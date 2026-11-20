// Song data: Neon Tide — A minor, 108 BPM. Bright night drive, hopeful.
const song = {
 "title": "Neon Tide",
 "station": "nights",
 "style": "synthwave",
 "bpm": 108,
 "keyName": "A minor",
 "mood": "Bright night drive, hopeful",
 "key": 57,
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
   "Am",
   "F",
   "C",
   "G"
  ],
  "B": [
   "F",
   "C",
   "G",
   "Am"
  ],
  "C": [
   "Dm",
   "Am",
   "Dm",
   "E"
  ]
 },
 "sections": {
  "intro": {
   "prog": "A",
   "pad": "pad",
   "arp": "arp16",
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
   "prog": "A",
   "pad": "pad",
   "arp": "arp8",
   "bells": true,
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
  "verse": "A4 - C5 - E5 - D5 C5 | A4 - - - . . G4 A4 | C5 - E5 - G5 - E5 D5 | D5 - - - . . . .",
  "chorus": "A5 - G5 - E5 - G5 A5 | C6 - - - A5 - G5 - | E5 - G5 - A5 - E5 D5 | E5 - - - - - . .",
  "bridge": "D5 - - - F5 - - - | E5 - - - C5 - - - | D5 - F5 - A5 - G5 F5 | E5 - - - G#4 - B4 -"
 }
};
export default song;
