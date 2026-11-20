// Song data: Bukit Asri Sunrise — E pelog-inspired (E F G B C), 112 BPM. Morning light over the hills.
const song = {
 "title": "Bukit Asri Sunrise",
 "station": "gamelan",
 "style": "gamelan",
 "bpm": 112,
 "keyName": "E pelog-inspired (E F G B C)",
 "mood": "Morning light over the hills",
 "key": 52,
 "scale": [
  0,
  1,
  3,
  7,
  8
 ],
 "progs": {
  "A": [
   "Em",
   "Em",
   "C",
   "C"
  ],
  "B": [
   "C",
   "Em",
   "F",
   "Em"
  ]
 },
 "sections": {
  "intro": {
   "prog": "A",
   "pad": "pad",
   "arp": "kotekan",
   "gong": true,
   "lead": false,
   "bars": 4
  },
  "a": {
   "prog": "A",
   "drums": "gamelan",
   "bass": "gong",
   "arp": "kotekan",
   "gong": true,
   "melody": "a",
   "bars": 8
  },
  "b": {
   "prog": "B",
   "drums": "gamelanDrive",
   "bass": "gong",
   "pad": "pad",
   "arp": "kotekan",
   "gong": true,
   "melody": "b",
   "lift": true,
   "bars": 8
  },
  "outro": {
   "prog": "A",
   "pad": "pad",
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
  "a": "E5 - F5 - G5 - - - | B5 - C6 - B5 - G5 - | F5 - - - E5 - F5 G5 | E5 - - - - - . .",
  "b": "B5 - - - C6 - B5 - | G5 - F5 - E5 - - - | G5 - B5 - C6 - E6 - | C6 - - - B5 - - -"
 }
};
export default song;
