#!/bin/bash
set -euo pipefail

# Build torx-mac and copy result to repo root as Torx.app

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
DERIVED="$ROOT_DIR/build"
CONFIG="${CONFIGURATION:-Debug}"

echo "Building torx-mac ($CONFIG)…"
xcodebuild \
  -project "$ROOT_DIR/torx-mac.xcodeproj" \
  -scheme torx-mac \
  -configuration "$CONFIG" \
  -destination 'platform=macOS' \
  -derivedDataPath "$DERIVED" \
  clean build | sed -e 's/\r/\n/g' || true

APP_SRC="$DERIVED/Build/Products/$CONFIG/torx-mac.app"
APP_DST="$ROOT_DIR/Torx.app"

if [ ! -d "$APP_SRC" ]; then
  echo "Build output not found: $APP_SRC" >&2
  exit 1
fi

rm -rf "$APP_DST"
cp -R "$APP_SRC" "$APP_DST"
echo "App copied to: $APP_DST"

if [ "${OPEN_AFTER_BUILD:-1}" = "1" ]; then
  open -n "$APP_DST" || true
fi


