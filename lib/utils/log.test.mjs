import { test } from 'node:test';
import assert from 'node:assert/strict';
import { error, info, verbose, setVerbose } from './log.mjs';

test('log', async (t) => {
  // The verbose flag is module-level; reset between tests.
  t.beforeEach(() => setVerbose(false));
  t.after(() => setVerbose(false));

  await t.test('error() writes to console.error', (t) => {
    const spy = t.mock.method(console, 'error', () => {});
    error('boom');
    assert.equal(spy.mock.callCount(), 1);
    assert.match(String(spy.mock.calls[0].arguments[0]), /boom/);
  });

  await t.test('info() writes to console.log', (t) => {
    const spy = t.mock.method(console, 'log', () => {});
    info('hello');
    assert.equal(spy.mock.callCount(), 1);
    assert.match(spy.mock.calls[0].arguments.join(' '), /hello/);
  });

  await t.test('verbose() is silent when not enabled', (t) => {
    const spy = t.mock.method(console, 'log', () => {});
    verbose('hidden');
    assert.equal(spy.mock.callCount(), 0);
  });

  await t.test('verbose() prints once setVerbose(true) is called', (t) => {
    const spy = t.mock.method(console, 'log', () => {});
    setVerbose(true);
    verbose('visible');
    assert.equal(spy.mock.callCount(), 1);
    assert.match(spy.mock.calls[0].arguments.join(' '), /visible/);
  });
});
