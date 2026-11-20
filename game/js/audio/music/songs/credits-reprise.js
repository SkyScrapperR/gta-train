// Song data: Heat on the Coast (Credits Reprise) — C minor, 96 BPM. Full-length reprise for the end credits.
const song = {
 "title": "Heat on the Coast (Credits Reprise)",
 "station": "score",
 "style": "cinematic",
 "bpm": 96,
 "keyName": "C minor",
 "mood": "Full-length reprise for the end credits",
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
   "Gm",
   "Cm"
  ],
  "C": [
   "Fm",
   "Ab",
   "Bb",
   "G"
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
  },
  "bridge": {
   "prog": "C",
   "drums": "half",
   "bass": "sub",
   "pad": "pad",
   "arp": "arp8",
   "melody": "bridge",
   "bars": 8
  },
  "outro": {
   "prog": "B",
   "pad": "pad",
   "bells": true,
   "melody": "hook",
   "bars": 8
  }
 },
 "arrangement": [
  "intro",
  "theme",
  "theme2",
  "bridge",
  "theme2",
  "outro"
 ],
 "melodies": {
  "hook": "C5 - - - Eb5 - G5 - | F5 - Eb5 - D5 - Bb4 - | C5 - - - G5 - - - | F5 - - - - - Eb5 D5 | Eb5 - - - C5 - Eb5 - | G5 - - - Ab5 - G5 F5 | Eb5 - D5 - Bb4 - D5 - | C5 - - - - - . .",
  "bridge": "F5 - - - Ab5 - G5 F5 | Eb5 - - - C5 - - - | D5 - F5 - Bb5 - Ab5 G5 | G5 - - - B4 - D5 -"
 }
};
export default song;
