import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const managerSource = readFileSync(
  'src/pages/admin/HomeAnnouncementManager.tsx',
  'utf8'
);

const loadHelper = <T>(name: string) => {
  const match = managerSource.match(
    new RegExp(
      `const ${name} = \\(value: [^)]+\\) => \\{([\\s\\S]*?)\\n\\};`
    )
  );

  assert.ok(match, `${name} helper should exist`);

  return new Function('value', match[1]) as (value: string | null) => T;
};

test('home announcement schedule preserves the instant through a Seoul datetime-local round trip', () => {
  const originalTimezone = process.env.TZ;
  process.env.TZ = 'Asia/Seoul';

  try {
    const toDateTimeLocal = loadHelper<string>('toDateTimeLocal');
    const fromDateTimeLocal = loadHelper<string | null>('fromDateTimeLocal');
    const storedValue = '2026-06-09T09:30:00.000Z';

    const inputValue = toDateTimeLocal(storedValue);

    assert.equal(inputValue, '2026-06-09T18:30');
    assert.equal(fromDateTimeLocal(inputValue), storedValue);
    assert.match(
      managerSource,
      /publishStartAt: fromDateTimeLocal\(editStartAt\)/
    );
    assert.match(
      managerSource,
      /publishEndAt: fromDateTimeLocal\(editEndAt\)/
    );
  } finally {
    if (originalTimezone === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = originalTimezone;
    }
  }
});
