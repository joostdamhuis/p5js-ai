import { useEffect, useMemo, useRef, MutableRefObject } from 'react';
import { useDialKitController, DialConfig } from 'dialkit';
import { AutoDial, autoDialConfig } from '@/lib/auto-dials';

interface SketchControlsProps {
  // From the sketch's dials({...}) call, if any
  dialConfig: DialConfig | null;
  // Plain const settings found in the code (lib/auto-dials.ts)
  autoDials: AutoDial[];
  // Sends a message into the running sketch iframe
  postToSketch: (message: Record<string, unknown>) => void;
  // Latest values, so a reloaded sketch can pick up where the controls are
  latestDialValues: MutableRefObject<unknown>;
  latestAutoValues: MutableRefObject<unknown>;
  // Saved control positions to restore, and a callback when they change
  savedValues?: Record<string, unknown>;
  onValuesChange?: (values: Record<string, unknown>) => void;
}

// One "Sketch" panel holding both the dials() controls and the smart toggles,
// so DialKit shows a single header and preset row.
const SketchControls = ({ dialConfig, autoDials, postToSketch, latestDialValues, latestAutoValues, savedValues, onValuesChange }: SketchControlsProps) => {
  const dialKey = JSON.stringify(dialConfig);
  const autoKey = JSON.stringify(autoDials);
  const config = useMemo(
    () => ({ ...(dialConfig ?? {}), ...autoDialConfig(autoDials) }) as DialConfig,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dialKey, autoKey]
  );
  const { values, setValue, setValues } = useDialKitController('Sketch', config, {
    onAction: (action) => postToSketch({ type: 'action', action }),
  });

  // Put the controls back where they were saved, using the values as they were
  // when the sketch opened. Re-checks until each control shows its saved value,
  // because controls appear at different moments (dials() arrives a bit later)
  // and DialKit can re-register the panel right after mounting.
  const initialSaved = useRef(savedValues ?? {});
  const attempts = useRef(new Map<string, number>());
  useEffect(() => {
    const current = values as Record<string, unknown>;
    const toRestore: Record<string, unknown> = {};
    for (const key of Object.keys(config)) {
      if (!(key in initialSaved.current)) continue;
      const tries = attempts.current.get(key) ?? 0;
      if (tries >= 5) continue;
      if (JSON.stringify(current[key]) === JSON.stringify(initialSaved.current[key])) {
        attempts.current.set(key, 5); // restored
        continue;
      }
      attempts.current.set(key, tries + 1);
      toRestore[key] = initialSaved.current[key];
    }
    if (Object.keys(toRestore).length) setValues(toRestore as never);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, values]);

  // When the code changes a control's default (e.g. Claude picks new colours),
  // move that control to the new default; otherwise the old slider/colour value
  // would keep overriding the edit
  const prevDialConfig = useRef<DialConfig | null>(null);
  useEffect(() => {
    const before = prevDialConfig.current;
    prevDialConfig.current = dialConfig;
    if (!before || !dialConfig) return;
    const current = values as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    for (const key of Object.keys(dialConfig)) {
      if (!(key in before)) continue;
      const merged = applyChangedDefaults(before[key], dialConfig[key], current[key]);
      if (merged.changed) {
        patch[key] = merged.value;
        attempts.current.set(key, 5); // don't restore the old saved value over it
      }
    }
    if (Object.keys(patch).length) setValues(patch as never);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialKey]);

  useEffect(() => {
    onValuesChange?.(values as Record<string, unknown>);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values]);

  // When a smart-toggle value is edited in the code, move its control to it
  const codeValues = useRef<Record<string, unknown>>({});
  useEffect(() => {
    for (const { label, value } of autoDials) {
      if (label in codeValues.current && codeValues.current[label] !== value) setValue(label, value);
    }
    codeValues.current = Object.fromEntries(autoDials.map(d => [d.label, d.value]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoKey]);

  // Split the values back: dials() keys go to the dial object, labels to variables
  useEffect(() => {
    const all = values as Record<string, unknown>;
    const autoLabels = new Set(autoDials.map(d => d.label));
    if (dialConfig) {
      const dialValues = Object.fromEntries(Object.entries(all).filter(([k]) => !autoLabels.has(k)));
      latestDialValues.current = dialValues;
      postToSketch({ type: 'values', values: dialValues });
    }
    if (autoDials.length) {
      const autoValues = Object.fromEntries(autoDials.map(d => [d.name, all[d.label]]));
      latestAutoValues.current = autoValues;
      postToSketch({ type: 'autoValues', values: autoValues });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values, postToSketch, dialKey, autoKey]);

  return null;
};

// A control's default as written in dials(): [default, min, max], a plain value,
// or { type, default }. Folders (plain objects without a type) return undefined.
function defaultOf(c: unknown): unknown {
  if (Array.isArray(c)) return c[0];
  if (c && typeof c === 'object') {
    const o = c as Record<string, unknown>;
    if (!o.type) return undefined;
    return 'default' in o ? o.default : JSON.stringify(o); // e.g. easing: compare the whole spec
  }
  return c;
}

const isFolder = (c: unknown) => !!c && typeof c === 'object' && !Array.isArray(c) && !(c as Record<string, unknown>).type;

// Walks old and new config side by side; where a default changed, takes the new
// default, otherwise keeps the current value
function applyChangedDefaults(before: unknown, after: unknown, current: unknown): { changed: boolean; value: unknown } {
  if (isFolder(after) && isFolder(before)) {
    const cur = (current && typeof current === 'object' ? { ...(current as Record<string, unknown>) } : {}) as Record<string, unknown>;
    let changed = false;
    for (const k of Object.keys(after as object)) {
      const r = applyChangedDefaults((before as Record<string, unknown>)[k], (after as Record<string, unknown>)[k], cur[k]);
      if (r.changed) { cur[k] = r.value; changed = true; }
    }
    return { changed, value: cur };
  }
  const a = defaultOf(after), b = defaultOf(before);
  if (a === undefined || JSON.stringify(a) === JSON.stringify(b)) return { changed: false, value: current };
  const o = after as Record<string, unknown>;
  // easing and other objects without a plain default take the spec's own value
  const value = o && typeof o === 'object' && !Array.isArray(o) && !('default' in o) ? o : a;
  return { changed: true, value };
}

export default SketchControls;
