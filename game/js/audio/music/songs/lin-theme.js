// Song data: Mama Lin's Theme — F major, 72 BPM. Warm, family, garage at golden hour.
const song = {
 "title": "Mama Lin's Theme",
 "station": "score",
 "style": "cinematic",
 "bpm": 72,
 "keyName": "F major",
 "mood": "Warm, family, garage at golden hour",
 "key": 53,
 "scale": [
  0,
  2,
  4,
  5,
  7,
  9,
  11
 ],
 "progs": {
  "A": [
   "Fmaj7",
   "Am7",
   "Bbmaj7",
   "C"
  ]
 },
 "sections": {
  "a": {
   "prog": "A",
   "pad": "pad",
   "melody": "a",
   "voicesLead": "bell",
   "bars": 8
  },
  "b": {
   "prog": "A",
   "pad": "pad",
   "bass": "sub",
   "melody": "a",
   "octave": 12,
   "bars": 8
  }
 },
 "arrangement": [
  "a",
  "b"
 ],
 "melodies": {
  "a": "F5 - A5 - C6 - - - | E5 - - - G5 - - - | D5 - F5 - A5 - G5 - | E5 - - - C5 - - -"
 }
};
song.voices = { lead: (s, o, t, m, d) => s.fm(o, t, m, d, { ratio: 1, index: 0.8, indexEnd: 0.2, vol: 0.16, decay: 2.2, r: 1.2 }) };
export default song;
