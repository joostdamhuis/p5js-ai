// Turns a sketch into a Framer code component (one .tsx file to paste into
// Framer: Assets → Code → New file). The sketch runs in an iframe inside the
// component; its dials() controls and smart toggles become Framer property
// controls, starting at the values currently set in the editor.
import type { DialConfig } from 'dialkit';
import { Project } from './types';
import { AutoDial, findAutoDials } from './auto-dials';

type Control = Record<string, unknown>;

const isHex = (v: unknown) => typeof v === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(v);

const titleCase = (key: string) =>
  key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').replace(/^./, c => c.toUpperCase());

// One dials() entry → a Framer property control (null for ones Framer can't show)
function toControl(key: string, cfg: unknown, current: unknown): Control | null {
  const title = titleCase(key);
  if (Array.isArray(cfg)) {
    const [def, min, max, step] = cfg as number[];
    return { type: 'Number', title, defaultValue: typeof current === 'number' ? current : def, min, max, step: step ?? (max - min) / 100 };
  }
  if (typeof cfg === 'number') {
    return { type: 'Number', title, defaultValue: typeof current === 'number' ? current : cfg, min: 0, max: Math.max(1, Math.abs(cfg) * 3), step: Number.isInteger(cfg) ? 1 : 0.01 };
  }
  if (typeof cfg === 'boolean') return { type: 'Boolean', title, defaultValue: typeof current === 'boolean' ? current : cfg };
  if (typeof cfg === 'string') {
    return isHex(cfg)
      ? { type: 'Color', title, defaultValue: isHex(current) ? current : cfg }
      : { type: 'String', title, defaultValue: typeof current === 'string' ? current : cfg };
  }
  if (cfg && typeof cfg === 'object') {
    const c = cfg as Record<string, unknown>;
    if (c.type === 'select' && Array.isArray(c.options)) {
      const values = c.options.map(o => (typeof o === 'object' && o ? (o as { value: string }).value : String(o)));
      const titles = c.options.map(o => (typeof o === 'object' && o ? (o as { label: string }).label : titleCase(String(o))));
      return { type: 'Enum', title, options: values, optionTitles: titles, defaultValue: typeof current === 'string' ? current : (c.default ?? values[0]) };
    }
    if (c.type === 'color') return { type: 'Color', title, defaultValue: typeof current === 'string' ? current : (c.default ?? '#ffffff') };
    if (c.type === 'text') return { type: 'String', title, defaultValue: typeof current === 'string' ? current : (c.default ?? '') };
    if (c.type) return null; // action, spring, easing, image…: not editable in Framer
    // Folder → Framer object control
    const controls: Record<string, Control> = {};
    const cur = (current && typeof current === 'object' ? current : {}) as Record<string, unknown>;
    for (const [k, v] of Object.entries(c)) {
      if (k === '_collapsed') continue;
      const child = toControl(k, v, cur[k]);
      if (child) controls[k] = child;
    }
    return Object.keys(controls).length ? { type: 'Object', title, controls } : null;
  }
  return null;
}

// Controls as TypeScript source (ControlType.X instead of strings)
function controlSource(control: Control, indent: string): string {
  const lines = Object.entries(control).map(([k, v]) => {
    if (k === 'type') return `${indent}  type: ControlType.${v},`;
    if (k === 'controls') {
      const inner = Object.entries(v as Record<string, Control>)
        .map(([ck, cv]) => `${indent}    ${JSON.stringify(ck)}: ${controlSource(cv, indent + '    ')},`)
        .join('\n');
      return `${indent}  controls: {\n${inner}\n${indent}  },`;
    }
    return `${indent}  ${k}: ${JSON.stringify(v)},`;
  });
  return `{\n${lines.join('\n')}\n${indent}}`;
}

const componentName = (name: string) =>
  (name.replace(/[^A-Za-z0-9]+/g, ' ').trim().split(' ').map(w => w[0]?.toUpperCase() + w.slice(1)).join('') || 'Sketch')
    .replace(/^[0-9]/, 'S$&');

export function buildFramerComponent(
  project: Project,
  dialConfig: DialConfig | null,
  fontData: Record<string, string>,
): string {
  const name = componentName(project.name);
  const controls = project.controls ?? {};
  const js = project.files.filter(f => f.type === 'js').map(f => f.content).join('\n\n');
  const autoDials: AutoDial[] = findAutoDials(js);

  // Property controls: dials() keys as d_<key>, smart toggles as c_<NAME>
  const props: Record<string, Control> = {};
  for (const [key, cfg] of Object.entries(dialConfig ?? {})) {
    const control = toControl(key, cfg, controls[key]);
    if (control) props[`d_${key}`] = control;
  }
  for (const d of autoDials) {
    const control = toControl(d.label, d.value, controls[d.label]);
    if (control) props[`c_${d.name}`] = control;
  }

  const fonts = (project.fonts ?? [])
    .filter(f => fontData[f])
    .map(f => ({ family: f.replace(/\.(ttf|otf|woff2?)$/i, ''), src: fontData[f] }));

  const propsSource = Object.entries(props)
    .map(([k, c]) => `  ${JSON.stringify(k)}: ${controlSource(c, '  ')},`)
    .join('\n');

  return `// ${project.name}: p5.js sketch as a Framer code component.
// Made with the p5.js AI Editor. Paste into Framer: Assets → Code → New code file.
import { addPropertyControls, ControlType } from "framer"
import { useMemo } from "react"

const SKETCH = ${JSON.stringify(js)}
const AUTO_SETTINGS = ${JSON.stringify(autoDials.map(d => d.name))}
const FONTS: { family: string; src: string }[] = ${JSON.stringify(fonts)}

function buildPage(props: Record<string, any>) {
    // dials({...}) returns the values set in Framer
    const dialValues: Record<string, any> = {}
    for (const key of Object.keys(props)) {
        if (key.startsWith("d_")) dialValues[key.slice(2)] = props[key]
    }
    // Plain settings (const NAME = value) take their value from Framer
    let code = SKETCH
    for (const name of AUTO_SETTINGS) {
        const value = props["c_" + name]
        if (value === undefined) continue
        code = code.replace(
            new RegExp("^const\\\\s+" + name + "\\\\s*=\\\\s*[^;\\\\n]+", "m"),
            "const " + name + " = " + JSON.stringify(value)
        )
    }
    const fontFaces = FONTS.map(
        (f) => '@font-face { font-family: "' + f.family + '"; src: url("' + f.src + '"); }'
    ).join("\\n")
    const end = "</" + "script>"
    return (
        "<!doctype html><html><head><meta charset=utf-8>" +
        '<script src="https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.9.0/p5.min.js">' + end +
        "<style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#000}" +
        "body{display:flex;align-items:center;justify-content:center}" +
        "canvas{display:block;max-width:100%;max-height:100%;object-fit:contain}" + fontFaces + "</style>" +
        "<script>window.dials=function(){return " + JSON.stringify(dialValues) + "};" +
        "window.addEventListener('resize',function(){if(typeof windowResized!=='function'&&typeof resizeCanvas==='function')resizeCanvas(innerWidth,innerHeight)});" +
        end + "</head><body><script>" + code + end + "</body></html>"
    )
}

/**
 * @framerSupportedLayoutWidth any
 * @framerSupportedLayoutHeight any
 * @framerIntrinsicWidth 600
 * @framerIntrinsicHeight 600
 */
export default function ${name}(props: Record<string, any>) {
    const html = useMemo(() => buildPage(props), [JSON.stringify(props)])
    return (
        <iframe
            srcDoc={html}
            title="${project.name.replace(/"/g, '')}"
            style={{ width: "100%", height: "100%", border: "none", display: "block", ...props.style }}
        />
    )
}

addPropertyControls(${name}, {
${propsSource}
})
`;
}
