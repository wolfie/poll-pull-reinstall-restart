import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  chmodSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, delimiter } from 'node:path';
import findExecutable from './findExecutable.mjs';

test('findExecutable', async (t) => {
  const originalPath = process.env['PATH'];
  const workDir = mkdtempSync(join(tmpdir(), 'pprr-findexec-test-'));

  t.after(() => {
    process.env['PATH'] = originalPath;
    rmSync(workDir, { recursive: true, force: true });
  });
  t.afterEach(() => {
    process.env['PATH'] = originalPath;
  });

  const binA = join(workDir, 'a');
  const binB = join(workDir, 'b');
  mkdirSync(binA);
  mkdirSync(binB);

  writeFileSync(join(binB, 'tool'), '#!/bin/sh\n');
  chmodSync(join(binB, 'tool'), 0o755);
  writeFileSync(join(binA, 'not-executable'), '');
  chmodSync(join(binA, 'not-executable'), 0o644);
  mkdirSync(join(binA, 'a-directory'));

  await t.test('finds an executable in a later PATH entry', async () => {
    process.env['PATH'] = [binA, binB].join(delimiter);
    assert.equal(await findExecutable('tool'), join(binB, 'tool'));
  });

  await t.test('returns null when not on PATH', async () => {
    process.env['PATH'] = binA;
    assert.equal(await findExecutable('tool'), null);
  });

  await t.test('ignores files without the executable bit', async () => {
    process.env['PATH'] = binA;
    assert.equal(await findExecutable('not-executable'), null);
  });

  await t.test('ignores directories', async () => {
    process.env['PATH'] = binA;
    assert.equal(await findExecutable('a-directory'), null);
  });

  await t.test('returns null when PATH is empty', async () => {
    process.env['PATH'] = '';
    assert.equal(await findExecutable('tool'), null);
  });
});
