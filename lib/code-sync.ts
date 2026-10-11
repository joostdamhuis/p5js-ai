// Controls → code: writes the Controls panel's values back into the sketch, so
// the code always shows what's on screen. Edits only the literal values inside
// dials({...}) and the top-level consts behind smart toggles; everything else
// (formatting, comments, min/max/step) is left as it is.
import { parse } from 'acorn';
import type { AutoDial } from './auto-dials';

type Node = { type: string; start: number; end: number; [key: string]: unknown };
type Edit = { start: number; end: number; text: string };

const formatNumber = (n: number) => String(Math.round(n * 1e6) / 1e6);

// The literal that replaces `node`, or null when the value doesn't fit there
function literalFor(node: Node, value: unknown, code: string): string | null {
  const isNumberNode = (node.type === 'Literal' && typeof node.value === 'number')
    || (node.type === 'UnaryExpression' && node.operator === '-' && (node.argument as Node).type === 'Literal');
  if (typeof value === 'number' && isNumberNode) return formatNumber(value);
  if (node.type !== 'Literal') return null;
  if (typeof value === 'boolean' && typeof node.value === 'boolean') return String(value);
  if (typeof value === 'string' && typeof node.value === 'string') {
    const quote = code[node.start] === '"' ? '"' : "'";
    return quote + value.replace(/\\/g, '\\\\').replace(new RegExp(quote, 'g'), `\\${quote}`) + quote;
  }
  return null;
}

const keyName = (prop: Node) => {
  const key = prop.key as Node;
  return key.type === 'Identifier' ? (key.name as string) : key.type === 'Literal' ? String(key.value) : null;
};

const propValue = (obj: Node, name: string) =>
  (obj.properties as Node[]).find(p => p.type === 'Property' && keyName(p) === name)?.value as Node | undefined;

// One level of dials({...}): each key is a control or a folder
function collect(obj: Node, values: Record<string, unknown>, code: string, edits: Edit[]) {
  for (const prop of obj.properties as Node[]) {
    if (prop.type !== 'Property') continue;
    const name = keyName(prop);
    if (name === null || !(name in values)) continue;
    const value = values[name];
    const node = prop.value as Node;

    if (node.type === 'ArrayExpression') {
      // [default, min, max, step]
      const first = (node.elements as Node[])[0];
      const text = first && literalFor(first, value, code);
      if (text !== null && text !== undefined && text !== code.slice(first.start, first.end)) edits.push({ start: first.start, end: first.end, text });
    } else if (node.type === 'ObjectExpression') {
      if (propValue(node, 'type')) {
        // { type: 'select', options, default }; other typed controls (easing, image…) stay as written
        const def = propValue(node, 'default');
        const text = def && literalFor(def, value, code);
        if (def && text && text !== code.slice(def.start, def.end)) edits.push({ start: def.start, end: def.end, text });
      } else if (value && typeof value === 'object') {
        collect(node, value as Record<string, unknown>, code, edits);
      }
    } else {
      const text = literalFor(node, value, code);
      if (text && text !== code.slice(node.start, node.end)) edits.push({ start: node.start, end: node.end, text });
    }
  }
}

function findDialsObject(ast: Node): Node | null {
  let found: Node | null = null;
  const visit = (n: unknown) => {
    if (found || !n || typeof n !== 'object') return;
    const node = n as Node;
    if (node.type === 'CallExpression' && (node.callee as Node).type === 'Identifier' && (node.callee as Node).name === 'dials') {
      const arg = (node.arguments as Node[])[0];
      if (arg?.type === 'ObjectExpression') { found = arg; return; }
    }
    for (const key in node) {
      const child = node[key];
      if (Array.isArray(child)) child.forEach(visit);
      else if (child && typeof child === 'object' && 'type' in (child as object)) visit(child);
    }
  };
  visit(ast);
  return found;
}

export function writeControlsToCode(
  code: string,
  values: Record<string, unknown>,
  autoDials: AutoDial[],
): string {
  const autoLabels = new Set(autoDials.map(d => d.label));
  const dialValues = Object.fromEntries(Object.entries(values).filter(([k]) => !autoLabels.has(k)));
  const edits: Edit[] = [];

  try {
    const ast = parse(code, { ecmaVersion: 'latest', sourceType: 'script', allowHashBang: true }) as unknown as Node;
    const obj = findDialsObject(ast);
    if (obj) collect(obj, dialValues, code, edits);
  } catch {
    // Code that doesn't parse right now (mid-edit): leave it alone
    return code;
  }

  let out = code;
  for (const e of edits.sort((a, b) => b.start - a.start)) out = out.slice(0, e.start) + e.text + out.slice(e.end);

  // Smart toggles: `const NAME = value` lines
  for (const d of autoDials) {
    const v = values[d.label];
    if (v === undefined || v === d.value) continue;
    const re = new RegExp(`^(const\\s+${d.name}\\s*=\\s*)(-?\\d*\\.?\\d+|true|false|(['"])#[0-9a-fA-F]{3,8}\\3)`, 'm');
    out = out.replace(re, (_m, head: string, raw: string, quote?: string) => {
      if (typeof v === 'number' && !quote && !/^(true|false)$/.test(raw)) return head + formatNumber(v);
      if (typeof v === 'boolean' && /^(true|false)$/.test(raw)) return head + String(v);
      if (typeof v === 'string' && quote && /^#[0-9a-fA-F]{3,8}$/.test(v)) return head + quote + v + quote;
      return head + raw;
    });
  }
  return out;
}
