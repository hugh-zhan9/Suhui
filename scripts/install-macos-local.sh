#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_NAME="溯洄"
DESKTOP_PACKAGE="suhui"
CLI_PACKAGE="@suhui/cli"
CLI_BIN_NAME="suhui"
PACKAGE_ROOT_DIR="/tmp/suhui-forge-out"
DEFAULT_INSTALL_ARCH="$(uname -m)"
case "$DEFAULT_INSTALL_ARCH" in
  arm64|aarch64) DEFAULT_INSTALL_ARCH="arm64" ;;
  x86_64|amd64) DEFAULT_INSTALL_ARCH="x64" ;;
esac
INSTALL_ARCH="${SUHUI_INSTALL_ARCH:-$DEFAULT_INSTALL_ARCH}"
PACKAGE_OUTPUT_DIR="${PACKAGE_ROOT_DIR}/${APP_NAME}-darwin-${INSTALL_ARCH}"
PACKAGED_APP_PATH="${PACKAGE_OUTPUT_DIR}/${APP_NAME}.app"
INSTALLED_APP_PATH="/Applications/${APP_NAME}.app"
CLI_SOURCE_PATH="${ROOT_DIR}/apps/cli/dist/index.js"
CLI_BIN_DIR="${SUHUI_CLI_BIN_DIR:-$HOME/.local/bin}"
CLI_BIN_PATH="${CLI_BIN_DIR}/${CLI_BIN_NAME}"
CURRENT_STEP=""
PACKAGE_PID=""
TEMP_INSTALLED_APP_PATH=""
PREVIOUS_INSTALLED_APP_PATH=""

validate_install_arch() {
  case "$INSTALL_ARCH" in
    arm64|x64) return 0 ;;
  esac

  echo "Unsupported install architecture: $INSTALL_ARCH" >&2
  echo "Set SUHUI_INSTALL_ARCH to arm64 or x64." >&2
  return 1
}

print_error_diagnostics() {
  local exit_code="${1:-1}"
  echo >&2
  echo "install-macos-local failed" >&2
  echo "step: ${CURRENT_STEP:-unknown}" >&2
  echo "exit_code: $exit_code" >&2
  echo "app_path: $INSTALLED_APP_PATH" >&2
  echo "package_root_dir: $PACKAGE_ROOT_DIR" >&2
  echo "packaged_app_path: $PACKAGED_APP_PATH" >&2
  echo "cli_bin_path: $CLI_BIN_PATH" >&2

  if [[ -d "$PACKAGE_ROOT_DIR" ]]; then
    echo "recent_artifacts:" >&2
    find "$PACKAGE_ROOT_DIR" -maxdepth 2 -mindepth 1 -print | head -n 20 >&2 || true
  else
    echo "recent_artifacts: package output directory does not exist yet" >&2
  fi

  if [[ -d "$INSTALLED_APP_PATH" ]]; then
    echo "installed_app_signature:" >&2
    codesign --verify --deep --verbose=2 "$INSTALLED_APP_PATH" >&2 || true
    echo "installed_app_quarantine:" >&2
    xattr "$INSTALLED_APP_PATH" >&2 || true
  else
    echo "installed_app: not present" >&2
  fi
  if [[ -e "$CLI_BIN_PATH" ]]; then
    echo "cli_link:" >&2
    ls -l "$CLI_BIN_PATH" >&2 || true
  else
    echo "cli_link: not present" >&2
  fi
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
  wait_for_app_exit 15 || {
    echo "App did not exit after TERM; forcing quit: $APP_NAME" >&2
    pkill -9 -x "$APP_NAME" >/dev/null 2>&1 || true
    wait_for_app_exit 5
  }
}

wait_for_app_exit() {
  local timeout_seconds="${1:-15}"
  local started_at now

  started_at="$(date +%s)"
  while pgrep -x "$APP_NAME" >/dev/null 2>&1; do
    now="$(date +%s)"
    if (( now - started_at >= timeout_seconds )); then
      return 1
    fi
    sleep 1
  done
}

cleanup() {
  if [[ -n "$PACKAGE_PID" ]]; then
    terminate_process_tree "$PACKAGE_PID"
    wait "$PACKAGE_PID" >/dev/null 2>&1 || true
    PACKAGE_PID=""
  fi

  if [[ -n "$TEMP_INSTALLED_APP_PATH" && -e "$TEMP_INSTALLED_APP_PATH" ]]; then
    rm -rf "$TEMP_INSTALLED_APP_PATH"
  fi

  if [[ -n "$PREVIOUS_INSTALLED_APP_PATH" && -e "$PREVIOUS_INSTALLED_APP_PATH" ]]; then
    if [[ ! -e "$INSTALLED_APP_PATH" ]]; then
      mv "$PREVIOUS_INSTALLED_APP_PATH" "$INSTALLED_APP_PATH" >/dev/null 2>&1 || true
    else
      rm -rf "$PREVIOUS_INSTALLED_APP_PATH"
    fi
  fi
}

install_app_bundle() {
  local source_app_path="$1"

  if [[ ! -d "$source_app_path" ]]; then
    echo "Source app bundle not found: $source_app_path" >&2
    return 1
  fi

  TEMP_INSTALLED_APP_PATH="$(dirname "$INSTALLED_APP_PATH")/.${APP_NAME}.app.installing.$$"
  rm -rf "$TEMP_INSTALLED_APP_PATH"

  ditto "$source_app_path" "$TEMP_INSTALLED_APP_PATH"
  codesign --force --deep --sign - "$TEMP_INSTALLED_APP_PATH"
  xattr -dr com.apple.quarantine "$TEMP_INSTALLED_APP_PATH"
  replace_installed_app "$TEMP_INSTALLED_APP_PATH"
}

replace_installed_app() {
  local prepared_app_path="$1"
  local installed_parent_dir
  local move_status

  installed_parent_dir="$(dirname "$INSTALLED_APP_PATH")"
  PREVIOUS_INSTALLED_APP_PATH="${installed_parent_dir}/.${APP_NAME}.app.previous.$$"
  rm -rf "$PREVIOUS_INSTALLED_APP_PATH"

  if [[ -e "$INSTALLED_APP_PATH" ]]; then
    mv "$INSTALLED_APP_PATH" "$PREVIOUS_INSTALLED_APP_PATH"
  fi

  if mv "$prepared_app_path" "$INSTALLED_APP_PATH"; then
    TEMP_INSTALLED_APP_PATH=""
    rm -rf "$PREVIOUS_INSTALLED_APP_PATH"
    PREVIOUS_INSTALLED_APP_PATH=""
    return 0
  fi

  move_status="$?"
  if [[ -e "$PREVIOUS_INSTALLED_APP_PATH" && ! -e "$INSTALLED_APP_PATH" ]]; then
    mv "$PREVIOUS_INSTALLED_APP_PATH" "$INSTALLED_APP_PATH" >/dev/null 2>&1 || true
  fi
  return "$move_status"
}

build_local_app_bundle() {
  CURRENT_STEP="build-electron-vite"
  cd "$ROOT_DIR"
  pnpm --filter "$DESKTOP_PACKAGE" build:electron-vite

  CURRENT_STEP="package-local-app"
  rm -rf "$PACKAGE_OUTPUT_DIR"
  FOLO_NO_SIGN=1 pnpm --filter "$DESKTOP_PACKAGE" exec node scripts/run-electron-forge.mjs package --platform=darwin --arch="$INSTALL_ARCH" &
  PACKAGE_PID="$!"

  wait_for_packaged_app "$PACKAGED_APP_PATH" "$PACKAGE_PID" 180

  if kill -0 "$PACKAGE_PID" >/dev/null 2>&1; then
    echo "electron-forge package produced app bundle but did not exit, terminating stale packaging process..." >&2
    terminate_process_tree "$PACKAGE_PID"
  fi

  wait "$PACKAGE_PID" >/dev/null 2>&1 || true
  PACKAGE_PID=""
}

build_cli_tool() {
  cd "$ROOT_DIR"
  pnpm --filter "$CLI_PACKAGE" build
}

link_cli_tool() {
  if [[ ! -x "$CLI_SOURCE_PATH" ]]; then
    echo "CLI executable not found or not executable: $CLI_SOURCE_PATH" >&2
    return 1
  fi

  mkdir -p "$CLI_BIN_DIR"
  if [[ -e "$CLI_BIN_PATH" && ! -L "$CLI_BIN_PATH" ]]; then
    echo "CLI target already exists and is not a symlink: $CLI_BIN_PATH" >&2
    return 1
  fi

  rm -f "$CLI_BIN_PATH"
  ln -sfn "$CLI_SOURCE_PATH" "$CLI_BIN_PATH"

  if [[ ":$PATH:" != *":$CLI_BIN_DIR:"* ]]; then
    echo "CLI installed at $CLI_BIN_PATH, but $CLI_BIN_DIR is not in PATH" >&2
  fi
}

install_cli_tool() {
  CURRENT_STEP="build-cli"
  build_cli_tool

  CURRENT_STEP="install-cli"
  link_cli_tool
}

open_installed_app() {
  open "$INSTALLED_APP_PATH"
}

main() {
  local packaged_app_path

  trap 'print_error_diagnostics "$?"' ERR
  trap cleanup EXIT

  CURRENT_STEP="validate-install-arch"
  validate_install_arch

  CURRENT_STEP="quit-running-app"
  quit_running_app

  build_local_app_bundle

  CURRENT_STEP="resolve-packaged-app"
  packaged_app_path="$(resolve_packaged_app_path "$PACKAGED_APP_PATH")"

  CURRENT_STEP="install-app"
  install_app_bundle "$packaged_app_path"

  install_cli_tool

  CURRENT_STEP="open-app"
  open_installed_app
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
