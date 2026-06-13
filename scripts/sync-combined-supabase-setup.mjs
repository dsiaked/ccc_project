import {
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { dirname } from 'node:path';

const migrationDirectory = 'supabase/migrations';
const outputPath = 'supabase/baseline/current_migration_chain.sql';
const migrationFilePattern = /^(\d{14})_[a-z0-9_]+\.sql$/;
const checkOnly = process.argv.includes('--check');

const migrationFiles = readdirSync(migrationDirectory)
  .filter((fileName) => fileName.endsWith('.sql'))
  .sort();

if (migrationFiles.length === 0) {
  throw new Error(`No migrations found in ${migrationDirectory}.`);
}

const seenVersions = new Set();
for (const migrationFile of migrationFiles) {
  const match = migrationFile.match(migrationFilePattern);
  if (!match) {
    throw new Error(
      `Migration names must match ${migrationFilePattern}: ${migrationFile}`
    );
  }

  const version = match[1];
  if (seenVersions.has(version)) {
    throw new Error(`Duplicate migration version: ${version}`);
  }
  seenVersions.add(version);
}

const separator = '-- =========================================================';
const sections = migrationFiles.map((migrationFile) => {
  const sql = readFileSync(`${migrationDirectory}/${migrationFile}`, 'utf8')
    .replaceAll('\r\n', '\n')
    .trimEnd();
  return [
    separator,
    `-- BEGIN ${migrationDirectory}/${migrationFile}`,
    separator,
    '',
    sql,
    '',
    separator,
    `-- END ${migrationDirectory}/${migrationFile}`,
    separator,
  ].join('\n');
});

const combined = [
  '-- GENERATED FILE. DO NOT EDIT.',
  `-- Source of truth: ${migrationDirectory}`,
  '-- This is an inspection bundle, not a deployable squashed migration.',
  '',
  sections.join('\n\n'),
  '',
].join('\n');

if (checkOnly) {
  const current = readFileSync(outputPath, 'utf8').replaceAll('\r\n', '\n');
  if (current !== combined) {
    throw new Error(
      `${outputPath} is stale. Run node scripts/sync-combined-supabase-setup.mjs.`
    );
  }
} else {
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, combined);
  console.log(`Bundled ${migrationFiles.length} migrations into ${outputPath}.`);
}
