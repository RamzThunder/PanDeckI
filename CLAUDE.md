# PanDeckI — 프로젝트 컨텍스트

## Claude 행동 규칙
- **"데브 켜줘" 의미**: 사용자가 "데브 켜줘", "개발 앱 켜줘" 등 개발 실행을 요청하면 브라우저용 `npm run dev`만 실행하지 말고, 별도 데스크톱 앱 창이 뜨도록 `npm run tauri dev`를 실행한다.
- **푸쉬 전 CLAUDE.md 동기화**: `git push` 요청이 오면, 이번 작업에서 변경된 내용(새 기능, 타입 변경, 커맨드 추가, 설정 키 추가 등)이 있을 경우 CLAUDE.md를 먼저 업데이트한 뒤 푸쉬한다.
- **커밋 전 git 사용자 확인**: 커밋 전 `git config user.name` / `git config user.email`을 확인하고, `RamzThunder` / `ramzwith@gmail.com`이 아니라면 아래 명령으로 수정 후 커밋한다.
  ```bash
  git config --global user.name "RamzThunder"
  git config --global user.email "ramzwith@gmail.com"
  ```

## 앱 개요
개인 디지털 다이어리 데스크톱 앱. 자유 캔버스 꾸미기 스타일.
**앱 이름**: PanDeckI

## 기술 스택
- **프레임워크**: Tauri 2 (Rust 백엔드 + WKWebView 프론트엔드)
- **프론트엔드**: React 18 + TypeScript + Vite (포트 1420)
- **스타일**: Tailwind CSS v3 (ESM config — `tailwind.config.js`는 `export default` 형식)
- **DB**: SQLite (rusqlite bundled, `src-tauri/src/db.rs`)

## macOS 주의사항
- macOS 26 (Tahoe 베타, Darwin 25)에서 Electron 전 버전 동작 불가 → Tauri로 전환
- Cargo가 PATH에 없을 수 있으므로 실행 전 export 필요
- **iCloud Drive 주의**: `target/` 폴더를 iCloud가 동기화하려다 타임아웃 발생. `CARGO_TARGET_DIR`을 로컬로 설정
- **올바른 실행 명령** (프로젝트 위치: `~/Documents/on-diary`):
  ```bash
  export PATH="/opt/homebrew/bin:$HOME/.cargo/bin:$PATH"
  export CARGO_TARGET_DIR="$HOME/cargo_targets/pandecki"
  npm run tauri dev
  ```
- 프로젝트 스킬 있음: `.claude/skills/run-app/SKILL.md` 참고

## 주요 파일 구조
```
src/
  App.tsx                  # 라우팅(월간/일간), 테마/줌/전체폰트 로딩, Cmd+스크롤 줌
  api.ts                   # Tauri invoke 래퍼 — 아래 api 네임스페이스 목록 참고
  store/
    diary.ts               # useDiaryNav 훅, ViewMode = 'monthly' | 'daily'
    theme.ts               # PRESET_THEMES (4종: 하늘색·딸기핑크·흑백·다크), applyTheme(), applyGlobalFont()
  pages/
    DailyView.tsx          # 자유 캔버스 뷰 (메인 꾸미기 화면, ~2300줄)
    MonthlyView.tsx        # 월간 캘린더 + 목표/버킷리스트
  components/
    Sidebar.tsx            # 좌측 사이드바 (월간/일간 탭, 설정 버튼)
    ThemePanel.tsx         # 테마 편집 패널 (SettingsPanel 내부에서 사용)
    StickerPicker.tsx      # PNG 스티커팩 피커 (폴더 기반)
    CropModal.tsx          # 사진 크롭 모달 (고정 프레임/자유형, PNG 마스크 모양)
    MarkdownTestBox.tsx    # 마크다운 렌더 테스트 박스
src-tauri/
  src/
    commands.rs            # Rust IPC 커맨드 전체
    db.rs                  # SQLite 스키마 (entries, monthly_data, settings)
    lib.rs                 # Tauri 앱 빌더, 커맨드 등록
  tauri.conf.json          # 윈도우 설정 (1800×1012), assetProtocol 활성화
```

## CanvasEl 타입 (DailyView의 캔버스 요소)
```typescript
export interface CanvasEl {
  id: string
  type: 'text' | 'sticker' | 'photo' | 'video' | 'markdown' | 'analogClock' | 'digitalClock'
  x: number; y: number; w: number; h: number; z: number
  rotation: number       // 회전 각도 (deg)
  opacity: number        // 0-100
  content: string        // text: 텍스트, sticker/photo: base64 dataURL, video: URL

  // 텍스트 전용
  fontSize: number; color: string; bold: boolean; italic: boolean
  underline?: boolean; strikethrough?: boolean
  letterSpacing?: number   // 자간 (px, 기본 0) — 숫자 입력
  lineHeight?: number      // 줄간격 배율 (기본 1.4) — 숫자 입력
  scaleX?: number          // 장평 (%, 기본 100) — 숫자 입력
  fontFamily: string
  bgColor: string; bgOpacity: number   // 배경색 + 불투명도 (0=투명)
  align: 'left' | 'center' | 'right'
  alignV: 'top' | 'middle' | 'bottom'
  textRadius: number      // 모서리 둥글기 (px)
  borderWidth: number; borderColor: string

  // 사진 전용
  clipShape: string       // 'none'|'circle'|'heart'|'star'|'diamond'|'hexagon'|'custom_*'
  photoRadius: number     // clipShape=none일 때 모서리 둥글기 (%, 0-100)

  // 비디오 전용
  videoType?: 'embed' | 'local'   // embed: YouTube/Vimeo, local: 로컬 파일

  // 시계 전용
  clockFaceColor?: string    // 눈금/숫자/테두리 색 (기본 #ffffff)
  clockHandColor?: string    // 시침/분침 + 중앙 원 색 (기본 #ffffff)
  clockSecondColor?: string  // 초침 색 (기본 #ef4444)
  clockBgColor?: string      // 배경색 ('transparent' = 없음)

  // 링크
  linkUrl?: string        // 더블클릭 시 열리는 URL

  // 레이아웃/그룹
  groupId?: string        // Cmd+G로 묶인 그룹 ID
  locked?: boolean        // 잠금 — 선택/이동 불가
  flipH?: boolean         // 좌우 뒤집기
  flipV?: boolean         // 상하 뒤집기

}

export interface DailyData {
  elements: CanvasEl[]
  bg: string              // 배경색 hex
  bgImage?: string        // 배경 이미지 data URL
  bgImageScale?: number   // 배경 이미지 크기 (1.0 = 100%)
  bgImageRotation?: number // 0 | 90 | 180 | 270
  bgImageFit?: 'center' | 'cover'
}
```

## 앱 레이아웃 구조
- 최상위 래퍼: `100vw × 100vh`, 배경 `#5a5a5a` (캔버스 밖 영역)
- 내부 고정 캔버스: `1800 × 1012px`, `transform: scale(appZoom)` (기본 1.0)
- 네이티브 창: 수동 리사이즈 비활성화. 앱 줌 변경 시 고정 캔버스 비율에 맞춰 창 크기도 함께 변경하며 macOS 타이틀바 높이 28px을 보정
- 줌: Cmd/Ctrl+스크롤 또는 설정 패널 슬라이더 (50~150%), settings DB에 영속

## 구현된 기능
- **자유 캔버스**: 텍스트/스티커/사진/카드/비디오 자유 배치, 드래그/리사이즈/회전
- **드래그**: `window.addEventListener('pointermove/pointerup')` 방식 (React synthetic event 문제 우회)
- **드래그 경계**: 회전된 요소의 실제 bounding box(bbW/bbH) 기준으로 캔버스 이탈 방지 — 세로 이미지 90° 회전 시에도 상단 여백 없이 배치 가능
- **마키 선택**: 빈 캔버스 드래그 → 영역 내 요소 다중 선택
- **다중 선택/조작**: Shift+클릭, 다중 드래그/리사이즈, Cmd+G 그룹핑, 레이어 정렬(맨앞/앞/뒤/맨뒤)
- **실행 취소/다시 실행**: 최대 50단계 히스토리, Cmd+Z / Cmd+Shift+Z, 툴바 ↩↪ 버튼
- **잠금**: 요소별 잠금(locked) — 선택/이동 불가, 우클릭 메뉴로 토글
- **뒤집기**: 좌우(flipH)/상하(flipV) 반전
- **링크**: 요소에 URL 첨부 → 더블클릭 시 브라우저로 열기
- **텍스트**: 폰트/크기/색상/굵기/기울임/밑줄/취소선/자간/줄간격/가로정렬/세로정렬/배경색(불투명도)/테두리/모서리. 툴바 4행 구조: 글꼴조정|문장조정|텍스트박스조정|전체공통
- **시스템 폰트**: macOS=NSFontManager(Python 경유), Windows=PowerShell+PresentationCore(DirectWrite) — 한글 포함 전체 폰트 열거, 검색 가능
- **전체 폰트**: 설정 패널에서 앱 전체 폰트 변경 (`applyGlobalFont`). 최근 사용 폰트 5개 상단 고정 (`recentFonts` settings 키)
- **PNG 스티커팩**: `sticker/` 폴더 내 하위 폴더 = 팩, 자동 감지
- **사진 크롭**: 고정 프레임 + 이미지 이동/줌, Canvas API로 최종 렌더
- **사진 자유형 크롭**: 드래그로 영역 선택 → 해당 영역만 추출
- **사진 모양**: circle/heart/star/diamond/hexagon (CSS clip-path + SVG) + PNG 마스크 커스텀 모양
- **커스텀 모양**: PNG 업로드 → WebkitMask 미리보기, Canvas 합성 저장, settings DB에 영속
- **사진 배경색**: 크롭 모달에서 설정, 즐겨찾기(`favBgColors`) 영속
- **배경**: 프리셋 8색 + 커스텀 3슬롯(우클릭 삭제) + hex 입력 + 배경 이미지(크기/회전/fit)
- **불투명도**: 요소 전체 투명도 슬라이더
- **뒤집기**: 좌우/상하 반전
- **비디오**: YouTube/Vimeo embed(`videoType: 'embed'`) + 로컬 파일(`videoType: 'local'`). YouTube URL 인식: watch?v=, shorts/, live/, youtu.be/. embed URL: `youtube.com/embed/` 사용 (nocookie 아님)
- **동영상 툴바**: photo=600px, 그 외(video/sticker 등)=410px, text=460px
- **야구 티켓 팀 선택**: KBO 12구단 + 울산 웨일즈/상무 피닉스. 팀별 `color`(메인)·`color2`(그라데이션) 2색 적용. 헤더 배경: 135° 대각선 그라데이션, color1 35% 고정 후 color2로 전환. `homeTeam` 필드 → KBO_TEAMS 맵
- **문장 수집 카드 줄바꿈**: 인용구 박스는 `\n` 자동 인식(최대 20줄, 카드 높이 자동 확장). 원고지는 `manuscriptNewline` 토글(OFF=순차 흐름, ON=\n마다 새 행 시작)
- **회전 스냅**: Shift 누른 채 핸들 회전 시 15° 단위로 스냅
- **클립보드 붙여넣기**: Cmd+V로 이미지→사진요소, 텍스트→텍스트요소
- **학생 목록/발표 뽑기**: 줄별 학생 목록을 저장하고 판 하단 도크에서 이동·크기 조절 가능한 발표 위젯을 실행. 위젯 크기에 따라 내부 UI도 함께 확대/축소. 빈 판 클릭 시 선택 해제되며 선택 중에만 기존 요소 툴바 스타일의 툴바·핸들을 표시. 한 번에 뽑을 인원 설정, 뽑힌 학생 자동 제외/개별 복원, 당일 결석 학생 제외, 추첨 초기화 가능
- **시계 위젯**: 아날로그(`analogClock`, 기본 210×210) + 디지털(`digitalClock`, 기본 260×92). 1초마다 실시간 갱신(`setInterval`). 아날로그는 비율 고정 리사이즈. 툴바에서 눈금/침/초침/배경색 4색 커스터마이즈 가능. 도크에 시계 추가 버튼(드롭다운) 제공
- **테마**: 4 프리셋(하늘색·딸기핑크·흑백·다크, 기본=하늘색) + 5 커스텀 슬롯(삭제 가능), CSS 변수 기반 (`--color-primary` 등)
- **앱 줌**: Cmd+스크롤 또는 설정 슬라이더 (50~150%), settings DB에 영속
- **PNG 내보내기**: 캔버스를 PNG로 저장 (`save_png` 커맨드)
- **화면 캡처**: macOS=ObjC FFI(NSView→NSWindow→windowNumber)로 CGWindowID 직접 획득 → `screencapture -l <wid> -x`. Windows=Win32 GDI 직접 호출(GetDC→BitBlt→GetDIBits, `png` 크레이트로 저장), DPI 인식은 `SetThreadDpiAwarenessContext(PER_MONITOR_V2)`. 둘 다 지역 캡처 폴백 있음
- **백업**: JSON으로 전체 DB 내보내기/불러오기 (트랜잭션으로 원자적 처리)
- **월간 뷰**: 캘린더 + 목표/버킷리스트/D-Day/프로필
- **저장**: SQLite, 날짜별 JSON 저장

## Sidebar 구조
- 아이콘만 표시 (텍스트 없음), 24px 아이콘, 44px 버튼
- 상단: 트래픽라이트 → 연/월 → 월간/일간 탭 → 내보내기
- 하단: 저장 → 설정

## SettingsPanel 구조 (우측 패널)
- **정보 탭**: 소프트웨어 버전 표시(`getVersion()`) + 수동 업데이트 버튼(`check()` → ask → downloadAndInstall → relaunch) + 다이어리 이름 + 백업 내보내기/불러오기 + DB 저장 위치
  - `geocode` 타입: 도시 검색 입력 → Open-Meteo geocoding API 조회 → 결과 선택 → JSON 저장

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

## api.ts 네임스페이스
```
api.entry      get(date), save(date, content), listMonth(ym), listMonthBgs(ym)
api.monthly    get(ym), save(ym, data)
api.settings   get(key), set(key, value)
api.file       pickImage(), pickVideo(), readFileB64(path)
api.sticker    listPacks(), getDir(), pickDir()
api.fonts      list()
api.shell      openUrl(url)
api.http       fetchText(url), fetchImageB64(url)
api.export     savePng(b64, filename), captureToB64(), captureScreenshot()
api.backup     export(), import()
api.db         getPath(), openFolder(), pickDir(), resetPath()
```

## Settings DB 키 목록
| 키 | 값 형식 | 설명 |
|---|---|---|
| `active_theme` | string (theme id) | 현재 테마 |
| `theme_{id}` | JSON (Theme) | 커스텀 테마 데이터 |
| `appZoom` | float string | 앱 배율 |
| `globalFont` | string | 전체 폰트명 |
| `fontScale` | float string | 폰트 크기 배율 |
| `fontOffsetY` | float string | 폰트 Y 오프셋 |
| `customShapes` | JSON (CustomShape[]) | 커스텀 크롭 모양 |
| `bgCustomColors` | JSON (string[3]) | 배경 커스텀 색 3슬롯 |
| `favBgColors` | JSON (string[]) | 크롭 모달 배경색 즐겨찾기 |
| `themeRecentColors` | JSON (string[]) | 최근 사용 테마 색상 |
| `globalBucket` | JSON (BucketItem[]) | 버킷리스트 (월간 뷰) |
| `globalDDays` | JSON (DDayItem[]) | D-Day 목록 (월간 뷰) |
| `globalProfile` | JSON ({name,bio,photo}) | 프로필 (월간 뷰) |
| `diaryName` | string | 다이어리 이름 (내보내기 파일명에 사용) |
| `recentFonts` | JSON (string[5]) | 최근 선택한 폰트 (폰트 드롭다운 상단 고정) |

## Rust 커맨드 목록
```
# 엔트리
get_entry, save_entry, list_month_entries, list_month_bgs

# 월간 데이터
get_monthly, save_monthly

# 설정
get_setting, set_setting, get_settings_batch(keys: Vec<String>)   ← 스타트업 배치 로딩용

# 파일/미디어
pick_image, pick_video, read_file_b64

# 스티커
get_sticker_dir, list_sticker_packs, pick_sticker_dir

# 폰트
list_system_fonts

# 창 제어
resize_window, window_start_dragging, window_close, window_minimize, window_toggle_maximize

# 내보내기
save_png(b64, filename), capture_screenshot_to, capture_screenshot_b64

# 백업
backup_export_to, backup_import_from   ← import는 트랜잭션으로 원자적 처리

# DB 경로
get_db_path, open_db_folder, pick_db_dir, reset_db_path

# 네트워크
fetch_text, fetch_image_b64

# 기타
open_url
```

## 자동 업데이트 (Auto-Update)
- **방식**: GitHub Releases + `tauri-plugin-updater` (서명 키 기반, Apple 개발자 계정 불필요)
- **서명 키**: `~/.tauri/dida.key` (로컬), 공개키는 `tauri.conf.json`에 포함
- **GitHub Secret**: `TAURI_SIGNING_PRIVATE_KEY` (비밀번호 없음)
- **릴리즈 방법**: 버전 태그 푸쉬 → GitHub Actions 자동 빌드 (macOS aarch64 + Windows x86_64 병렬)
  ```bash
  # 1. package.json / tauri.conf.json 버전 올리기
  # 2. 커밋 후 태그 푸쉬
  git tag v1.0.1
  git push origin v1.0.1
  ```
- **워크플로우 구조**: `build-macos` + `build-windows` 병렬 → `release` job에서 합쳐 latest.json 생성
- **latest.json 플랫폼**: `darwin-aarch64`, `windows-x86_64`
- **Windows 아티팩트**: NSIS `.exe` (설치파일) + `.nsis.zip` + `.nsis.zip.sig` (업데이터)
- **macOS 최초 실행**: 우클릭 → 열기 (또는 `xattr -dr com.apple.quarantine "/Applications/PanDeckI.app"`)
- **워크플로우**: `.github/workflows/release.yml`

## 크로스 플랫폼 구현 (macOS vs Windows)
| 기능 | macOS | Windows |
|------|-------|---------|
| 폰트 목록 | Python3 + NSFontManager | PowerShell + InstalledFontCollection |
| 화면 캡처 | ObjC FFI → windowNumber → screencapture -l | Win32 GDI 직접 호출 (GetDC→BitBlt→GetDIBits, png 크레이트, DPI PER_MONITOR_V2) |
| URL 열기 | `open` 명령 | `cmd /c start` |
| DB 기본 경로 | iCloud Drive (`~/Library/Mobile Documents/...`) | AppData (`%APPDATA%/com.subinlee.pandecki/`) |

## 성능 관련 주의사항
- **base64 이미지**: CanvasEl의 `content`에 base64 dataURL을 저장하므로 엔트리 JSON이 매우 커질 수 있음
- **월간 뷰 배경 로딩**: `list_month_bgs`로 SQLite `json_extract`를 써서 bg/bgImage만 추출 (풀 엔트리 로드 금지)
- **백업 import**: 반드시 트랜잭션 안에서 처리 (개별 INSERT 시 매우 느림)
- **DailyView persist**: 변경마다 전체 JSON을 save_entry — 불필요한 저장 최소화 필요

## 맥미니 첫 실행 체크리스트
```bash
# 1. Rust 설치 (없으면)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# 2. Node.js 설치 (없으면)
brew install node

# 3. 의존성 설치
cd ~/Documents/on-diary
npm install

# 4. 앱 실행
export PATH="/opt/homebrew/bin:$HOME/.cargo/bin:$PATH"
export CARGO_TARGET_DIR="$HOME/cargo_targets/pandecki"
npm run tauri dev
```
