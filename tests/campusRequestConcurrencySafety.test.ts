import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  'sql/setup/195_campus_request_creation_idempotency.sql',
  'utf8'
);
const page = readFileSync(
  'src/pages/admin/AdminCampusRequestsPage.tsx',
  'utf8'
);

test('campus request creation serializes retries for each administrator', () => {
  assert.match(
    migration,
    /pg_advisory_xact_lock\([\s\S]*campus-request-create:[\s\S]*v_actor_id/i
  );
  assert.match(
    migration,
    /where request\.created_by = v_actor_id[\s\S]*request\.created_at >= clock_timestamp\(\) - interval '30 seconds'/i
  );
  assert.match(
    migration,
    /if v_request\.id is not null then[\s\S]*return jsonb_build_object\([\s\S]*'request', to_jsonb\(v_request\)/i
  );
  assert.match(
    migration,
    /idx_campus_requests_creator_recent[\s\S]*where is_global_notice = false/i
  );
});

test('campus request creation keeps the request and initial message atomic', () => {
  assert.match(
    migration,
    /insert into public\.campus_requests[\s\S]*returning \* into v_request[\s\S]*insert into public\.campus_request_messages/i
  );
});

test('campus request and notice submits reject same-tick duplicate actions', () => {
  assert.match(page, /const submissionInFlightRef = useRef\(false\)/);
  assert.match(
    page,
    /handleCreateGlobalNotice[\s\S]*submissionInFlightRef\.current[\s\S]*submissionInFlightRef\.current = true[\s\S]*createGlobalCampusNotice[\s\S]*finally \{[\s\S]*submissionInFlightRef\.current = false/
  );
  assert.match(
    page,
    /handleCreateRequest[\s\S]*submissionInFlightRef\.current[\s\S]*submissionInFlightRef\.current = true[\s\S]*createCampusRequest[\s\S]*finally \{[\s\S]*submissionInFlightRef\.current = false/
  );
});
