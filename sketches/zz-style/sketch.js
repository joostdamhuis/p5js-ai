const dial = dials({ word: "STYLE", speed: [1, 0, 5] });
const SIZE = 120;
const INK = "#c6f000";

function setup() {
  createCanvas(windowWidth, windowHeight);
  textAlign(CENTER, CENTER);
  console.log("ready");
}

function draw() {
  background(0);
  fill(INK);
  textSize(SIZE);
  text(dial.word, width / 2, height / 2);
}