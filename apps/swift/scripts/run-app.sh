#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

swift build

binary_path="$(swift build --show-bin-path)/EmailSwiftApp"
app_path=".build/EmailSwiftApp.app"
contents_path="$app_path/Contents"
macos_path="$contents_path/MacOS"

rm -rf "$app_path"
mkdir -p "$macos_path"
cp "$binary_path" "$macos_path/EmailSwiftApp"

cat > "$contents_path/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key>
  <string>EmailSwiftApp</string>
  <key>CFBundleIdentifier</key>
  <string>com.jackhodkinson.email-swift-app</string>
  <key>CFBundleName</key>
  <string>EmailSwiftApp</string>
  <key>CFBundleDisplayName</key>
  <string>EmailSwiftApp</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>0.1.0</string>
  <key>CFBundleVersion</key>
  <string>1</string>
  <key>LSMinimumSystemVersion</key>
  <string>14.0</string>
  <key>NSHighResolutionCapable</key>
  <true/>
</dict>
</plist>
PLIST

open "$app_path"
