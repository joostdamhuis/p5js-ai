// Gradient Pattern: rows of randomly sized rectangles, each with a horizontal gradient,
// sliding sideways. Press R (or change seed) for a new arrangement.
const dial = dials({
  colors: {
    from: '#ff4f6d',
    via: '#7b5cff',
    to: '#21d4c4',
    background: '#0d0d0d',
  },
  bars: {
    rows: [12, 2, 60, 1],
    minWidth: [40, 4, 600, 1],
    maxWidth: [320, 4, 1200, 1],
    gap: [6, 0, 40, 1],
    radius: [6, 0, 60, 1],
    margin: [24, 0, 200, 1], // top and bottom only
    seed: [1, 1, 999, 1],
  },
  motion: {
    speed: [0.3, 0, 3, 0.01],
    slide: [40, 0, 400, 1], // pixels per second the rows drift
    rowOffset: [0.08, 0, 0.5, 0.01],
    repeats: [1, 0.25, 4, 0.05],
  },
});

const STOPS = 12; // colour samples per rectangle
let layout = [];
let layoutKey = '';

function setup() {
  createCanvas(windowWidth, windowHeight);
  noStroke();
}

// Random widths per row, repeating across a strip a bit wider than the canvas
function buildLayout() {
  const b = dial.bars;
  const key = [b.rows, b.minWidth, b.maxWidth, b.gap, b.seed, width].join();
  if (key === layoutKey) return;
  layoutKey = key;
  randomSeed(b.seed);
  const lo = min(b.minWidth, b.maxWidth), hi = max(b.minWidth, b.maxWidth);
  layout = [];
  for (let r = 0; r < b.rows; r++) {
    const rects = [];
    let x = 0;
    while (x < width + hi) {
      const w = random(lo, hi);
      rects.push({ x, w });
      x += w + b.gap;
    }
    layout.push({ rects, length: x, dir: random() < 0.5 ? -1 : 1, pace: random(0.5, 1.5) });
  }
}

function draw() {
  buildLayout();
  background(dial.colors.background);
  const b = dial.bars;
  const m = dial.motion;
  const secs = millis() / 1000;
  const t = secs * m.speed * 0.1;
  const c1 = color(dial.colors.from);
  const c2 = color(dial.colors.via);
  const c3 = color(dial.colors.to);
  const ctx = drawingContext;

  const h = (height - b.margin * 2 - b.gap * (b.rows - 1)) / b.rows;
  if (h <= 0) return;

  layout.forEach((row, r) => {
    const y = b.margin + r * (h + b.gap);
    const phase = t + r * m.rowOffset;
    // Slide the row, wrapping its strip so it never runs out
    const shift = (((secs * m.slide * row.pace * row.dir) % row.length) + row.length) % row.length;

    for (const copy of [-row.length, 0]) {
      for (const rc of row.rects) {
        const x = rc.x + shift + copy;
        if (x > width || x + rc.w < 0) continue;
        // Gradient follows screen position, so colours flow across the gaps
        const grad = ctx.createLinearGradient(x, 0, x + rc.w, 0);
        for (let i = 0; i <= STOPS; i++) {
          const u = (x + (rc.w * i) / STOPS) / width;
          grad.addColorStop(i / STOPS, palette(u * m.repeats - phase, c1, c2, c3).toString());
        }
        ctx.fillStyle = grad;
        rect(x, y, rc.w, h, min(b.radius, h / 2, rc.w / 2));
      }
    }
  });
}

// from → via → to → via → from, repeating every 1, so it never shows a seam
function palette(u, c1, c2, c3) {
  const k = ((u % 1) + 1) % 1;
  const p = k < 0.5 ? k * 2 : (1 - k) * 2;
  return p < 0.5 ? lerpColor(c1, c2, p * 2) : lerpColor(c2, c3, p * 2 - 1);
}

function keyPressed() {
  if (key === 'r' || key === 'R') {
    dial.bars.seed = floor(random(1, 999));
  }
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}
