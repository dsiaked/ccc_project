import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const legacyFixtureDirectory = 'sql/setup';
const maxLegacyFixtureFiles = 60;
const maxLegacyFixtureBytes = 310_000;

const files = readdirSync(legacyFixtureDirectory)
  .filter((fileName) => fileName.endsWith('.sql'))
  .sort();
const totalBytes = files.reduce(
  (sum, fileName) => sum + statSync(join(legacyFixtureDirectory, fileName)).size,
  0
);

if (files.length > maxLegacyFixtureFiles) {
  throw new Error(
    `Legacy SQL fixture count grew from its cleanup ceiling: ${files.length} > ${maxLegacyFixtureFiles}.`
  );
}

if (totalBytes > maxLegacyFixtureBytes) {
  throw new Error(
    `Legacy SQL fixture size grew from its cleanup ceiling: ${totalBytes} > ${maxLegacyFixtureBytes} bytes.`
  );
}

console.log(
  `SQL context budget: ${files.length} legacy fixtures, ${totalBytes} bytes.`
);
