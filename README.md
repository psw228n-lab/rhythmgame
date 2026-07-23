# Afterglow — 4-Key Rhythm System

`Z`, `X`, `C`, `V` 키로 플레이하는 4레인 브라우저 리듬게임입니다. 첨부된 MP3를 실제 PCM 데이터로 디코딩하여 BPM, 온셋, 에너지 변화를 분석했고, 그 결과로 Easy / Normal / Hard 채보를 생성했습니다. 곡 선택 카탈로그와 Supabase 글로벌 랭킹을 포함합니다.

## 빠른 실행

Node.js 22 이상이 필요합니다.

```bash
npm install
npm run dev
```

터미널에 표시되는 로컬 주소를 데스크톱 브라우저에서 여세요. 음악은 브라우저 정책상 사용자가 `START RUN`을 누른 뒤 재생됩니다.

## 조작법

| 기능 | 조작 |
| --- | --- |
| 1~4번 레인 | `Z`, `X`, `C`, `V` (`KeyboardEvent.code`의 `KeyZ`~`KeyV`) |
| 게임 시작 / 재시작 | 우측 `START RUN` / `↻` |
| 일시정지 | 우측 `PAUSE` |
| 에디터 기록 | `CHART LAB`에서 음악을 들으며 `Z`, `X`, `C`, `V` |
| 노트 추가 / 선택 | 에디터 타임라인 클릭 |
| 싱크 측정 | `SYNC`에서 테스트 비트에 맞춰 아무 레인 키 입력 |

처음 열면 `SONG SELECT` 화면이 표시됩니다. 곡을 선택하면 플레이 화면으로 이동합니다.

판정 범위는 `src/game/config.ts`에서 바꿀 수 있습니다.

- Perfect: ±45ms / 1,000점
- Great: ±90ms / 700점
- Good: ±140ms / 300점
- Miss: 140ms 초과 / 0점, 콤보 초기화

## 실제 오디오 분석과 채보 재생성

기본 입력 파일은 `public/audio/song.mp3`입니다.

```bash
npm run generate-chart
```

스크립트는 `mpg123-decoder`의 WebAssembly 디코더로 MP3를 PCM으로 변환합니다. FFmpeg는 필요하지 않습니다. 분석 단계는 다음과 같습니다.

1. 2,048 샘플 프레임과 512 샘플 홉으로 RMS 에너지와 고주파 변화량을 계산합니다.
2. 적응형 로컬 임계값으로 타격음/온셋 후보를 검출합니다.
3. 온셋 간격 히스토그램을 70~180 BPM 범위에 접어 넣어 BPM을 추정합니다.
4. 비트 위상과 에너지 상위 구간을 찾아 조용한 구간과 클라이맥스의 밀도를 다르게 만듭니다.
5. 계단, 역계단, 트릴, 교차, 동시치기, 롱노트 패턴을 난이도별 규칙으로 배치합니다.
6. 중복, 과밀 입력, 3개 이상 동시치기, 잘못된 lane/time, 곡 종료 이후 노트를 후처리합니다.

이 프로젝트의 실제 분석 결과는 다음과 같습니다.

| 항목 | 결과 |
| --- | ---: |
| 샘플 레이트 | 44,100Hz |
| PCM 샘플 | 10,870,784 / 채널 |
| 추정 BPM | 123.5 |
| 감지 온셋 | 1,063 |
| Easy | 334 notes · 1.35 notes/sec |
| Normal | 731 notes · 2.97 notes/sec |
| Hard | 1,438 notes · 5.83 notes/sec |

다른 파일을 분석하려면 기본 파일을 교체하거나 환경 변수로 경로를 지정하세요.

PowerShell:

```powershell
$env:CHART_AUDIO_PATH="public/audio/another-song.mp3"
npm run generate-chart
```

bash / zsh:

```bash
CHART_AUDIO_PATH="public/audio/another-song.mp3" npm run generate-chart
```

브라우저에서 사용하는 오디오 경로는 생성된 JSON의 `audio` 필드입니다. 배포 시에는 해당 파일이 `public` 아래에 있어야 합니다.

## 채보 설정

- `scripts/chart-config.mjs`: 분석 프레임, 온셋 민감도, BPM 범위, 난이도별 최소 간격과 최대 NPS
- `src/game/config.ts`: 게임 판정 범위, 점수, 기본 볼륨/속도/오프셋
- `public/charts/*.json`: 실제 게임이 불러오는 채보

채보 형식:

```json
{
  "title": "I Really Want to Stay at Your House",
  "audio": "./audio/song.mp3",
  "offset": 0,
  "bpm": 123.5,
  "difficulty": "normal",
  "notes": [
    { "time": 2.5, "lane": 0, "type": "tap" },
    { "time": 3.5, "lane": 2, "type": "hold", "duration": 0.8 }
  ]
}
```

## 채보 에디터

상단 `CHART LAB`에서 자동 생성 채보를 수정할 수 있습니다.

- 음악 재생/일시정지, 0.5× / 0.75× / 1× 속도
- 타임라인 이동과 4초 구간 반복
- 키 입력 또는 클릭으로 노트 추가
- 노트 선택, 삭제, ±10ms 미세 조정, 레인 변경
- 전체 오프셋 조정
- JSON 불러오기 / 내보내기

기록 시각은 프레임 수가 아니라 오디오 요소의 실제 `currentTime`을 사용합니다.

## Supabase 글로벌 랭킹 설정

GitHub Pages는 서버가 없는 정적 사이트이므로 브라우저에서 Supabase Data API에 연결합니다. `service_role` 키가 아니라 공개용 Publishable/anon key만 사용하며, 데이터 보호는 `supabase/schema.sql`의 RLS 정책이 담당합니다.

1. Supabase에서 프로젝트를 만듭니다.
2. Dashboard → SQL Editor에서 `supabase/schema.sql` 전체를 실행합니다.
3. Project URL과 Publishable/anon key를 확인합니다.
4. 로컬에서는 `.env.example`을 복사해 `.env.local`을 만들고 값을 입력합니다.

```text
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-publishable-anon-key
```

5. GitHub 저장소 Settings → Secrets and variables → Actions에 다음 Repository secrets를 등록합니다.

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

6. `main` 브랜치에 푸시하면 GitHub Actions가 두 값을 정적 빌드에 주입합니다.

게임 종료 후 닉네임을 입력해 점수를 등록할 수 있으며, `RANKING` 화면에서 곡·난이도별 상위 20개 기록을 확인합니다. 공개 클라이언트 방식은 RLS와 값 범위로 오용을 제한하지만 완전한 치팅 방지는 아닙니다. 검증이 필요하면 Supabase Edge Function에서 리플레이나 채보 서명을 검증하도록 확장하세요.

## 곡 추가 방법

새 음원과 채보를 `public` 아래에 넣고 `public/songs.json`에 항목을 추가하면 별도 코드 수정 없이 곡 선택 화면에 카드가 생깁니다.

```json
{
  "id": "new-song",
  "title": "New Song",
  "artist": "Artist",
  "bpm": 128,
  "duration": 180,
  "accent": "#21e6c1",
  "charts": {
    "easy": "./charts/new-song/easy.json",
    "normal": "./charts/new-song/normal.json",
    "hard": "./charts/new-song/hard.json"
  }
}
```

각 채보의 `audio` 필드는 해당 음원의 상대 경로를 가리켜야 합니다.

## 싱크와 기록

`SYNC` 화면은 Web Audio API로 8개의 테스트 비트를 예약 재생하고 입력 지연의 평균을 계산합니다. 오프셋 범위는 -300ms~+300ms, 단위는 5ms입니다.

볼륨, 노트 속도, 오디오 오프셋, 곡·난이도별 개인 최고 기록은 `localStorage`에 저장됩니다. 글로벌 기록은 `src/services/rankingService.ts`를 통해 Supabase에 저장됩니다.

## 테스트와 빌드

```bash
npm test
npm run build
npm run test:site
npm run build:pages
```

- `npm test`: 판정, 점수, 콤보, 정확도, 랭크, JSON 검증, 정렬, 후처리 단위 테스트
- `npm run build`: Sites/Cloudflare 배포용 vinext 빌드
- `npm run test:site`: 빌드 결과의 서버 렌더링 스모크 테스트
- `npm run build:pages`: GitHub Pages용 정적 결과를 `dist-pages`에 생성

## GitHub Pages 배포

`.github/workflows/deploy-pages.yml`이 포함되어 있습니다.

1. 저장소를 GitHub에 올리고 기본 브랜치를 `main`으로 둡니다.
2. 저장소 Settings → Pages → Source를 `GitHub Actions`로 선택합니다.
3. `main`에 푸시하면 테스트와 정적 빌드 후 자동 배포됩니다.

음원 파일을 공개 저장소나 웹사이트에 게시하기 전에는 반드시 해당 음원을 배포할 권리가 있는지 확인하세요.

## 주요 구조

```text
app/                         Sites/Cloudflare 페이지와 전역 스타일
public/audio/song.mp3        플레이할 오디오
public/charts/*.json         실제 분석으로 생성한 3개 채보
scripts/generateChart.mjs    MP3 디코딩 및 채보 생성 진입점
scripts/chartAnalysis.mjs    BPM/온셋/에너지 분석과 난이도 패턴
src/components/              게임 화면과 싱크 보정 UI
src/editor/ChartEditor.tsx   채보 에디터
src/game/                    오디오, 입력, 판정, Canvas, 엔진 모듈
src/services/                localStorage 기록 어댑터
supabase/schema.sql           공개 랭킹 테이블과 RLS 정책
tests/                       Vitest 단위 테스트와 사이트 스모크 테스트
```

## 오류 처리

음악/채보 누락, 잘못된 JSON, Web Audio 미지원, 오디오 재생 차단, 로딩 전 시작, 탭 비활성화 상황은 화면의 상태 메시지로 안내합니다. 탭이 숨겨지면 게임은 자동 일시정지됩니다.

## ChatGPT 로그인에 관하여

게임 코드에는 ChatGPT 로그인이나 OpenAI API 연동이 없습니다. 이전에 전달된 `chatgpt.site` 주소는 작업 확인용 Sites 배포를 비공개로 게시했기 때문에 플랫폼 접근 제한이 표시된 것입니다. GitHub Pages 배포본에는 해당 로그인이 붙지 않습니다.
