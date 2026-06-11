import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  'supabase/migrations/20260612000001_196_personal_inquiry_retry_idempotency.sql',
  'utf8'
);

const getFunctionBody = (functionName: string) => {
  const match = migration.match(
    new RegExp(
      `create or replace function public\\.${functionName}\\([\\s\\S]*?\\n\\$\\$;`,
      'i'
    )
  );

  assert.ok(match, `${functionName} definition is missing`);
  return match[0];
};

test('lost personal inquiry creation responses return the committed inquiry', () => {
  const body = getFunctionBody('create_personal_inquiry');

  assert.match(body, /pg_advisory_xact_lock[\s\S]*personal-inquiry:/i);
  assert.match(
    body,
    /inquiry\.category = p_category[\s\S]*inquiry\.title = v_title[\s\S]*inquiry\.content = v_content[\s\S]*interval '60 seconds'/i
  );
  assert.match(
    body,
    /if v_inquiry\.id is not null then\s*return v_inquiry;[\s\S]*Resolve an existing inquiry/i
  );
});

test('lost personal inquiry message responses do not duplicate messages or notifications', () => {
  const body = getFunctionBody('add_personal_inquiry_message');

  assert.match(body, /from public\.personal_inquiries[\s\S]*for update/i);
  assert.match(
    body,
    /message\.sender_id = v_actor_id[\s\S]*message\.message = v_message_text[\s\S]*interval '30 seconds'/i
  );
  assert.match(
    body,
    /if v_message\.id is not null then\s*return v_message;[\s\S]*insert into public\.personal_inquiry_messages/i
  );
  assert.match(
    body,
    /insert into public\.personal_inquiry_messages[\s\S]*insert into public\.personal_notifications/i
  );
});

test('personal inquiry retry lookup paths have supporting indexes', () => {
  assert.match(
    migration,
    /idx_personal_inquiries_user_recent[\s\S]*\(user_id, created_at desc\)/i
  );
  assert.match(
    migration,
    /idx_personal_inquiry_messages_sender_recent[\s\S]*\(inquiry_id, sender_id, created_at desc\)/i
  );
});
