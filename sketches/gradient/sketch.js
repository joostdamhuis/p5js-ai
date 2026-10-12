// Gradient Pattern: rows of randomly sized blocks, each with a horizontal gradient,
// sliding sideways. Switch between bars and cubes under Bars. Move the cursor to swell
// the blocks and drag the rows along.
// Press R (or change seed) for a new arrangement.
const dial = dials({
  reds: {
    from: '#3399ff',
    via: '#0e3fb3',
    to: '#8ac8ff',
    background: '#03081a',
  },
  bars: {
    form: { type: 'select', options: ['bars', 'cubes'], default: 'cubes' },
    depth: [0.5, 0, 0.5, 0.01], // cube depth, as a share of the block width
    rows: [2, 2, 60, 1],
    minWidth: [270, 4, 600, 1],
    maxWidth: [871, 4, 1200, 1],
    gap: [0, 0, 40, 1],
    radius: [0, 0, 60, 1],
    margin: [0, 0, 200, 1], // top and bottom only
    seed: [171, 1, 999, 1],
  },
  motion: {
    speed: [0.94, 0, 3, 0.01],
    slide: [263, 0, 400, 1], // pixels per second the rows drift
    rowOffset: [0.12, 0, 0.5, 0.01],
    repeats: [1.85, 0.25, 4, 0.05],
    breathe: [0, 0, 1, 0.01], // gentle height pulse per bar
  },
  cursor: {
    reach: [20, 20, 900, 1], // how far the cursor's influence spreads
    swell: [0.45, 0, 2.5, 0.01], // extra height for bars under the cursor
    drag: [0, 0, 4, 0.01], // how much moving the cursor pushes rows
    shift: [0, 0, 1, 0.01], // colour shift near the cursor
    ease: [0.51, 0.01, 1, 0.01], // how quickly the effect follows the cursor
  },
  finish: {
    sheen: [0, 0, 1, 0.01], // light on top, shade underneath
    glow: [0, 0, 80, 1], // soft light around bars near the cursor
    vignette: [0, 0, 1, 0.01],
  },
});

const STOPS = 1; // colour samples per rectangle
let layout = [];
let layoutKey = '';
let offsets = []; // per row: { pos, push }
let cx = 0, cy = 0, strength = 0, active = false;

function setup() {
  createCanvas(windowWidth, windowHeight);
  noStroke();
  cx = width / 2;
  cy = height / 2;
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
      rects.push({ x, w, ph: random(TAU), rate: random(0.6, 1.4) });
      x += w + b.gap;
    }
    layout.push({ rects, length: x, dir: random() < 0.5 ? -1 : 1, pace: random(0.5, 1.5) });
    if (!offsets[r]) offsets[r] = { pos: 0, push: 0 };
  }
}

// Fill a polygon given as [[x, y], ...]
function face(ctx, pts, fill) {
  ctx.beginPath();
  pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

function draw() {
  buildLayout();
  background(dial.reds.background);
  const b = dial.bars;
  const m = dial.motion;
  const k = dial.cursor;
  const f = dial.finish;
  const dt = min(deltaTime, 50) / 1000;
  const secs = millis() / 1000;
  const t = secs * m.speed * 0.1;
  const c1 = color(dial.reds.from);
  const c2 = color(dial.reds.via);
  const c3 = color(dial.reds.to);
  const ctx = drawingContext;
  const cubes = b.form === 'cubes';

  // Smoothed cursor, fading in when it's over the canvas
  const inside = active && mouseX >= 0 && mouseX <= width && mouseY >= 0 && mouseY <= height;
  const px = cx;
  cx = lerp(cx, mouseX, k.ease);
  cy = lerp(cy, mouseY, k.ease);
  strength = lerp(strength, inside ? 1 : 0, 0.08);
  const cursorDx = cx - px;

  const h = (height - b.margin * 2 - b.gap * (b.rows - 1)) / b.rows;
  if (h <= 0) return;

  layout.forEach((row, r) => {
    const y = b.margin + r * (h + b.gap);
    const mid = y + h / 2;
    const phase = t + r * m.rowOffset;
    const rowNear = strength * exp(-sq((mid - cy) / k.reach));

    // Drift plus a push from cursor movement that eases out
    const o = offsets[r];
    o.push = o.push * 0.92 + cursorDx * k.drag * rowNear * 0.6;
    o.pos += m.slide * row.pace * row.dir * dt + o.push;
    const shift = ((o.pos % row.length) + row.length) % row.length;

    for (const copy of [-row.length, 0]) {
      for (const rc of row.rects) {
        const x = rc.x + shift + copy;
        if (x > width || x + rc.w < 0) continue;
        const d = dist(x + rc.w / 2, mid, cx, cy);
        const near = strength * exp(-sq(d / k.reach));
        const pulse = 1 - m.breathe * 0.5 * (1 + sin(secs * rc.rate * (0.6 + m.speed) + rc.ph)) * 0.5;
        const rh = h * pulse * (1 + k.swell * near);
        const ry = mid - rh / 2;

        // Cubes: the front face sits lower, leaving room for a top and a side face
        const dz = cubes ? min(rc.w, rh) * b.depth : 0;
        const fy = ry + dz, fh = rh - dz;
        const rr = cubes ? 0 : min(b.radius, rh / 2, rc.w / 2);
        const top = [[x, fy], [x + dz, ry], [x + rc.w + dz, ry], [x + rc.w, fy]];
        const side = [[x + rc.w, fy], [x + rc.w + dz, ry], [x + rc.w + dz, ry + fh], [x + rc.w, ry + rh]];

        // Gradient follows screen position, so colours flow across the gaps
        const grad = ctx.createLinearGradient(x, 0, x + rc.w, 0);
        for (let i = 0; i <= STOPS; i++) {
          const u = (x + (rc.w * i) / STOPS) / width;
          grad.addColorStop(i / STOPS, palette(u * m.repeats - phase + k.shift * near, c1, c2, c3).toString());
        }

        // Soft glow, strongest under the cursor
        if (f.glow > 0) {
          const gc = palette(((x + rc.w / 2) / width) * m.repeats - phase + k.shift * near, c1, c2, c3);
          gc.setAlpha(255 * (0.25 + 0.75 * near));
          ctx.shadowColor = gc.toString();
          ctx.shadowBlur = f.glow * (0.2 + 0.8 * near);
        }
        if (cubes) {
          face(ctx, top, grad);
          face(ctx, side, grad);
        }
        ctx.fillStyle = grad;
        rect(x, fy, rc.w, fh, rr);
        ctx.shadowBlur = 0;

        // Cube faces: top catches light, side falls into shade
        if (cubes) {
          face(ctx, top, 'rgba(255,255,255,0.22)');
          face(ctx, side, 'rgba(0,0,0,0.35)');
        }

        // Sheen: light along the top, shade along the bottom
        if (f.sheen > 0) {
          const s = ctx.createLinearGradient(0, fy, 0, fy + fh);
          s.addColorStop(0, `rgba(255,255,255,${f.sheen})`);
          s.addColorStop(0.45, 'rgba(255,255,255,0)');
          s.addColorStop(0.6, 'rgba(0,0,0,0)');
          s.addColorStop(1, `rgba(0,0,0,${f.sheen * 0.8})`);
          ctx.fillStyle = s;
          rect(x, fy, rc.w, fh, rr);
        }
      }
    }
  });

  // Vignette to pull the eye to the centre
  if (f.vignette > 0) {
    const bg = color(dial.reds.background);
    const v = ctx.createRadialGradient(width / 2, height / 2, min(width, height) * 0.25, width / 2, height / 2, max(width, height) * 0.75);
    v.addColorStop(0, `rgba(${red(bg)},${green(bg)},${blue(bg)},0)`);
    v.addColorStop(1, `rgba(${red(bg)},${green(bg)},${blue(bg)},${f.vignette})`);
    ctx.fillStyle = v;
    rect(0, 0, width, height);
  }
}

// from → via → to → via → from, repeating every 1, so it never shows a seam
function palette(u, c1, c2, c3) {
  const k = ((u % 1) + 1) % 1;
  const p = k < 0.5 ? k * 2 : (1 - k) * 2;
  return p < 0.5 ? lerpColor(c1, c2, p * 2) : lerpColor(c2, c3, p * 2 - 1);
}

function mouseMoved() {
  active = true;
}

function mouseDragged() {
  active = true;
}

function keyPressed() {
  if (key === 'r' || key === 'R') {
    dial.bars.seed = floor(random(1, 999));
  }
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}
