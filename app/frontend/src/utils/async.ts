export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface DebouncedFunction<T extends (...args: any[]) => unknown> {
  (...args: Parameters<T>): void;
  cancel(): void;
  flush(): void;
}

/**
 * Create a debounced version of a function.
 */
export function debounce<T extends (...args: any[]) => unknown>(fn: T, wait = 100, immediate = false): DebouncedFunction<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let lastArgs: Parameters<T> | undefined;
  let lastThis: ThisParameterType<T>;

  const debounced = function (this: ThisParameterType<T>, ...args: Parameters<T>) {
    lastArgs = args;
    lastThis = this;

    const later = () => {
      timeoutId = undefined;
      if (!immediate && lastArgs) {
        fn.apply(lastThis, lastArgs);
        lastArgs = undefined;
      }
    };

    const callNow = immediate && timeoutId === undefined;
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(later, wait);

    if (callNow && lastArgs) {
      fn.apply(lastThis, lastArgs);
      lastArgs = undefined;
    }
  } as DebouncedFunction<T>;

  debounced.cancel = () => {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
      timeoutId = undefined;
    }
    lastArgs = undefined;
  };

  debounced.flush = () => {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
      timeoutId = undefined;
      if (lastArgs) {
        fn.apply(lastThis, lastArgs);
        lastArgs = undefined;
      }
    }
  };

  return debounced;
}

export interface ThrottledFunction<T extends (...args: any[]) => unknown> {
  (...args: Parameters<T>): void;
  cancel(): void;
}

/**
 * Create a throttled version of a function.
 */
export function throttle<T extends (...args: any[]) => unknown>(fn: T, limit = 100): ThrottledFunction<T> {
  let inThrottle = false;
  let trailingArgs: Parameters<T> | undefined;
  let trailingThis: ThisParameterType<T>;

  const throttled = function (this: ThisParameterType<T>, ...args: Parameters<T>) {
    if (!inThrottle) {
      fn.apply(this, args);
      inThrottle = true;
      setTimeout(() => {
        inThrottle = false;
        if (trailingArgs) {
          fn.apply(trailingThis, trailingArgs);
          trailingArgs = undefined;
        }
      }, limit);
    } else {
      trailingArgs = args;
      trailingThis = this;
    }
  } as ThrottledFunction<T>;

  throttled.cancel = () => {
    inThrottle = false;
    trailingArgs = undefined;
  };

  return throttled;
}

/**
 * Retry an async operation with exponential backoff.
 */
export async function retryWithBackoff<T>(operation: () => Promise<T>, maxRetries = 3, baseDelay = 1000): Promise<T> {
  let attempt = 0;
  let lastError: unknown;

  while (attempt <= maxRetries) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt === maxRetries) {
        throw lastError;
      }
      const delayMs = baseDelay * Math.pow(2, attempt);
      await sleep(delayMs);
      attempt += 1;
    }
  }

  throw lastError ?? new Error('Retry operation failed');
}

/**
 * Apply a timeout to a promise.
 */
export function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message?: string): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout>;

  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(message ?? `Operation timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timeoutHandle);
  }) as Promise<T>;
}

/**
 * Process a list of items in batches with limited concurrency.
 */
export async function processInBatches<T, R>(
  items: readonly T[],
  processor: (item: T, index: number) => Promise<R>,
  batchSize = 5
): Promise<R[]> {
  if (batchSize <= 0) {
    throw new Error('batchSize must be greater than zero');
  }

  const results: R[] = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map((item, index) => processor(item, i + index)));
    results.push(...batchResults);
  }

  return results;
}

export interface SimulateProgressOptions {
  duration?: number;
  initialSpeed?: number;
  slowDownAt?: number;
  finalSpeed?: number;
  maxProgress?: number;
  intervalMs?: number;
}

/**
 * Simulate progress updates for long-running operations.
 */
export function simulateProgress(
  update: (progress: number) => void,
  {
    duration = 10_000,
    initialSpeed = 20,
    slowDownAt = 80,
    finalSpeed = 2,
    maxProgress = 95,
    intervalMs = 100,
  }: SimulateProgressOptions = {}
): () => void {
  let progress = 0;
  const startTime = Date.now();

  const intervalId = setInterval(() => {
    const elapsed = Date.now() - startTime;
    const elapsedProgress = (elapsed / duration) * 100;

    let speed = initialSpeed;
    if (progress > slowDownAt) {
      const slowFactor = (progress - slowDownAt) / Math.max(1, 100 - slowDownAt);
      speed = initialSpeed - (initialSpeed - finalSpeed) * slowFactor;
    }

    const randomFactor = 0.5 + Math.random();
    progress += (speed * randomFactor) / 100;

    progress = Math.min(progress, maxProgress, elapsedProgress, 100);
    update(Math.round(progress));

    if (progress >= maxProgress || elapsed >= duration) {
      clearInterval(intervalId);
    }
  }, intervalMs);

  return () => clearInterval(intervalId);
}

