#!/bin/bash
echo "dida 앱의 보안 잠금을 해제합니다..."
xattr -dr com.apple.quarantine "/Applications/dida.app"
echo ""
echo "완료! 이제 dida를 실행할 수 있습니다."
echo ""
read -p "엔터를 누르면 창이 닫힙니다."
