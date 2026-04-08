#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_NAME="溯洄"
DESKTOP_PACKAGE="suhui"
MAKE_OUTPUT_DIR="/tmp/suhui-forge-out/make"
PACKAGE_OUTPUT_DIR="/tmp/suhui-forge-out/${APP_NAME}-darwin-arm64"
PACKAGED_APP_PATH="${PACKAGE_OUTPUT_DIR}/${APP_NAME}.app"
INSTALLED_APP_PATH="/Applications/${APP_NAME}.app"
CURRENT_STEP=""
MOUNT_POINT=""
PACKAGE_PID=""

print_error_diagnostics() {
  local exit_code="${1:-1}"
  echo >&2
  echo "install-macos-local failed" >&2
  echo "step: ${CURRENT_STEP:-unknown}" >&2
  echo "exit_code: $exit_code" >&2
  echo "app_path: $INSTALLED_APP_PATH" >&2
  echo "make_output_dir: $MAKE_OUTPUT_DIR" >&2
  echo "packaged_app_path: $PACKAGED_APP_PATH" >&2

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

resolve_packaged_app_path() {
  local packaged_app_path="$1"

  if [[ ! -d "$packaged_app_path" ]]; then
    echo "Packaged app bundle not found: $packaged_app_path" >&2
    return 1
  fi

  printf '%s\n' "$packaged_app_path"
}

is_packaged_app_ready() {
  local packaged_app_path="$1"
  local executable_path="$packaged_app_path/Contents/MacOS/$APP_NAME"
  local info_plist_path="$packaged_app_path/Contents/Info.plist"
  local asar_path="$packaged_app_path/Contents/Resources/app.asar"

  [[ -d "$packaged_app_path" ]] &&
    [[ -f "$executable_path" ]] &&
    [[ -f "$info_plist_path" ]] &&
    [[ -f "$asar_path" ]]
}

get_packaged_app_fingerprint() {
  local packaged_app_path="$1"
  local executable_path="$packaged_app_path/Contents/MacOS/$APP_NAME"
  local info_plist_path="$packaged_app_path/Contents/Info.plist"
  local asar_path="$packaged_app_path/Contents/Resources/app.asar"

  stat -f '%m:%z' "$executable_path" "$info_plist_path" "$asar_path" 2>/dev/null | tr '\n' '|'
}

terminate_process_tree() {
  local pid="$1"
  if [[ -z "$pid" ]] || ! kill -0 "$pid" >/dev/null 2>&1; then
    return 0
  fi

  local children
  children="$(pgrep -P "$pid" || true)"
  if [[ -n "$children" ]]; then
    while IFS= read -r child_pid; do
      [[ -n "$child_pid" ]] || continue
      terminate_process_tree "$child_pid"
    done <<<"$children"
  fi

  kill "$pid" >/dev/null 2>&1 || true
}

wait_for_packaged_app() {
  local packaged_app_path="$1"
  local package_pid="$2"
  local timeout_seconds="${3:-180}"
  local started_at now stable_count
  local last_fingerprint=""

  started_at="$(date +%s)"
  stable_count=0

  while true; do
    if is_packaged_app_ready "$packaged_app_path"; then
      local fingerprint
      fingerprint="$(get_packaged_app_fingerprint "$packaged_app_path")"
      if [[ -n "$fingerprint" && "$fingerprint" == "$last_fingerprint" ]]; then
        stable_count=$((stable_count + 1))
      else
        stable_count=0
        last_fingerprint="$fingerprint"
      fi

      if [[ "$stable_count" -ge 2 ]]; then
        return 0
      fi
    fi

    if ! kill -0 "$package_pid" >/dev/null 2>&1; then
      if is_packaged_app_ready "$packaged_app_path"; then
        return 0
      fi
      echo "Packaging process exited before app bundle was ready" >&2
      return 1
    fi

    now="$(date +%s)"
    if (( now - started_at >= timeout_seconds )); then
      if is_packaged_app_ready "$packaged_app_path"; then
        return 0
      fi
      echo "Timed out waiting for packaged app: $packaged_app_path" >&2
      return 1
    fi

    sleep 1
  done
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
  if [[ -n "$PACKAGE_PID" ]]; then
    terminate_process_tree "$PACKAGE_PID"
    wait "$PACKAGE_PID" >/dev/null 2>&1 || true
    PACKAGE_PID=""
  fi

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
  codesign --force --deep --sign - "$INSTALLED_APP_PATH"
  xattr -dr com.apple.quarantine "$INSTALLED_APP_PATH"
}

build_local_app_bundle() {
  CURRENT_STEP="build-electron-vite"
  cd "$ROOT_DIR"
  pnpm --filter "$DESKTOP_PACKAGE" build:electron-vite

  CURRENT_STEP="package-local-app"
  rm -rf "$PACKAGE_OUTPUT_DIR"
  FOLO_NO_SIGN=1 pnpm --filter "$DESKTOP_PACKAGE" exec electron-forge package --platform=darwin --arch=arm64 &
  PACKAGE_PID="$!"

  wait_for_packaged_app "$PACKAGED_APP_PATH" "$PACKAGE_PID" 180

  if kill -0 "$PACKAGE_PID" >/dev/null 2>&1; then
    echo "electron-forge package produced app bundle but did not exit, terminating stale packaging process..." >&2
    terminate_process_tree "$PACKAGE_PID"
  fi

  wait "$PACKAGE_PID" >/dev/null 2>&1 || true
  PACKAGE_PID=""
}

open_installed_app() {
  open "$INSTALLED_APP_PATH"
}

main() {
  local packaged_app_path

  trap 'print_error_diagnostics "$?"' ERR
  trap cleanup EXIT

  CURRENT_STEP="quit-running-app"
  quit_running_app

  build_local_app_bundle

  CURRENT_STEP="resolve-packaged-app"
  packaged_app_path="$(resolve_packaged_app_path "$PACKAGED_APP_PATH")"

  CURRENT_STEP="install-app"
  install_app_bundle "$packaged_app_path"

  CURRENT_STEP="open-app"
  open_installed_app
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
