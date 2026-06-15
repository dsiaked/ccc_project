import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';

const migrationDirectory = 'supabase/migrations';
const manifestPath = 'supabase/migration-checksums.json';
const immutableThrough = '20260613000001';
const writeManifest = process.argv.includes('--write');

const hashFile = (path) =>
  createHash('sha256')
    .update(readFileSync(path, 'utf8').replaceAll('\r\n', '\n'))
    .digest('hex');

const historicalFiles = readdirSync(migrationDirectory)
  .filter((fileName) => {
    const version = fileName.match(/^(\d{14})_.+\.sql$/)?.[1];
    return version && version <= immutableThrough;
  })
  .sort();

const currentChecksums = Object.fromEntries(
  historicalFiles.map((fileName) => [
    fileName,
    hashFile(`${migrationDirectory}/${fileName}`),
  ])
);

if (writeManifest) {
  writeFileSync(
    manifestPath,
    `${JSON.stringify(
      { immutableThrough, migrations: currentChecksums },
      null,
      2
    )}\n`
  );
  console.log(`Wrote checksums for ${historicalFiles.length} migrations.`);
  process.exit(0);
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
if (manifest.immutableThrough !== immutableThrough) {
  throw new Error(
    `Unexpected immutable migration cutoff: ${manifest.immutableThrough}`
  );
}

const expectedFiles = Object.keys(manifest.migrations).sort();
if (JSON.stringify(expectedFiles) !== JSON.stringify(historicalFiles)) {
  throw new Error(
    'Historical migration set changed. Add schema changes as a new migration.'
  );
}

for (const fileName of historicalFiles) {
  if (manifest.migrations[fileName] !== currentChecksums[fileName]) {
    throw new Error(
      `Historical migration changed: ${fileName}. Add a new migration instead.`
    );
  }
}

console.log(
  `Verified ${historicalFiles.length} immutable migrations through ${immutableThrough}.`
);
