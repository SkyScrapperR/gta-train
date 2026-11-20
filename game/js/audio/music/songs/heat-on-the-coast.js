// Song data: Heat on the Coast — C minor, 96 BPM. Main title: cinematic, nostalgic, heroic.
const song = {
 "title": "Heat on the Coast",
 "station": "score",
 "style": "cinematic",
 "bpm": 96,
 "keyName": "C minor",
 "mood": "Main title: cinematic, nostalgic, heroic",
 "key": 48,
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
   "Cm",
   "Ab",
   "Eb",
   "Bb"
  ],
  "B": [
   "Ab",
   "Bb",
   "Cm",
   "Cm"
  ]
 },
 "sections": {
  "intro": {
   "prog": "A",
   "pad": "pad",
   "bells": true,
   "lead": false,
   "bars": 4
  },
  "theme": {
   "prog": "A",
   "drums": "cinematic",
   "bass": "octave8",
   "pad": "pad",
   "arp": "arp16",
   "melody": "hook",
   "bars": 8
  },
  "theme2": {
   "prog": "A",
   "drums": "cinematicDrive",
   "bass": "drive",
   "pad": "pad",
   "arp": "arp16",
   "melody": "hook",
   "lift": true,
   "octave": 12,
   "bars": 8
  }
 },
 "arrangement": [
  "intro",
  "theme",
  "theme2"
 ],
 "melodies": {
  "hook": "C5 - - - Eb5 - G5 - | F5 - Eb5 - D5 - Bb4 - | C5 - - - G5 - - - | F5 - - - - - Eb5 D5 | Eb5 - - - C5 - Eb5 - | G5 - - - Ab5 - G5 F5 | Eb5 - D5 - Bb4 - D5 - | C5 - - - - - . ."
 }
};
export default song;
