import log from './log.mjs';

const DEFAULT_NTFY_SERVER = 'https://ntfy.sh';

/**
 * @param {import('../getEnv.mjs').Env} env
 * @returns {string | undefined}
 */
const getNtfyUrl = (env) => {
  const topic = env.ntfyTopic?.trim();
  if (!topic) return undefined;

  const server = env.ntfyServer?.trim() || DEFAULT_NTFY_SERVER;
  const url = new URL(server);
  const basePath = url.pathname.replace(/\/+$/, '');
  url.pathname = `${basePath}/${encodeURIComponent(topic)}`;
  url.search = '';
  url.hash = '';
  return url.toString();
};

/**
 * @param {import('../getEnv.mjs').Env} env
 * @param {{ title: string, body?: string }} notification
 */
const notify = async (env, notification) => {
  let url;
  try {
    url = getNtfyUrl(env);
  } catch (error) {
    log.error('ntfy notification failed:', error);
    return;
  }
  if (!url) return;

  const title = env.serviceName
    ? `[${env.serviceName}] ${notification.title}`
    : notification.title;
  await fetch(url, {
    method: 'POST',
    headers: {
      Title: title,
      'Content-Type': 'text/plain',
    },
    body: notification.body ?? '',
  }).catch((error) => {
    log.error('ntfy notification failed:', error);
  });
};

export default notify;
