/**
 * WCAG 2.1 Color Contrast Utilities
 *
 * Implements the W3C algorithm for relative luminance and contrast ratio.
 * Reference: https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 *
 * Usage (dev / test tooling only — tree-shaken in production bundles):
 *   import { checkContrast } from '@/lib/a11y/colorContrast';
 *   const { ratio, aa, aaa } = checkContrast('#0F2D5E', '#FFFFFF');
 */

/** Parse a hex color string to [r, g, b] in 0–255. */
function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const full = clean.length === 3
    ? clean.split('').map((c) => c + c).join('')
    : clean;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Compute relative luminance of an sRGB color. */
function luminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

export interface ContrastResult {
  /** Contrast ratio (1:1 to 21:1) */
  ratio: number;
  /** Formatted string e.g. "4.52:1" */
  ratioStr: string;
  /** WCAG AA for normal text (4.5:1) */
  aaNormal: boolean;
  /** WCAG AA for large text (3:1) */
  aaLarge: boolean;
  /** WCAG AA for UI components and graphical objects (3:1) */
  aaUi: boolean;
  /** WCAG AAA for normal text (7:1) */
  aaaNormal: boolean;
  /** WCAG AAA for large text (4.5:1) */
  aaaLarge: boolean;
}

/**
 * Check the contrast ratio between two hex colors.
 * @param fg  Foreground color hex (e.g. "#0F2D5E")
 * @param bg  Background color hex (e.g. "#FFFFFF")
 */
export function checkContrast(fg: string, bg: string): ContrastResult {
  const [fr, fg_, fb] = hexToRgb(fg);
  const [br, bg_, bb] = hexToRgb(bg);

  const L1 = luminance(fr, fg_, fb);
  const L2 = luminance(br, bg_, bb);

  const lighter = Math.max(L1, L2);
  const darker  = Math.min(L1, L2);
  const ratio = (lighter + 0.05) / (darker + 0.05);

  return {
    ratio,
    ratioStr: `${ratio.toFixed(2)}:1`,
    aaNormal: ratio >= 4.5,
    aaLarge:  ratio >= 3.0,
    aaUi:     ratio >= 3.0,
    aaaNormal: ratio >= 7.0,
    aaaLarge:  ratio >= 4.5,
  };
}

/**
 * Batch audit the OrthoClinic design-system token pairs.
 * Returns an array of audit results for the critical color combinations.
 */
export function auditDesignSystemContrast() {
  const pairs: Array<{ name: string; fg: string; bg: string; context: string }> = [
    // Light mode
    { name: 'Body text / page bg',     fg: '#0F172A', bg: '#F1F5F9', context: 'light' },
    { name: 'Secondary text / page bg',fg: '#475569', bg: '#F1F5F9', context: 'light' },
    { name: 'Brand text / white',      fg: '#0F2D5E', bg: '#FFFFFF', context: 'light' },
    { name: 'Brand-600 / white (btn)', fg: '#FFFFFF', bg: '#0F2D5E', context: 'light' },
    { name: 'Error text / white',      fg: '#DC2626', bg: '#FFFFFF', context: 'light' },
    { name: 'Error bg / error text',   fg: '#B91C1C', bg: '#FEF2F2', context: 'light' },
    { name: 'Success text / white',    fg: '#15803D', bg: '#FFFFFF', context: 'light' },
    { name: 'Warning text / white',    fg: '#B45309', bg: '#FFFFFF', context: 'light' },
    { name: 'Input text / input bg',   fg: '#0F172A', bg: '#FFFFFF', context: 'light' },
    { name: 'Placeholder / input bg',  fg: '#94A3B8', bg: '#FFFFFF', context: 'light' },
    { name: 'Label / page bg',         fg: '#475569', bg: '#F1F5F9', context: 'light' },
    { name: 'Badge brand text / badge bg', fg: '#1E40AF', bg: '#DBEAFE', context: 'light' },

    // Dark mode
    { name: 'Body text / dark bg',       fg: '#F8FAFC', bg: '#020617', context: 'dark' },
    { name: 'Secondary text / dark bg',  fg: '#94A3B8', bg: '#020617', context: 'dark' },
    { name: 'Brand text / dark surface', fg: '#7096D8', bg: '#020617', context: 'dark' },
    { name: 'Brand btn text / dark btn', fg: '#FFFFFF', bg: '#3D6BBF', context: 'dark' },
    { name: 'Error text / dark surface', fg: '#FCA5A5', bg: '#020617', context: 'dark' },
    { name: 'Success text / dark surface',fg:'#86EFAC', bg: '#020617', context: 'dark' },
    { name: 'Input text / dark input',   fg: '#F8FAFC', bg: '#0F172A', context: 'dark' },
    { name: 'Placeholder / dark input',  fg: '#64748B', bg: '#0F172A', context: 'dark' },
    { name: 'Warning text / dark bg',    fg: '#FCD34D', bg: '#020617', context: 'dark' },
  ];

  return pairs.map(({ name, fg, bg, context }) => ({
    name,
    context,
    fg,
    bg,
    ...checkContrast(fg, bg),
  }));
}
