/**
 * @deprecated Legacy browser helpers. Use app/frontend/src/utils/browser.ts instead.
 */
const legacy = window.LegacyUtils;

function assertLegacy(name) {
  if (!legacy || typeof legacy[name] !== 'function') {
    throw new Error(`Legacy browser utility "${name}" is unavailable. Use the SPA utilities instead.`);
  }
  return legacy[name];
}

export const generateUUID = (...args) => assertLegacy('generateUUID')(...args);
export const copyToClipboard = (...args) => assertLegacy('copyToClipboard')(...args);
export const downloadFile = (...args) => assertLegacy('downloadFile')(...args);
export const validateFile = (...args) => assertLegacy('validateFile')(...args);
export const supportsFeature = (...args) => assertLegacy('supportsFeature')(...args);
export const getBrowserInfo = (...args) => assertLegacy('getBrowserInfo')(...args);
export const isMobile = (...args) => assertLegacy('isMobile')(...args);
export const getDevicePixelRatio = (...args) => assertLegacy('getDevicePixelRatio')(...args);
export const prefersDarkMode = (...args) => assertLegacy('prefersDarkMode')(...args);
export const prefersReducedMotion = (...args) => assertLegacy('prefersReducedMotion')(...args);

const Utils = legacy ?? {};
export default Utils;
