/**
 * @param {string} key
 * @returns {string[]}
 */
const splitEnvVarArray = (key) => {
  const content = process.env[key]?.trim();
  return content ? content.split(',') : [];
};

export default splitEnvVarArray;
