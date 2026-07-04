/**
 * @template {string} T
 * @param {T} str
 * @param {number} num
 * @returns {T | `${T}s`}`
 */
const pluralize = (str, num) => (num === 1 ? str : `${str}s`);

export default pluralize;
