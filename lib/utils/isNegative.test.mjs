import { test } from 'node:test';
import assert from 'node:assert/strict';
import isNegative from './isNegative.mjs';

test('isNegative', async (t) => {
  await t.test('treats undefined as negative', () => {
    assert.equal(isNegative(undefined), true);
  });

  await t.test('treats empty string as negative', () => {
    assert.equal(isNegative(''), true);
  });

  await t.test(
    'treats "no" / "false" / "0" as negative, case-insensitively',
    () => {
      for (const v of ['no', 'NO', ' No ', 'false', 'FALSE', 'False', '0']) {
        assert.equal(
          isNegative(v),
          true,
          `expected ${JSON.stringify(v)} → true`,
        );
      }
    },
  );

  await t.test('treats other strings as positive', () => {
    for (const v of ['yes', 'true', '1', 'anything', 'off']) {
      assert.equal(
        isNegative(v),
        false,
        `expected ${JSON.stringify(v)} → false`,
      );
    }
  });
});
