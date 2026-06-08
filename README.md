# CCC Bus Reservation System

## Supabase setup note

For a fresh Supabase project, run `sql/setup/combined_supabase_setup.sql` once. It already
includes the Seoul organization and station seed sections, so do not rerun
`80_seed_seoul_organization.sql`, `82_seed_stations_template.sql`, or
`83_add_dong_team_campuses.sql` unless you are patching an older database.

귀가 버스 신청 시스템입니다.

## 주요 페이지

### 사용자용
- **신청하기** (`/reservation`): 귀가 버스 신청
- **버스표 확인** (`/ticket`): 신청 현황 및 버스표 확인
- **버스표** (`/ticket`): 신청 현황과 확정된 버스표 상세 보기

### 관리자용
- **운영 대시보드** (`/admin/dashboard`): 전체 운영 현황과 빠른 작업
- **가입·신청 현황** (`/admin/applications`): 조직별 가입 및 신청 현황
- **개별 사용자 관리** (`/admin/users`): 사용자별 신청, 입금, 권한 관리
- **문의·공지** (`/admin/communications`): 캠퍼스 문의와 공지 관리
- **배차 관리** (`/admin/allocations`): 배차 계산, 작업공간, 결과 관리
- **입금·정산** (`/admin/payments/*`): 잔여 좌석, 캠퍼스 송금, 최종 검토
- **권한 관리** (`/admin/access/*`): 캠퍼스 관리자와 선탑자 관리
- **운영 설정** (`/admin/settings/*`): 초기 설정, 참여 목표, 신청 마감
- **시스템 관리** (`/admin/system/*`): 시뮬레이션과 관리 작업 기록

## 설정 방법

### 1. Supabase 데이터베이스 설정

Supabase 대시보드에서 다음 단계를 따르세요:

1. [Supabase](https://supabase.com)에 접속
2. 프로젝트의 SQL Editor 실행
3. `sql/setup/combined_supabase_setup.sql` 파일의 SQL을 모두 복사하여 실행
4. 테이블이 생성되었는지 확인

### 2. 환경 변수 설정

`.env` 파일에 다음 정보를 설정하세요:
```
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 3. 개발 서버 실행

```bash
npm install
npm run dev
```

## 주요 기능

### 사용자 기능
- **회원가입/로그인**: Supabase Auth를 통한 인증
- **신청하기**:
  - 이름, 연락처 입력
  - 팀, 캠퍼스 선택
  - 도착역 1-2지망 선택
  - 신청 정보 DB 저장
- **신청 수정**: 확정되기 전까지 정보 수정 가능
- **버스표 확인**:
  - 확정된 버스표 상세 보기
  - 호차, 좌석, 출발 시간, 탑승 장소, 도착역 확인
  - 출력 기능 지원

### 관리자 기능
- **모든 신청 조회**: 사용자별 신청 정보 조회
- **버스표 확정**:
  - 호차, 좌석 배정
  - 출발 시간, 탑승 장소 설정
  - 확정 도착역, 세부 위치 설정
  - 관리자 메모 추가
- **상태 관리**: 확정/대기/취소 상태 추적
- **통계**: 확정, 대기, 취소 인원 현황

## 데이터베이스 구조

### reservations 테이블
- `id` (uuid): 신청 ID
- `user_id` (uuid): 사용자 ID
- `name` (text): 이름
- `phone` (text): 연락처
- `team` (text): 팀
- `campus` (text): 캠퍼스
- `station_preferences` (jsonb): 도착역 선호도 (1-2지망)
- `status` (text): 상태 (requested, confirmed, cancelled)
- `confirmed_ticket` (jsonb): 확정된 버스표 정보
- `data` (jsonb): 전체 신청 정보 (호환성용)
- `created_at` (timestamp): 생성 시간
- `updated_at` (timestamp): 수정 시간

### confirmed_ticket 구조
```typescript
{
  busNumber: string;        // 호차
  seatNumber?: string;      // 좌석
  departureTime: string;    // 출발 시간
  boardingPlace: string;    // 탑승 장소
  dropoffStation: string;   // 도착역
  dropoffDetail?: string;   // 세부 위치
  managerNote?: string;     // 관리자 메모
  confirmedAt: string;      // 확정 시간
}
```

## API 서비스

`src/lib/reservationService.ts`에서 제공하는 함수들:

- `saveReservation(userId, reservation)`: 신청 정보 저장/수정
- `getReservation(userId)`: 사용자 신청 정보 조회
- `deleteReservation(userId)`: 사용자 신청 정보 삭제

## 보안 및 권한

### Row Level Security (RLS)
- 사용자는 자신의 신청만 조회/수정/삭제 가능
- 서비스 롤(관리자)은 모든 신청 관리 가능

### 관리자 권한
- 현재는 DB 접근 가능 여부로 관리자 판단
- 프로덕션에서는 별도의 admin 테이블 추가 권장

## React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

### React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
