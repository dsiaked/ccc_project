# 인수인계 진행 상태

## 환경
- 시작일: 2026-06-13
- 새 담당자: USER
- 운영 Supabase 프로젝트: 확인됨 (qdpfccuqeumguhishifu)
- 테스트 Supabase 프로젝트: 확인됨 (pjbvxoesgwhbxfsfjliw)

## 체크포인트
| 단계 | 상태 | 증거 | 남은 작업 |
| --- | --- | --- | --- |
| A. 로컬 조사 | 완료 | .gitignore 점검 완료, 도구 가용성/버전 확인, .env/.env.local 환경 변수 세팅 상태 및 비밀값 안전성 확인 | 없음 |
| B. 계정 및 권한 | 대기 | | 새 담당자 개인 계정으로 깃허브, Supabase, Kakao Developers, GCP 등 계정 및 초대 수락 상태 확인 |
| C. 로컬 실행 | 완료 | npm install, npm run lint, npm run test:unit, npm run build 통과 및 로컬 개발 서버(http://localhost:5173) 구동 검증 완료 | 없음 |
| D. 테스트 Supabase | 대기 | | DB 스키마 검증, `sync-combined-supabase-setup.mjs` 스크립트 검증, 시뮬레이션 시드 데이터 삽입 테스트 |
| E. 운영 흐름 리허설 | 대기 | | 테스트 프로젝트 내에서 역할별 흐름 조작(사용자 신청 -> 캠퍼스 승인 -> 본부 송금 -> 최적화 배차 실행 -> 버스 탑승 처리) |
| F. 배포 및 복구 | 대기 | | Firebase Hosting Preview 배포 및 롤백 절차 테스트 |
| G. 소유권 이전 | 대기 | | 기존 담당자의 조직/개인 권한 회수 및 비밀값(Secret) 갱신 |

## 승인 기록
| 시각 | 승인 작업 | 승인자 | 결과 |
| --- | --- | --- | --- |

## 남은 위험
- **Docker Desktop**: 자동 설치 과정에서 Windows UAC(사용자 계정 컨트롤) 승인을 대기하지 못해 설치 실패(코드 4294967291). 사용자가 직접 Docker 공식 웹페이지에서 다운로드하거나, 관리자 권한 파워쉘에서 `winget install Docker.DockerDesktop`을 실행하여 설치 완료해야 함.
- **Supabase CLI 전역 설치**: npm 전역 설치 시 `win32-x64` 바이너리 누락 오류가 발생함. 단, 프로젝트 내에 포함된 로컬 패키지를 이용해 `npx supabase` 명령어를 사용하면 100% 정상 작동하므로, 전역 설치 대신 `npx supabase` 사용을 권장함.

## 최종 판정
- 인수인계 완료/미완료: 미완료
- 미완료 사유: 단계 B~G 대기 중
