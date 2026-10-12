// Live controls: tweak these in the Controls panel
const dial = dials({
  size: [164, 64, 400],
  detail: [29, 3, 64, 1],
  color: '#000000',
  background: '#ffffff',
  columns: [4, 1, 12, 1],
  spacing: [1, 1, 3, 0.05],
  speed: [5, 0, 5, 0.1],
  ripple: [0.4, 0, 1, 0.05],
  spin: true,
});

// Text printed on every face of the cube
const CUBE_TEXT = 'HELLO';

let faceTex;
let lastKey = '';

function setup() {
  createCanvas(windowWidth, windowHeight, WEBGL);
  noStroke();
  faceTex = createGraphics(512, 512);
}

// Redraw the face texture only when a colour changes
function drawFace() {
  const key = dial.color + dial.background;
  if (key === lastKey) return;
  lastKey = key;

  faceTex.background(dial.background);
  faceTex.fill(dial.color);
  faceTex.noStroke();
  faceTex.textAlign(CENTER, CENTER);
  faceTex.textStyle(BOLD);
  faceTex.textSize(110);
  faceTex.text(CUBE_TEXT, 256, 256);
}

function draw() {
  background(dial.background);
  drawFace();

  // Grid of spheres centred on the canvas, spaced by their size
  const gap = dial.size * dial.spacing;
  const offset = (dial.columns - 1) / 2;
  // Spin speed scales with the speed control; spin toggle stops the rotation
  const spinAngle = dial.spin ? frameCount * 0.01 * dial.speed : 0;
  texture(faceTex);

  for (let i = 0; i < dial.columns; i++) {
    for (let j = 0; j < dial.columns; j++) {
      push();
      translate((i - offset) * gap, (j - offset) * gap, 0);
      // Each sphere spins at its own phase so the grid ripples
      rotateY(spinAngle + (i + j) * dial.ripple);
      sphere(dial.size / 2, dial.detail, dial.detail);
      pop();
    }
  }
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}
