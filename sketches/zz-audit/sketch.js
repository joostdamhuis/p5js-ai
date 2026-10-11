// Audit sketch
const dial = dials({ word: 'HELLO', mode: { type: 'select', options: ['a', 'b'] }, wave: { speed: [1, 0, 5], bob: [10, 0, 50] } });
const SIZE = 80;
const INK = '#ffffff';
const TRAILS = true;
function setup() { createCanvas(windowWidth, windowHeight); console.log('started'); console.warn('a warning'); }
function draw() { background(0); fill(INK); textSize(SIZE); textAlign(CENTER, CENTER); text(dial.word, width/2, height/2); }