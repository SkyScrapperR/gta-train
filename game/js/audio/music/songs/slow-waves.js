// Song data: Slow Waves — E minor (9ths), 72 BPM. Sunday morning beach.
const song = {
 "title": "Slow Waves",
 "station": "lofi",
 "style": "lofi",
 "bpm": 72,
 "swing": 0.16,
 "keyName": "E minor (9ths)",
 "mood": "Sunday morning beach",
 "key": 52,
 "scale": [
  0,
  2,
  3,
  5,
  7,
  9,
  10
 ],
 "progs": {
  "A": [
   "Em9",
   "Am9",
   "Dmaj7",
   "Gmaj7"
  ],
  "B": [
   "Cmaj7",
   "B7",
   "Em9",
   "Em9"
  ]
 },
 "sections": {
  "intro": {
   "prog": "A",
   "pad": "comp",
   "lead": false,
   "bars": 4
  },
  "a": {
   "prog": "A",
   "drums": "lofiSparse",
   "bass": "walk",
   "pad": "comp",
   "melody": "a",
   "bars": 8
  },
  "b": {
   "prog": "B",
   "drums": "lofi",
   "bass": "walk",
   "pad": "comp",
   "arp": "arp8",
   "melody": "b",
   "lift": true,
   "bars": 8
  },
  "outro": {
   "prog": "A",
   "pad": "comp",
   "lead": false,
   "bars": 4
  }
 },
 "arrangement": [
  "intro",
  "a",
  "b",
  "a",
  "b",
  "outro"
 ],
 "melodies": {
  "a": "B4 - - - E5 - D5 - | C5 - - - . . A4 - | F#4 - A4 - D5 - - - | B4 - - - - - . .",
  "b": "E5 - D5 - C5 - - - | D#5 - - - F#5 - - - | G5 - F#5 - E5 - B4 - | E5 - - - - - . ."
 }
};
export default song;
