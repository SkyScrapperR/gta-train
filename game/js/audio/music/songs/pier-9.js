// Song data: Pier 9 — A pelog-inspired (A Bb C E F), 118 BPM. Cranes and containers at dusk.
const song = {
 "title": "Pier 9",
 "station": "gamelan",
 "style": "gamelan",
 "bpm": 118,
 "keyName": "A pelog-inspired (A Bb C E F)",
 "mood": "Cranes and containers at dusk",
 "key": 57,
 "scale": [
  0,
  1,
  3,
  7,
  8
 ],
 "progs": {
  "A": [
   "Am",
   "F",
   "Am",
   "E"
  ],
  "B": [
   "F",
   "Am",
   "Bb",
   "Am"
  ]
 },
 "sections": {
  "intro": {
   "prog": "A",
   "arp": "kotekan",
   "gong": true,
   "lead": false,
   "drums": "half",
   "bars": 4
  },
  "a": {
   "prog": "A",
   "drums": "gamelan",
   "bass": "octave8",
   "arp": "kotekan",
   "gong": true,
   "melody": "a",
   "bars": 8
  },
  "b": {
   "prog": "B",
   "drums": "gamelanDrive",
   "bass": "drive",
   "pad": "pad",
   "arp": "kotekan",
   "gong": true,
   "melody": "b",
   "lift": true,
   "bars": 8
  },
  "outro": {
   "prog": "A",
   "arp": "kotekan",
   "gong": true,
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
  "b",
  "outro"
 ],
 "melodies": {
  "a": "A5 - Bb5 - C6 - - - | E6 - - - C6 - Bb5 - | A5 - C6 - E6 - F6 - | E6 - - - - - . .",
  "b": "F6 - E6 - C6 - - - | Bb5 - A5 - - - E5 - | F5 - A5 - C6 - Bb5 - | A5 - - - - - . ."
 }
};
export default song;
