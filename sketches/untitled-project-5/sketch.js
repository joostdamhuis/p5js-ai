// Live controls: tweak these in the Controls panel
const dial = dials({
  size: [30, 10, 120],        // text size in pixels
  color: '#ffffff',
  background: '#000000',
  lineHeight: [0.8, 0.8, 2], // row spacing as a share of the text size
  copies: [4, 1, 16],         // how many squashed copies make up each trail
  stretch: [0.6, 0, 3],       // how far each trail spreads, in word widths
  spacing: [3.7, 1.2, 4],     // distance between repeats in a row, in word widths
  stagger: [0.04, 0, 1],      // how much each row is shifted sideways
  drift: [-0.05, -0.5, 0.5],   // sideways scroll per beat
  wave: [0.23, 0, 0.5],       // how much the stretch ripples outward from the centre in a diamond
  snap: [0, 0, 1],          // 0 = smooth sway, 1 = snappy moves that pause when fully open or closed
  fade: [0.6, 0, 1],          // how much the trail copies fade into the background
  bpm: [80, 70, 180],        // tempo of the tunes and the motion
  volume: [0.3, 0, 1],       // music volume
});

// The words the rows alternate between
const WORDS = ['JOOST', 'DAMHUIS'];

// ---------- Tunes (plain Web Audio, starts on click) ----------
let actx = null, master, noiseBuf;
let nextStep = 0, step = 0, lastKick = 0;
let kickQueue = [];  // scheduled kick times, released to the visuals as they are heard
let beatCount = 0;   // index of the last kick heard
let lastBeats = 0;   // last beat position, so pausing doesn't make things jump
let pausedAt = 0;    // millis() when the beat clock last ran

const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);
// Am, F, C, G — one chord per bar
const CHORDS = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];
const BASS = [33, 29, 36, 31];

function startAudio() {
  actx = new (window.AudioContext || window.webkitAudioContext)();
  master = actx.createGain();
  master.gain.value = dial.volume;
  master.connect(actx.destination);
  if (actx.state === 'suspended') actx.resume();
  noiseBuf = actx.createBuffer(1, actx.sampleRate, actx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  nextStep = actx.currentTime + 0.1;
  lastKick = nextStep;
  // Start the music on a bar line, continuing from where the visuals are
  beatCount = ceil(lastBeats / 4) * 4 - 1;
  step = 0;
}

// Clicking the canvas starts or pauses the tunes; keys only start or resume them
function toggleAudio() {
  if (!actx) startAudio();
  else if (actx.state === 'suspended') actx.resume();
  else actx.suspend();
}
function keyPressed() {
  if (!actx) startAudio();
  else if (actx.state === 'suspended') actx.resume();
}

function env(g, t, peak, decay) {
  g.gain.setValueAtTime(peak, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
}

function kick(t) {
  const o = actx.createOscillator(), g = actx.createGain();
  o.frequency.setValueAtTime(150, t);
  o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
  env(g, t, 1, 0.4);
  o.connect(g).connect(master);
  o.start(t); o.stop(t + 0.45);
}

function noise(t, type, freq, peak, decay) {
  const s = actx.createBufferSource(), f = actx.createBiquadFilter(), g = actx.createGain();
  s.buffer = noiseBuf;
  f.type = type; f.frequency.value = freq;
  env(g, t, peak, decay);
  s.connect(f).connect(g).connect(master);
  s.start(t); s.stop(t + decay + 0.05);
}

function tone(t, type, freq, peak, decay, cutoff) {
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = type; o.frequency.value = freq;
  env(g, t, peak, decay);
  if (cutoff) {
    const f = actx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = cutoff; f.Q.value = 8;
    o.connect(f).connect(g);
  } else o.connect(g);
  g.connect(master);
  o.start(t); o.stop(t + decay + 0.05);
}

function playStep(s, t) {
  const s16 = s % 16, bar = floor(s / 16) % 4;
  if (s16 % 4 === 0) { kick(t); kickQueue.push(t); }
  if (s16 === 4 || s16 === 12) { noise(t, 'bandpass', 1800, 0.6, 0.18); tone(t, 'triangle', 190, 0.2, 0.08); }
  noise(t, 'highpass', 7000, s16 % 4 === 2 ? 0.25 : 0.08, s16 % 4 === 2 ? 0.12 : 0.04);
  if (s16 % 2 === 0 && s16 % 8 !== 6) {
    const oct = s16 % 4 === 2 ? 12 : 0;
    tone(t, 'sawtooth', midi(BASS[bar] + oct), 0.3, 0.22, 700);
  }
  const ch = CHORDS[bar];
  tone(t, 'square', midi(ch[s16 % 3] + 12), 0.045, 0.12);
}

function runScheduler() {
  if (!actx || actx.state !== 'running') return;
  master.gain.value = dial.volume;
  const stepLen = 60 / dial.bpm / 4;
  // If the sketch stalled, skip ahead instead of firing a pile of notes at once
  if (nextStep < actx.currentTime) {
    const missed = ceil((actx.currentTime - nextStep) / stepLen);
    nextStep += missed * stepLen;
    step += missed;
  }
  while (nextStep < actx.currentTime + 0.12) {
    playStep(step, nextStep);
    nextStep += stepLen;
    step++;
  }
}

// Continuous beat position: whole part counts kicks, fraction is 0 right as a kick lands
function beatClock() {
  const beat = 60 / dial.bpm;
  if (actx && actx.state === 'running') {
    const heard = actx.currentTime - (actx.outputLatency || actx.baseLatency || 0);
    while (kickQueue.length && kickQueue[0] <= heard) {
      lastKick = kickQueue.shift();
      beatCount++;
    }
    const frac = constrain((heard - lastKick) / beat, 0, 0.999);
    lastBeats = max(0, beatCount + frac);
  } else {
    lastBeats += (millis() - pausedAt) / 1000 / beat;
  }
  pausedAt = millis();
  return lastBeats;
}

// ---------- Sketch ----------
function setup() {
  const cnv = createCanvas(windowWidth, windowHeight);
  cnv.mousePressed(toggleAudio);
  noStroke();
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}

// One word with a trail of squashed copies to its left. Each copy hides the rest of
// the one before it, so the trail shows thin slivers, then growing slices of the word.
function trail(word, w, x, y, open) {
  const K = max(1, round(dial.copies));
  const L = open * w * dial.stretch;
  const h = dial.size * 0.9;
  for (let j = 0; j < K; j++) {
    const f = K > 1 ? j / (K - 1) : 1;
    const c = color(dial.color);
    c.setAlpha(255 * (1 - dial.fade * (1 - f)));
    push();
    translate(x - L * (1 - f * f), y);
    scale(0.08 + 0.92 * f, 1);
    fill(dial.background);
    rect(-1, -h / 2, w + 2, h);
    fill(c);
    text(word, 0, 0);
    pop();
  }
}

function draw() {
  background(dial.background);
  runScheduler();
  const beats = beatClock();

  textFont('Inter Tight, Arial');
  textStyle(BOLD);
  textSize(dial.size);
  textAlign(LEFT, CENTER);

  let maxW = 0;
  for (const w of WORDS) maxW = max(maxW, textWidth(w));
  const cellW = maxW * dial.spacing;
  const rowH = dial.size * dial.lineHeight;

  for (let r = 0; r * rowH < height + rowH; r++) {
    const word = WORDS[r % WORDS.length];
    const w = textWidth(word);
    const y = r * rowH + rowH / 2;
    const shift = ((((r * dial.stagger + beats * dial.drift) % 1) + 1) % 1) * cellW;
    for (let x = shift - cellW; x < width; x += cellW) {
      // Trails open and close once per bar, rippling outward from the centre in a diamond
      const d = (abs(x + w / 2 - width / 2) / cellW) + (abs(y - height / 2) / rowH) * 0.25;
      const phase = beats / 4 - d * dial.wave;
      const tri = 1 - abs(((phase % 1) + 1) % 1 * 2 - 1);
      const s1 = tri * tri * (3 - 2 * tri);
      const s2 = s1 * s1 * (3 - 2 * s1);
      trail(word, w, x, y, lerp(tri, s2, dial.snap));
    }
  }

  if (!actx || actx.state !== 'running') {
    fill(dial.color);
    textAlign(CENTER, BOTTOM);
    textSize(14);
    text('click for tunes', width / 2, height - 20);
  }
}
