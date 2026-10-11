// Kinetic Type: rows of a word brought to life by different animations.
// Pick an animation, type your own word and shape the motion in the Controls panel.
const dial = dials({
  word: 'KINETIC',
  animation: {
    type: 'select',
    options: ['wave', 'ripple', 'bounce', 'spin', 'breathe', 'scatter'],
    default: 'wave',
  },
  motion: {
    shape: { type: 'select', options: ['sine', 'triangle', 'square', 'eased'], default: 'sine' },
    // Curve for the 'eased' shape: how each letter travels through its swing
    ease: { type: 'easing', duration: 1, ease: [0.65, 0, 0.35, 1] },
    speed: [1.2, 0, 5, 0.01],
    amount: [0.6, 0, 2, 0.01],
    bob: [12, 0, 120, 1],
    sway: [0, 0, 45, 1],
    letterOffset: [0.45, 0, 2, 0.01],
    rowOffset: [0.6, 0, 2, 0.01],
    reverse: false,
  },
});

const SIZE = 73;
const ROWS = 7;
const INK = '#ffffff';
const PAPER = '#000000';

// One cycle as a value from -1 to 1
function waveAt(p, shape) {
  if (shape === 'triangle') return (2 / PI) * asin(sin(p));
  if (shape === 'square') return sin(p) >= 0 ? 1 : -1;
  if (shape === 'eased') {
    // Up and back down once per cycle, each half following the Ease curve
    const f = ((p / TWO_PI) % 1 + 1) % 1;
    const [x1, y1, x2, y2] = dial.motion.ease.ease;
    const half = f < 0.5 ? f * 2 : (1 - f) * 2;
    return cubicBezier(half, x1, y1, x2, y2) * 2 - 1;
  }
  return sin(p);
}

// CSS-style cubic-bezier(x1, y1, x2, y2): progress 0..1 in, eased 0..1 out
function cubicBezier(x, x1, y1, x2, y2) {
  const bez = (t, a, b) => 3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3;
  let lo = 0, hi = 1, t = x;
  for (let i = 0; i < 20; i++) {
    t = (lo + hi) / 2;
    if (bez(t, x1, x2) < x) lo = t; else hi = t;
  }
  return bez(t, y1, y2);
}

function setup() {
  createCanvas(windowWidth, windowHeight);
  textFont('Helvetica');
  textStyle(BOLD);
  textAlign(CENTER, CENTER);
  noStroke();
}

function draw() {
  background(PAPER);
  fill(INK);
  textSize(SIZE);

  const m = dial.motion;
  const word = (dial.word || ' ').toUpperCase();
  const t = (millis() / 1000) * m.speed * (m.reverse ? -1 : 1) * PI;
  const lineH = SIZE * 0.9;
  const top = height / 2 - ((ROWS - 1) * lineH) / 2;
  const midRow = (ROWS - 1) / 2;
  const midLetter = (word.length - 1) / 2;

  for (let r = 0; r < ROWS; r++) {
    let x = width / 2 - textWidth(word) / 2;
    for (let i = 0; i < word.length; i++) {
      const cw = textWidth(word[i]);
      // Phase offset per letter: diagonal for most, distance from centre for ripple
      const offset = dial.animation === 'ripple'
        ? dist(i, r, midLetter, midRow) * (m.letterOffset + m.rowOffset)
        : i * m.letterOffset + r * m.rowOffset;
      const p = t - offset;
      const s = waveAt(p, m.shape);
      const c = waveAt(p + HALF_PI, m.shape);

      let dx = 0, dy = c * m.bob, angle = c * m.sway, sx = 1, sy = 1;
      switch (dial.animation) {
        case 'wave':
        case 'ripple':
          sy = 1 + s * m.amount;
          break;
        case 'bounce':
          dy = -abs(s) * m.bob * 3 * m.amount;
          sy = 1 - max(0, -c) * 0.3 * m.amount; // squash on landing
          sx = 1 + max(0, -c) * 0.2 * m.amount;
          break;
        case 'spin':
          angle = degrees(p) * m.amount + c * m.sway;
          break;
        case 'breathe':
          sx = sy = 1 + s * m.amount * 0.5;
          break;
        case 'scatter': {
          const n = noise(i * 3.1, r * 7.7, t * 0.1);
          dx = (n - 0.5) * 400 * m.amount * (0.5 + 0.5 * s);
          dy += (noise(i * 5.3, r * 2.1, t * 0.1 + 99) - 0.5) * 400 * m.amount * (0.5 + 0.5 * s);
          angle += (n - 0.5) * 180 * m.amount * (0.5 + 0.5 * s);
          break;
        }
      }

      push();
      translate(x + cw / 2 + dx, top + r * lineH + dy);
      rotate(radians(angle));
      scale(sx, max(0.05, sy));
      text(word[i], 0, 0);
      pop();
      x += cw;
    }
  }
}

// One full cycle of the wave, in seconds: Record → One perfect loop uses this.
// (spin and scatter never repeat exactly, so they won't loop seamlessly.)
function loopLength() {
  return 2 / max(0.01, dial.motion.speed);
}
