// Live controls: tweak these in the Controls panel
const dial = dials({
  text: 'lets dance baby 💃🕺🎶✨🪩 🎧🥳🔥🌈🎉 ',
  size: [14, 4, 240],
  count: [28, 10, 600, 1],
  freqA: [9, 1, 12, 1],
  freqB: [5, 1, 12, 1],
  shape: [0.98, 0, 1],
  speed: [0.1, 0, 4],
  scale: [0.51, 0.1, 1],
  rotate: false,
  color: '#000000',
  background: '#ffffff',
  showBackground: true,      // on: the background colour fills the canvas; off: transparent canvas, the trails fade to nothing
  scope: {
    trace: [0, 0, 8],          // beam thickness (0 hides it)
    glow: [0, 0, 50],         // phosphor glow around the beam
    persistence: [0, 0, 1],  // how long the screen keeps the afterglow
    wobble: [0, 0, 1],       // the music's waveform bends the beam (XY mode)
    drift: [0.3, 0, 3],        // the figure rolls as the phase drifts, like a real scope
  },
  music: {
    volume: [0.15, 0, 1],
    sensitivity: [3.8, 0, 4],
    pulse: [3, 0, 3],   // bass makes the letters bigger
    spread: [4, 0, 4],  // mids make the figure roll faster
    rush: [7.2, 0, 8],      // highs speed the text up
    wave: [0.7, 0, 3],      // each letter grows to its own frequency
    jump: [1.2, 0, 4],      // letters jump off the line with the sound
    shake: [0, 0, 2],     // letters tilt with the waveform
    newSong: { type: 'action' }, // make a new random song
  },
}, {
  onAction: (name) => {
    if (String(name).endsWith('newSong')) randomSong();
  },
});

const SAMPLES = 19059;
let pts = [];
let cum = [];
let drift = 0;

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

// Audio: click for a random generated song, F to pick a music file (or drop one), space pauses
let audioCtx, analyser, gainNode, songBus, noiseBuf, audioEl, mediaSource, spectrum, waveform, picker;
let trackName = '';
let needsClick = false;
const level = { bass: 0, mid: 0, high: 0 };
let travel = 0;
let bounce = []; // smoothed per-letter jump

function ensureAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.75;
    gainNode = audioCtx.createGain();
    analyser.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    spectrum = new Uint8Array(analyser.frequencyBinCount);
    waveform = new Uint8Array(analyser.fftSize).fill(128);
    songBus = audioCtx.createGain();
    songBus.gain.value = 0.45;
    songBus.connect(analyser);
    noiseBuf = audioCtx.createBuffer(1, audioCtx.sampleRate, audioCtx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // Schedule the song on its own timer so it never depends on the draw loop
    setInterval(() => scheduleSong(), 25);
  }
  unlockAudio();
}

// Resume the audio and play a tiny silent sound: some browsers (Safari, iOS) only start audio this way
let unlocked = false;
function unlockAudio() {
  if (!audioCtx) return;
  if (audioCtx.state !== 'running') audioCtx.resume().catch(() => {});
  if (!unlocked) {
    try {
      const b = audioCtx.createBufferSource();
      b.buffer = audioCtx.createBuffer(1, 1, 22050);
      b.connect(audioCtx.destination);
      b.start(0);
      unlocked = true;
    } catch (e) {}
  }
}

function stopFile() {
  if (!audioEl) return;
  audioEl.pause();
  mediaSource.disconnect();
  URL.revokeObjectURL(audioEl.src);
  audioEl = null;
}

function playFile(file) {
  if (!file || (file.type && !file.type.startsWith('audio/'))) return;
  ensureAudio();
  song = null;
  stopFile();
  audioEl = new Audio(URL.createObjectURL(file));
  audioEl.loop = true;
  mediaSource = audioCtx.createMediaElementSource(audioEl);
  mediaSource.connect(analyser);
  trackName = file.name;
  needsClick = false;
  // Dropped files may need one click before the browser lets them play
  audioEl.play().catch(() => (needsClick = true));
}

// ---- Random song generator ----
const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
};
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const PROGRESSIONS = [[0, 5, 3, 4], [0, 3, 4, 3], [0, 4, 5, 3], [5, 3, 0, 4], [0, 2, 5, 4], [0, 6, 5, 4]];
const KICKS = [[0, 8], [0, 6, 10], [0, 3, 8, 11], [0, 8, 10], [0, 4, 8, 12]];
let song = null;

function randomSong() {
  ensureAudio();
  stopFile();
  needsClick = false;
  const mode = random(Object.keys(SCALES));
  const root = 45 + floor(random(12));
  song = {
    tempo: floor(random(88, 136)),
    root,
    scale: SCALES[mode],
    prog: random(PROGRESSIONS),
    kick: random(KICKS),
    hatEvery: random([1, 2]),
    bass: random([[0, 8], [0, 6, 10], [0, 3, 6, 8, 11, 14], [0, 2, 4, 6, 8, 10, 12, 14]]),
    lead: Array.from({ length: 16 }, () => (random() < 0.5 ? floor(random(8)) : -1)),
    leadWave: random(['triangle', 'square', 'sawtooth']),
    step: 0,
    next: audioCtx.currentTime + 0.1,
    playing: true,
  };
  trackName = NOTE_NAMES[root % 12] + ' ' + mode + ' · ' + song.tempo + ' bpm';
}

function midiOf(degree, octave) {
  const s = song.scale;
  return song.root + 12 * (octave + floor(degree / 7)) + s[((degree % 7) + 7) % 7];
}
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

function tone(t, f, dur, type, vol, cutoff, attack = 0.01) {
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = type;
  o.frequency.value = f;
  let node = o;
  if (cutoff) {
    const fl = audioCtx.createBiquadFilter();
    fl.type = 'lowpass';
    fl.frequency.value = cutoff;
    o.connect(fl);
    node = fl;
  }
  node.connect(g);
  g.connect(songBus);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function kick(t) {
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.frequency.setValueAtTime(150, t);
  o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
  g.gain.setValueAtTime(1, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
  o.connect(g);
  g.connect(songBus);
  o.start(t);
  o.stop(t + 0.4);
}

// Named noiseHit (not noise) so p5's built-in Perlin noise() doesn't replace it
function noiseHit(t, dur, vol, type, f) {
  const src = audioCtx.createBufferSource();
  src.buffer = noiseBuf;
  const fl = audioCtx.createBiquadFilter();
  fl.type = type;
  fl.frequency.value = f;
  const g = audioCtx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(fl);
  fl.connect(g);
  g.connect(songBus);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.02);
}

function playStep(step, t) {
  const sixteenth = 60 / song.tempo / 4;
  const i = step % 16;
  const chord = song.prog[floor(step / 16) % song.prog.length];

  if (song.kick.includes(i)) kick(t);
  if (i === 4 || i === 12) noiseHit(t, 0.18, 0.5, 'bandpass', 1800);
  if (i % song.hatEvery === 0) noiseHit(t, 0.05, i % 4 === 2 ? 0.25 : 0.12, 'highpass', 7000);
  if (song.bass.includes(i)) tone(t, hz(midiOf(chord, -1)), sixteenth * 1.8, 'sawtooth', 0.35, 400);
  if (i === 0) {
    for (const d of [0, 2, 4]) tone(t, hz(midiOf(chord + d, 1)), sixteenth * 16, 'triangle', 0.06, 1500, 0.3);
  }
  // Lead melody: same rhythm each bar, follows the chord, varies a little every 4 bars
  const n = song.lead[i];
  if (n >= 0) {
    const shift = floor(step / 64) % 2 ? 2 : 0;
    tone(t, hz(midiOf(chord + n + shift, 2)), sixteenth * 1.5, song.leadWave, 0.09, 3000);
  }
}

function scheduleSong() {
  if (!audioCtx || !song || !song.playing) return;
  const now = audioCtx.currentTime;
  if (song.next < now - 0.1) song.next = now + 0.05; // tab was hidden: don't burst
  const sixteenth = 60 / song.tempo / 4;
  while (song.next < now + 0.15) {
    playStep(song.step, song.next);
    song.next += sixteenth;
    song.step++;
  }
}

// Average loudness (0..1) of a range of frequency bins
function band(a, b) {
  let sum = 0;
  for (let i = a; i < b; i++) sum += spectrum[i];
  return sum / (b - a) / 255;
}

function isPlaying() {
  return (audioEl && !audioEl.paused) || (song && song.playing);
}

function listen() {
  if (!isPlaying()) {
    level.bass *= 0.9;
    level.mid *= 0.9;
    level.high *= 0.9;
    if (spectrum) spectrum.fill(0);
    if (waveform) waveform.fill(128);
    return;
  }
  gainNode.gain.value = dial.music.volume;
  analyser.getByteFrequencyData(spectrum);
  analyser.getByteTimeDomainData(waveform);
  const k = dial.music.sensitivity;
  level.bass = constrain(pow(band(1, 8) * k, 2), 0, 1.5);
  level.mid = constrain(band(8, 60) * k, 0, 1.5);
  level.high = constrain(band(60, 250) * k * 1.5, 0, 1.5);
}

function setup() {
  const cnv = createCanvas(windowWidth, windowHeight);
  noStroke();
  textAlign(CENTER, CENTER);
  textStyle(BOLD);
  if (dial.showBackground) background(dial.background);
  else clear();

  picker = document.createElement('input');
  picker.type = 'file';
  picker.accept = 'audio/*';
  picker.style.display = 'none';
  picker.onchange = () => {
    playFile(picker.files[0]);
    picker.value = '';
  };
  document.body.appendChild(picker);
  cnv.drop((f) => playFile(f.file));

  // Browsers keep audio suspended until a real user gesture: resume on any click, tap or key
  // Creating the audio inside the gesture itself is what browsers accept
  const unlock = () => {
    ensureAudio();
  };
  ['pointerdown', 'pointerup', 'click', 'touchend', 'keydown'].forEach((ev) =>
    window.addEventListener(ev, unlock, true)
  );
}

function mousePressed() {
  ensureAudio();
  if (needsClick && audioEl) {
    needsClick = false;
    audioEl.play();
    return;
  }
  randomSong();
}

function keyPressed() {
  if (key === ' ') {
    ensureAudio();
    if (audioEl) {
      if (audioEl.paused) audioEl.play();
      else audioEl.pause();
    } else if (song) {
      song.playing = !song.playing;
      song.next = audioCtx.currentTime + 0.05;
    }
    return false;
  }
  if (key === 'f' || key === 'F') picker.click();
}

// Sample the Lissajous curve (bent by the music's waveform, like an XY scope) and its cumulative arc length.
// The size stays fixed; the phase drifts so the figure rolls, as when two signals are slightly out of tune.
function buildPath(scl) {
  const rx = (width / 2) * scl;
  const ry = (height / 2) * scl;
  const phase = dial.shape * PI + drift;
  const w = dial.scope.wobble * min(width, height) * 0.25 * scl;
  const n = waveform ? waveform.length : 0;
  pts = [];
  cum = [0];
  for (let i = 0; i <= SAMPLES; i++) {
    const u = (i / SAMPLES) * TWO_PI;
    let x = rx * sin(dial.freqA * u + phase);
    let y = ry * sin(dial.freqB * u);
    if (n && w > 0) {
      // Left/right-ish: the waveform on X, a quarter-buffer later on Y
      const j = floor((i / SAMPLES) * (n - 1));
      x += ((waveform[j] - 128) / 128) * w;
      y += ((waveform[(j + (n >> 2)) % n] - 128) / 128) * w;
    }
    pts.push(createVector(x, y));
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

// Scope graticule: 10 × 8 divisions with small ticks on the centre axes
function drawGrid() {
  const c = color(dial.color);
  const cols = 10;
  const rows = 8;
  const div = min(width / cols, height / rows) * 0.9;
  const w = div * cols;
  const h = div * rows;
  push();
  translate(width / 2, height / 2);
  noFill();
  c.setAlpha(28);
  stroke(c);
  strokeWeight(1);
  for (let i = 0; i <= cols; i++) line(-w / 2 + i * div, -h / 2, -w / 2 + i * div, h / 2);
  for (let j = 0; j <= rows; j++) line(-w / 2, -h / 2 + j * div, w / 2, -h / 2 + j * div);
  c.setAlpha(60);
  stroke(c);
  for (let i = 0; i <= cols * 5; i++) {
    const x = -w / 2 + (i * div) / 5;
    line(x, -4, x, 4);
  }
  for (let j = 0; j <= rows * 5; j++) {
    const y = -h / 2 + (j * div) / 5;
    line(-4, y, 4, y);
  }
  pop();
}

function draw() {
  // Phosphor persistence: fade the previous frame instead of clearing it
  const fade = 255 * (1 - dial.scope.persistence * 0.92);
  if (dial.showBackground) {
    const bg = color(dial.background);
    bg.setAlpha(fade);
    background(bg);
  } else {
    // No background: erase a little of the last frame so the canvas stays transparent
    push();
    noStroke();
    erase(fade, fade);
    rect(0, 0, width, height);
    noErase();
    pop();
  }

  listen();

  // Phase drift: the figure rolls; mids make it roll faster
  drift += (deltaTime / 1000) * dial.scope.drift * (1 + level.mid * dial.music.spread);
  buildPath(dial.scale);
  const total = cum[cum.length - 1];
  if (total <= 0) return;

  push();
  translate(width / 2, height / 2);

  // The beam
  if (dial.scope.trace > 0) {
    drawingContext.shadowBlur = dial.scope.glow * (1 + level.bass * 0.5);
    drawingContext.shadowColor = dial.color;
    noFill();
    stroke(dial.color);
    strokeWeight(dial.scope.trace);
    beginShape();
    for (const p of pts) vertex(p.x, p.y);
    endShape();
    drawingContext.shadowBlur = 0;
    noStroke();
  }

  fill(dial.color);
  drawingContext.shadowBlur = dial.scope.glow * 0.5;
  drawingContext.shadowColor = dial.color;
  const chars = getGlyphs(dial.text);
  const count = dial.count;
  const step = total / count;
  // Highs push the text along faster; accumulate so speed changes don't jump
  travel += (deltaTime / 1000) * dial.speed * (1 + level.high * dial.music.rush);
  const offset = ((travel / TWO_PI) % 1) * total;
  const baseSize = dial.size * (1 + level.bass * dial.music.pulse);
  const n = waveform ? waveform.length : 0;
  if (bounce.length !== count) bounce = new Array(count).fill(0);

  for (let i = 0; i < count; i++) {
    const s = (i * step + offset) % total;
    const p = pointAt(s);
    const amp = spectrum ? spectrum[floor(map(i, 0, count, 2, 200))] / 255 : 0;
    // The waveform at this letter's spot along the text: letters ride the sound wave
    const wv = n ? (waveform[floor((i / count) * (n - 1))] - 128) / 128 : 0;
    // Jump off the line: its own frequency pushes it out, the waveform shakes it back and forth
    const target = (amp * 1.2 + wv * 2) * dial.music.jump * baseSize;
    bounce[i] = lerp(bounce[i], target, 0.35);

    push();
    translate(p.x, p.y);
    // Push out along the curve's normal
    translate(sin(p.angle) * bounce[i], -cos(p.angle) * bounce[i]);
    // Letters follow the curve's direction, but flip when it runs leftward so they never read upside down
    if (dial.rotate) {
      let a = p.angle;
      if (cos(a) < 0) a += PI;
      rotate(a);
    }
    rotate(wv * dial.music.shake * PI * 0.5);
    textSize(max(1, baseSize * (1 + amp * dial.music.wave)));
    text(chars[i % chars.length], 0, 0);
    pop();
  }
  drawingContext.shadowBlur = 0;
  pop();

  // Hint / now playing
  const hint = !audioEl && !song
    ? 'Click for a random song · F to pick a music file, or drop one here'
    : audioCtx && audioCtx.state !== 'running'
      ? 'Click anywhere to turn on sound'
      : needsClick
      ? 'Click to play ' + trackName
      : !isPlaying()
        ? 'Paused · space to play'
        : song
          ? '♪ ' + trackName + ' · click for another'
          : '';
  if (hint) {
    const c = color(dial.color);
    c.setAlpha(song && isPlaying() ? 90 : 150);
    fill(c);
    textStyle(NORMAL);
    textSize(14);
    text(hint, width / 2, height - 40);
    textStyle(BOLD);
  }
}
