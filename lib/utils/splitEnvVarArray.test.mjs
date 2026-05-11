import { test } from 'node:test';
import assert from 'node:assert/strict';
import splitEnvVarArray from './splitEnvVarArray.mjs';

const KEY = 'PPRR_TEST_SPLIT';

test('splitEnvVarArray', async (t) => {
  t.beforeEach(() => delete process.env[KEY]);
  t.after(() => delete process.env[KEY]);

  await t.test('returns [] when the env var is unset', () => {
    assert.deepEqual(splitEnvVarArray(KEY), []);
  });

  await t.test('returns [] when the env var is an empty string', () => {
    process.env[KEY] = '';
    assert.deepEqual(splitEnvVarArray(KEY), []);
  });

  await t.test('returns [] when the env var is whitespace-only', () => {
    process.env[KEY] = '   ';
    assert.deepEqual(splitEnvVarArray(KEY), []);
  });

  await t.test('splits a comma-separated list', () => {
    process.env[KEY] = 'one,two,three';
    assert.deepEqual(splitEnvVarArray(KEY), ['one', 'two', 'three']);
  });

  await t.test('preserves empty entries between commas', () => {
    process.env[KEY] = 'one,,three';
    assert.deepEqual(splitEnvVarArray(KEY), ['one', '', 'three']);
  });
});
