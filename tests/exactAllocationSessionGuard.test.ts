import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('allocation job creation rejects an expired administrator session before RPC', () => {
  const source = readFileSync(
    'src/lib/admin/exactAllocationOptimizationService.ts',
    'utf8'
  );

  assert.match(
    source,
    /const requireAllocationAdminSession = async \(\) => \{[\s\S]*supabase\.auth\.getSession\(\)[\s\S]*supabase\.auth\.getUser\([\s\S]*return data\.session\.access_token/
  );
  assert.match(
    source,
    /createExactAllocationJob[\s\S]*await requireAllocationAdminSession\(\);[\s\S]*create_allocation_optimization_job_for_execution/
  );
  assert.match(
    source,
    /createDetailedBalanceJob[\s\S]*await requireAllocationAdminSession\(\);[\s\S]*create_detailed_allocation_optimization_job_for_execution/
  );
  assert.match(
    source,
    /Only global admins can create allocation optimization jobs[\s\S]*전체 관리자 권한을 확인할 수 없습니다/
  );
});

test('allocation launcher and reset validate the session before authenticated calls', () => {
  const source = readFileSync(
    'src/lib/admin/exactAllocationOptimizationService.ts',
    'utf8'
  );

  assert.match(
    source,
    /launchExactAllocationJob[\s\S]*const accessToken = await requireAllocationAdminSession\(\);[\s\S]*headers: \{ Authorization: `Bearer \$\{accessToken\}` \}/
  );
  assert.match(
    source,
    /resetExactAllocationJobs[\s\S]*await requireAllocationAdminSession\(\);[\s\S]*reset_allocation_optimization_jobs/
  );
});

test('allocation job creation exposes unexpected PostgREST error details', () => {
  const source = readFileSync(
    'src/lib/admin/exactAllocationOptimizationService.ts',
    'utf8'
  );

  assert.match(
    source,
    /const getAllocationErrorDetail = \(error: AllocationRpcError\) =>\s*\[error\.message, error\.details, error\.hint\][\s\S]*const detail = getAllocationErrorDetail\(error\);[\s\S]*throw new Error\(detail \|\| error\.code/
  );
  assert.match(
    source,
    /record "new" has no field "allocation_data"[\s\S]*배차 계산용 DB 트리거 업데이트가 필요합니다/
  );
});
