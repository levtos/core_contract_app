import de from './de.json';

export type TranslationKey = keyof typeof de;
const translations: Record<string, string> = de;

/** German is the binding locale; the empty English catalog is a future extension. */
export function t(key: string, parameters: Record<string, unknown> = {}): string {
  const text = translations[key];
  if (text === undefined) throw new Error(`Missing translation: ${key}`);
  return text.replace(/\{([a-zA-Z0-9_]+)\}/g, (placeholder, name: string) => name in parameters ? String(parameters[name]) : placeholder);
}

export function hasTranslation(key: string): boolean {
  return Object.hasOwn(translations, key);
}
