import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const ticketPage = readFileSync('src/pages/TicketPage.tsx', 'utf8');

test('ticket page explains the next steps after an application', () => {
  assert.match(ticketPage, /신청 이후 진행 상황/);
  assert.match(ticketPage, /배차 확정을 기다리고 있어요/);
  assert.match(ticketPage, /입금 확인을 기다리고 있어요/);
  assert.match(ticketPage, /label: '배차 확정', detail: '현재 대기 중'/);
  assert.match(ticketPage, /label: '탑승권 발급', detail: '예정'/);
});
