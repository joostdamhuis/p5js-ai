// Live controls: tweak these in the Controls panel
const dial = dials({
  size: [60, 4, 240],
  color: '#ffffff',
  background: '#000000',
});

function setup() {
  createCanvas(windowWidth, windowHeight);
  noStroke();
}

function draw() {
  background(dial.background);
  fill(dial.color);
  circle(mouseX, mouseY, dial.size);
}