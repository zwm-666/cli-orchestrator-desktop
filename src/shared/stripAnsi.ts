const ANSI_PATTERN = new RegExp(
  String.fromCharCode(0x1b) + '\\[[0-9;]*[A-Za-z]|' +
  String.fromCharCode(0x1b) + '\\].*?(?:' + String.fromCharCode(0x07) + '|' + String.fromCharCode(0x1b) + '\\\\)|' +
  String.fromCharCode(0x1b) + '[()[A-B012]',
  'g'
);

export const stripAnsi = (value: string): string => {
  return value.replace(ANSI_PATTERN, '');
};
