// Song data: Coastline Run — E minor, 116 BPM. Fast highway energy.
const song = {
 "title": "Coastline Run",
 "station": "nights",
 "style": "synthwave",
 "bpm": 116,
 "keyName": "E minor",
 "mood": "Fast highway energy",
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
   "G",
   "D"
  ],
  "B": [
   "C",
   "D",
   "Em",
   "Em"
  ],
  "C": [
   "Am",
   "Em",
   "B",
   "B"
  ]
 },
 "sections": {
  "intro": {
   "prog": "A",
   "drums": "half",
   "pad": "pad",
   "arp": "arp16",
   "bars": 4
  },
  "verse": {
   "prog": "A",
   "drums": "synth",
   "bass": "octave8",
   "pad": "pad",
   "arp": "arp8",
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
   "bars": 8
  },
  "bridge": {
   "prog": "C",
   "drums": "half",
   "bass": "pulse16",
   "pad": "pad",
   "melody": "bridge",
   "bars": 8
  },
  "outro": {
   "prog": "B",
   "pad": "pad",
   "arp": "arp16",
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
  "chorus",
  "outro"
 ],
 "melodies": {
  "verse": "E5 . E5 . G5 - F#5 E5 | D5 - B4 - - - . . | E5 . E5 . G5 - A5 G5 | F#5 - - - D5 - - -",
  "chorus": "B5 - A5 - G5 - E5 - | F#5 - - - D5 - E5 F#5 | G5 - A5 - B5 - D6 - | B5 - - - - - . .",
  "bridge": "C5 - E5 - A5 - G5 - | E5 - - - B4 - - - | C5 - E5 - G5 - F#5 E5 | D#5 - - - F#5 - - -"
 }
};
export default song;
