/**
 * @deprecated Legacy formatter helpers. Use app/frontend/src/utils/format.ts instead.
 */
const legacy = window.LegacyUtils;

function assertLegacy(name) {
  if (!legacy || typeof legacy[name] !== 'function') {
    throw new Error(`Legacy formatter "${name}" is unavailable. Use the SPA utilities instead.`);
  }
  return legacy[name];
}

export const formatFileSize = (...args) => assertLegacy('formatFileSize')(...args);
export const formatDuration = (...args) => assertLegacy('formatDuration')(...args);
export const formatDurationFromMilliseconds = (...args) => assertLegacy('formatDurationFromMilliseconds')(...args);
export const formatElapsedTime = (...args) => assertLegacy('formatElapsedTime')(...args);
export const formatRelativeTime = (...args) => assertLegacy('formatRelativeTime')(...args);
export const formatNumber = (...args) => assertLegacy('formatNumber')(...args);
export const formatPercentage = (...args) => assertLegacy('formatPercentage')(...args);
export const truncateText = (...args) => assertLegacy('truncateText')(...args);
export const escapeHtml = (...args) => assertLegacy('escapeHtml')(...args);
export const formatDate = (...args) => assertLegacy('formatDate')(...args);
export const formatDateTime = (...args) => assertLegacy('formatDateTime')(...args);

const Utils = legacy ?? {};
export default Utils;
