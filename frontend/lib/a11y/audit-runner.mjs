// Standalone contrast audit runner (ES module, no TS transpile)
function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map(c => c+c).join('') : clean;
  const n = parseInt(full, 16);
  return [(n>>16)&255, (n>>8)&255, n&255];
}
function luminance(r, g, b) {
  const vals = [r, g, b].map(v => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * vals[0] + 0.7152 * vals[1] + 0.0722 * vals[2];
}
function contrast(fg, bg) {
  const [fr, fg2, fb] = hexToRgb(fg);
  const [br, bg2, bb] = hexToRgb(bg);
  const L1 = luminance(fr, fg2, fb);
  const L2 = luminance(br, bg2, bb);
  const ratio = (Math.max(L1,L2)+0.05) / (Math.min(L1,L2)+0.05);
  return { ratio, aa: ratio >= 4.5, aaLarge: ratio >= 3.0 };
}

const pairs = [
  // Light mode
  { name: 'Body text / page bg (light)',       fg: '#0F172A', bg: '#F1F5F9' },
  { name: 'Secondary text / page bg (light)',  fg: '#475569', bg: '#F1F5F9' },
  { name: 'Tertiary text / page bg (fixed)',   fg: '#475569', bg: '#F1F5F9' },
  { name: 'Brand-600 btn text / brand-600 bg', fg: '#FFFFFF', bg: '#0F2D5E' },
  { name: 'Brand text / white card',           fg: '#0F2D5E', bg: '#FFFFFF' },
  { name: 'Error-600 / white',                 fg: '#DC2626', bg: '#FFFFFF' },
  { name: 'Error-700 / error-50',              fg: '#B91C1C', bg: '#FEF2F2' },
  { name: 'Error-600 on error-50 bg',          fg: '#DC2626', bg: '#FEF2F2' },
  { name: 'Success-600 / white',               fg: '#16A34A', bg: '#FFFFFF' },
  { name: 'Success-700 / success-50',          fg: '#15803D', bg: '#F0FDF4' },
  { name: 'Warning-700 / white',               fg: '#B45309', bg: '#FFFFFF' },
  { name: 'Warning-700 / warning-50',          fg: '#B45309', bg: '#FFFBEB' },
  { name: 'Input text / white input',          fg: '#0F172A', bg: '#FFFFFF' },
  { name: 'Placeholder / white input (fixed)',  fg: '#64748B', bg: '#FFFFFF' },
  { name: 'Label / page bg',                   fg: '#475569', bg: '#F1F5F9' },
  { name: 'NavBar text / brand-600 bg',        fg: '#FFFFFF', bg: '#0F2D5E' },
  { name: 'Disabled text / disabled bg',       fg: '#94A3B8', bg: '#F1F5F9' },
  // Dark mode
  { name: 'Body text / dark-950 bg',           fg: '#F8FAFC', bg: '#020617' },
  { name: 'Secondary text / dark-950 bg',      fg: '#94A3B8', bg: '#020617' },
  { name: 'Tertiary text / dark-900 bg (fixed)',fg: '#94A3B8', bg: '#0F172A' },
  { name: 'Brand-400 text / dark-950 bg',      fg: '#7096D8', bg: '#020617' },
  { name: 'White / brand-500 dark btn',        fg: '#FFFFFF', bg: '#3D6BBF' },
  { name: 'Error-300 / dark-950 bg',           fg: '#FCA5A5', bg: '#020617' },
  { name: 'Error-400 / dark surface',          fg: '#F87171', bg: '#0F172A' },
  { name: 'Success-300 / dark-950 bg',         fg: '#86EFAC', bg: '#020617' },
  { name: 'Success-400 / dark surface',        fg: '#4ADE80', bg: '#0F172A' },
  { name: 'Warning-200 / dark-950 bg',         fg: '#FCD34D', bg: '#020617' },
  { name: 'Input text / dark-900 input',       fg: '#F8FAFC', bg: '#0F172A' },
  { name: 'Placeholder / dark-900 input (fixed)',fg: '#94A3B8', bg: '#0F172A' },
  { name: 'Card border dark (slate-500 fixed)',  fg: '#64748B', bg: '#020617' },
  { name: 'Accent-400 / dark-950 bg',          fg: '#22D3EE', bg: '#020617' },
];

const LINE = '='.repeat(72);
console.log(LINE);
console.log('  OrthoClinic Sprint 6 — WCAG 2.1 AA Color Contrast Audit');
console.log(LINE);

let pass = 0, fail = 0, largeFail = 0;
const failures = [];

pairs.forEach(({ name, fg, bg }) => {
  const { ratio, aa, aaLarge } = contrast(fg, bg);
  const r = ratio.toFixed(2).padStart(5);
  if (aa) {
    console.log(`  ✓  ${r}:1  [AA ] ${name}`);
    pass++;
  } else if (aaLarge) {
    console.log(`  △  ${r}:1  [3:1] ${name}  ← passes LARGE text / UI only`);
    largeFail++;
    failures.push({ name, ratio: r, level: 'AA-large only', fg, bg });
  } else {
    console.log(`  ✗  ${r}:1  [---] ${name}  ← FAIL`);
    fail++;
    failures.push({ name, ratio: r, level: 'FAIL', fg, bg });
  }
});

console.log(LINE);
console.log(`  ${pass} PASS (AA)   ${largeFail} PASS (large/UI only)   ${fail} FAIL`);
console.log(`  Total pairs tested: ${pairs.length}`);

if (failures.length > 0) {
  console.log('\n  Pairs requiring attention:');
  failures.forEach(f => console.log(`    [${f.level}] ${f.name} — ${f.ratio}:1 (${f.fg} / ${f.bg})`));
}
console.log(LINE);
