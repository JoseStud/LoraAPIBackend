/**
 * API Utilities
 * 
 * Functions for handling HTTP requests, API communication,
 * and data fetching operations.
 */

/**
 * Fetch data from an API endpoint with error handling
 * @param {string} url - The API endpoint URL
 * @param {object} options - Fetch options (method, headers, body, etc.)
 * @returns {Promise<any>} The response data
 */
export async function fetchData(url, options = {}) {
    const {
        headers = {},
        parseResponse = true,
        returnResponse = false,
        ...fetchOptions
    } = options;

    const normalizedHeaders = headers instanceof Headers
        ? Object.fromEntries(headers.entries())
        : headers;

    const requestHeaders = {
        'Content-Type': 'application/json',
        ...normalizedHeaders
    };

    if (requestHeaders['Content-Type'] === null || requestHeaders['Content-Type'] === undefined) {
        delete requestHeaders['Content-Type'];
    }

    const requestOptions = {
        credentials: 'same-origin',
        ...fetchOptions,
        headers: requestHeaders
    };

    if (typeof FormData !== 'undefined' && requestOptions.body instanceof FormData) {
        delete requestOptions.headers['Content-Type'];
    }

    const method = typeof requestOptions.method === 'string'
        ? requestOptions.method.toUpperCase()
        : 'GET';

    try {
        const response = await fetch(url, requestOptions);

        const meta = {
            ok: !!response?.ok,
            status: typeof response?.status === 'number' ? response.status : 0,
            headers: response?.headers || null
        };

        if (!response.ok) {
            const error = new Error(`HTTP error! status: ${response.status}`);
            error.response = response;
            error.status = response.status;
            throw error;
        }

        const shouldParseBody = parseResponse && method !== 'HEAD' && ![204, 205, 304].includes(meta.status);

        let data = null;
        if (shouldParseBody) {
            const contentType = response?.headers?.get?.('content-type') || '';
            const preferJson = contentType.includes('application/json') || typeof response?.json === 'function';

            if (preferJson) {
                data = await response.json();
            } else if (typeof response?.text === 'function') {
                data = await response.text();
            }
        }

        if (returnResponse) {
            return { data, response, meta };
        }

        return data;
    } catch (error) {
        console.error('API request failed:', error);
        throw error;
    }
}

/**
 * POST data to an API endpoint
 * @param {string} url - The API endpoint URL
 * @param {any} data - The data to send
 * @param {object} options - Additional fetch options
 * @returns {Promise<any>} The response data
 */
export async function postData(url, data, options = {}) {
    return fetchData(url, {
        method: 'POST',
        body: JSON.stringify(data),
        ...options
    });
}

/**
 * PUT data to an API endpoint
 * @param {string} url - The API endpoint URL
 * @param {any} data - The data to send
 * @param {object} options - Additional fetch options
 * @returns {Promise<any>} The response data
 */
export async function putData(url, data, options = {}) {
    return fetchData(url, {
        method: 'PUT',
        body: JSON.stringify(data),
        ...options
    });
}

/**
 * PATCH data to an API endpoint
 * @param {string} url - The API endpoint URL
 * @param {any} data - The data to send
 * @param {object} options - Additional fetch options
 * @returns {Promise<any>} The response data
 */
export async function patchData(url, data, options = {}) {
    return fetchData(url, {
        method: 'PATCH',
        body: JSON.stringify(data),
        ...options
    });
}

/**
 * DELETE from an API endpoint
 * @param {string} url - The API endpoint URL
 * @param {object} options - Additional fetch options
 * @returns {Promise<any>} The response data
 */
export async function deleteData(url, options = {}) {
    return fetchData(url, {
        method: 'DELETE',
        ...options
    });
}

/**
 * Upload a file to an API endpoint
 * @param {string} url - The API endpoint URL
 * @param {FormData} formData - The form data containing the file
 * @param {function} onProgress - Progress callback function
 * @returns {Promise<any>} The response data
 */
export async function uploadFile(url, formData, onProgress = null) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        
        if (onProgress) {
            xhr.upload.addEventListener('progress', (event) => {
                if (event.lengthComputable) {
                    const percentComplete = (event.loaded / event.total) * 100;
                    onProgress(percentComplete);
                }
            });
        }
        
        xhr.addEventListener('load', () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                try {
                    const response = JSON.parse(xhr.responseText);
                    resolve(response);
                } catch {
                    resolve(xhr.responseText);
                }
            } else {
                reject(new Error(`Upload failed with status: ${xhr.status}`));
            }
        });
        
        xhr.addEventListener('error', () => {
            reject(new Error('Upload failed'));
        });
        
        xhr.open('POST', url);
        xhr.send(formData);
    });
}

/**
 * Download a file as blob
 * @param {string} url - The file URL
 * @param {object} options - Additional fetch options
 * @returns {Promise<Blob>} The file blob
 */
export async function downloadBlob(url, options = {}) {
    try {
        const defaultOptions = {
            headers: {
                ...options.headers
            }
        };

        const response = await fetch(url, { ...defaultOptions, ...options });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        return await response.blob();
    } catch (error) {
        console.error('Blob download failed:', error);
        throw error;
    }
}

/**
 * Post data and download response as blob
 * @param {string} url - The API endpoint URL
 * @param {any} data - The data to send
 * @param {object} options - Additional fetch options
 * @returns {Promise<Blob>} The response blob
 */
export async function postForBlob(url, data, options = {}) {
    try {
        const defaultOptions = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            body: JSON.stringify(data)
        };

        const response = await fetch(url, { ...defaultOptions, ...options });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        return await response.blob();
    } catch (error) {
        console.error('Blob POST failed:', error);
        throw error;
    }
}
