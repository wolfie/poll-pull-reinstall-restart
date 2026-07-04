import { test } from 'node:test';
import assert from 'node:assert/strict';
import notify from './notify.mjs';

/** @returns {import('../getEnv.mjs').Env} */
const makeEnv = (overrides = {}) => ({
  restartScripts: ['start'],
  onceScripts: [],
  sshKeyPath: undefined,
  installDevPkgs: false,
  nvmAutoInstall: false,
  corepackEnable: false,
  pollInterval: 60,
  serviceName: undefined,
  ntfyTopic: 'my-topic',
  ntfyServer: 'https://ntfy.sh',
  ...overrides,
});

test('notify', async (t) => {
  t.mock.method(console, 'error', () => {});

  await t.test('POSTs to ntfy with title and body', async (t) => {
    /** @type {string | undefined} */
    let capturedUrl;
    /** @type {RequestInit | undefined} */
    let capturedInit;
    t.mock.method(
      globalThis,
      'fetch',
      async (/** @type {string} */ url, /** @type {RequestInit} */ init) => {
        capturedUrl = url;
        capturedInit = init;
        return new Response();
      },
    );

    await notify(makeEnv(), { title: 'Test title', body: 'Test body' });

    assert.equal(capturedUrl, 'https://ntfy.sh/my-topic');
    assert.equal(capturedInit?.method, 'POST');
    assert.deepEqual(capturedInit?.headers, {
      Title: 'Test title',
      'Content-Type': 'text/plain',
    });
    assert.equal(capturedInit?.body, 'Test body');
  });

  await t.test('sends empty string body when body is omitted', async (t) => {
    /** @type {RequestInit | undefined} */
    let capturedInit;
    t.mock.method(
      globalThis,
      'fetch',
      async (/** @type {string} */ _url, /** @type {RequestInit} */ init) => {
        capturedInit = init;
        return new Response();
      },
    );

    await notify(makeEnv(), { title: 'No body' });

    assert.equal(capturedInit?.body, '');
  });

  await t.test('prefixes title with service name when set', async (t) => {
    /** @type {RequestInit | undefined} */
    let capturedInit;
    t.mock.method(
      globalThis,
      'fetch',
      async (/** @type {string} */ _url, /** @type {RequestInit} */ init) => {
        capturedInit = init;
        return new Response();
      },
    );

    await notify(makeEnv({ serviceName: 'my-app' }), {
      title: 'Service started',
    });

    assert.deepEqual(capturedInit?.headers, {
      Title: '[my-app] Service started',
      'Content-Type': 'text/plain',
    });
  });

  await t.test(
    'defaults to https://ntfy.sh when ntfyServer is not set',
    async (t) => {
      /** @type {string | undefined} */
      let capturedUrl;
      t.mock.method(globalThis, 'fetch', async (/** @type {string} */ url) => {
        capturedUrl = url;
        return new Response();
      });

      await notify(makeEnv({ ntfyServer: undefined }), { title: 'Test' });

      assert.equal(capturedUrl, 'https://ntfy.sh/my-topic');
    },
  );

  await t.test('encodes topic as a single path segment', async (t) => {
    /** @type {string | undefined} */
    let capturedUrl;
    t.mock.method(globalThis, 'fetch', async (/** @type {string} */ url) => {
      capturedUrl = url;
      return new Response();
    });

    await notify(makeEnv({ ntfyTopic: ' ../team/ops?urgent#prod ' }), {
      title: 'Test',
    });

    assert.equal(
      capturedUrl,
      'https://ntfy.sh/..%2Fteam%2Fops%3Furgent%23prod',
    );
  });

  await t.test(
    'joins trailing-slash custom server URLs without double slashes',
    async (t) => {
      /** @type {string | undefined} */
      let capturedUrl;
      t.mock.method(globalThis, 'fetch', async (/** @type {string} */ url) => {
        capturedUrl = url;
        return new Response();
      });

      await notify(
        makeEnv({
          ntfyServer: 'https://push.example.com/base/',
          ntfyTopic: 'alerts',
        }),
        { title: 'Test' },
      );

      assert.equal(capturedUrl, 'https://push.example.com/base/alerts');
    },
  );

  await t.test('logs invalid server URLs without calling fetch', async (t) => {
    const errorSpy = t.mock.method(console, 'error', () => {});
    let fetchCalled = false;
    t.mock.method(globalThis, 'fetch', async () => {
      fetchCalled = true;
      return new Response();
    });

    await notify(makeEnv({ ntfyServer: 'not a url' }), { title: 'Test' });

    assert.equal(fetchCalled, false);
    assert.ok(errorSpy.mock.callCount() >= 1);
  });

  await t.test('is a no-op when ntfyTopic is not set', async (t) => {
    let fetchCalled = false;
    t.mock.method(globalThis, 'fetch', async () => {
      fetchCalled = true;
      return new Response();
    });

    await notify(makeEnv({ ntfyTopic: undefined }), { title: 'Test' });

    assert.equal(fetchCalled, false);
  });

  await t.test('logs error on fetch failure without throwing', async (t) => {
    const errorSpy = t.mock.method(console, 'error', () => {});
    t.mock.method(globalThis, 'fetch', async () => {
      throw new Error('network error');
    });

    await notify(makeEnv(), { title: 'Test' });

    assert.ok(errorSpy.mock.callCount() >= 1);
  });
});
