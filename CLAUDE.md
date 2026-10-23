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
교실용 판(보드) 데스크톱 앱. 대시보드에서 판을 만들고, 각 판은 자유 캔버스로 꾸민다. (디지털 다이어리 앱 dida에서 출발)
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
  App.tsx                  # 대시보드/학생 목록/판 전환, 테마/줌/전체폰트 로딩, Cmd+스크롤 줌, 전체화면
  api.ts                   # Tauri invoke 래퍼 — 아래 api 네임스페이스 목록 참고
  store/
    theme.ts               # PRESET_THEMES (4종: 하늘색·딸기핑크·흑백·다크), applyTheme(), applyGlobalFont()
  pages/
    Dashboard.tsx          # 판 목록/카테고리/새 판 만들기
    StudentLists.tsx       # 학생 목록 편집 (기피 쌍 포함)
    DailyView.tsx          # 판 하나의 자유 캔버스 (메인 꾸미기 화면)
  components/
    AppSidebar.tsx         # 좌측 아이콘 레일 (대시보드/학생 목록/전체화면/설정)
    SettingsPanel.tsx      # 설정 패널 (테마/폰트/줌/업데이트/백업/DB 위치)
    UpdateNotice.tsx       # 시작 시 자동 업데이트 알림
    StickerPicker.tsx      # PNG 스티커팩 피커 (폴더 기반)
    CropModal.tsx          # 사진 크롭 모달 (고정 프레임/자유형, PNG 마스크 모양)
    RichText.tsx           # 텍스트 박스 글자별 서식 (TextRun 모델, 서식 편집기 RichTextEditor, RichTextContent)
    RandomStudentPicker.tsx # 발표 뽑기 위젯
    GroupMaker.tsx         # 조 만들기 위젯
    TimetableClock.tsx     # 시정표 시계 (Whattime 포맷 파싱/계산, 미니·전체 모드, 색상 변수)
    TimetableEditor.tsx    # 시정 설정 모달 (일반/개인/특별 시정, 요일·보정, Whattime 가져오기)
    TimetableColorPanel.tsx # 시정표 색상 패널 (Whattime 색상 키·프리셋·내 색 10칸·종료 알림)
src-tauri/
  src/
    commands.rs            # Rust IPC 커맨드 전체
    db.rs                  # SQLite 스키마 (entries, monthly_data(dida 잔재, 백업 호환용으로 테이블만 유지), settings)
    lib.rs                 # Tauri 앱 빌더, 커맨드 등록
  tauri.conf.json          # 윈도우 설정 (1800×1012), assetProtocol 활성화
```

## CanvasEl 타입 (DailyView의 캔버스 요소)
```typescript
export interface CanvasEl {
  id: string
  type: 'text' | 'sticker' | 'photo' | 'video' | 'analogClock' | 'digitalClock' | 'timetableClock' | 'qr'
  x: number; y: number; w: number; h: number; z: number
  rotation: number       // 회전 각도 (deg)
  opacity: number        // 0-100
  content: string        // text: 일반 텍스트(서식 제외), sticker/photo/qr: base64 dataURL, video: URL

  // 텍스트 전용 (아래 서식 필드는 박스 기본값, 글자별 서식은 runs)
  runs?: TextRun[]       // 글자별 서식 구간 {text, color?, fontFamily?, fontSize?, bold?, italic?, underline?, strikethrough?}
                         // 없으면 박스 전체 서식. 기본값과 같은 속성은 저장하지 않음 (RichText.normalizeRuns)
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

  // 시정표 시계 전용
  ttMode?: 'mini' | 'full'   // 미니(현재 교시 블록 하나, 기본) / 전체(오늘 시정 목록)
  ttShowPersonal?: boolean   // 개인 시간표(반·과목) 표시 (기본 true)
  ttColors?: { bg?, active?, inactive?, countdown?, bell_alert? }  // Whattime 색상 키, bg ''=투명
  ttBellAlert?: boolean; ttBellSeconds?: number   // 개인 수업 종료 N초 전 진행 바 색 변화

  // QR 전용
  qrUrl?: string; qrTitle?: string

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
- 전체화면: 사이드바 전체화면 버튼 / F11 / Cmd+Ctrl+F (`set_fullscreen`, `is_fullscreen` 커맨드). 사이드바를 숨기고 콘텐츠 영역(1744×1012)을 디스플레이에 맞춰 비율 유지 확대 + 가운데 정렬(남는 영역 #111). 오른쪽 위 구석 호버 시 끝내기 버튼. 전체화면 중 Cmd+스크롤 줌 비활성

## 듀얼 디스플레이 발표 모드
- 전체화면 버튼 / F11 / Cmd+Ctrl+F: 다른 디스플레이가 있으면 별도 `presentation` 창에 판을 표시하고 메인 창은 편집 가능 상태 유지. 하나뿐이면 기존 전체화면으로 동작.
- 발표 창은 `index.html?presentation=1` → `src/presentation/PresentationApp.tsx`. 고정 1744×1012 좌표를 비율 유지 확대. 편집 도크·선택 테두리·조작 버튼을 숨기며 편집/저장 effect는 실행하지 않음.
- `src/presentation/sync.ts`: 편집 창이 상태의 원본. `useBoardState`로 판·시정표·학생 위젯 상태를 32ms 단위 묶음 전송. 발표 창 준비 이벤트에 전체 스냅샷 전송, 이후 변경 키만 전송하며 data URL 이미지는 연결당 한 번 전송. 드래그 도중 DOM 위치/크기도 별도 전달.
- 메인 창에서 판을 전환하면 발표 창도 전환. 대시보드/학생 목록에서는 발표 창에 판 선택 안내 표시. Esc / 전체화면 버튼으로 종료, 모니터 분리 감지 시 발표 창 종료.
- macOS는 `set_simple_fullscreen`으로 별도 Space 전환 없이 출력하며 종료 시 복원. 다른 플랫폼은 일반 전체화면. `src-tauri/src/presentation.rs`에서 대상 모니터의 배율로 논리 좌표를 계산하고, 실제 창 위치·소속 모니터가 바뀐 것을 확인한 뒤 전체화면 적용. 화면 크기까지 확인 후 창 표시하며, 각 단계가 3초 내 완료되지 않으면 창을 닫고 오류 표시. 창 이동/크기 명령은 macOS에서 비동기이므로 연속 호출만으로 완료를 가정하지 않음.
- `PresentationVideo.tsx`: 편집 창에서 영상 재생·일시정지·탐색 조작, 발표 창은 음소거로 동기화하여 중복 오디오 방지. YouTube는 `src-tauri/src/youtube-player.html` API 브리지, Vimeo는 플레이어 메시지 API 사용. 로컬 영상도 지원. 임베드 영상은 네트워크/제공자 정책에 영향받음.
- 커맨드: `start_presentation` (다른 화면 없으면 false), `stop_presentation`, `presentation_status`.
- 검증: `npm run test:presentation`, `npm run build`, `cargo check --manifest-path src-tauri/Cargo.toml`. macOS WebKit 렌더링 smoke test는 빌드 후 `swift scripts/presentation-webkit-smoke.swift` (임시 데이터, 실제 DB 접근 없음). 실제 디스플레이의 DPI·배치·연결 해제 및 외부 영상 재생은 실기기 확인 필요.

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
- **글자별 서식**: 폰트·크기·색·굵게·기울임·밑줄·취소선은 글자 단위. 편집은 contentEditable(`RichTextEditor`, 비제어 — 입력/IME 조합 중엔 DOM을 건드리지 않고 서식 적용 시에만 다시 그림), 해석은 computed style 기반. 편집 중에도 툴바 표시(버튼 mousedown preventDefault로 선택 유지, 툴바 입력칸으로 포커스가 가도 편집 유지). 글자 선택 시 선택 범위에만, 선택 없으면 박스 기본값 변경 + 해당 속성 글자별 서식 초기화. 붙여넣기는 일반 텍스트만. 편집 종료 저장은 `editingId` 변화를 감지하는 effect에서 처리
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
- **기피 설정 (avoidPairs)**: 학생 목록 편집 화면에서 같은 조에 두면 안 되는 학생 쌍 등록. `StudentList.avoidPairs?: [number, number][]` — 학생 인덱스 쌍 배열. 조 만들기/좌석 배치에서 자동 적용
- **조 만들기 위젯 (GroupMaker)**: `src/components/GroupMaker.tsx`. 도크 "조 만들기" 버튼으로 실행. 조 수 설정 → buildGroups 함수(400회 시도, 기피 쌍 제약 충족). 결과 카드 표시. 발표 뽑기와 동일한 드래그/리사이즈/z-order 인프라. 선택한 학생 목록의 avoidPairs 자동 적용
- **QR 코드**: URL 입력 → `qrcode` 라이브러리로 400×400 PNG 생성 → `qr` 요소(제목 선택)로 캔버스 삽입. linkUrl도 함께 첨부되어 더블클릭 시 브라우저 열림
- **시계 위젯**: 아날로그(`analogClock`, 기본 210×210) + 디지털(`digitalClock`, 기본 260×92). 1초마다 실시간 갱신(`setInterval`). 아날로그는 비율 고정 리사이즈. 툴바에서 눈금/침/초침/배경색 4색 커스터마이즈 가능. 도크에 시계 추가 버튼(드롭다운) 제공
- **시정표 시계**: `timetableClock` (미니 300×130 기본 / 전체 300×560). Whattime(지금 몇교시야) `schedule.json` 포맷을 그대로 사용하고 계산 규칙도 동일(쉬는 날 → 날짜별 특별 시정 → 7교시 요일/6교시 자동 파생, 개인 시간표는 오늘 시정 index 매칭, `time_offset_seconds` 보정, `no_countdown` 블록 숨김). 시정은 모든 판 공유(`timetableSchedule`). 툴바 "⚙ 시정 설정"에서 판떼기 안 편집 또는 Whattime 가져오기(macOS: `~/Library/Application Support/WhatTime/schedule.json` 자동, 파일 선택 가능). `source: 'whattime'`이면 판 열 때마다 Whattime 최신 내용으로 자동 갱신, 판떼기에서 고쳐 저장하면 `'manual'`로 바뀌어 자동 갱신 중지. 교실용이라 출근/퇴근 카운트다운은 제외. 색상은 위젯별(Whattime 방식: 배경 명도→글자색, 진행 바 명도→진행 바 위 글자색, 프리셋 5 + 내 색 10칸, 종료 알림)
- **테마**: 4 프리셋(하늘색·딸기핑크·흑백·다크, 기본=하늘색) + 5 커스텀 슬롯(삭제 가능), CSS 변수 기반 (`--color-primary` 등)
- **앱 줌**: Cmd+스크롤 또는 설정 슬라이더 (50~150%), settings DB에 영속
- **트윗 카드**: X/Twitter 게시물 링크를 붙여넣으면 카드 이미지(photo 요소)로 삽입 (`fetch_text`/`fetch_image_b64`로 CORS 우회)
- **백업**: JSON으로 전체 DB 내보내기/불러오기 (트랜잭션으로 원자적 처리)
- **저장**: SQLite, 판별 JSON 저장 (entries 테이블, 키 `board_{id}`)
- **제거됨 (dida 잔재)**: 월간/주간 뷰, 날짜 이동, PNG 내보내기·화면 캡처, 마크다운 요소, 다이어리 이름 설정, 야구 티켓·문장 수집 카드

## AppSidebar 구조
- 56px 아이콘 레일: 로고(P) → 대시보드 → 학생 목록 … 하단: 전체화면 → 설정

## SettingsPanel 구조 (우측 패널)
- **정보 탭**: 소프트웨어 버전 표시(`getVersion()`) + 수동 업데이트 버튼(`check()` → ask → downloadAndInstall → relaunch) + 백업 내보내기/불러오기 + DB 저장 위치

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
api.entry      get(key), save(key, content), delete(key)
api.settings   get(key), set(key, value)
api.file       pickImage(), pickVideo(), readFileB64(path)
api.whattime   readInstalled(), pick()          ← Whattime schedule.json 원문 문자열
api.sticker    listPacks(), getDir(), pickDir()
api.fonts      list()
api.shell      openUrl(url)
api.http       fetchText(url), fetchImageB64(url)
api.backup     export(), import()
api.db         getPath(), openFolder(), pickDir(), resetPath()
api.video      getYoutubePort()
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
| `recentFonts` | JSON (string[5]) | 최근 선택한 폰트 (폰트 드롭다운 상단 고정) |
| `pandecki_boards` | JSON (BoardInfo[]) | 판 목록 |
| `pandecki_categories` | JSON (string[]) | 대시보드 카테고리 |
| `pandecki_student_lists` | JSON (StudentList[]) | 학생 목록 |
| `timetableSchedule` | JSON (TimetableSchedule) | 시정표 (Whattime 포맷 일부 + `source`/`importedAt`/`colors`) — 모든 판 공유 |
| `timetableCustomColors` | JSON ({키: string[]}) | 시정표 색상 "내 색" 슬롯 (키별 최대 10개) |

## Rust 커맨드 목록
```
# 엔트리
get_entry, save_entry, delete_entry

# 설정
get_setting, set_setting, get_settings_batch(keys: Vec<String>)   ← 스타트업 배치 로딩용

# 파일/미디어
pick_image, pick_video, read_file_b64

# 스티커
get_sticker_dir, list_sticker_packs, pick_sticker_dir

# 폰트
list_system_fonts

# Whattime 시정표
read_whattime_schedule (macOS 설치본 읽기), pick_whattime_schedule (JSON 파일 선택)

# 창 제어
resize_window, window_close, set_fullscreen, is_fullscreen

# 백업
backup_export_to, backup_import_from   ← import는 트랜잭션으로 원자적 처리

# DB 경로
get_db_path, open_db_folder, pick_db_dir, reset_db_path

# 네트워크
fetch_text, fetch_image_b64

# 기타
open_url, get_youtube_proxy_port
```

## 자동 업데이트 (Auto-Update)
- **방식**: GitHub Releases + `tauri-plugin-updater` (서명 키 기반, Apple 개발자 계정 불필요)
- **릴리즈 저장소**: PanDeckI 저장소 자체(공개). 워크플로우는 기본 `GITHUB_TOKEN`으로 릴리즈 생성 — PAT 불필요. 예전 dida 앱의 `dida-releases`와 섞이면 안 됨
- **자동 확인**: 앱 시작 3초 후 `UpdateNotice`(`src/components/UpdateNotice.tsx`)가 `check()` → 우측 하단 알림(업데이트/나중에, 다운로드 진행률). dev 모드에서는 건너뜀. 설정 → 정보의 수동 버튼도 유지
- **앱 아이콘**: 원본은 루트 `app-icon.png`(1024×1024, 투명 배경). 교체 시 `npx tauri icon app-icon.png -o src-tauri/icons`로 전체 재생성
- **서명 키**: `~/.tauri/pandecki.key` (로컬, 비밀번호 없음, 1.0.23부터 dida 키와 분리), 공개키는 `tauri.conf.json`에 포함
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
- **macOS 최초 실행**: 앱 번들은 ad-hoc 서명(`signingIdentity: "-"`). 브라우저로 받은 DMG는 격리 속성 때문에 경고 → DMG 안 `설치 방법.txt` 안내(그래도 열기 / `xattr -dr com.apple.quarantine /Applications/PanDeckI.app`). 가장 쉬운 설치: `curl -fsSL https://raw.githubusercontent.com/RamzThunder/PanDeckI/main/scripts/install-mac.sh | bash` (curl 다운로드는 격리 속성이 안 붙음). `.command` 스크립트는 그 자체가 격리돼 실행 불가라 제거함
- **워크플로우**: `.github/workflows/release.yml`

## 크로스 플랫폼 구현 (macOS vs Windows)
| 기능 | macOS | Windows |
|------|-------|---------|
| 폰트 목록 | Python3 + NSFontManager | PowerShell + InstalledFontCollection |
| URL 열기 | `open` 명령 | `cmd /c start` |
| DB 기본 경로 | iCloud Drive (`~/Library/Mobile Documents/...`) | AppData (`%APPDATA%/com.subinlee.pandecki/`) |

## 성능 관련 주의사항
- **base64 이미지**: CanvasEl의 `content`에 base64 dataURL을 저장하므로 엔트리 JSON이 매우 커질 수 있음
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
