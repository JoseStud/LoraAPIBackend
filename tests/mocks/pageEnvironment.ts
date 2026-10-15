import { vi } from 'vitest';

/**
 * Drives `document.hidden` and `navigator.onLine` and dispatches the matching events.
 * Call `install()` before the code under test starts polling and `restore()` afterwards.
 */
export const createPageEnvironment = () => {
  let hidden = false;
  let online = true;
  let spies: Array<{ mockRestore: () => void }> = [];

  return {
    install() {
      hidden = false;
      online = true;
      spies = [
        vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden),
        vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => online),
      ];
    },
    restore() {
      spies.forEach((spy) => spy.mockRestore());
      spies = [];
    },
    setHidden(value: boolean) {
      hidden = value;
      document.dispatchEvent(new Event('visibilitychange'));
    },
    setOnline(value: boolean) {
      online = value;
      window.dispatchEvent(new Event(value ? 'online' : 'offline'));
    },
  };
};
