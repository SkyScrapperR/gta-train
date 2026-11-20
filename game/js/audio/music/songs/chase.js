// Song data: Chase (dynamic layers) — E minor, 128 BPM. Pursuit: bass, drums, arp and lead fade in by wanted level.
const song = {
 "title": "Chase (dynamic layers)",
 "station": "score",
 "style": "cinematic",
 "bpm": 128,
 "keyName": "E minor",
 "mood": "Pursuit: bass, drums, arp and lead fade in by wanted level",
 "key": 52,
 "scale": [
  0,
  2,
  3,
  5,
  7,
  8,
  10
 ],
 "progs": {
  "A": [
   "Em",
   "C",
   "D",
   "B"
  ]
 },
 "sections": {
  "loop": {
   "prog": "A",
   "drums": "chase",
   "bass": "pulse16",
   "arp": "arp16",
   "melody": "a",
   "fill": false,
   "bars": 8
  }
 },
 "arrangement": [
  "loop"
 ],
 "melodies": {
  "a": "E5 - G5 - B5 - - - | C6 - B5 - G5 - - - | D5 - F#5 - A5 - - - | B5 - - - D#5 - - -"
 }
};
export default song;
