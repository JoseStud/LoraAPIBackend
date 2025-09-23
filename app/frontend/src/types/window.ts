export type WindowWithExtras = Window & {
  htmx?: {
    trigger: (target: Element | Document, event: string, detail?: unknown) => void;
  };
  DevLogger?: {
    error?: (...args: unknown[]) => void;
  };
};
