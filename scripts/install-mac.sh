#!/bin/bash
# PanDeckI macOS 설치 스크립트
# 터미널에서 curl로 받은 파일에는 macOS 격리(quarantine) 속성이 붙지 않아 "손상된 앱" 경고 없이 실행된다.
set -euo pipefail

URL="https://github.com/RamzThunder/PanDeckI/releases/latest/download/PanDeckI.app.tar.gz"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

echo "PanDeckI 최신 버전을 내려받는 중..."
curl -fL --progress-bar "$URL" -o "$TMP/PanDeckI.app.tar.gz"
tar -xzf "$TMP/PanDeckI.app.tar.gz" -C "$TMP"

if pgrep -x PanDeckI >/dev/null; then
  echo "실행 중인 PanDeckI를 종료합니다..."
  osascript -e 'quit app "PanDeckI"' || true
  sleep 2
fi

rm -rf "/Applications/PanDeckI.app"
mv "$TMP/PanDeckI.app" "/Applications/PanDeckI.app"
xattr -dr com.apple.quarantine "/Applications/PanDeckI.app" 2>/dev/null || true

echo "설치 완료! PanDeckI를 실행합니다."
open "/Applications/PanDeckI.app"
