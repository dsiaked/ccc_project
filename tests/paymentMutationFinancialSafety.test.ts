import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  'supabase/migrations/20260611000029_193_payment_mutation_financial_safety.sql',
  'utf8'
);

test('individual payment mutations use the locked reservation and server price', () => {
  assert.match(
    migration,
    /from public\.reservations[\s\S]*where id = p_reservation_id[\s\S]*for update/i
  );
  assert.match(
    migration,
    /v_expected_amount := greatest\(public\.get_bus_ticket_price\(\), 0\)/i
  );
  assert.match(
    migration,
    /p_amount is distinct from v_expected_amount[\s\S]*Payment amount changed\. Refresh and try again\./i
  );
  assert.match(
    migration,
    /v_expected_amount <= 0[\s\S]*A positive bus ticket price is required before changing payments\./i
  );
  assert.match(migration, /amount = v_expected_amount/i);
  assert.doesNotMatch(migration, /greatest\(coalesce\(p_amount/i);
});

test('payment status changes preserve the original paid timestamp', () => {
  assert.match(
    migration,
    /when p_status = 'completed' then coalesce\(paid_at, clock_timestamp\(\)\)[\s\S]*else paid_at/i
  );
  assert.match(
    migration,
    /when excluded\.status = 'completed' then coalesce\(payments\.paid_at, excluded\.paid_at\)[\s\S]*else payments\.paid_at/i
  );
});

test('individual payment mutations cannot bypass dedicated remaining-seat confirmation', () => {
  assert.match(
    migration,
    /v_reservation\.data \? 'remainingSeatClaim'[\s\S]*Remaining seat payments must use the dedicated confirmation workflow\./i
  );
});

test('individual payment mutations stop after campus settlement reporting', () => {
  assert.match(
    migration,
    /from public\.campus_transfers transfer[\s\S]*transfer\.status in \('sent', 'confirmed'\)/i
  );
  assert.match(
    migration,
    /transfer\.campus_id = v_reservation\.campus_id[\s\S]*transfer\.district = v_reservation\.district[\s\S]*transfer\.team = v_reservation\.team[\s\S]*transfer\.campus = v_reservation\.campus/i
  );
  assert.match(
    migration,
    /Cancel or reopen the campus transfer before changing individual payments\./i
  );
});

test('payment changes and campus transfer snapshots share a scope lock', () => {
  assert.match(
    migration,
    /create or replace function public\.get_payment_scope_lock_key/i
  );
  assert.match(
    migration,
    /create trigger enforce_payment_mutation_financial_safety[\s\S]*before insert or update on public\.payments/i
  );
  assert.match(
    migration,
    /create trigger validate_campus_transfer_financial_snapshot[\s\S]*before insert or update on public\.campus_transfers/i
  );
  assert.equal(
    migration.match(/pg_advisory_xact_lock\(public\.get_payment_scope_lock_key/gi)
      ?.length,
    2
  );
});

test('campus transfer snapshots are revalidated immediately before writing', () => {
  assert.match(
    migration,
    /validate_campus_transfer_financial_snapshot[\s\S]*payment\.status = 'completed'[\s\S]*v_total_amount := v_total_people \* public\.get_bus_ticket_price\(\)/i
  );
  assert.match(
    migration,
    /new\.total_people is distinct from v_total_people[\s\S]*new\.paid_people is distinct from v_paid_people[\s\S]*new\.total_amount is distinct from v_total_amount[\s\S]*Campus transfer totals changed\. Refresh and try again\./i
  );
});
