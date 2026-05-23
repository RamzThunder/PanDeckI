# On Diary — 프로젝트 컨텍스트

## 앱 개요
개인 디지털 다이어리 데스크톱 앱. 딩글(한국 다이어리 앱)과 유사한 자유 캔버스 꾸미기 스타일.

## 기술 스택
- **프레임워크**: Tauri 2 (Rust 백엔드 + WKWebView 프론트엔드)
- **프론트엔드**: React 18 + TypeScript + Vite (포트 1420)
- **스타일**: Tailwind CSS v3 (ESM config — `tailwind.config.js`는 `export default` 형식)
- **DB**: SQLite (rusqlite bundled, `src-tauri/src/db.rs`)
- **개발 실행**: 아래 macOS 주의사항 참고

## macOS 주의사항
- macOS 26 (Tahoe 베타, Darwin 25)에서 Electron 전 버전 동작 불가 → Tauri로 전환
- Cargo가 PATH에 없을 수 있어서 실행 전 `export PATH="/opt/homebrew/bin:$HOME/.cargo/bin:$PATH"` 필요
- **iCloud Drive 주의**: 프로젝트가 iCloud Drive(`~/Library/Mobile Documents/...`) 안에 있어서 Rust `target/` 폴더를 iCloud가 동기화하려다 타임아웃 발생. 반드시 `CARGO_TARGET_DIR`을 로컬 경로로 설정해야 함
- **올바른 실행 명령**:
  ```bash
  export PATH="/opt/homebrew/bin:$HOME/.cargo/bin:$PATH"
  export CARGO_TARGET_DIR="$HOME/cargo_targets/on_diary"
  npm run tauri dev
  ```

## 주요 파일 구조
```
src/
  App.tsx                  # 라우팅 (월간/일간), 테마/줌/전체폰트 로딩, Cmd+스크롤 줌
  api.ts                   # Tauri invoke 래퍼 (entry, monthly, settings, file, sticker, fonts)
  store/
    diary.ts               # useDiaryNav 훅, ViewMode = 'monthly' | 'daily'
    theme.ts               # PRESET_THEMES (5종), applyTheme(), applyGlobalFont()
  pages/
    DailyView.tsx          # 자유 캔버스 뷰 (메인 꾸미기 화면)
    MonthlyView.tsx        # 월간 캘린더 + 목표/버킷리스트
  components/
    Sidebar.tsx            # 좌측 사이드바 (월간/일간 탭, 설정 버튼)
    SettingsPanel.tsx      # 우측 설정 패널 (테마/화면 탭)
    StickerPicker.tsx      # PNG 스티커팩 피커 (폴더 기반)
    CropModal.tsx          # 사진 크롭 모달 (고정 프레임/자유형, PNG 마스크 모양)
src-tauri/
  src/
    commands.rs            # Rust IPC 커맨드 전체
    db.rs                  # SQLite 스키마 (entries, monthly_data, settings)
    lib.rs                 # Tauri 앱 빌더, 커맨드 등록
  tauri.conf.json          # 윈도우 설정 (1800×1012), assetProtocol 활성화
```

## CanvasEl 타입 (DailyView의 캔버스 요소)
```typescript
interface CanvasEl {
  id: string
  type: 'text' | 'sticker' | 'photo'
  x, y, w, h, z       // 위치/크기/z-order
  rotation             // 회전 각도 (deg)
  opacity              // 0-100
  content              // text: 텍스트, sticker/photo: base64 data URL
  // 텍스트 전용
  fontSize, color, bold, italic, fontFamily
  bgColor, bgOpacity   // 텍스트 박스 배경색 + 불투명도 (0=투명)
  align                // 가로 정렬 (left/center/right)
  alignV               // 세로 정렬 (top/middle/bottom)
  textRadius           // 텍스트 박스 모서리 (px)
  borderWidth          // 텍스트 박스 테두리 두께 (px)
  borderColor          // 텍스트 박스 테두리 색상
  // 사진 전용
  clipShape            // 'none'|'circle'|'heart'|'star'|'diamond'|'hexagon'|'custom_*'
  photoRadius          // clipShape=none일 때 모서리 둥글기 (%, 0-100)
}

interface DailyData {
  elements: CanvasEl[]
  bg: string           // 배경색 hex
  bgImage?: string     // 배경 이미지 data URL
  bgImageScale?: number // 배경 이미지 크기 (1.0 = 100%)
}
```

## 앱 레이아웃 구조
- 최상위 래퍼: `100vw × 100vh`, 배경 `#5a5a5a` (캔버스 밖 영역)
- 내부 고정 캔버스: `1800 × 1012px`, `transform: scale(appZoom)` (기본 1.0)
- 줌: Cmd+스크롤 또는 설정 패널 슬라이더 (50~150%), settings DB에 영속

## 구현된 기능
- **자유 캔버스**: 텍스트/스티커/사진 자유 배치, 드래그/리사이즈/회전
- **드래그**: `window.addEventListener('pointermove/pointerup')` 방식 (React synthetic event 문제 우회)
- **실행 취소/다시 실행**: 최대 50단계 히스토리, Cmd+Z / Cmd+Shift+Z, 툴바 ↩↪ 버튼
- **텍스트**: 폰트/크기/색상/굵기/기울임/가로정렬/세로정렬/배경색(불투명도)/테두리/모서리 설정
- **시스템 폰트**: macOS NSFontManager로 전체 목록 (Python 경유), 검색 가능
- **전체 폰트**: 설정 패널에서 앱 전체 폰트 변경 (`applyGlobalFont`)
- **PNG 스티커팩**: `sticker/` 폴더 내 하위 폴더 = 팩, 자동 감지 (개발 시 프로젝트 루트 탐색)
- **사진 크롭**: 고정 프레임 + 이미지 이동/줌, Canvas API로 최종 렌더
- **사진 자유형 크롭**: 드래그로 영역 선택 → 해당 영역만 추출
- **사진 모양**: circle/heart/star/diamond/hexagon (CSS clip-path + SVG) + PNG 마스크 커스텀 모양
- **커스텀 모양**: PNG 업로드 → WebkitMask로 미리보기, Canvas 합성으로 저장, settings DB에 영속
- **사진 배경색**: 크롭 모달에서 설정, 즐겨찾기 5개 (`favBgColors`) 영속
- **배경**: 프리셋 8색 + 커스텀 3슬롯 (우클릭 삭제) + hex 입력 + 배경 이미지 (크기 조절)
- **불투명도**: 요소 전체 투명도 슬라이더
- **클립보드 붙여넣기**: Cmd+V로 이미지→사진요소, 텍스트→텍스트요소
- **테마**: 5 프리셋 + 5 커스텀 슬롯, CSS 변수 기반 (`--color-primary` 등)
- **앱 줌**: Cmd+스크롤 또는 설정 슬라이더 (50~150%), settings DB에 영속
- **월간 뷰**: 캘린더 + 목표/버킷리스트
- **저장**: SQLite, 날짜별 JSON 저장

## SettingsPanel 구조 (우측 패널)
- **테마 탭**: 프리셋 5종 + 커스텀 5슬롯 (인라인 에디터) + 전체 폰트 선택
- **화면 탭**: 줌 슬라이더 (50~150%) + 초기화 버튼

## CropModal 동작 방식
- **일반 모드**: 고정 프레임 (frameW × frameH), 이미지 이동/스크롤 줌
- **자유형 모드**: 이미지를 fit으로 표시, 드래그로 크롭 영역 선택
- **PNG 마스크 모양**: Canvas `destination-in` 합성으로 마스크 적용
- 출력: `onConfirm(dataUrl, shape, newSize?, borderRadius?)` 콜백

## 스티커 폴더
`{프로젝트루트}/sticker/` 안에 폴더별로 PNG 스티커 보관.
현재 팩: `무도짤/`, `야구 스티커 공유/`
앱 실행 시 자동으로 프로젝트 루트를 탐색해서 찾음.
처음 실행 시 StickerPicker의 📁 버튼으로 폴더 수동 지정 가능.

## Settings DB 키 목록
| 키 | 값 형식 | 설명 |
|---|---|---|
| `active_theme` | string (theme id) | 현재 테마 |
| `theme_{id}` | JSON (Theme) | 커스텀 테마 데이터 |
| `appZoom` | float string | 앱 배율 |
| `globalFont` | string | 전체 폰트명 |
| `customShapes` | JSON (CustomShape[]) | 커스텀 크롭 모양 |
| `bgCustomColors` | JSON (string[3]) | 배경 커스텀 색 3슬롯 |
| `favBgColors` | JSON (string[]) | 크롭 모달 배경색 즐겨찾기 |

## Rust 커맨드 목록
`get_entry`, `save_entry`, `list_month_entries`,
`get_monthly`, `save_monthly`, `get_setting`, `set_setting`,
`pick_image`, `read_file_b64`,
`get_sticker_dir`, `list_sticker_packs`, `pick_sticker_dir`,
`list_system_fonts`

## 맥미니 첫 실행 체크리스트
```bash
# 1. Rust 설치 (없으면)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# 2. Node.js 설치 (없으면)
brew install node

# 3. 의존성 설치
cd ~/Library/Mobile\ Documents/com~apple~CloudDocs/code/on_diary
npm install

# 4. 앱 실행
export PATH="$HOME/.cargo/bin:$PATH"
npm run tauri dev
```
