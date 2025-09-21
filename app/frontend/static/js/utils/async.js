/**
 * @deprecated Legacy async helpers. Use app/frontend/src/utils/async.ts instead.
 */
const legacy = window.LegacyUtils;

function assertLegacy(name) {
  if (!legacy || typeof legacy[name] !== 'function') {
    throw new Error(`Legacy async utility "${name}" is unavailable. Use the SPA utilities instead.`);
  }
  return legacy[name];
}

export const delay = (...args) => assertLegacy('delay')(...args);
export const debounce = (...args) => assertLegacy('debounce')(...args);
export const throttle = (...args) => assertLegacy('throttle')(...args);
export const retryWithBackoff = (...args) => assertLegacy('retryWithBackoff')(...args);
export const withTimeout = (...args) => assertLegacy('withTimeout')(...args);
export const processBatches = (...args) => assertLegacy('processBatches')(...args);
export const simulateProgress = (...args) => assertLegacy('simulateProgress')(...args);

const Utils = legacy ?? {};
export default Utils;
