// Song data: Kecak Circuit — D slendro-inspired (D E G A B), 122 BPM. Hypnotic chant-like chops over beats.
const song = {
 "title": "Kecak Circuit",
 "station": "gamelan",
 "style": "gamelan",
 "bpm": 122,
 "keyName": "D slendro-inspired (D E G A B)",
 "mood": "Hypnotic chant-like chops over beats",
 "key": 50,
 "scale": [
  0,
  2,
  5,
  7,
  9
 ],
 "progs": {
  "A": [
   "Dsus2",
   "Gsus2",
   "Asus4",
   "Dsus2"
  ],
  "B": [
   "Gsus2",
   "Asus4",
   "Bm",
   "Asus4"
  ]
 },
 "sections": {
  "intro": {
   "prog": "A",
   "drums": "kecak",
   "gong": true,
   "lead": false,
   "bars": 4
  },
  "a": {
   "prog": "A",
   "drums": "kecak",
   "bass": "pulse16",
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
   "drums": "kecak",
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
  "a": "D5 - E5 - G5 - - - | A5 - G5 - E5 - - - | D5 - E5 - A5 - B5 - | A5 - - - - - . .",
  "b": "B5 - A5 - G5 - - - | E5 - G5 - A5 - - - | B5 - D6 - B5 - A5 - | G5 - - - E5 - - -"
 }
};
export default song;
