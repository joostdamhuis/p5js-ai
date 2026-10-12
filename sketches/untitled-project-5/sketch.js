// Live controls: tweak these in the Controls panel
const dial = dials({
  size: [44, 4, 160],     // max ball diameter in pixels
  color: '#00f84a',       // colour of the balls
  background: '#000000',
  scale: [0.5, 0.2, 2],     // overall size of the clock
  ballSize: [1, 0.1, 1.2], // ball diameter as a share of the spacing (lower = more space between balls)
  density: [5, 1, 5],     // how many balls fill each digit (higher = more, smaller-spaced balls)
  morph: [0.11, 0.01, 0.5], // how quickly balls glide into their new spots (higher = snappier)
  pulse: [0, 0, 1],    // size pop on each new second
  funky: [0, 0, 60],      // how far the balls bounce and sway
  speed: [2, 0, 10],    // how fast the bounce moves
  jitter: [0, 0, 1.5],  // how far each ball strays from a tidy pattern (0 = neat)
  variety: [0, 0, 1],   // how much ball sizes differ from each other
  wander: [0, 0, 20],     // each ball's own gentle drift in pixels
  burst: [0, 0, 400],    // how far every ball flies out on each new second
  shuffle: [1, 0, 1],    // share of balls that swap spots each second (1 = every digit fully re-forms)
});

// Stable pseudo-random number 0..1 for a given seed, so balls keep their spot
function hash(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

// Persistent pool of balls. They keep their position between frames so they can glide.
let pool = [];
let pg;              // offscreen buffer the digits are drawn into, then sampled
let targets = [];
let ballSpacing = 10;
let cacheKey = '';
let lastSec = -1;
let order = [];      // which target each ball heads for; reshuffled every second

function setup() {
  createCanvas(windowWidth, windowHeight);
  noStroke();
  makeBuffer();
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  makeBuffer();
}

function makeBuffer() {
  pg = createGraphics(width, height);
  pg.pixelDensity(1);
  cacheKey = '';
}

// Draw the time in a smooth font offscreen, then drop balls wherever the ink is
function buildTargets(text) {
  const n = text.length;
  const Ts = min((width * 0.9 * dial.scale) / (n * 0.62), height * 0.75 * dial.scale);
  const cw = Ts * 0.62;
  const x0 = width / 2 - (cw * n) / 2;
  const cy = height / 2;

  pg.background(0);
  pg.noStroke();
  pg.fill(255);
  pg.textFont('Arial');
  pg.textStyle(BOLD);
  pg.textSize(Ts);
  pg.textAlign(CENTER, CENTER);
  for (let i = 0; i < n; i++) pg.text(text[i], x0 + cw * (i + 0.5), cy);
  pg.loadPixels();

  const sp = Ts / (7 * dial.density);
  const rowH = sp * 0.866; // staggered rows so balls pack loosely, not in blocks
  const out = [];
  let idx = 0;
  for (let i = 0; i < n; i++) {
    let row = 0;
    for (let y = cy - Ts * 0.6; y < cy + Ts * 0.6; y += rowH, row++) {
      const off = row % 2 ? sp / 2 : 0;
      let col = 0;
      for (let x = x0 + cw * i + off; x < x0 + cw * (i + 1); x += sp, col++) {
        const px = floor(x), py = floor(y);
        if (px < 0 || py < 0 || px >= pg.width || py >= pg.height) continue;
        if (pg.pixels[(py * pg.width + px) * 4] < 128) continue;
        const seed = i * 100000 + row * 300 + col;
        out.push({
          x: x + (hash(seed) - 0.5) * dial.jitter * sp,
          y: y + (hash(seed + 0.31) - 0.5) * dial.jitter * sp,
          s: 1 - dial.variety * hash(seed + 0.57),
          ph: hash(seed + 0.83) * TWO_PI,
          i: idx++,
        });
      }
    }
  }
  targets = out;
  ballSpacing = sp;
}

function draw() {
  background(dial.background);

  const text = nf(hour(), 2) + ':' + nf(minute(), 2) + ':' + nf(second(), 2);
  const key = [text, width, height, dial.scale, dial.density, dial.jitter, dial.variety].join('|');
  if (key !== cacheKey) {
    buildTargets(text);
    cacheKey = key;
  }

  // Grow the pool if the time needs more balls. New balls appear at the centre.
  while (pool.length < targets.length) {
    order.push(pool.length);
    pool.push({ x: width / 2, y: height / 2, d: 0 });
  }

  // Every new second, swap balls' destinations and kick them so every digit morphs
  if (second() !== lastSec) {
    lastSec = second();
    for (let k = order.length - 1; k > 0; k--) {
      if (random() > dial.shuffle) continue;
      const j = floor(random(k + 1));
      [order[k], order[j]] = [order[j], order[k]];
    }
    for (const p of pool) {
      const a = random(TWO_PI);
      const r = random(dial.burst);
      p.x += cos(a) * r;
      p.y += sin(a) * r;
    }
  }

  const maxD = min(dial.size * dial.scale, ballSpacing * dial.ballSize);
  const t = frameCount * 0.02 * dial.speed;
  const pulse = 1 + dial.pulse * max(0, 1 - (millis() % 1000) / 250);

  fill(dial.color);
  for (let k = 0; k < pool.length; k++) {
    const p = pool[k];
    let tx, ty, td;
    if (order[k] < targets.length) {
      const tg = targets[order[k]];
      const bob = sin(t * 3 + tg.i * 0.45) * dial.funky;
      const sway = cos(t * 2 + tg.i * 0.3) * dial.funky * 0.3;
      const wx = cos(t * 1.3 + tg.ph) * dial.wander;
      const wy = sin(t * 1.7 + tg.ph * 1.9) * dial.wander;
      tx = tg.x + sway + wx;
      ty = tg.y + bob + wy;
      td = maxD * tg.s * pulse;
    } else {
      // Spare balls shrink away where they are
      tx = p.x;
      ty = p.y;
      td = 0;
    }
    p.x += (tx - p.x) * dial.morph;
    p.y += (ty - p.y) * dial.morph;
    p.d += (td - p.d) * dial.morph;
    if (p.d > 0.5) circle(p.x, p.y, p.d);
  }
}
