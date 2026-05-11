import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import getScripts from './getScripts.mjs';

test('getScripts reads package.json from the current working directory at call time', async (t) => {
  const originalCwd = process.cwd();
  const dir = mkdtempSync(join(tmpdir(), 'pprr-test-'));
  const first = join(dir, 'first');
  const second = join(dir, 'second');

  t.after(() => {
    process.chdir(originalCwd);
    rmSync(dir, { recursive: true, force: true });
  });

  mkdirSync(first);
  mkdirSync(second);

  writeFileSync(
    join(first, 'package.json'),
    JSON.stringify({ scripts: { start: 'node first.mjs' } }),
    { flag: 'wx' },
  );
  writeFileSync(
    join(second, 'package.json'),
    JSON.stringify({ scripts: { start: 'node second.mjs' } }),
    { flag: 'wx' },
  );

  process.chdir(first);
  assert.deepEqual(await getScripts(), { start: 'node first.mjs' });

  process.chdir(second);
  assert.deepEqual(await getScripts(), { start: 'node second.mjs' });
});
