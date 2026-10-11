const SIZE = 200;
function setup() { createCanvas(windowWidth, windowHeight); noStroke(); }
function draw() { background(0); fill(255); circle(width/2 + sin(frameCount * 0.05) * width * 0.3, height/2, SIZE); }