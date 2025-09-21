export type DownloadSource = string | Blob;

export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const r = Math.floor(Math.random() * 16);
    const v = char === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator?.clipboard?.writeText && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', 'true');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    const successful = document.execCommand('copy');
    document.body.removeChild(textarea);
    return successful;
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('copyToClipboard failed', error);
    }
    return false;
  }
}

export function downloadFile(source: DownloadSource, filename: string): void {
  const link = document.createElement('a');

  if (source instanceof Blob) {
    link.href = URL.createObjectURL(source);
  } else {
    link.href = source;
  }

  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  if (source instanceof Blob) {
    setTimeout(() => URL.revokeObjectURL(link.href), 100);
  }
}

export interface ValidateFileOptions {
  maxSize?: number;
  allowedTypes?: readonly string[];
  allowedExtensions?: readonly string[];
}

export interface ValidateFileResult {
  valid: boolean;
  errors: string[];
}

export function validateFile(file: File, options: ValidateFileOptions = {}): ValidateFileResult {
  const {
    maxSize = 10 * 1024 * 1024,
    allowedTypes = [],
    allowedExtensions = [],
  } = options;

  const errors: string[] = [];

  if (file.size > maxSize) {
    errors.push(`File size exceeds maximum allowed size of ${maxSize} bytes`);
  }

  if (allowedTypes.length > 0 && !allowedTypes.includes(file.type)) {
    errors.push(`File type ${file.type || 'unknown'} is not allowed`);
  }

  if (allowedExtensions.length > 0) {
    const extension = file.name.includes('.') ? file.name.split('.').pop()?.toLowerCase() ?? '' : '';
    if (!allowedExtensions.includes(extension)) {
      errors.push(`File extension .${extension} is not allowed`);
    }
  }

  return { valid: errors.length === 0, errors };
}

export type BrowserFeature =
  | 'webgl'
  | 'serviceworker'
  | 'websocket'
  | 'geolocation'
  | 'notifications'
  | 'vibration'
  | 'clipboard'
  | 'webrtc';

export function supportsFeature(feature: BrowserFeature): boolean {
  switch (feature) {
    case 'webgl':
      try {
        const canvas = document.createElement('canvas');
        return !!(window.WebGLRenderingContext && canvas.getContext('webgl'));
      } catch {
        return false;
      }
    case 'serviceworker':
      return 'serviceWorker' in navigator;
    case 'websocket':
      return 'WebSocket' in window;
    case 'geolocation':
      return 'geolocation' in navigator;
    case 'notifications':
      return 'Notification' in window;
    case 'vibration':
      return typeof navigator.vibrate === 'function';
    case 'clipboard':
      return !!navigator.clipboard;
    case 'webrtc':
      return 'RTCPeerConnection' in window;
    default:
      return false;
  }
}

export interface BrowserInfo {
  name: string;
  version: string;
  mobile: boolean;
}

export function getBrowserInfo(): BrowserInfo {
  const ua = navigator.userAgent;
  const info: BrowserInfo = {
    name: 'Unknown',
    version: 'Unknown',
    mobile: /Mobile|Android|iPhone|iPad/.test(ua),
  };

  if (ua.includes('Chrome')) {
    info.name = 'Chrome';
    info.version = ua.match(/Chrome\/(\d+)/)?.[1] ?? 'Unknown';
  } else if (ua.includes('Firefox')) {
    info.name = 'Firefox';
    info.version = ua.match(/Firefox\/(\d+)/)?.[1] ?? 'Unknown';
  } else if (ua.includes('Safari') && !ua.includes('Chrome')) {
    info.name = 'Safari';
    info.version = ua.match(/Version\/(\d+)/)?.[1] ?? 'Unknown';
  } else if (ua.includes('Edge')) {
    info.name = 'Edge';
    info.version = ua.match(/Edge\/(\d+)/)?.[1] ?? 'Unknown';
  }

  return info;
}

export function isMobile(): boolean {
  return /Mobile|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

export function getDevicePixelRatio(): number {
  return window.devicePixelRatio || 1;
}

export function prefersDarkMode(): boolean {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

export function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

