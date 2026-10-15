/**
 * True for a plain left click, which LoRA links turn into in-app navigation.
 * Modified clicks (new tab, new window) keep the link's default behaviour.
 */
export const isPlainLeftClick = (event: MouseEvent): boolean =>
  !event.defaultPrevented
  && event.button === 0
  && !event.metaKey
  && !event.ctrlKey
  && !event.shiftKey
  && !event.altKey;
