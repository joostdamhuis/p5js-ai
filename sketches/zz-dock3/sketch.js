const SIZE = 160;
const INK = "#c6f000";
function setup() { createCanvas(windowWidth, windowHeight); textAlign(CENTER, CENTER); textStyle(BOLD); }
function draw() { background(0); fill(INK); textSize(SIZE); text("SIMPLE", width/2, height/2); }