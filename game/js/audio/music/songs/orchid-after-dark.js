// Song data: Orchid After Dark — D minor, 100 BPM. Dark, seductive, neon purple.
const song = {
 "title": "Orchid After Dark",
 "station": "nights",
 "style": "synthwave",
 "bpm": 100,
 "keyName": "D minor",
 "mood": "Dark, seductive, neon purple",
 "key": 50,
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
   "Dm",
   "Bb",
   "F",
   "C"
  ],
  "B": [
   "Gm",
   "Dm",
   "Bb",
   "A"
  ],
  "C": [
   "Bb",
   "C",
   "Dm",
   "Dm"
  ]
 },
 "sections": {
  "intro": {
   "prog": "A",
   "pad": "pad",
   "bells": true,
   "bars": 4
  },
  "verse": {
   "prog": "A",
   "drums": "half",
   "bass": "octave8",
   "pad": "pad",
   "melody": "verse",
   "bars": 8
  },
  "chorus": {
   "prog": "B",
   "drums": "synth",
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
   "arp": "arp8",
   "melody": "bridge",
   "bars": 8
  },
  "outro": {
   "prog": "A",
   "pad": "pad",
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
  "verse": "D5 - - - F5 - E5 D5 | C5 - - - A4 - - - | D5 - F5 - A5 - G5 F5 | E5 - - - . . C5 -",
  "chorus": "A5 - - - G5 - F5 - | D5 - - - F5 - G5 A5 | Bb5 - A5 - G5 - F5 - | E5 - - - C#5 - - -",
  "bridge": "F5 - G5 - A5 - - - | G5 - A5 - C6 - - - | A5 - - - F5 - D5 - | D5 - - - - - . ."
 }
};
export default song;
