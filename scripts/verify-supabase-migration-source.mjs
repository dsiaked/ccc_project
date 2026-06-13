import { readFileSync, readdirSync } from 'node:fs';

const migrationDirectory = 'supabase/migrations';
const migrationFilePattern = /^(\d{14})_[a-z0-9_]+\.sql$/;
const files = readdirSync(migrationDirectory)
  .filter((fileName) => fileName.endsWith('.sql'))
  .sort();

const versions = new Set();
for (const file of files) {
  const match = file.match(migrationFilePattern);
  if (!match) {
    throw new Error(`Invalid migration filename: ${file}`);
  }
  if (versions.has(match[1])) {
    throw new Error(`Duplicate migration version: ${match[1]}`);
  }
  versions.add(match[1]);
}

const generator = readFileSync(
  'scripts/sync-combined-supabase-setup.mjs',
  'utf8'
);
if (generator.includes("'sql/setup/") || generator.includes('"sql/setup/')) {
  throw new Error('Migration bundle generator must not depend on sql/setup.');
}

const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
if (
  packageJson.scripts?.['db:migrations:bundle'] !==
  'node scripts/sync-combined-supabase-setup.mjs'
) {
  throw new Error('db:migrations:bundle script is missing.');
}

console.log(
  `Verified ${files.length} ordered migrations. supabase/migrations is the source of truth.`
);
