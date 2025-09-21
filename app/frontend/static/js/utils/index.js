/**
 * @deprecated Legacy utilities bundle. Use app/frontend/src/utils instead.
 */
const legacy = window.LegacyUtils ?? {};

export const {
  // API utilities
  fetchData = () => { throw new Error('Legacy fetchData unavailable'); },
  postData = () => { throw new Error('Legacy postData unavailable'); },
  putData = () => { throw new Error('Legacy putData unavailable'); },
  patchData = () => { throw new Error('Legacy patchData unavailable'); },
  deleteData = () => { throw new Error('Legacy deleteData unavailable'); },
  uploadFile = () => { throw new Error('Legacy uploadFile unavailable'); },
  requestBlob = () => { throw new Error('Legacy requestBlob unavailable'); },
  requestJson = () => { throw new Error('Legacy requestJson unavailable'); },

  // DOM utilities
  showElement,
  hideElement,
  toggleElement,
  isElementVisible,
  scrollToElement,
  addClass,
  removeClass,
  toggleClass,
  getDataAttribute,
  setDataAttribute,

  // Formatters
  formatFileSize,
  formatDuration,
  formatDurationFromMilliseconds,
  formatElapsedTime,
  formatRelativeTime,
  formatNumber,
  formatPercentage,
  truncateText,
  escapeHtml,
  formatDate,
  formatDateTime,

  // Async utilities
  delay,
  debounce,
  throttle,
  retryWithBackoff,
  withTimeout,
  processBatches,
  simulateProgress,

  // Browser utilities
  generateUUID,
  copyToClipboard,
  downloadFile,
  validateFile,
  supportsFeature,
  getBrowserInfo,
  isMobile,
  getDevicePixelRatio,
  prefersDarkMode,
  prefersReducedMotion,
} = legacy;

const Utils = legacy;
export default Utils;
