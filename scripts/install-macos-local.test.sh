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

main() {
  test_resolve_latest_dmg
  test_resolve_latest_dmg_missing
  echo "install-macos-local tests passed"
}

main "$@"
