#!/usr/bin/env bash
set -euo pipefail

# Copies the local Bun binary into src-tauri/binaries/ with the
# Tauri target-triple naming convention so it can be bundled as a sidecar.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BINARIES_DIR="$SCRIPT_DIR/../src-tauri/binaries"

# Determine the host target triple via rustc.
TARGET_TRIPLE="$(rustc --print host-tuple 2>/dev/null || rustc -vV | sed -n 's/host: //p')"
if [ -z "$TARGET_TRIPLE" ]; then
  echo "Error: Could not determine target triple. Is rustc installed?" >&2
  exit 1
fi

BUN_PATH="$(which bun)"
if [ -z "$BUN_PATH" ]; then
  echo "Error: bun not found in PATH" >&2
  exit 1
fi

mkdir -p "$BINARIES_DIR"

DEST="$BINARIES_DIR/bun-${TARGET_TRIPLE}"
echo "Copying $BUN_PATH -> $DEST"
cp "$BUN_PATH" "$DEST"
chmod +x "$DEST"

echo "Sidecar ready: $DEST"
