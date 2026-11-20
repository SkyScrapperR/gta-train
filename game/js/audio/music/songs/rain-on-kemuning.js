// Song data: Rain on Kemuning — D minor (jazzy 9ths), 80 BPM. Rainy window, mellow.
const song = {
 "title": "Rain on Kemuning",
 "station": "lofi",
 "style": "lofi",
 "bpm": 80,
 "swing": 0.18,
 "keyName": "D minor (jazzy 9ths)",
 "mood": "Rainy window, mellow",
 "key": 50,
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
   "Dm9",
   "G9",
   "Cmaj7",
   "Am7"
  ],
  "B": [
   "Bbmaj7",
   "A7",
   "Dm9",
   "Dm9"
  ]
 },
 "sections": {
  "intro": {
   "prog": "A",
   "drums": "lofiSparse",
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
   "arp": "arp8",
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
  "a": "A4 - C5 - D5 - - - | . . B4 - A4 - G4 - | E4 - G4 - C5 - - - | . . . . A4 - - -",
  "b": "D5 - - - C5 - A4 - | C#5 - - - E5 - - - | D5 - F5 - E5 - D5 - | A4 - - - - - . ."
 }
};
export default song;
