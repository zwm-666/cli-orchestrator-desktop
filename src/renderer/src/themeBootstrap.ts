const THEME_STORAGE_KEY = 'cli-orchestrator-theme';

type ThemeName = 'black' | 'oc2';

const themeAliases: Record<string, ThemeName> = {
  black: 'black',
  dark: 'black',
  oc2: 'oc2',
  'oc-2': 'oc2',
};

const normalizeThemeName = (value: string | null): ThemeName => {
  if (!value) {
    return 'oc2';
  }

  return themeAliases[value] ?? 'oc2';
};

const initialTheme = normalizeThemeName(window.localStorage.getItem(THEME_STORAGE_KEY));
document.documentElement.setAttribute('data-theme', initialTheme);
window.localStorage.setItem(THEME_STORAGE_KEY, initialTheme);
