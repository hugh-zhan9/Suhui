#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_NAME="溯洄"
DESKTOP_PACKAGE="suhui"
MAKE_OUTPUT_DIR="/tmp/suhui-forge-out/make"
INSTALLED_APP_PATH="/Applications/${APP_NAME}.app"
CURRENT_STEP=""
MOUNT_POINT=""

print_error_diagnostics() {
  local exit_code="${1:-1}"
  echo >&2
  echo "install-macos-local failed" >&2
  echo "step: ${CURRENT_STEP:-unknown}" >&2
  echo "exit_code: $exit_code" >&2
  echo "app_path: $INSTALLED_APP_PATH" >&2
  echo "make_output_dir: $MAKE_OUTPUT_DIR" >&2

  if [[ -d "$MAKE_OUTPUT_DIR" ]]; then
    echo "recent_artifacts:" >&2
    ls -lt "$MAKE_OUTPUT_DIR" | head -n 10 >&2 || true
  else
    echo "recent_artifacts: make output directory does not exist yet" >&2
  fi

  if [[ -d "$INSTALLED_APP_PATH" ]]; then
    echo "installed_app_signature:" >&2
    codesign --verify --deep --verbose=2 "$INSTALLED_APP_PATH" >&2 || true
    echo "installed_app_quarantine:" >&2
    xattr "$INSTALLED_APP_PATH" >&2 || true
  else
    echo "installed_app: not present" >&2
  fi
}

resolve_latest_dmg_path() {
  local make_dir="$1"
  if [[ ! -d "$make_dir" ]]; then
    echo "Make output directory not found: $make_dir" >&2
    return 1
  fi

  local latest_path
  latest_path="$(
    find "$make_dir" -maxdepth 1 -type f -name '*.dmg' -print0 \
      | xargs -0 stat -f '%m %N' \
      | sort -nr \
      | head -n 1 \
      | cut -d ' ' -f 2-
  )"

  if [[ -z "$latest_path" ]]; then
    echo "No DMG artifact found in $make_dir" >&2
    return 1
  fi

  printf '%s\n' "$latest_path"
}

quit_running_app() {
  osascript -e "tell application \"$APP_NAME\" to quit" >/dev/null 2>&1 || true
  pkill -x "$APP_NAME" >/dev/null 2>&1 || true
}

mount_dmg() {
  local dmg_path="$1"
  local mount_point="$2"
  hdiutil attach "$dmg_path" -nobrowse -readonly -mountpoint "$mount_point"
}

detach_dmg() {
  local mount_point="$1"
  hdiutil detach "$mount_point" >/dev/null 2>&1 || hdiutil detach "$mount_point" -force >/dev/null 2>&1 || true
}

cleanup() {
  if [[ -n "$MOUNT_POINT" && -d "$MOUNT_POINT" ]]; then
    detach_dmg "$MOUNT_POINT"
    rm -rf "$MOUNT_POINT"
  fi
}

install_app_bundle() {
  local mounted_app_path="$1"

  if [[ ! -d "$mounted_app_path" ]]; then
    echo "Mounted app bundle not found: $mounted_app_path" >&2
    return 1
  fi

  rm -rf "$INSTALLED_APP_PATH"
  ditto "$mounted_app_path" "$INSTALLED_APP_PATH"
  xattr -dr com.apple.quarantine "$INSTALLED_APP_PATH"
}

open_installed_app() {
  open "$INSTALLED_APP_PATH"
}

main() {
  local dmg_path mount_point mounted_app_path

  trap 'print_error_diagnostics "$?"' ERR
  trap cleanup EXIT

  CURRENT_STEP="quit-running-app"
  quit_running_app

  CURRENT_STEP="build-unsigned-dmg"
  cd "$ROOT_DIR"
  pnpm --filter "$DESKTOP_PACKAGE" build:electron:unsigned

  CURRENT_STEP="resolve-latest-dmg"
  dmg_path="$(resolve_latest_dmg_path "$MAKE_OUTPUT_DIR")"

  mount_point="$(mktemp -d /tmp/suhui-install-macos.XXXXXX)"
  MOUNT_POINT="$mount_point"
  mounted_app_path="$mount_point/${APP_NAME}.app"

  CURRENT_STEP="mount-dmg"
  mount_dmg "$dmg_path" "$mount_point"

  CURRENT_STEP="install-app"
  install_app_bundle "$mounted_app_path"

  CURRENT_STEP="open-app"
  open_installed_app
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
