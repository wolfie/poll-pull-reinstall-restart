import kleur from 'kleur';
import { format } from 'util';

let verboseEnabled = false;

/** @param {boolean} v */
export const setVerbose = (v) => {
  verboseEnabled = v;
};

/**
 * @param {...any} msg
 */
export const error = (...msg) =>
  console.error(kleur.bold().red('🚨 ' + msg.map(($) => format($)).join(' ')));

/**
 * @param {...any} msg
 */
export const info = (...msg) => console.log('✨', ...msg.map(($) => format($)));

/**
 * @param {...any} msg
 */
export const verbose = (...msg) => {
  if (verboseEnabled) info(...msg);
};

const log = {
  error,
  info,
  verbose,
};

export default log;
