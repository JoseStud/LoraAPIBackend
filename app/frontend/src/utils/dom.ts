export type ElementTarget = string | Element | null | undefined;

function resolveElement(target: ElementTarget): HTMLElement | null {
  if (!target) {
    return null;
  }

  if (typeof target === 'string') {
    return document.querySelector<HTMLElement>(target);
  }

  if (target instanceof HTMLElement) {
    return target;
  }

  return null;
}

export function showElement(target: ElementTarget): void {
  const element = resolveElement(target);
  if (!element) return;

  element.classList.remove('hidden');
  element.removeAttribute('aria-hidden');
}

export function hideElement(target: ElementTarget): void {
  const element = resolveElement(target);
  if (!element) return;

  element.classList.add('hidden');
  element.setAttribute('aria-hidden', 'true');
}

export function toggleElement(target: ElementTarget): void {
  const element = resolveElement(target);
  if (!element) return;

  if (element.classList.contains('hidden')) {
    showElement(element);
  } else {
    hideElement(element);
  }
}

export function isElementVisible(target: ElementTarget): boolean {
  const element = resolveElement(target);
  if (!element) return false;

  return !element.classList.contains('hidden') && element.offsetWidth > 0 && element.offsetHeight > 0;
}

export interface ScrollOptions extends ScrollIntoViewOptions {}

export function scrollToElement(target: ElementTarget, options: ScrollOptions = {}): void {
  const element = resolveElement(target);
  if (!element) return;

  element.scrollIntoView({ behavior: 'smooth', block: 'start', ...options });
}

export function addClass(target: ElementTarget, className: string): void {
  const element = resolveElement(target);
  element?.classList.add(className);
}

export function removeClass(target: ElementTarget, className: string): void {
  const element = resolveElement(target);
  element?.classList.remove(className);
}

export function toggleClass(target: ElementTarget, className: string): boolean {
  const element = resolveElement(target);
  if (!element) return false;

  return element.classList.toggle(className);
}

export function getDataAttribute(target: ElementTarget, attribute: string): string | null {
  const element = resolveElement(target);
  if (!element) return null;

  return element.dataset[attribute] ?? null;
}

export function setDataAttribute(target: ElementTarget, attribute: string, value: string): void {
  const element = resolveElement(target);
  if (!element) return;

  element.dataset[attribute] = value;
}

