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

test_resolve_latest_dmg() {
  local tmp_dir
  tmp_dir="$(mktemp -d)"
  touch "$tmp_dir/溯洄-1.3.0-macos-arm64.dmg"
  sleep 1
  touch "$tmp_dir/溯洄-1.3.1-macos-arm64.dmg"

  local latest
  latest="$(resolve_latest_dmg_path "$tmp_dir")"
  assert_eq "$latest" "$tmp_dir/溯洄-1.3.1-macos-arm64.dmg" "should pick newest dmg"

  rm -rf "$tmp_dir"
}

test_resolve_latest_dmg_missing() {
  local tmp_dir
  tmp_dir="$(mktemp -d)"

  local output
  if output="$(resolve_latest_dmg_path "$tmp_dir" 2>&1)"; then
    echo "expected resolve_latest_dmg_path to fail when no dmg exists" >&2
    exit 1
  fi

  assert_contains "$output" "No DMG artifact found" "should show missing dmg diagnostic"
  rm -rf "$tmp_dir"
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

main() {
  test_resolve_latest_dmg
  test_resolve_latest_dmg_missing
  test_resolve_packaged_app_path
  test_resolve_packaged_app_path_missing
  test_is_packaged_app_ready
  echo "install-macos-local tests passed"
}

main "$@"
