const THEME_STORAGE_KEY = 'cli-orchestrator-theme';

type ThemeName = 'black' | 'oc-2';

const themeAliases: Record<string, ThemeName> = {
  black: 'black',
  dark: 'black',
  oc2: 'oc-2',
  'oc-2': 'oc-2',
};

const normalizeThemeName = (value: string | null): ThemeName => {
  if (!value) {
    return 'oc-2';
  }

  return themeAliases[value] ?? 'oc-2';
};

const initialTheme = normalizeThemeName(window.localStorage.getItem(THEME_STORAGE_KEY));
document.documentElement.setAttribute('data-theme', initialTheme);
window.localStorage.setItem(THEME_STORAGE_KEY, initialTheme);
