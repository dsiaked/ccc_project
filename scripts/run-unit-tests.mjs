import { readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const outputDirectory = resolve('.tmp', `test-dist-${process.pid}`);
const typescriptCli = resolve('node_modules', 'typescript', 'bin', 'tsc');

const run = (command, args) => {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    stdio: 'inherit',
  });

  if (result.error) throw result.error;
  return result.status ?? 1;
};

try {
  rmSync(outputDirectory, { recursive: true, force: true });

  const compileStatus = run(process.execPath, [
    typescriptCli,
    '-p',
    'tsconfig.test.json',
    '--outDir',
    outputDirectory,
  ]);
  if (compileStatus !== 0) process.exitCode = compileStatus;
  else {
    const testDirectory = join(outputDirectory, 'tests');
    const testFiles = readdirSync(testDirectory)
      .filter((file) => file.endsWith('.test.js'))
      .map((file) => join(testDirectory, file));
    process.exitCode = run(process.execPath, [
      '--test',
      '--test-isolation=none',
      ...testFiles,
    ]);
  }
} finally {
  rmSync(outputDirectory, { recursive: true, force: true });
}
