// Live controls: tweak these in the Controls panel
const dial = dials({
  text: '🌈✨🦄🍭💫🌸🍉🚀',
  size: [24, 4, 240],
  count: [31, 10, 600, 1],
  freqA: [3, 1, 12, 1],
  freqB: [9, 1, 12, 1],
  shape: [0.09, 0, 1],
  speed: [0.3, 0, 4],
  scale: [0.33, 0.1, 1],
  rotate: false,
  color: '#ffffff',
  background: '#000000',
});

const SAMPLES = 1210;
let pts = [];
let cum = [];

// Split text into visible characters, keeping emoji (incl. skin tones, flags, ZWJ sequences) whole
const segmenter = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;
let lastText = null;
let glyphs = [' '];
function getGlyphs(str) {
  if (str === lastText) return glyphs;
  lastText = str;
  glyphs = segmenter ? Array.from(segmenter.segment(str), (s) => s.segment) : Array.from(str);
  if (!glyphs.length) glyphs = [' '];
  return glyphs;
}

// One full trip of the text around the curve, in seconds
function loopLength() {
  return dial.speed > 0 ? TWO_PI / dial.speed : 4;
}

function setup() {
  createCanvas(windowWidth, windowHeight);
  noStroke();
  textAlign(CENTER, CENTER);
  textStyle(BOLD);
}

// Sample the fixed Lissajous curve and its cumulative arc length
function buildPath() {
  const rx = (width / 2) * dial.scale;
  const ry = (height / 2) * dial.scale;
  const phase = dial.shape * PI;
  pts = [];
  cum = [0];
  for (let i = 0; i <= SAMPLES; i++) {
    const u = (i / SAMPLES) * TWO_PI;
    pts.push(createVector(rx * sin(dial.freqA * u + phase), ry * sin(dial.freqB * u)));
    if (i > 0) cum.push(cum[i - 1] + p5.Vector.dist(pts[i], pts[i - 1]));
  }
}

// Position and direction at arc length s
function pointAt(s) {
  let lo = 0;
  let hi = cum.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= s) lo = mid;
    else hi = mid;
  }
  const a = pts[lo];
  const b = pts[hi];
  const seg = cum[hi] - cum[lo] || 1;
  const f = (s - cum[lo]) / seg;
  return { x: lerp(a.x, b.x, f), y: lerp(a.y, b.y, f), angle: atan2(b.y - a.y, b.x - a.x) };
}

function draw() {
  background(dial.background);
  fill(dial.color);
  textSize(dial.size);

  buildPath();
  const total = cum[cum.length - 1];
  if (total <= 0) return;

  const chars = getGlyphs(dial.text);
  const step = total / dial.count;
  const t = millis() / 1000;
  const offset = dial.speed > 0 ? ((t % loopLength()) / loopLength()) * total : 0;

  translate(width / 2, height / 2);
  for (let i = 0; i < dial.count; i++) {
    const s = (i * step + offset) % total;
    const p = pointAt(s);

    push();
    translate(p.x, p.y);
    // Letters sit on the curve, following its direction
    if (dial.rotate) rotate(p.angle);
    text(chars[i % chars.length], 0, 0);
    pop();
  }
}
