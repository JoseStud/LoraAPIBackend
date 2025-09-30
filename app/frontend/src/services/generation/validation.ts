export const ensureArray = <T>(value: unknown): T[] => (Array.isArray(value) ? value : []);
