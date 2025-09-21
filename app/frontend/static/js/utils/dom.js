/**
 * @deprecated Legacy DOM helpers. Use app/frontend/src/utils/dom.ts instead.
 */
const legacy = window.LegacyUtils;

function assertLegacy(name) {
  if (!legacy || typeof legacy[name] !== 'function') {
    throw new Error(`Legacy DOM utility "${name}" is unavailable. Use the SPA utilities instead.`);
  }
  return legacy[name];
}

export const showElement = (...args) => assertLegacy('showElement')(...args);
export const hideElement = (...args) => assertLegacy('hideElement')(...args);
export const toggleElement = (...args) => assertLegacy('toggleElement')(...args);
export const isElementVisible = (...args) => assertLegacy('isElementVisible')(...args);
export const scrollToElement = (...args) => assertLegacy('scrollToElement')(...args);
export const addClass = (...args) => assertLegacy('addClass')(...args);
export const removeClass = (...args) => assertLegacy('removeClass')(...args);
export const toggleClass = (...args) => assertLegacy('toggleClass')(...args);
export const getDataAttribute = (...args) => assertLegacy('getDataAttribute')(...args);
export const setDataAttribute = (...args) => assertLegacy('setDataAttribute')(...args);

const Utils = legacy ?? {};
export default Utils;
