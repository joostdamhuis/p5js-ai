function setup() {
  createCanvas(800, 500);
  background(240);
}

function draw() {
  // Draw a circle that follows the mouse
  fill(237, 34, 93);
  noStroke();
  ellipse(mouseX, mouseY, 60, 60);
}