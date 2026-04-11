const ANSI_PATTERN = /\x1b\[[0-9;]*[A-Za-z]|\x1b\].*?(?:\x07|\x1b\\)|\x1b[()][A-B012]/g;

export const stripAnsi = (value: string): string => {
  return value.replace(ANSI_PATTERN, '');
};
