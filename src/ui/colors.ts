// Zero-dependency terminal color and styling library

const isColorSupported = (): boolean => {
  if (process.env.FORCE_COLOR && process.env.FORCE_COLOR !== '0') return true;
  if (process.env.NO_COLOR || process.env.TERM === 'dumb') return false;
  return Boolean(process.stdout && process.stdout.isTTY);
};

const enabled = isColorSupported();

const wrap = (open: string, close: string) => (str: string | number): string =>
  enabled ? `${open}${str}${close}` : String(str);

const boldFn = wrap('\x1b[1m', '\x1b[22m');
const inverseFn = wrap('\x1b[7m', '\x1b[27m');
const greenFn = wrap('\x1b[32m', '\x1b[39m');

export const c = {
  reset: wrap('\x1b[0m', '\x1b[0m'),
  bold: boldFn,
  dim: wrap('\x1b[2m', '\x1b[22m'),
  italic: wrap('\x1b[3m', '\x1b[23m'),
  underline: wrap('\x1b[4m', '\x1b[24m'),
  inverse: inverseFn,

  // Foreground colors
  black: wrap('\x1b[30m', '\x1b[39m'),
  red: wrap('\x1b[31m', '\x1b[39m'),
  green: greenFn,
  yellow: wrap('\x1b[33m', '\x1b[39m'),
  blue: wrap('\x1b[34m', '\x1b[39m'),
  magenta: wrap('\x1b[35m', '\x1b[39m'),
  cyan: wrap('\x1b[36m', '\x1b[39m'),
  white: wrap('\x1b[37m', '\x1b[39m'),
  gray: wrap('\x1b[90m', '\x1b[39m'),

  brightRed: wrap('\x1b[91m', '\x1b[39m'),
  brightGreen: wrap('\x1b[92m', '\x1b[39m'),
  brightYellow: wrap('\x1b[93m', '\x1b[39m'),
  brightBlue: wrap('\x1b[94m', '\x1b[39m'),
  brightMagenta: wrap('\x1b[95m', '\x1b[39m'),
  brightCyan: wrap('\x1b[96m', '\x1b[39m'),
  brightWhite: wrap('\x1b[97m', '\x1b[39m'),

  // Background colors
  bgBlack: wrap('\x1b[40m', '\x1b[49m'),
  bgRed: wrap('\x1b[41m', '\x1b[49m'),
  bgGreen: wrap('\x1b[42m', '\x1b[49m'),
  bgYellow: wrap('\x1b[43m', '\x1b[49m'),
  bgBlue: wrap('\x1b[44m', '\x1b[49m'),
  bgMagenta: wrap('\x1b[45m', '\x1b[49m'),
  bgCyan: wrap('\x1b[46m', '\x1b[49m'),
  bgWhite: wrap('\x1b[47m', '\x1b[49m'),
  bgGray: wrap('\x1b[100m', '\x1b[49m'),

  badge(text: string, colorFn: (s: string | number) => string = greenFn): string {
    return enabled ? boldFn(inverseFn(colorFn(` ${text} `))) : `[${text}]`;
  },
};

// Strips all ANSI sequences to calculate visual width accurately
export function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
}

// Visual string length ignoring ANSI escape codes and accounting for wide emojis/glyphs
export function stringWidth(str: string): number {
  const clean = stripAnsi(str);
  let width = 0;
  for (const char of clean) {
    const code = char.codePointAt(0);
    if (!code) continue;
    // Common 2-column wide emojis and fullwidth characters
    if (
      (code >= 0x1100 && code <= 0x115f) ||
      (code >= 0x2e80 && code <= 0xa4cf && code !== 0x303f) ||
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xff00 && code <= 0xff60) ||
      (code >= 0x1f300 && code <= 0x1f9ff)
    ) {
      width += 2;
    } else {
      width += 1;
    }
  }
  return width;
}
