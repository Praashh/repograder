import { c, stringWidth } from './colors';

export interface BoxOptions {
  title?: string;
  borderColor?: (s: string | number) => string;
  padding?: number;
  width?: number;
  style?: 'rounded' | 'single' | 'double';
}

const BORDER_STYLES = {
  rounded: {
    tl: '╭',
    tr: '╮',
    bl: '╰',
    br: '╯',
    h: '─',
    v: '│',
  },
  single: {
    tl: '┌',
    tr: '┐',
    bl: '└',
    br: '┘',
    h: '─',
    v: '│',
  },
  double: {
    tl: '╔',
    tr: '╗',
    bl: '╚',
    br: '╝',
    h: '═',
    v: '║',
  },
};

export function renderBox(lines: string[], options: BoxOptions = {}): string {
  const style = BORDER_STYLES[options.style || 'rounded'];
  const color = options.borderColor || c.gray;
  const padding = options.padding ?? 2;

  // Compute inner content width
  let maxContentWidth = 0;
  for (const line of lines) {
    const width = stringWidth(line);
    if (width > maxContentWidth) maxContentWidth = width;
  }

  const titleWidth = options.title ? stringWidth(options.title) + 4 : 0;
  const minRequiredWidth = Math.max(maxContentWidth + padding * 2, titleWidth + 4);

  // Target width (clamp nicely between 70 and 80 chars)
  const termWidth = process.stdout.columns || 80;
  const targetWidth =
    options.width ?? Math.min(Math.max(minRequiredWidth + 2, 74), Math.max(74, termWidth - 2));
  const innerWidth = targetWidth - 2;

  const result: string[] = [];

  // Top border with optional title
  if (options.title) {
    const titleText = ` ${options.title} `;
    const tLen = stringWidth(titleText);
    const leftDashes = 3;
    const rightDashes = Math.max(0, innerWidth - leftDashes - tLen);
    result.push(
      color(`${style.tl}${style.h.repeat(leftDashes)}`) +
        options.title +
        color(`${style.h.repeat(rightDashes)}${style.tr}`),
    );
  } else {
    result.push(color(`${style.tl}${style.h.repeat(innerWidth)}${style.tr}`));
  }

  // Content lines
  const padLeft = ' '.repeat(padding);
  for (const line of lines) {
    const lineWidth = stringWidth(line);
    const remaining = Math.max(0, innerWidth - padding * 2 - lineWidth);
    const padRight = ' '.repeat(padding + remaining);
    result.push(color(style.v) + padLeft + line + padRight + color(style.v));
  }

  // Bottom border
  result.push(color(`${style.bl}${style.h.repeat(innerWidth)}${style.br}`));

  return result.join('\n');
}

export function renderDivider(title?: string, width = 74): string {
  const termWidth = Math.min(process.stdout.columns || 80, width);
  if (!title) {
    return c.gray('─'.repeat(termWidth));
  }
  const titleText = ` ${title} `;
  const tLen = stringWidth(titleText);
  const leftLen = 3;
  const rightLen = Math.max(0, termWidth - leftLen - tLen);
  return c.gray('─'.repeat(leftLen)) + c.bold(titleText) + c.gray('─'.repeat(rightLen));
}
