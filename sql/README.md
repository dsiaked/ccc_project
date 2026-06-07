# SQL Setup Files

## Simulation rehearsal

The end-to-end simulation SQL is split by execution stage under
`simulation/`. Follow `simulation/README.md` and run the numbered files in order.
The old single-file `90_simulation_rehearsal_seed.sql` has been replaced by these
smaller, independently transactional steps.

## Combined setup note

All non-simulation SQL files are grouped under `setup/`.

`setup/combined_supabase_setup.sql` already includes the base schema, Seoul organization seed
(`setup/80_seed_seoul_organization.sql`), and station seed template
(`setup/82_seed_stations_template.sql`). When setting up a fresh test Supabase project with
`setup/combined_supabase_setup.sql`, do not run `setup/80_seed_seoul_organization.sql`,
`setup/82_seed_stations_template.sql`, or `setup/83_add_dong_team_campuses.sql` again unless you
are intentionally patching an older DB.

이 폴더는 Supabase SQL Editor에서 실행할 프로젝트 DB 스키마, RLS 정책, RPC, 시드 데이터를 목적별로 정리한 곳입니다.

## 새 DB 권장 실행 순서

1. `00_base_schema_and_rls.sql`
   - 예약, 입금, 관리자 권한, 버스 옵션, 배차 결과의 기본 테이블과 기본 RLS 정책
   - `reservations.status`와 `payments.status` 체크 제약까지 기준값으로 보정

2. `01_profiles_organization_stations.sql`
   - 회원 프로필, 서울지구/팀/캠퍼스, 도착역 테이블
   - `campus_options` view
   - 캠퍼스 관리자 권한 범위 정책 보강
   - `district_id/team_id/campus_id` 기준 컬럼과 기존 text 값의 backfill
   - 관리자 권한을 사용자 1개 고정이 아니라 역할/범위 기준으로 관리할 수 있게 인덱스 보강
   - 관리자 권한 저장 시 text 범위에서 id 범위를 자동 보정하는 트리거

3. `05_app_settings.sql`
   - 기능 공통 설정 저장소
   - `bus_ticket_price`, `first_reservation_deadline` 기본 키 생성
   - `app_settings` RLS와 `updated_at` 트리거

4. `10_payment_and_price_functions.sql`
   - 개인 입금 상태 저장 RPC
   - 버스표 가격 조회/수정 RPC

5. `20_reservation_deadline.sql`
   - 1차 신청 마감 설정 기본값 보정
   - 공통 설정 테이블은 `05_app_settings.sql`에서 생성

5a. `21_atomic_reservation_save.sql`
   - 마감 확인과 사용자 예약 insert/update를 단일 트랜잭션 RPC로 처리
   - 동일 사용자 동시 저장은 `reservations.user_id` unique 인덱스로 직렬화

5b. `22_destination_stats_rpc.sql`
   - 모든 신청자의 도착역 선호도를 Postgres 내부에서 집계
   - PostgREST 최대 반환 행 수 때문에 배차 통계가 누락되는 문제 방지
   - 전체 관리자만 집계 RPC 실행 가능

5c. `55_atomic_allocation_confirmation.sql`
   - 임시 배차안 확정과 확정 취소를 단일 DB 트랜잭션 RPC로 처리
   - 활성 승객 명단과 버스·좌석 배정을 DB에서 다시 검증
   - 확정 중 일부 승객만 반영되는 부분 성공 상태 방지

5d. `56_post_deadline_remaining_seat_claim.sql`
   - 신청 마감 후 미신청자가 확정 배차안의 잔여 좌석을 직접 선택
   - 동시 신청 시 좌석 중복 판매를 막고 예약·버스표·배차안을 한 트랜잭션으로 갱신

5e. `57_atomic_admin_remaining_seat_sale.sql`
   - 전체 관리자의 잔여좌석 판매를 단일 DB 트랜잭션으로 처리
   - 동시 판매 시 잔여좌석, 신청 상태, 좌석번호 중복을 잠금 후 다시 검증

6. `30_campus_transfer_settlement.sql`
   - 캠퍼스별 본부 송금 보고/확인
   - 실제 본부 확인 금액, 추가 정산 감지, 송금 상태 체크 제약
   - 캠퍼스 text 값과 함께 `district_id/team_id/campus_id`를 저장해 이후 이름 변경에 대비
   - text 범위만 들어와도 id 범위를 자동 보정하는 트리거

7. `33_confirm_campus_transfer_amount.sql`
   - 전체 관리자가 입력한 실제 본부 입금액을 `campus_transfers.actual_confirmed_amount`에 저장하는 RPC
   - 저장 후 새로고침에서도 실제 입금액이 유지되도록 PostgREST 스키마 캐시 갱신

8. `40_campus_requests_board.sql`
   - 마감 후 캠퍼스 문의 게시판
   - 문의별 메시지, 답장 수정/삭제 정책, 상태/유형 체크 제약
   - 캠퍼스 text 값과 함께 `district_id/team_id/campus_id`를 저장해 권한 매칭 안정성 보강
   - text 범위만 들어와도 id 범위를 자동 보정하는 트리거

8a. `41_campus_notice_reads.sql`
   - 사용자별 캠퍼스 공지 읽음 상태 저장 및 기기 간 동기화

9. `50_home_announcements.sql`
   - 홈 공지 관리

10. `60_reset_reservation_data.sql`
   - Step 0 세팅 확인 화면의 선택형 DB 정보 초기화 RPC
   - 운영 데이터와 행선지/버스 옵션/앱 설정/홈 공지/캠퍼스 관리자/조직 구조/유저 계정을 선택적으로 초기화
   - 유저 계정 삭제 시 현재 로그인한 전체 관리자 계정과 프로필은 항상 보호

10a. `63_admin_delete_user_account.sql`
   - Adds the global-admin RPC used by individual user management to delete one account and its linked data.
   - Protects the currently signed-in account and every global-admin account.

10b. `64_allocation_workspace_versions.sql`
   - Moves allocation save snapshots out of `bus_allocations.allocation_data`.
   - Keeps only lightweight version metadata on initial load and fetches a snapshot when restoring.
   - Migrates existing embedded versions and keeps the latest 20 versions per allocation.

10c. `65_canonical_reservation_status.sql`
   - Treats `reservations.status` and `reservations.confirmed_ticket` as canonical.
   - Keeps legacy JSON mirrors synchronized and repairs existing mismatches.

10d. `66_atomic_admin_personal_ticket.sql`
   - Synchronizes administrator personal-ticket edits with the confirmed allocation.
   - Validates bus existence, capacity, and duplicate seats in one transaction.

10e. `67_reservations_rpc_only_writes.sql`
   - Removes direct reservation write policies and table grants.
   - Requires all user and administrator reservation writes to use validated RPCs.

10f. `68_payments_rpc_only_writes.sql`
   - Removes direct payment write policies and table grants.
   - Requires all administrator payment changes to use the authorized payment RPC.

10g. `69_admin_roles_rpc_only_writes.sql`
   - Moves campus-admin assignment and cancellation into authorized atomic RPCs.
   - Removes direct administrator-role table write policies and grants.

10i. `71_admin_setup_rpc_only_writes.sql`
   - Moves bus option, organization campus, and station changes into validated global-admin RPCs.
   - Removes direct write policies and grants for those setup tables.

10j. `72_app_settings_announcements_rpc_only.sql`
   - Restricts editable app-setting keys through a validated global-admin RPC.
   - Moves home-announcement creation to an authenticated RPC and closes direct writes.

10k. `73_campus_transfers_rpc_only_writes.sql`
   - Adds an authorized RPC for reverting transfer confirmation.
   - Closes direct campus-transfer writes while preserving report and confirmation RPCs.

10l. `74_bus_allocations_rpc_only_writes.sql`
   - Moves allocation creation into an authorized RPC and closes direct writes.
   - Recalculates total cost and capacity from allocation JSON for every database write.

10m. `75_campus_admin_manage_users_page.sql`
   - Adds a server-paginated user list for campus administrator management.
   - Avoids downloading the entire administrator-role table to the browser.

10n. `76_exact_allocation_optimization_jobs.sql`
   - Adds the single-bus optimizer configuration and exact optimization job queue.
   - Snapshots anonymized active-reservation inputs and exposes global-admin-only job RPCs.
   - Allows only one pending or running optimization job at a time.

10o. `77_create_draft_from_exact_optimization.sql`
   - Creates allocation drafts only from independently revalidated `OPTIMAL` job results.
   - Rejects stale reservations, malformed assignments, duplicate seats, and manipulated costs.
   - Joins names and phone numbers only inside Supabase after optimizer result validation.

10p. `78_out_of_preference_admin_override.sql`
   - Allows global administrators to confirm manually edited out-of-preference assignments.
   - Requires a separate acknowledgement and records the actor, time, and affected passengers.
   - Keeps original passenger preferences in the saved workspace and version history.

10q. `79_single_bus_option.sql`
   - Restricts bus option creation to the single vehicle type supported by the exact optimizer.
   - Keeps existing options editable and removable so legacy multi-option data can be cleaned up.

10r. `80_remaining_seat_payment_workflow.sql`
   - Temporarily holds an automatically assigned remaining seat after the deadline.
   - Creates a pending Seoul-district payment and issues a ticket only after global-admin confirmation.
   - Allows pending holds to be cancelled manually and controls global or per-bus public availability.

10h. `70_admin_personal_ticket_page.sql`
   - Adds the server-paginated global-admin personal-ticket list RPC.
   - Joins profiles, reservations, payments, and roles on the server and returns only the requested page plus lightweight summary metadata.

10c. `65_confirmed_allocation_summaries.sql`
   - Adds a lightweight confirmed-allocation list RPC.
   - Returns counts and totals without downloading the full `allocation_data` JSON.

11. `80_seed_seoul_organization.sql`
   - 서울지구 팀/캠퍼스 조직 옵션 시드

12. `82_seed_stations_template.sql`
    - 도착역 후보 시드 템플릿
    - 실제 운영 도착역에 맞게 수정한 뒤 실행

## 선택 실행 파일

- `81_cleanup_unused_seoul_organization.sql`
  - `80_seed_seoul_organization.sql` 실행 후, 더 이상 쓰지 않는 서울 조직 옵션을 정리할 때만 실행합니다.
  - 삭제 작업이 포함되어 있으므로 결과 조회를 먼저 확인하세요.

## 기존 DB 보정용 패치

아래 파일들은 기준 SQL에 내용이 흡수되어 있습니다. 새 DB에서는 보통 별도로 실행하지 않아도 됩니다. 이미 운영 중인 DB에서 특정 오류가 발생했을 때만 사용하세요.

- `31_fix_campus_transfer_confirm_amount.sql`
  - `campus_transfers.actual_confirmed_amount` 스키마 캐시 오류 보정

- `32_fix_reservation_cancelled_status.sql`
  - `reservations.status = cancelled` 저장 오류 보정

- `51_fix_bus_options_policies.sql`
  - 버스 옵션 정책/스키마 캐시 보정

- `52_fix_bus_allocations_policies.sql`
  - 배차 결과 정책/스키마 캐시 보정

- `59_fix_bus_allocations_rls_recursion.sql`
  - Fixes authenticated `bus_allocations` requests returning HTTP 500 when allocation policies evaluate `admin_roles` RLS directly.

- `53_bus_option_max_count.sql`
  - 기존 DB의 버스 옵션에 종류별 사용 가능 최대 대수 컬럼 추가

- `54_fix_destination_stats_all_active_reservations.sql`
  - 배차 수요 집계에서 확정 상태 승객이 누락되는 문제 보정
  - 취소되지 않은 모든 예매 승객을 결제 여부와 관계없이 배차 수요에 포함

## 관리 원칙

- 새 기능의 기준 구조는 번호가 낮은 기준 SQL에 반영합니다.
- 운영 중 발견된 오류 대응은 `patch/fix` 성격의 파일로 남기되, 안정화되면 기준 SQL에도 흡수합니다.
- `district/team/campus` 텍스트 컬럼은 현재 프론트 호환과 표시용으로 유지합니다.
- 새 SQL은 `district_id/team_id/campus_id`를 함께 채우도록 구성되어 있습니다. 장기적으로 RLS와 집계는 ID 기준으로 더 옮겨가는 것이 좋습니다.
- `admin_roles`는 더 이상 사용자당 1개 권한으로 고정하지 않습니다. 전체 관리자와 캠퍼스 관리자, 또는 여러 캠퍼스 권한을 함께 둘 수 있도록 역할/범위 기준 인덱스를 사용합니다.
- SQL Editor에서 실행 후 PostgREST 스키마 캐시 문제가 의심되면 관련 패치 파일처럼 `notify pgrst, 'reload schema';`를 사용할 수 있습니다.
