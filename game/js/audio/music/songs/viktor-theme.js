// Song data: Viktor's Theme — B minor, 70 BPM. Menacing, slow pulse.
const song = {
 "title": "Viktor's Theme",
 "station": "score",
 "style": "cinematic",
 "bpm": 70,
 "keyName": "B minor",
 "mood": "Menacing, slow pulse",
 "key": 47,
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
   "Bm",
   "G",
   "Em",
   "F#"
  ]
 },
 "sections": {
  "a": {
   "prog": "A",
   "pad": "pad",
   "bass": "pulse16",
   "melody": "a",
   "drums": "half",
   "bars": 8
  },
  "b": {
   "prog": "A",
   "pad": "pad",
   "bass": "octave8",
   "melody": "a",
   "drums": "cinematic",
   "arp": "arp8",
   "bars": 8
  }
 },
 "arrangement": [
  "a",
  "b"
 ],
 "melodies": {
  "a": "B4 - - - D5 - C#5 - | B4 - - - F#4 - - - | G4 - - - F#4 - E4 - | F#4 - - - - - . ."
 }
};
export default song;
