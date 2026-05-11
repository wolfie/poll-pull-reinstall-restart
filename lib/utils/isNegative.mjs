/** @param {string|undefined} x */
const isNegative = (x) =>
  !x || ['no', 'false', '0'].includes(x.trim().toLowerCase());

export default isNegative;
