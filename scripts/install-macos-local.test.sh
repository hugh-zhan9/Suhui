#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=/dev/null
source "$ROOT_DIR/scripts/install-macos-local.sh"

assert_eq() {
  local actual="$1"
  local expected="$2"
  local message="$3"

  if [[ "$actual" != "$expected" ]]; then
    echo "assert_eq failed: $message" >&2
    echo "  actual:   $actual" >&2
    echo "  expected: $expected" >&2
    exit 1
  fi
}

assert_contains() {
  local actual="$1"
  local expected="$2"
  local message="$3"

  if [[ "$actual" != *"$expected"* ]]; then
    echo "assert_contains failed: $message" >&2
    echo "  actual:   $actual" >&2
    echo "  expected substring: $expected" >&2
    exit 1
  fi
}

test_resolve_packaged_app_path() {
  local tmp_dir
  tmp_dir="$(mktemp -d)"
  mkdir -p "$tmp_dir/溯洄.app"

  local resolved
  resolved="$(resolve_packaged_app_path "$tmp_dir/溯洄.app")"
  assert_eq "$resolved" "$tmp_dir/溯洄.app" "should resolve packaged app path"

  rm -rf "$tmp_dir"
}

test_resolve_packaged_app_path_missing() {
  local tmp_dir
  tmp_dir="$(mktemp -d)"

  local output
  if output="$(resolve_packaged_app_path "$tmp_dir/溯洄.app" 2>&1)"; then
    echo "expected resolve_packaged_app_path to fail when app bundle does not exist" >&2
    exit 1
  fi

  assert_contains "$output" "Packaged app bundle not found" "should show missing app diagnostic"
  rm -rf "$tmp_dir"
}

test_is_packaged_app_ready() {
  local tmp_dir
  tmp_dir="$(mktemp -d)"
  local app_path="$tmp_dir/溯洄.app"
  mkdir -p "$app_path/Contents/MacOS" "$app_path/Contents/Resources"
  touch "$app_path/Contents/MacOS/溯洄" "$app_path/Contents/Info.plist" "$app_path/Contents/Resources/app.asar"

  if ! is_packaged_app_ready "$app_path"; then
    echo "expected packaged app readiness check to pass" >&2
    exit 1
  fi

  rm -rf "$tmp_dir"
}

test_validate_install_arch() {
  local old_install_arch output
  old_install_arch="$INSTALL_ARCH"

  INSTALL_ARCH="arm64"
  validate_install_arch

  INSTALL_ARCH="x64"
  validate_install_arch

  INSTALL_ARCH="sparc"
  if output="$(validate_install_arch 2>&1)"; then
    echo "expected validate_install_arch to fail for unsupported architecture" >&2
    exit 1
  fi

  assert_contains "$output" "Unsupported install architecture" "should show unsupported architecture diagnostic"

  INSTALL_ARCH="$old_install_arch"
}

test_replace_installed_app() {
  local tmp_dir old_installed_app_path old_temp_installed_app_path old_previous_installed_app_path
  tmp_dir="$(mktemp -d)"
  old_installed_app_path="$INSTALLED_APP_PATH"
  old_temp_installed_app_path="$TEMP_INSTALLED_APP_PATH"
  old_previous_installed_app_path="$PREVIOUS_INSTALLED_APP_PATH"

  INSTALLED_APP_PATH="$tmp_dir/Applications/溯洄.app"
  TEMP_INSTALLED_APP_PATH=""
  PREVIOUS_INSTALLED_APP_PATH=""

  mkdir -p "$INSTALLED_APP_PATH" "$tmp_dir/new.app"
  printf 'old\n' >"$INSTALLED_APP_PATH/version.txt"
  printf 'new\n' >"$tmp_dir/new.app/version.txt"

  replace_installed_app "$tmp_dir/new.app"

  assert_eq "$(cat "$INSTALLED_APP_PATH/version.txt")" "new" "should replace installed app with prepared app"

  INSTALLED_APP_PATH="$old_installed_app_path"
  TEMP_INSTALLED_APP_PATH="$old_temp_installed_app_path"
  PREVIOUS_INSTALLED_APP_PATH="$old_previous_installed_app_path"
  rm -rf "$tmp_dir"
}

test_link_cli_tool() {
  local tmp_dir old_cli_source_path old_cli_bin_dir old_cli_bin_path
  tmp_dir="$(mktemp -d)"
  old_cli_source_path="$CLI_SOURCE_PATH"
  old_cli_bin_dir="$CLI_BIN_DIR"
  old_cli_bin_path="$CLI_BIN_PATH"

  CLI_SOURCE_PATH="$tmp_dir/dist/index.js"
  CLI_BIN_DIR="$tmp_dir/bin"
  CLI_BIN_PATH="$CLI_BIN_DIR/suhui"

  mkdir -p "$(dirname "$CLI_SOURCE_PATH")"
  printf '#!/usr/bin/env node\n' >"$CLI_SOURCE_PATH"
  chmod +x "$CLI_SOURCE_PATH"

  link_cli_tool >/dev/null 2>&1

  assert_eq "$(readlink "$CLI_BIN_PATH")" "$CLI_SOURCE_PATH" "should link suhui cli into bin dir"

  CLI_SOURCE_PATH="$old_cli_source_path"
  CLI_BIN_DIR="$old_cli_bin_dir"
  CLI_BIN_PATH="$old_cli_bin_path"
  rm -rf "$tmp_dir"
}

test_link_cli_tool_existing_file() {
  local tmp_dir old_cli_source_path old_cli_bin_dir old_cli_bin_path output
  tmp_dir="$(mktemp -d)"
  old_cli_source_path="$CLI_SOURCE_PATH"
  old_cli_bin_dir="$CLI_BIN_DIR"
  old_cli_bin_path="$CLI_BIN_PATH"

  CLI_SOURCE_PATH="$tmp_dir/dist/index.js"
  CLI_BIN_DIR="$tmp_dir/bin"
  CLI_BIN_PATH="$CLI_BIN_DIR/suhui"

  mkdir -p "$(dirname "$CLI_SOURCE_PATH")" "$CLI_BIN_DIR"
  printf '#!/usr/bin/env node\n' >"$CLI_SOURCE_PATH"
  chmod +x "$CLI_SOURCE_PATH"
  printf 'existing\n' >"$CLI_BIN_PATH"

  if output="$(link_cli_tool 2>&1)"; then
    echo "expected link_cli_tool to fail when CLI target is a regular file" >&2
    exit 1
  fi

  assert_contains "$output" "not a symlink" "should show existing CLI target diagnostic"
  assert_eq "$(cat "$CLI_BIN_PATH")" "existing" "should not overwrite existing CLI target"

  CLI_SOURCE_PATH="$old_cli_source_path"
  CLI_BIN_DIR="$old_cli_bin_dir"
  CLI_BIN_PATH="$old_cli_bin_path"
  rm -rf "$tmp_dir"
}

test_link_cli_tool_missing() {
  local tmp_dir old_cli_source_path old_cli_bin_dir old_cli_bin_path output
  tmp_dir="$(mktemp -d)"
  old_cli_source_path="$CLI_SOURCE_PATH"
  old_cli_bin_dir="$CLI_BIN_DIR"
  old_cli_bin_path="$CLI_BIN_PATH"

  CLI_SOURCE_PATH="$tmp_dir/missing/index.js"
  CLI_BIN_DIR="$tmp_dir/bin"
  CLI_BIN_PATH="$CLI_BIN_DIR/suhui"

  if output="$(link_cli_tool 2>&1)"; then
    echo "expected link_cli_tool to fail when CLI executable is missing" >&2
    exit 1
  fi

  assert_contains "$output" "CLI executable not found" "should show missing CLI diagnostic"

  CLI_SOURCE_PATH="$old_cli_source_path"
  CLI_BIN_DIR="$old_cli_bin_dir"
  CLI_BIN_PATH="$old_cli_bin_path"
  rm -rf "$tmp_dir"
}

main() {
  test_resolve_packaged_app_path
  test_resolve_packaged_app_path_missing
  test_is_packaged_app_ready
  test_validate_install_arch
  test_replace_installed_app
  test_link_cli_tool
  test_link_cli_tool_existing_file
  test_link_cli_tool_missing
  echo "install-macos-local tests passed"
}

main "$@"
