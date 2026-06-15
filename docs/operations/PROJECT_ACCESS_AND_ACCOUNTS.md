# 프로젝트 실행 권한 및 계정 정리

이 문서는 CCC Bus Reservation System을 개발, 운영, 배포하기 위해 필요한
계정과 권한을 실행 범위별로 정리한다. 비밀키의 실제 값은 문서나 Git에
기록하지 않는다.

## 1. 실행 범위별 최소 준비

| 실행 범위 | 필요한 계정/권한 | 필수 설정 |
| --- | --- | --- |
| 프론트엔드 로컬 실행 | Supabase 프로젝트 조회 권한, 일반 테스트 사용자 | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, 선택적으로 `VITE_KAKAO_JAVASCRIPT_KEY` |
| 관리자 화면 사용 | Supabase Auth 사용자와 해당 `admin_roles` 역할 | `global_admin`, `campus_admin`, 또는 `boarding_manager` |
| DB 최초 구축/변경 | Supabase CLI와 연결 프로젝트를 관리할 수 있는 프로젝트 관리자 | `supabase/migrations` 적용 |
| Edge Function 배포 | 대상 Supabase 프로젝트에 Function 배포 및 Secret 설정 권한, Supabase CLI 로그인 | 함수별 Secret, `supabase functions deploy ...` |
| 로컬 최적화 워커 | 운영 담당자 전용 PC, Supabase 관리자급 비밀키 접근 권한 | `VITE_SUPABASE_URL` 또는 `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| 시뮬레이션 | 운영과 분리된 Supabase 테스트 프로젝트 관리자 | 테스트 프로젝트의 `SUPABASE_SERVICE_ROLE_KEY` |
| Firebase Hosting 배포 | GitHub 저장소 관리 권한, Firebase Hosting 배포 서비스 계정 | GitHub Actions Secrets |
| Cloud Run 최적화 | Google Cloud 프로젝트 관리/배포 권한과 전용 서비스 계정 | Cloud Run Job, Secret Manager, Artifact Registry |
| 승차 명단 Google Sheet 동기화 | Google Cloud 서비스 계정과 대상 Sheet 편집 권한 | Google Sheets API 및 함수 Secret |

## 2. 애플리케이션 사용자 계정과 역할

모든 애플리케이션 사용자는 Supabase Auth 계정이다. 데이터 접근은 RLS와
`admin_roles` 테이블을 통해 제한된다.

| 역할 | 주요 권한 |
| --- | --- |
| 일반 사용자 | 자신의 프로필, 신청, 입금 및 버스표 관련 기능 사용 |
| `campus_admin` | 배정된 지구/팀/캠퍼스 범위의 신청·입금·송금 보고 및 캠퍼스 문의 관리 |
| `boarding_manager` | 전체 관리자가 배정한 버스의 승차 명단 조회, 탑승 처리, 출발 처리 |
| `global_admin` | 모든 관리자 화면과 운영 기능 접근, 관리자 역할 관리, 배차·최적화·시뮬레이션·감사 로그·Google Sheet 동기화 |

`global_admin`은 다른 관리자 역할의 권한을 포괄한다. 최초 전체 관리자는
일반 회원가입 후 SQL 또는 분리된 테스트 프로젝트의 시뮬레이션 도구로
`global_admin` 역할을 부여해야 한다.

## 3. Supabase 계정과 키

### 사람이 사용하는 Supabase 프로젝트 관리자 계정

다음 작업을 수행할 수 있어야 한다.

- SQL Editor에서 초기 스키마와 후속 SQL 적용
- Auth 설정 및 사용자 확인
- Kakao OAuth Provider 설정
- Edge Function 배포
- Edge Function Secrets 설정
- 운영/테스트 프로젝트를 명확히 분리하여 관리

CLI 배포 시에는 해당 프로젝트에 접근 가능한 Supabase 계정으로
`supabase login`과 프로젝트 연결이 필요하다.

### 브라우저 공개 가능 설정

| 변수 | 용도 |
| --- | --- |
| `VITE_SUPABASE_URL` | 프론트엔드가 접속할 Supabase 프로젝트 URL |
| `VITE_SUPABASE_ANON_KEY` | RLS가 적용되는 브라우저용 공개 키 |
| `VITE_SIMULATION_PROJECT_ID` | 시뮬레이션 실행을 허용할 테스트 프로젝트 ID |

`VITE_` 접두사가 붙은 값은 빌드 결과에 포함된다. 관리자급 비밀키에는 절대
`VITE_`를 붙이지 않는다.

### 관리자급 비밀 설정

| 변수/Secret | 사용 위치 | 주의 |
| --- | --- | --- |
| `SUPABASE_SERVICE_ROLE_KEY` | 로컬 최적화 워커, 시뮬레이션, Edge Functions, Cloud Run Job | RLS를 우회하는 최고 민감도 키. 브라우저 및 Git 금지 |
| `SUPABASE_URL` | Edge Functions, Cloud Run Job | 서버 실행용 프로젝트 URL |
| `SUPABASE_ANON_KEY` | Edge Functions | 호출 사용자 JWT 검증용 |
| `SIMULATION_PASSWORD` | Simulation Runner Edge Function | 생성되는 시뮬레이션 계정의 공통 비밀번호 |

Edge Functions에는 Supabase가 제공하는 기본 Secret 외에 함수별 Secret을
`supabase secrets set ...`으로 등록한다.

## 4. Kakao 계정

두 종류의 Kakao 설정이 필요하다.

1. 지도/주소 검색용 Kakao JavaScript 키
   - Kakao Developers 앱의 JavaScript 키를 `VITE_KAKAO_JAVASCRIPT_KEY`에 설정한다.
   - 로컬 주소와 실제 Firebase Hosting 주소를 Web 플랫폼 허용 도메인에 등록한다.
   - 이전 호환 변수 `VITE_KAKAO_MAP_KEY`도 코드에서 읽지만, 기본 변수는
     `VITE_KAKAO_JAVASCRIPT_KEY`다.
2. Kakao 로그인용 OAuth 앱
   - 같은 또는 별도 Kakao Developers 앱을 Supabase Auth의 Kakao Provider에 연결한다.
   - Supabase가 안내하는 callback URL과 프론트엔드의 `/auth/callback` 경로가
     정상적으로 연결되도록 설정한다.

## 5. GitHub 및 Firebase Hosting

저장소는 `https://github.com/dsiaked/ccc_bus`를 사용하며, `dev` 브랜치
push 시 Firebase Hosting 운영 채널로 배포한다. PR에는 미리보기 채널을 만든다.

### 필요한 GitHub 권한

- 코드를 push하거나 PR을 만들 저장소 권한
- Actions workflow 실행 권한
- 아래 Actions Secrets를 등록/교체할 저장소 관리자 권한

### GitHub Actions Secrets

| Secret | 용도 |
| --- | --- |
| `VITE_SUPABASE_URL` | 프론트엔드 빌드 |
| `VITE_SUPABASE_ANON_KEY` | 프론트엔드 빌드 |
| `VITE_KAKAO_JAVASCRIPT_KEY` | 프론트엔드 빌드 |
| `FIREBASE_SERVICE_ACCOUNT_CCCBUS_99680` | Firebase Hosting 배포 |

`GITHUB_TOKEN`은 GitHub Actions가 자동 발급한다. Firebase 서비스 계정에는
`cccbus-99680` 프로젝트의 Hosting 배포에 필요한 권한만 부여한다.

## 6. Google Cloud Run 최적화

Cloud Run 최적화는 선택 기능이며 다음 계정을 분리한다.

### 배포 담당자 계정

Cloud Run Job, 컨테이너 이미지, Secret 및 서비스 계정을 구성할 수 있어야 한다.
일반적으로 다음 작업 권한이 필요하다.

- Artifact Registry에 이미지 push
- Cloud Run Job 생성/갱신
- 런타임 서비스 계정을 Job에 연결
- Secret Manager Secret 생성 및 접근 정책 설정

### Launcher 서비스 계정

Supabase Edge Function의 `GCP_SERVICE_ACCOUNT_JSON`에 등록한다.
설정된 Cloud Run Job을 실행하는 `run.jobs.run` 권한만 부여한다.

필수 Edge Function Secrets:

- `GCP_PROJECT_ID`
- `GCP_REGION`
- `GCP_RUN_JOB_NAME`
- `GCP_SERVICE_ACCOUNT_JSON`

### Cloud Run 런타임 서비스 계정

현재 Job 설정은
`ccc-bus-optimizer-runtime@ccc-bus-optimizer-20260608.iam.gserviceaccount.com`을
사용한다. 이 계정에는 `ccc-bus-supabase-service-role-key` Secret의 최신 값을
읽을 수 있는 권한만 부여한다.

Cloud Run Job은 실행마다 `ALLOCATION_OPTIMIZATION_JOB_ID`를 전달받으며,
`SUPABASE_SERVICE_ROLE_KEY`는 Secret Manager에서만 주입한다.

## 7. Google Sheet 동기화

`boarding-roster-google-sheet` Edge Function은 전체 관리자만 호출할 수 있다.

필요 설정:

- Google Cloud 프로젝트에서 Google Sheets API 활성화
- 전용 Google 서비스 계정 생성 및 JSON 키 발급
- 대상 Google Sheet를 서비스 계정 이메일에 `편집자`로 공유
- Supabase Secrets 설정:
  - `GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON`
  - `BOARDING_ROSTER_SPREADSHEET_ID`
- 프론트엔드에서 링크를 표시하려면 `VITE_BOARDING_ROSTER_GOOGLE_SHEET_URL` 설정

서비스 계정 JSON은 프론트엔드 환경변수, 저장소, 일반 공유 문서에 넣지 않는다.

## 8. 로컬 도구 및 현재 상태

기본 개발 실행:

```powershell
npm install
npm run dev
```

현재 작업 PC에서 확인된 상태:

- 설치됨: Node.js, npm, Git, Python Launcher
- 설치되지 않음: Supabase CLI, Firebase CLI, Google Cloud CLI, Docker
- `.env`에 프론트엔드 Supabase 설정, Kakao JavaScript 키,
  `SUPABASE_SERVICE_ROLE_KEY`, 시뮬레이션 프로젝트 ID의 변수명이 존재
- `.env.local`에 로컬 최적화 모드와 Google Sheet URL 관련 변수명이 존재
- `.env`와 `.env.local`은 `.gitignore`에 포함되어 있고 Git에서 추적되지 않음

프론트엔드 로컬 실행에는 미설치 CLI가 필요하지 않다. Supabase Functions 배포,
Firebase 수동 배포, Cloud Run 구성에는 해당 CLI 또는 각 서비스의 웹 콘솔이
필요하다.

## 9. 권장 계정 분리와 보안 규칙

- 운영 Supabase와 시뮬레이션 Supabase 프로젝트를 반드시 분리한다.
- 일반 개발자에게 `SUPABASE_SERVICE_ROLE_KEY`를 기본 제공하지 않는다.
- 로컬 최적화 워커는 제한된 운영 담당자 PC에서만 실행한다.
- Google 서비스 계정은 Launcher용, Cloud Run 런타임용, Sheets용으로 분리한다.
- 서비스 계정 JSON과 service-role 키는 주기적으로 교체하고 퇴사자/외부 협력자의
  접근 권한을 즉시 회수한다.
- `VITE_` 변수에는 공개되어도 되는 값만 넣는다.
- Firebase, Supabase, Google Cloud, Kakao, GitHub 각각에 조직 소유 관리자 계정을
  최소 2명 유지하고 개인 단독 소유를 피한다.
- 운영 배포 및 관리자급 키 접근에는 다중 인증을 적용한다.
