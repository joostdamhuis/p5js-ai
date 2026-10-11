import { useEffect, useMemo, useRef, MutableRefObject } from 'react';
import { useDialKitController } from 'dialkit';
import { AutoDial, autoDialConfig } from '@/lib/auto-dials';

interface AutoDialsProps {
  dials: AutoDial[];
  // Sends a message into the running sketch iframe
  postToSketch: (message: Record<string, unknown>) => void;
  // Latest values, so a reloaded sketch can pick up where the controls are
  latestValues: MutableRefObject<unknown>;
}

// Controls for the plain settings found in the sketch (see lib/auto-dials.ts),
// shown as a "Variables" panel in the Controls column.
const AutoDials = ({ dials, postToSketch, latestValues }: AutoDialsProps) => {
  const key = JSON.stringify(dials);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const config = useMemo(() => autoDialConfig(dials), [key]);
  const controller = useDialKitController('Variables', config);
  const { values, setValue } = controller;

  // When a value is edited in the code, move its control to the new value
  const codeValues = useRef<Record<string, unknown>>({});
  useEffect(() => {
    for (const { label, value } of dials) {
      if (label in codeValues.current && codeValues.current[label] !== value) setValue(label, value);
    }
    codeValues.current = Object.fromEntries(dials.map(d => [d.label, d.value]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Controls are keyed by label; the sketch needs variable names
  useEffect(() => {
    const byName = Object.fromEntries(
      dials.map(d => [d.name, (values as Record<string, unknown>)[d.label]])
    );
    latestValues.current = byName;
    postToSketch({ type: 'autoValues', values: byName });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values, postToSketch, latestValues, key]);

  return null;
};

export default AutoDials;
