// Song data: Midnight Merpati — G minor, 112 BPM. Cruising, nostalgic.
const song = {
 "title": "Midnight Merpati",
 "station": "nights",
 "style": "synthwave",
 "bpm": 112,
 "keyName": "G minor",
 "mood": "Cruising, nostalgic",
 "key": 55,
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
   "Gm",
   "Eb",
   "Bb",
   "F"
  ],
  "B": [
   "Eb",
   "F",
   "Gm",
   "Gm"
  ],
  "C": [
   "Cm",
   "Gm",
   "D",
   "D"
  ]
 },
 "sections": {
  "intro": {
   "prog": "A",
   "pad": "pad",
   "arp": "arp8",
   "bars": 4
  },
  "verse": {
   "prog": "A",
   "drums": "synth",
   "bass": "octave8",
   "pad": "pad",
   "melody": "verse",
   "bars": 8
  },
  "chorus": {
   "prog": "B",
   "drums": "synthDrive",
   "bass": "drive",
   "pad": "pad",
   "arp": "arp16",
   "melody": "chorus",
   "lift": true,
   "octave": 12,
   "bars": 8
  },
  "bridge": {
   "prog": "C",
   "drums": "half",
   "bass": "sub",
   "pad": "pad",
   "melody": "bridge",
   "bars": 8
  },
  "outro": {
   "prog": "B",
   "pad": "pad",
   "arp": "arp8",
   "bars": 4
  }
 },
 "arrangement": [
  "intro",
  "verse",
  "chorus",
  "verse",
  "chorus",
  "bridge",
  "chorus",
  "outro"
 ],
 "melodies": {
  "verse": "G4 - Bb4 - D5 - C5 Bb4 | A4 - F4 - - - . . | G4 - Bb4 - D5 - F5 Eb5 | D5 - - - . . . .",
  "chorus": "G4 - F4 - D4 - Bb3 C4 | D4 - - - F4 - - - | Eb4 - D4 - C4 - Bb3 A3 | G3 - - - - - . .",
  "bridge": "C5 - Eb5 - G5 - - - | D5 - G5 - Bb5 - - - | A5 - - - F#5 - D5 - | D5 - - - - - . ."
 }
};
export default song;
