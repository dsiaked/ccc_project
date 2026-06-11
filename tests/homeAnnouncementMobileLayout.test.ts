import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const managerStyles = readFileSync(
  'src/pages/admin/HomeAnnouncementManager.module.css',
  'utf8'
);

const mobileStyles = managerStyles.slice(
  managerStyles.indexOf('@media (max-width: 720px)')
);

test('mobile home announcements keep header actions compact and wrapping', () => {
  assert.match(
    mobileStyles,
    /\.headerActions \{[\s\S]*?align-items: center;[\s\S]*?flex-wrap: wrap;/
  );
  assert.match(
    mobileStyles,
    /\.listHeader \{[\s\S]*?align-items: center;[\s\S]*?flex-wrap: wrap;/
  );
  assert.match(
    mobileStyles,
    /\.listHeader \.secondaryButton \{[\s\S]*?flex: 0 0 auto;/
  );
  assert.doesNotMatch(
    mobileStyles,
    /\.secondaryButton,\s*\.primaryButton \{[\s\S]*?width: 100%;/
  );
});

test('mobile home announcement cards use a touch-friendly two-column action grid', () => {
  assert.match(
    mobileStyles,
    /\.cardActions \{[\s\S]*?display: grid;[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/
  );
  assert.match(
    mobileStyles,
    /\.cardActions > button,[\s\S]*?width: 100%;[\s\S]*?min-height: 40px;[\s\S]*?justify-content: center;/
  );
  assert.match(
    mobileStyles,
    /\.dateGrid \{[\s\S]*?grid-template-columns: 1fr;/
  );
});

test('mobile home announcement content wraps without horizontal overflow', () => {
  assert.match(
    mobileStyles,
    /\.cardHeader > div,[\s\S]*?\.scheduleText \{[\s\S]*?min-width: 0;[\s\S]*?overflow-wrap: anywhere;/
  );
  assert.match(
    mobileStyles,
    /\.card time \{[\s\S]*?white-space: normal;/
  );
});
