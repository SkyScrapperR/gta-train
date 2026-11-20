// Soundtrack index: every song module, grouped by radio station and score.
import s0 from './songs/neon-tide.js';
import s1 from './songs/coastline-run.js';
import s2 from './songs/orchid-after-dark.js';
import s3 from './songs/midnight-merpati.js';
import s4 from './songs/rain-on-kemuning.js';
import s5 from './songs/warung-at-2am.js';
import s6 from './songs/slow-waves.js';
import s7 from './songs/bukit-asri-sunrise.js';
import s8 from './songs/pier-9.js';
import s9 from './songs/kecak-circuit.js';
import s10 from './songs/heat-on-the-coast.js';
import s11 from './songs/credits-reprise.js';
import s12 from './songs/lin-theme.js';
import s13 from './songs/viktor-theme.js';
import s14 from './songs/chase.js';

export const SONGS = {
  'neon-tide': s0,
  'coastline-run': s1,
  'orchid-after-dark': s2,
  'midnight-merpati': s3,
  'rain-on-kemuning': s4,
  'warung-at-2am': s5,
  'slow-waves': s6,
  'bukit-asri-sunrise': s7,
  'pier-9': s8,
  'kecak-circuit': s9,
  'heat-on-the-coast': s10,
  'credits-reprise': s11,
  'lin-theme': s12,
  'viktor-theme': s13,
  'chase': s14,
};

export const STATIONS = [
  { id: 'nights', name: 'Selara Nights FM', tagline: 'Synthwave after dark', jingle: [69, 76, 81], songs: ['neon-tide', 'coastline-run', 'orchid-after-dark', 'midnight-merpati'] },
  { id: 'lofi', name: 'Ombak Lo-Fi', tagline: 'Beats to drive slow to', jingle: [65, 69, 72], songs: ['rain-on-kemuning', 'warung-at-2am', 'slow-waves'] },
  { id: 'gamelan', name: 'Gamelan Wave', tagline: 'Bronze and bass', jingle: [64, 65, 71], songs: ['bukit-asri-sunrise', 'pier-9', 'kecak-circuit'] },
  { id: 'off', name: 'Radio Off', songs: [] },
];
