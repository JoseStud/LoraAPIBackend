import type { ApiResult } from './api';
import { deleteRequest, patchJson, postJson, putJson, requestBlob, requestJson } from './api';
import {
  addClass,
  getDataAttribute,
  hideElement,
  isElementVisible,
  removeClass,
  scrollToElement,
  setDataAttribute,
  showElement,
  toggleClass,
  toggleElement,
} from './dom';
import {
  escapeHtml,
  formatDateTime,
  formatElapsedTime,
  formatDuration,
  formatDurationFromMilliseconds,
  formatFileSize,
  formatNumber,
  formatPercentage,
  formatRelativeTime,
  truncateText,
} from './format';
import {
  debounce,
  processInBatches,
  retryWithBackoff,
  simulateProgress,
  sleep,
  throttle,
  withTimeout,
} from './async';
import {
  copyToClipboard,
  downloadFile,
  generateUUID,
  getBrowserInfo,
  getDevicePixelRatio,
  isMobile,
  prefersDarkMode,
  prefersReducedMotion,
  supportsFeature,
  validateFile,
} from './browser';

function extractData<T>(result: ApiResult<T>): T | null {
  return result.data ?? null;
}

async function fetchDataLegacy<T = unknown>(url: string, options: RequestInit = {}): Promise<T | null> {
  const result = await requestJson<T>(url, options);
  return extractData(result);
}

async function postDataLegacy<TResponse = unknown, TBody = unknown>(
  url: string,
  body: TBody,
  options: RequestInit = {}
): Promise<TResponse | null> {
  const result = await postJson<TResponse, TBody>(url, body, options);
  return extractData(result);
}

async function putDataLegacy<TResponse = unknown, TBody = unknown>(
  url: string,
  body: TBody,
  options: RequestInit = {}
): Promise<TResponse | null> {
  const result = await putJson<TResponse, TBody>(url, body, options);
  return extractData(result);
}

async function patchDataLegacy<TResponse = unknown, TBody = unknown>(
  url: string,
  body: TBody,
  options: RequestInit = {}
): Promise<TResponse | null> {
  const result = await patchJson<TResponse, TBody>(url, body, options);
  return extractData(result);
}

async function deleteDataLegacy<TResponse = unknown>(url: string, options: RequestInit = {}): Promise<TResponse | null> {
  const result = await deleteRequest<TResponse>(url, options);
  return extractData(result);
}

interface UploadProgressEvent {
  loaded: number;
  total: number;
  percentage: number;
}

type UploadProgressCallback = (event: UploadProgressEvent) => void;

function uploadFileLegacy(url: string, formData: FormData, onProgress?: UploadProgressCallback): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url, true);
    xhr.withCredentials = true;

    xhr.onreadystatechange = () => {
      if (xhr.readyState === XMLHttpRequest.DONE) {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const response = xhr.responseText ? JSON.parse(xhr.responseText) : null;
            resolve(response);
          } catch (_error) {
            resolve(xhr.responseText);
          }
        } else {
          reject(new Error(`Upload failed with status ${xhr.status}`));
        }
      }
    };

    xhr.onerror = () => {
      reject(new Error('Upload failed due to a network error'));
    };

    if (onProgress) {
      xhr.upload.addEventListener('progress', (event) => {
        if (!event.lengthComputable) {
          return;
        }
        const percentage = Math.round((event.loaded / event.total) * 100);
        onProgress({ loaded: event.loaded, total: event.total, percentage });
      });
    }

    xhr.send(formData);
  });
}

const legacyFormat = {
  formatFileSize,
  formatDuration,
  formatDurationFromMilliseconds,
  formatElapsedTime,
  formatRelativeTime,
  formatNumber,
  formatPercentage,
  truncateText,
  escapeHtml,
  formatDate: (input: Parameters<typeof formatDateTime>[0], options: Intl.DateTimeFormatOptions = {}, locale = 'en-US') =>
    formatDateTime(input, { year: 'numeric', month: 'short', day: 'numeric', ...options }, locale),
  formatDateTime,
};

const legacyDom = {
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
};

const legacyAsync = {
  delay: sleep,
  debounce,
  throttle,
  retryWithBackoff,
  withTimeout,
  processBatches: processInBatches,
  processInBatches,
  simulateProgress,
};

const legacyBrowser = {
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
};

const legacyApi = {
  fetchData: fetchDataLegacy,
  postData: postDataLegacy,
  putData: putDataLegacy,
  patchData: patchDataLegacy,
  deleteData: deleteDataLegacy,
  uploadFile: uploadFileLegacy,
  requestBlob,
  requestJson,
};

export const legacyUtils = {
  ...legacyApi,
  ...legacyDom,
  ...legacyFormat,
  ...legacyAsync,
  ...legacyBrowser,
};

type LegacyUtils = typeof legacyUtils;

declare global {
  interface Window {
    LegacyUtils?: LegacyUtils;
  }
}

if (typeof window !== 'undefined') {
  window.LegacyUtils = legacyUtils;
}

export default legacyUtils;
