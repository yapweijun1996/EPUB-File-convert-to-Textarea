const STORAGE_KEY = 'epub-admin-preferences-v1';

export function loadPreferences() {
  const defaults = {
    theme: 'light',
    maxChars: 10000,
    separator: 'line'
  };

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    return { ...defaults, ...JSON.parse(raw) };
  } catch (error) {
    console.warn('Failed to load preferences.', error);
    return defaults;
  }
}

export function savePreferences(nextPreferences) {
  const current = loadPreferences();
  const merged = { ...current, ...nextPreferences };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  } catch (error) {
    console.warn('Failed to save preferences.', error);
  }
  return merged;
}
