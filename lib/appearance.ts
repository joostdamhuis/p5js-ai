// Appearance: 'auto' follows the canvas brightness (editor only), 'dark' and
// 'light' are fixed. Shared by the editor and the dashboard.
export type Appearance = 'auto' | 'dark' | 'light';

const KEY = 'p5_appearance';

export const readAppearance = (): Appearance => {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'auto' || v === 'dark' || v === 'light') return v;
    // Older setting: "Adapt panels to canvas" turned off meant always dark
    const layout = JSON.parse(localStorage.getItem('p5_layout') || '{}');
    if (layout.tintPanels === false) return 'dark';
  } catch {}
  return 'auto';
};

export const writeAppearance = (value: Appearance) => {
  try { localStorage.setItem(KEY, value); } catch {}
};

// Light chrome is switched on with html[data-surface="light"] (see globals.css)
export const applySurface = (light: boolean) => {
  if (light) document.documentElement.dataset.surface = 'light';
  else delete document.documentElement.dataset.surface;
};
