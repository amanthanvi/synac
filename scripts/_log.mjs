/**
 * scripts/_log.mjs
 * Minimal debug logger toggled by DEBUG=etl
 */
export const debugLog = (...args) => {
  if (process.env.DEBUG === 'etl') {
    console.log(...args);
  }
};
