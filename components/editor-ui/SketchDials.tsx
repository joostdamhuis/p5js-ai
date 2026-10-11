import { useEffect, MutableRefObject } from 'react';
import { useDialKit, DialConfig } from 'dialkit';

interface SketchDialsProps {
  config: DialConfig;
  // Sends a message into the running sketch iframe
  postToSketch: (message: Record<string, unknown>) => void;
  // Latest values, so a reloaded sketch can pick up where the sliders are
  latestValues: MutableRefObject<unknown>;
}

// Registers the controls a sketch declares with dials({...}).
// The panel itself is drawn by <DialRoot mode="inline"> in the Controls column.
const SketchDials = ({ config, postToSketch, latestValues }: SketchDialsProps) => {
  const values = useDialKit('Sketch', config, {
    onAction: (action) => postToSketch({ type: 'action', action }),
  });

  useEffect(() => {
    latestValues.current = values;
    postToSketch({ type: 'values', values });
  }, [values, postToSketch, latestValues]);

  return null;
};

export default SketchDials;
