import crypto from 'node:crypto';

/** @param {number} length */
const getWords = async (length) => {
  const WORDLIST = await import('./getWords.wordlist.mjs').then(
    (module) => module.default,
  );
  const indices = new Uint32Array(length);
  crypto.getRandomValues(indices);
  return [...indices].map((n) => WORDLIST[n % WORDLIST.length]);
};

export default getWords;
