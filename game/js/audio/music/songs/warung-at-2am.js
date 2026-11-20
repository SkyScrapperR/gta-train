// Song data: Warung at 2AM — F major (7ths), 76 BPM. Late-night street food, warm.
const song = {
 "title": "Warung at 2AM",
 "station": "lofi",
 "style": "lofi",
 "bpm": 76,
 "swing": 0.2,
 "keyName": "F major (7ths)",
 "mood": "Late-night street food, warm",
 "key": 53,
 "scale": [
  0,
  2,
  4,
  5,
  7,
  9,
  11
 ],
 "progs": {
  "A": [
   "Fmaj7",
   "Em7",
   "Dm7",
   "Cmaj7"
  ],
  "B": [
   "Bbmaj7",
   "Am7",
   "Gm7",
   "C7"
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
   "drums": "lofi",
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
   "melody": "b",
   "lift": true,
   "bars": 8
  },
  "outro": {
   "prog": "A",
   "drums": "lofiSparse",
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
  "a": "C5 - A4 - G4 - F4 - | E4 - - - G4 - - - | F4 - A4 - C5 - D5 - | E5 - - - - - . .",
  "b": "D5 - C5 - Bb4 - A4 - | C5 - - - E4 - F4 - | G4 - Bb4 - D5 - C5 - | C5 - - - - - . ."
 }
};
export default song;
