---
description: Launch the on-diary Tauri desktop app in dev mode
---

# on-diary 앱 실행

## 환경 전제조건

- Rust (`~/.cargo/bin`) 및 Homebrew (`/opt/homebrew/bin`) 가 PATH에 있어야 함
- `node_modules` 가 없으면 `npm install` 먼저 실행

## 실행 절차

### 1. node_modules 확인 및 설치

```bash
[ -d node_modules ] || npm install
```

### 2. 백그라운드에서 앱 실행

```bash
export PATH="/opt/homebrew/bin:$HOME/.cargo/bin:$PATH"
export CARGO_TARGET_DIR="$HOME/cargo_targets/on_diary"
npm run tauri dev > /tmp/tauri-dev.log 2>&1 &
echo "PID: $!"
```

> `CARGO_TARGET_DIR` 을 로컬로 지정하는 이유: 프로젝트가 iCloud Drive 경로에 있으면
> iCloud 동기화가 `target/` 폴더를 건드려 빌드 타임아웃이 발생함.

### 3. 실행 완료 대기

```bash
until grep -q "Running.*on-diary\|error\[" /tmp/tauri-dev.log 2>/dev/null; do sleep 2; done && tail -15 /tmp/tauri-dev.log
```

- `Finished` + `Running /Users/hozac/cargo_targets/on_diary/debug/on-diary` 가 보이면 성공
- `error[` 가 보이면 컴파일 에러 — 로그 전체 확인 필요

## 강제 종료

```bash
pkill -f "on-diary"; pkill -f "tauri dev"; kill $(lsof -ti:1420) 2>/dev/null
```

## 로그 확인

```bash
tail -30 /tmp/tauri-dev.log
```

## 주의사항

- 첫 빌드는 Rust 컴파일로 1~2분 소요, 이후 증분 빌드는 수 초
- Vite dev server: `http://localhost:1420`
- Rust 소스 변경 시 Tauri watch가 자동 재빌드함
- macOS 26 (Darwin 25 / Tahoe 베타) 전용 앱 — Electron 불가, Tauri 2 사용
