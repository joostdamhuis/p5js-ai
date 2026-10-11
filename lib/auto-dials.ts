// "Smart toggles": finds simple settings at the top level of a sketch, like
//   const SPEED = 2;   const COLOR = '#ff5500';   const TRAILS = true;
// and turns each into a live control, without the sketch calling dials().
// Only const: a top-level let/var is usually state the sketch changes itself.
import type { DialConfig } from 'dialkit';

export type AutoDial = {
  name: string;
  // What the control shows: "SPEED" → "Speed", "MAX_COUNT" → "Max count"
  label: string;
  value: number | string | boolean;
};

const toLabel = (name: string) =>
  /^[A-Z0-9_]+$/.test(name)
    ? name.toLowerCase().replace(/_+/g, ' ').trim().replace(/^./, c => c.toUpperCase())
    : name;

// Unindented const with a plain number, hex color or boolean,
// optionally followed by a semicolon and a comment
const DECLARATION =
  /^(const)(\s+)([A-Za-z_$][\w$]*)(\s*=\s*)(-?\d*\.?\d+|true|false|(['"])#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\6)(\s*;?\s*(?:\/\/.*)?)$/;

export function findAutoDials(code: string): AutoDial[] {
  const dials: AutoDial[] = [];
  const seen = new Set<string>();
  for (const line of code.split('\n')) {
    const m = line.match(DECLARATION);
    if (!m || seen.has(m[3])) continue;
    seen.add(m[3]);
    const raw = m[5];
    const value = raw === 'true' ? true : raw === 'false' ? false : m[6] ? raw.slice(1, -1) : Number(raw);
    dials.push({ name: m[3], label: toLabel(m[3]), value });
  }
  return dials;
}

// Rewrites the sketch so each setting can be changed while it runs:
// const becomes let, and a small setter is added in the same script scope.
export function instrumentAutoDials(code: string, dials: AutoDial[]): string {
  if (dials.length === 0) return code;
  const names = new Set(dials.map(d => d.name));
  const rewritten = code
    .split('\n')
    .map(line => {
      const m = line.match(DECLARATION);
      return m && names.has(m[3]) ? `let${line.slice(5)}` : line;
    })
    .join('\n');

  const setters = dials.map(d => `  ${JSON.stringify(d.name)}: (v) => { ${d.name} = v; },`).join('\n');
  return `${rewritten}
;(function() {
  window.__autoDials = Object.assign(window.__autoDials || {}, {
${setters}
  });
  window.parent.postMessage({ source: 'p5js-dials', type: 'autoReady' }, '*');
})();
`;
}

const roundNice = (n: number) => {
  const p = Math.pow(10, Math.floor(Math.log10(n)));
  return Math.ceil(n / p) * p;
};

// Slider range from the starting value: 0 up to a few times the value
export function autoDialConfig(dials: AutoDial[]): DialConfig {
  const config: DialConfig = {};
  for (const { label, value } of dials) {
    if (typeof value === 'number') {
      const isInt = Number.isInteger(value);
      const span = roundNice(Math.max(Math.abs(value) * 3, isInt ? 10 : 1));
      // Whole-number settings starting at 1+ (counts like ROWS) never go to 0
      const min = value < 0 ? -span : isInt && value >= 1 ? 1 : 0;
      config[label] = [value, min, span, isInt ? 1 : span / 100];
    } else {
      config[label] = value;
    }
  }
  return config;
}
