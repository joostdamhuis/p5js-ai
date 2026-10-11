import { useEffect, MutableRefObject } from 'react';
import { DialRoot, useDialKit, DialConfig } from 'dialkit';
import 'dialkit/styles.css';

interface SketchDialsProps {
  config: DialConfig;
  // Sends a message into the running sketch iframe
  postToSketch: (message: Record<string, unknown>) => void;
  // Latest values, so a reloaded sketch can pick up where the sliders are
  latestValues: MutableRefObject<unknown>;
}

// DialKit panel for the controls a sketch declares with dials({...})
const SketchDials = ({ config, postToSketch, latestValues }: SketchDialsProps) => {
  const values = useDialKit('Sketch', config, {
    onAction: (action) => postToSketch({ type: 'action', action }),
  });

  useEffect(() => {
    latestValues.current = values;
    postToSketch({ type: 'values', values });
  }, [values, postToSketch, latestValues]);

  return <DialRoot position="bottom-right" theme="dark" productionEnabled />;
};

export default SketchDials;
