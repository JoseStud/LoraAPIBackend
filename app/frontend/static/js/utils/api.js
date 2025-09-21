/**
 * @deprecated Legacy API helpers. Use app/frontend/src/utils/api.ts instead.
 */
const legacy = window.LegacyUtils;

function assertLegacy(name) {
  if (!legacy || typeof legacy[name] !== 'function') {
    throw new Error(`Legacy utility "${name}" is unavailable. Use the new SPA utilities instead.`);
  }
  return legacy[name];
}

export const fetchData = (...args) => assertLegacy('fetchData')(...args);
export const postData = (...args) => assertLegacy('postData')(...args);
export const putData = (...args) => assertLegacy('putData')(...args);
export const patchData = (...args) => assertLegacy('patchData')(...args);
export const deleteData = (...args) => assertLegacy('deleteData')(...args);
export const uploadFile = (...args) => assertLegacy('uploadFile')(...args);
export const requestBlob = (...args) => assertLegacy('requestBlob')(...args);
export const requestJson = (...args) => assertLegacy('requestJson')(...args);

const Utils = legacy ?? {};
export default Utils;
