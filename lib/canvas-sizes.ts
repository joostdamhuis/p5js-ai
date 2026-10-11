// Canvas size presets. "fit" follows the preview panel; the others make the
// sketch's window exactly that size (scaled down on screen), so windowWidth /
// windowHeight, PNGs and videos come out at those pixel sizes.
export type CanvasSize = { id: string; label: string; short: string; w?: number; h?: number };

export const CANVAS_SIZES: CanvasSize[] = [
  { id: 'fit', label: 'Fit window', short: 'Fit' },
  { id: '1080x1080', label: 'Square · 1080×1080', short: '1:1', w: 1080, h: 1080 },
  { id: '1080x1350', label: 'Portrait 4:5 · 1080×1350', short: '4:5', w: 1080, h: 1350 },
  { id: '1080x1920', label: 'Story 9:16 · 1080×1920', short: '9:16', w: 1080, h: 1920 },
  { id: '1920x1080', label: 'Landscape 16:9 · 1920×1080', short: '16:9', w: 1920, h: 1080 },
];

export const getCanvasSize = (id?: string) => CANVAS_SIZES.find(s => s.id === id) ?? CANVAS_SIZES[0];
