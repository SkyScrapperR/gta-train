# TASK: Build "SELARA BAY", an original 3D open-world crime game for the make.fun bounty gta6-01

You are building a complete, polished **3D** open-world crime game "in the spirit of" the modern genre, with a third-person camera behind the character or car. It must run offline in desktop Chrome from static files, using keyboard + mouse. Completeness counts most, then visual impact.

The AI judge compares entries pairwise using **3–4 screenshots + an outline of the source code**. Two things therefore matter:
- The screenshots must look like a real modern 3D city game.
- The source tree must be clean, modular and clearly named.

**Hard rule:** everything is original. No names, characters, vehicles, logos, music, sounds, phrases or art from Rockstar Games or any commercial game. Never use "Wasted", "Busted", "Ammu-Nation", "Pay 'n' Spray", "Los Santos", "Vice City", etc. Use only the original names in this brief.

**Engine rule:** write your own small WebGL2 renderer. Do not use Three.js, Babylon, or any other library or engine. The kit limits how many lines may be unauthored, and the custom engine is also a strong signal in the source outline.

## PRIORITY RULE: complete before beautiful

The judge says completeness counts most. Build in three tiers, and **never start a tier until the previous tier is fully playable end-to-end and committed**. If you are ever running low on context or time, stop adding features, polish what exists, take screenshots and commit. At every checkpoint the repo must contain a complete, submittable game.

- **Tier 1, MUST (complete game, simple visuals):**
  - kit/repo contract
  - WebGL2 engine with basic lighting
  - the generated city with collision
  - the player on foot with the third-person camera
  - cars: drive, enter/exit, steal
  - basic traffic and pedestrians
  - the wanted level with police cars and cops on foot
  - pistol and melee combat
  - all 6 missions with the dialogue system (simple cutscenes are fine)
  - HUD with the minimap
  - big map
  - title screen
  - pause
  - save/load
  - basic sound effects
  - a first set of screenshots
- **Tier 2, SHOULD (visual impact):**
  - shadows, the sky's time-of-day cycle, fog
  - night point lights and window glow
  - bloom/tone mapping
  - water
  - rain with wet roads
  - full character animation set
  - cinematic cutscene cameras
  - traffic lights
  - SMG/shotgun
  - helicopter with spotlight
  - title theme, chase music layers, and radio stations with at least 1 song each
  - GPS line
  - re-take the screenshots
- **Tier 3, NICE (extra polish):**
  - roadblocks
  - shooting down the helicopter
  - the full soundtrack: all songs on every station, cutscene themes, credits song, MUSIC.md
  - side content (tags, stats screen)
  - quality presets/adaptive resolution
  - slow-motion moments
  - extra props and billboards
  - damage indicators and hit markers

Work in stages (see "Build order"). After each stage, run the game in Chrome via Playwright MCP, check the console, look at a screenshot, and fix problems before moving on. Write all code yourself in this session.

---

## 0. Repository contract (read the kit first)

Before writing any game code, read the unpacked make.fun kit's README/rules and `cli/makefun.mjs --help`. Follow the kit's exact contract wherever it differs from this list.

- Repo root: `main.ts` (Node 22, runs as `node main.ts`), following the kit's contract exactly.
  - The grader runs it with **no network**, a read-only repo, a writable `$MAKEFUN_OUTPUT_DIR`, a **10 s wall time**, 1 CPU and 1 GB RAM.
  - Two runs must give **identical output**. Make it deterministic: no unseeded randomness and no clock reads.
  - It must **exit 0**.
- `vendor/makefun-game.ts`: copy it byte-for-byte from the kit. Never edit it.
- `game/index.html` plus every file it loads, all under `game/`. No CDNs, no external fonts and no external assets. It must work offline from a static server.
- `screenshots/`: 3–4 PNG files at 1920×1080, which must be real renders captured from the running game.
- `LICENSE`: MIT, with the copyright holder "I Wayan Bagus Somabawa".
- `README.md`:
  - the 3 live make.fun badges for gta6-01 from the kit template
  - a game description
  - the controls
  - how to run it
  - a screenshots gallery
  - a short "Engine" section describing the custom WebGL2 renderer
- `vercel.json` so Vercel serves `game/` as a static site (output directory `game`, no build step).
- Git commits: plain messages with **no AI attribution trailers** (no Co-Authored-By, no session links).
- At the end, remind me to set the GitHub About section: a link to make.fun and the topic `makefun`.

## 1. Architecture

The core idea: **simulate in 2D, render in 3D.** All gameplay (movement, physics, collision, AI, traffic, police, missions) runs on the ground plane (x, z) with simple heights. Rendering is fully 3D. This keeps gameplay robust while the visuals look modern.

Tech: plain JavaScript ES modules, WebGL2, and a 2D canvas overlay for the HUD. There is no build step. All geometry is generated procedurally in code. All audio is synthesized with Web Audio.

Suggested layout (keep names clear, because the judge reads the outline):
```
game/index.html, game/style.css
game/js/main.js                 boot, loop, state machine (title/playing/paused/map/cutscene)
game/js/core/input.js           keyboard, mouse, pointer lock
game/js/core/math.js            vec3, mat4, quaternions, seeded RNG
game/js/engine/gl.js            context, shader compile, buffers, VAOs
game/js/engine/renderer.js      frame graph: shadow pass, opaque, transparent, post
game/js/engine/shaders/*.js     GLSL sources: lit, instanced, sky, water, particles, post
game/js/engine/mesh-builder.js  procedural meshes: box, beveled box, cylinder, wheel, quad
game/js/engine/instancing.js    instanced batches for buildings, trees, lamps, props
game/js/engine/shadows.js       directional shadow map (camera-fitted)
game/js/engine/sky.js           sky gradient, sun/moon, stars, clouds
game/js/engine/post.js          bloom, tone mapping, vignette, color grade
game/js/engine/frustum.js       culling
game/js/world/city.js           city generation (districts, blocks, buildings, landmarks)
game/js/world/city-meshes.js    builds chunked static meshes from city data
game/js/world/collision.js      spatial grid, circle-vs-AABB, raycasts
game/js/world/roads.js          road graph, lanes, traffic lights
game/js/entities/player.js
game/js/entities/character-model.js  low-poly rigged humanoid with procedural animation
game/js/entities/vehicle.js     arcade physics
game/js/entities/vehicle-model.js    low-poly car meshes per model
game/js/entities/pedestrian.js
game/js/ai/traffic.js, police.js, combat-ai.js
game/js/combat/weapons.js
game/js/fx/particles.js         GPU-friendly billboard particles, decals, skid marks
game/js/fx/lights.js            many point lights (headlights, streetlights, lightbars, neon)
game/js/story/missions.js, dialogue.js
game/js/ui/hud.js, minimap.js, menus.js, bigmap.js
game/js/audio/audio.js, radio.js
game/js/save.js
tools/playtest.mjs              automated Playwright play-through
tools/screenshots.mjs           captures the screenshots
```

## 2. Renderer and visual style

The target look is **stylized low-poly**, like a clean modern indie city game: flat or soft-shaded geometry, a strong sunset/night mood, and rich lighting. It should not try to be realistic, but it must be clearly 3D, with depth, perspective and atmosphere.

**Lighting and materials**
- One shader with a directional sun/moon plus hemisphere ambient.
- Material color comes per vertex or per instance, plus an emissive term.
- **Window glow** is procedural in the fragment shader, computed from world-space UVs on building walls. Use a hash per window to decide which are lit and with which warm or cool tint; at night they glow, and by day they read as reflective glass.
- **Shadows:** a directional shadow map of 2048², fitted to the camera frustum, with PCF soft edges.
- **Night lights:** a clustered or simple forward point-light list, capped at 32–64 lights nearest the camera. Sources include streetlights, headlights (spot-like cones), taillights, police lightbars (alternating red/blue), neon signs, and the helicopter spotlight.

**Sky and atmosphere**
- A sky dome with a time-of-day gradient: dawn, day, golden hour, dusk purple, and night with stars and a moon.
- Exponential height fog tinted by the sky.
- Rain mode: streak particles, darker sky, wet roads (a specular boost plus a puddle mask), and splashes.

**Water**
- An animated plane with vertex waves, a fresnel tint toward the sky color, sun glints, and shoreline foam.

**Post-processing**
- An HDR render target, bloom (downsample/upsample chain) so neon and lights glow, ACES tone mapping, a subtle vignette, and a color grade per time of day.

**Performance**
- Static city geometry is merged into chunk meshes (one per 2×2 blocks) with frustum culling.
- Trees, lamps, props and containers use instancing.
- Dynamic entities (cars, people) are instanced per model where possible.
- Scale render resolution with the FPS. Target 60 fps on a normal laptop GPU.
- A settings menu offers quality presets (Low/Medium/High), which change shadow size, bloom, draw distance and the light count.

## 3. Camera and controls

**On foot (third-person over-the-shoulder)**
- Pointer lock, with the mouse orbiting the camera.
- WASD moves the character relative to the camera; Shift sprints (with a stamina bar); Space jumps (a short hop).
- Right mouse aims: the camera zooms in over the shoulder and a crosshair appears. Left mouse shoots or punches. Q/E or the mouse wheel switches weapons.
- The camera collides with buildings: pull it in when a wall is between the camera and the player.

**In a car (chase camera)**
- The camera sits behind and above the car, lags smoothly, and its field of view widens with speed.
- The mouse can look around, and the camera recenters after 1.5 s.
- W/S throttle and brake/reverse, A/D steer, Space handbrake, H horn, R cycles the radio.
- Left mouse shoots drive-by toward the camera direction.

**Other keys**
- F enters/exits a vehicle. M opens the big map. Esc pauses. C toggles a cinematic camera (optional).

**Feel**
- Screen shake on impacts, explosions and gunfire.
- A brief slow-motion moment on big crashes or explosions near the player.

## 4. World: the city of Selara Bay

A coastal tropical city surrounded by sea. The grid is 10×10 blocks, each block about 90 m. Every road has two lanes, and **traffic drives on the left** (local flavor). The world is in meters.

**Ground and streets**
- Asphalt roads with lane markings (as decal geometry), zebra crossings, curbs with raised sidewalks, and manholes.
- At every intersection, **traffic lights** on poles with cycling signal heads, which AI obeys.
- Streetlights along the sidewalks, plus benches, bins, bus stops, palm and tropical trees, and parked cars.
- A sea with an animated shoreline, a beach strip along the south with sand, palms and a boardwalk, a pier, and moored boats (low-poly) at the docks.
- A hill or overlook (optional) for a dramatic view.

**Building generator**
- Varied footprints: plain boxes, L-shapes, podium + tower, and stepped setbacks.
- Varied roofs: rooftop gardens, pools, solar arrays, AC/vent clusters, water tanks, antenna masts, and a helipad on at most 1 in 6 towers.
- Wall materials per district, with procedural windows and ground-floor shopfronts with colored awnings and glowing signs. Shop names are original, with text rendered to a texture from a canvas.

**Districts** (each with its own palette and generator; show the name when entering)
- **Downtown / Kota Lama**: glass towers of 40–140 m, plazas, fountains and big neon billboards (original brands invented by you).
- **Kemuning** (midtown): 4–10 storey buildings in terracotta and cream, balconies, shop awnings, alleys.
- **Bukit Asri** (residential, west): houses with pitched tiled roofs, gardens, pools, fences and many trees.
- **Pier 9 Docks** (east): warehouses, stacked colored containers, gantry cranes, the pier, and boats.
- **Pantai Selara** (south beach): beach hotels, pools, umbrellas, palms and the boardwalk.
- **Parks**: 3–4 park blocks with grass, paths, a pond and trees.

**Landmarks** (unique building, signage, minimap icon)
- Safehouse (Bukit Asri)
- Lin's Garage
- Selara General Hospital
- Selara Police HQ
- Bank Samudra
- Orchid Tower: the tallest building, with purple glass and a glowing orchid emblem on top that is visible from far away
- Orchid Freight warehouse (docks)
- Kilat Respray: clears your wanted level for $100
- Bang Bang Arms: buy ammo and weapons
- Dex's apartment
- Kedai Orchid (a café)

**Day/night cycle**
- 1 real second = 1 game minute.
- Streetlights and windows turn on at dusk.

## 5. Characters and vehicles

**Characters**
- Low-poly humanoids built from beveled boxes and cylinders (head, torso, upper and lower arms and legs, hands, feet), with hierarchical transforms.
- **Procedural animation**: idle breathing, walk and run cycles (leg/arm swing with knee bend and a body bob), aiming pose, punch, hit reaction, death/ragdoll-lite (falls and lies down), entering and exiting a car, and sitting while driving.
- Variety from skin tone, hair style mesh, clothing color and body width/height.
- Kai has a distinct teal jacket.
- Black Orchid gang members wear purple.
- Police wear navy uniforms with caps.

**Vehicles**
- Low-poly meshes with a body, cabin, glass (dark, slightly reflective), wheels that spin and steer, headlights and taillights as emissive parts (with brake lights), and bumpers.
- Visible damage: smoke, then fire, then an explosion. Burnt cars become dark wrecks.
- **Original models**:
  - Kancil (compact)
  - Merpati (sedan)
  - Selara Taxi (teal with a roof sign)
  - Vesper GT (low sports car with a spoiler)
  - Bajak (van)
  - Bison (box truck)
  - Garuda Patrol (police car with a flashing lightbar and siren)
  - Rajawali (police helicopter with spinning rotors and a spotlight)

**Arcade car physics**
- Throttle and brake/reverse, speed-sensitive steering, and lateral grip.
- The handbrake drifts, leaving skid marks and tire smoke.
- Weight-based collisions with cars, walls, poles (which break) and people.
- Light suspension feel: body roll and pitch, purely visual.

**Entering cars**
- Walk to the driver door, open it and get in. Occupied cars are carjacked: the driver is pulled out and flees.
- Police cars can be stolen (+2 wanted stars).

## 6. Traffic and pedestrians

**Traffic**
- AI follows the road graph lanes, obeys traffic lights, turns through intersections with entry and exit waypoints, and brakes for anything ahead.
- It honks when blocked and backs out when stuck.
- A deadlock breaker at junctions prevents jams.

**Spawning**
- Cars and people spawn and despawn in a ring outside the camera view, adapting the counts to the frame rate (about 30 cars and 50 pedestrians).
- A few police patrols drive in normal traffic.

**Pedestrians**
- They walk the sidewalks, cross at zebra crossings on green, idle, chat in pairs, and use their phones.
- They flee from gunfire and explosions, dive away from speeding cars, and are knocked down when hit.
- They drop cash when they die.
- Keep it non-graphic: no gore, and only small dark marks.

## 7. Combat

**Weapons** (original names)
- Fists (melee combo)
- Kobra 9 (pistol)
- Wasp (SMG)
- Thunder (shotgun with pellets)

**Shooting**
- Hitscan raycasts against the city, cars and characters.
- Tracers, muzzle flash with a light pulse, impact sparks, bullet decals on walls, shell casings, recoil and a crosshair bloom.
- Ammo with reloading (R on foot).

**Health and pickups**
- Health and armor.
- Pickups float, rotate and glow: health, armor, weapons, cash. Health, armor and weapon pickups respawn.

**Enemies and police aircraft**
- Gang AI keeps its distance, uses cover (corners or behind cars), strafes and shoots with imperfect accuracy.
- The police helicopter can be shot down: it smokes, spirals down and explodes (+1 star).

**Death and arrest**
- Death shows a "FLATLINED" screen with slow motion and desaturation, then a respawn at the hospital (−$100).
- Arrest shows a "CUFFED" screen, then a respawn at Police HQ (−$100, ammo lost).

## 8. Wanted level and police

**Heat and stars**
- 0–5 stars, driven by a heat score from crimes. Crimes include:
  - a carjack seen by police
  - hitting pedestrians
  - gunfire near people
  - killing civilians or cops
  - explosions
  - damaging police vehicles

**Line of sight**
- Police must see you (a line-of-sight raycast within range) to keep your location updated.
- While you are unseen, the stars flash and a search area appears on the minimap.
- Stay unseen long enough and the stars clear; the required time scales with the level.
- Kilat Respray clears the wanted level instantly.

**Police behavior by level**
- 1 star: cops try to arrest you.
- 2+ stars: they shoot.
- Cop cars chase you via the road graph, ram you, form roadblocks at 3+ stars, and drop off officers on foot.
- 3+ stars: the Rajawali helicopter follows you with a volumetric-looking spotlight cone (an additive cone mesh plus a ground light).
- 4+ stars: the helicopter also fires bursts.

## 9. Story and missions

**Characters**
- **Kai Santoso**: the protagonist, returning to Selara Bay after five years.
- **Viktor Raza**: leader of the Black Orchid syndicate, which is squeezing the coast.
- **Mama Lin**: Kai's aunt, who runs the garage.
- **Dex**: a hacker friend.

**Cutscenes**
- Use the 3D engine with scripted camera moves (dolly/orbit shots around the characters), letterbox bars, and subtitles with speaker names and colors.
- Include simple portrait cards drawn in 2D.
- Characters gesture with procedural animation.

**Mission rules**
- Missions have 3D markers: glowing cylinders of light with an icon.
- They show on the map and minimap and have on-screen objectives.
- Failed missions can be retried from the marker.
- Payouts come with a "MISSION PASSED" banner.
- Write short, punchy, original dialogue.

**The six missions**
1. **Homecoming** (starts automatically on a new game)
   - Kai arrives by ferry at the beach pier at sunset (an intro cutscene with a sweeping camera over the city).
   - Get in the Merpati parked nearby and drive to Lin's Garage.
   - Unlocks the safehouse.
2. **Yellow Fever**
   - Steal the Vesper GT owned by Viktor's nephew Rendy downtown. Taking it gives 1 star.
   - Deliver it to the garage with at least 25% health. The mission fails if the car is destroyed.
   - Reward: a Kobra 9 at the safehouse.
3. **Collections**
   - Go to Kedai Orchid.
   - Defeat 4 Orchid enforcers.
   - Pick up the cash bag and return it to the garage.
4. **Wheelman**
   - Get a car and pick up Dex at his apartment.
   - Drive to Bank Samudra and wait 15 s while Dex cracks the vault (show a countdown).
   - The alarm triggers 3 stars. Lose the cops, then drop Dex home.
   - The mission fails if the car explodes with Dex inside.
5. **Low Tide** (night)
   - An SMG is waiting at the garage.
   - At Orchid Freight, defeat 6 guards and blow up the Bison weapons truck.
   - Escape the docks.
6. **Orchid Falls**
   - Viktor flees Orchid Tower in a black Vesper GT toward an escape boat at the east pier. Show a distance indicator.
   - Wreck his car before he arrives.
   - He bails out on foot, a boss with 200 HP. Defeat him on the pier.
   - Final cutscene at sunrise, then end credits with stats. Free roam continues afterward.

**Side content**
- 12 hidden glowing "Orchid tags" to collect.
- The respray shop and the gun shop.
- A stats screen: missions, tags, kills, cars stolen, time played and money.

## 10. HUD and UI (2D canvas overlay)

All UI shares one consistent original style: dark translucent panels with a teal/magenta accent, a heavy sans-serif font, and outlined text.

- **Top-right panel**: clock, money (green, ticks up when gaining), weapon icon + ammo, and 5 wanted stars (flashing when unseen).
- **Bottom-left minimap**: a circle that rotates with the camera heading, built from a pre-rendered city map. It shows:
  - the player arrow
  - blips for missions, the safehouse, shops, the hospital and police
  - flashing cop blips
  - mission targets
  - the search area
  - a GPS route line to the waypoint or objective along the road graph

  Health and armor arcs or bars sit around or under it.
- **Big map (M)**: the full city with district names and a legend. Clicking sets a waypoint, which also appears in 3D as a beam.
- **Other overlay elements**:
  - the objective line
  - subtitles
  - a help-tip box ("Press F to enter vehicle")
  - pop-ups for the area name and vehicle name
  - the radio station name
  - a dynamic crosshair
  - damage-direction indicators
  - hit markers
- **Notifications**: banners and toasts use a priority queue with fixed screen slots, so nothing overlaps.
- **Title screen**: the live 3D city at dusk behind it, with a slow cinematic camera flying between towers and traffic running.
  - "SELARA BAY" in a big neon gradient with bloom glow, and the tagline "Heat on the Coast".
  - Menu: Continue (only if a save exists), New Game, Controls, Settings (graphics quality, volumes, mouse sensitivity, invert Y), Credits.
- **Pause (Esc)**: dims and blurs the scene. Options: Resume, Map, Stats, Controls, Settings, Quit to Title.
- **Loading screen**: shows progress while the city meshes are generated.

## 11. Save

- Walking into the safehouse SAVE marker saves the game. Autosave runs after every mission.
- Saves go to localStorage under a versioned key and include:
  - money
  - mission progress
  - weapons and ammo
  - health and armor
  - position
  - collected tags
  - stats
  - time of day
  - settings
- Continue loads the save. New Game asks for confirmation if a save exists.

## 12. Audio (all synthesized with Web Audio)

**Sound effects**
- Engine sound with pitch following RPM, and gear shifts
- Tire screech
- Crash (scaled by impact)
- Horn
- Each gunshot type
- Reload clicks
- Punch
- Explosion
- Siren: two-tone, positional, with a doppler-ish pitch shift
- Helicopter rotor thump
- Footsteps
- Pickup chime
- Mission-passed jingle
- UI clicks

All sound effects are positional via a PannerNode.

### Music system (all original, composed in code)

Build `game/js/audio/music/` as a small synthesizer and sequencer, made of these files:
- `synth.js`: voices.
  - subtractive synth: oscillators, filter envelope, LFO
  - FM bell (for gamelan-like metallic tones)
  - pluck (Karplus-Strong)
  - supersaw pad
  - noise
  - drum kit: kick, snare, clap, hats, toms, shaker
- `fx.js`: master bus effects (convolution reverb from a generated impulse, tempo-synced delay, sidechain-style ducking, compressor, and a "car radio" EQ filter when listening inside a car).
- `sequencer.js`: a lookahead scheduler; songs are data.
- `songs/*.js`: one file per song.

Each song is a data object with:
- tempo, key and scale
- a chord progression
- named sections (intro, verse, chorus, bridge, outro), each holding patterns per track (drums, bass, chords/pad, lead/melody, arp, fx)
- an arrangement order
- a melody written as note data

Songs must be **real compositions with a clear hook melody and structure**, 1.5–3 minutes each, not random notes. Melodies follow the chords, chorus sections lift (more layers, higher melody), and transitions use fills, risers and drops.

**Radio in cars** (R cycles stations; the station name and the current song title appear on screen)
1. **Selara Nights FM** (synthwave/retrowave, 100–118 BPM, minor keys): 4 original songs, e.g.
   - "Neon Tide"
   - "Coastline Run"
   - "Orchid After Dark"
   - "Midnight Merpati"
2. **Ombak Lo-Fi** (lo-fi hip hop, 72–88 BPM, jazzy 7th/9th chords, vinyl crackle, swing): 3 songs, e.g.
   - "Rain on Kemuning"
   - "Warung at 2AM"
   - "Slow Waves"
3. **Gamelan Wave** (original fusion of a pelog/slendro-inspired scale on FM bells and gongs over electronic beats, 110–124 BPM, interlocking kotekan-style patterns): 3 songs, e.g.
   - "Bukit Asri Sunrise"
   - "Pier 9"
   - "Kecak Circuit" (the "kecak" in the title is flavor only; use synthesized rhythmic vocal-like chops made from formant-filtered noise)
4. **Off**

Station behavior:
- Stations play songs in order and continue in the background ("live radio"): switching away and back resumes where that station would be.
- Between songs there is a short synthesized station jingle (a 3-note sting plus a sweep).
- The radio continues briefly with a muffled filter when you exit the car, then fades.

**Score (non-radio)**
- **Title theme** "Heat on the Coast": a cinematic synth theme with a memorable 8-bar hook that loops seamlessly.
- **Dynamic chase music**: when wanted ≥ 2 and the radio is off, or during missions, intensity layers fade in by star level (pulse bass, then drums, then a tense arp, then a lead). They fade out when the wanted level is lost.
- **Cutscene underscore**: a soft pad and piano motif per character (a Mama Lin warm theme, a Viktor dark theme).
- **Stingers**: mission passed (triumphant 2 s), mission failed, FLATLINED, CUFFED, and the credits song (a full-length reprise of the title theme).

**Ambience**
- On foot: city ambience (distant traffic, birds by day, crickets at night, rain loop when raining), plus waves near the sea.

**Mixing and controls**
- Music, SFX and radio have separate volume sliders in Settings.
- Music ducks under dialogue and explosions.
- Audio starts on the first user gesture.

Write a short `MUSIC.md` listing every song with its tempo, key and mood. The judge reads the source outline, and a real soundtrack list signals completeness.

## 13. Polish and quality bar

- Stable 60 fps target, with dt clamped. No console errors.
- Resizing the window works. Pointer lock is handled gracefully when Esc is pressed.
- The camera never clips inside buildings.
- Characters and cars are well scaled against buildings: doors at about 2.1 m, cars about 4.3 m long.
- Night must be properly dark, so that light sources create contrast. That contrast is what sells the screenshots.
- There are no dead ends: mission markers always reappear after a failure.
- Keep `tools/playtest.mjs` in the repo. It is an automated Playwright play-through that:
  - starts a new game
  - walks around
  - enters a car
  - drives a real route via the road graph, with at least one mission route driven without teleporting
  - shoots
  - triggers a wanted level and loses it
  - completes all 6 missions (teleports are allowed for long trips after that first real one)
  - tests save/load, death and arrest
  - fails the run on any console error

## 13b. Lessons from the 3D prototype (get these right from the start)

A previous prototype of this exact design worked, but looked weak in these specific ways. Fix them by design.

**Characters looked like blocky cubes with no faces.** This is the biggest visual weakness.
- Build humanoids from smooth low-poly primitives: 8–12-sided tapered cylinders for limbs and torso, a rounded head (a low-poly sphere or a beveled box with soft normals), separate hands and feet, a neck, and shoulders.
- Faces need simple features: eyes, eyebrows, a nose bump and a mouth. Use small geometry or a tiny procedural face texture.
- Hair is shaped mesh (short, bun, cap, ponytail).
- Clothing details include jacket collars, belt lines, and two-tone shirts and pants.
- Use stylized proportions, slightly heroic. Kai must be instantly recognizable in his teal jacket, with a rim light so he never reads as a black silhouette at night.

**Vehicles looked boxy.**
- Bevel the body edges.
- Shape the hood/cabin/trunk profile so it tapers.
- Add wheel arches, a grille, side mirrors, door seams (as a darker line texture) and rims with spokes.
- Paint gets a clearcoat specular highlight and environment-tinted reflections.

**Exposure blew out.** White police cars blew out under sirens and the spotlight.
- Cap albedo at about 0.85.
- Clamp per-light contribution.
- Add auto-exposure (eye adaptation) before tone mapping.

**Empty flat ground looked bad.**
- Every surface needs detail: a procedural noise/grime shader on asphalt and concrete, tire tracks, cracks, puddles, painted markings and curbs.
- Docks have yellow safety lines, bollards, pallets, crates, forklifts, barrels and fences.
- No large untextured flat areas should ever be visible in a screenshot.

**The over-the-shoulder camera was framed too close.** The character filled a third of the screen.
- When aiming, the character should take about 15–20% of the frame, offset to the left, so the scene stays readable.
- On foot without aiming, pull the camera back further.

**Screenshots looked staged and empty.**
- Each screenshot must be dense and well lit, with several points of interest.
- The docks shot needs gang members visible at mid-range behind lit containers, muzzle flashes from both sides, a lit crane, and a burning truck with smoke lit from inside.
- Review every screenshot as a harsh critic: "would this win against another polished entry?" If not, improve it.

**Verify on real hardware assumptions.**
- Keep the default quality at Medium, with a clear FPS counter toggle (F3).
- Keep draw calls low (merged chunks plus instancing), because the prototype could not measure GPU performance.

## 14. Screenshots (Playwright, 1920×1080, High quality preset)

Add a debug hook (e.g. the URL param `?shot=N`) that sets up each scene. Let the game run 3–5 s before capturing, so traffic, particles and lighting are live. All captures must be real renders of the game.

1. `01-title.png`: the title screen with the bloom-glowing logo over the 3D city at dusk, framed with the camera low between towers.
2. `02-night-chase.png`: downtown at night in the rain. The player drives the Vesper GT seen from the chase camera, with 4 stars, 2–3 police cars with lightbars behind, the helicopter spotlight cone on the car, wet road reflections, neon billboards, and the full HUD with the minimap.
3. `03-mission-cutscene.png`: a golden-hour cutscene at Lin's Garage, with a cinematic camera on Kai and Mama Lin, letterbox bars, a portrait card and a subtitle.
4. `04-docks-firefight.png`: Low Tide at the docks at night. Over-the-shoulder aim with tracers, a truck explosion with a fireball and smoke, Orchid gang members behind containers, cranes in the background, and the HUD.

## Build order (play-test in Chrome and look at a screenshot after each step)

**Tier 1: complete game**
1. **Kit and repo skeleton.** Read the kit. Create `vendor/` (copied unchanged), `main.ts` per the contract, `LICENSE`, `vercel.json` and the README skeleton. Verify `node main.ts` exits 0 and is deterministic.
2. **Engine core.** WebGL2 context, shaders, mesh builder, camera, and a simple lit shader with sun + ambient.
3. **City.** City generation and chunked meshes, instancing, frustum culling, collision.
4. **Player on foot.** A basic character model with simple walk animation, the third-person camera with wall collision, and pointer lock.
5. **Vehicles.** Vehicle models, physics, entering, exiting and stealing cars, the chase camera.
6. **Traffic and police.** Road graph, traffic AI, pedestrians, the wanted level, police cars and cops on foot.
7. **Combat.** Pistol and melee, basic particles and explosions.
8. **UI.** HUD, minimap, big map, title screen, pause, save/load, basic sound effects.
9. **Story.** The dialogue system and **all 6 missions playable start to finish**.
10. **Checkpoint 1.** Run the automated play-through of all missions, fix bugs, take the first screenshots, write the README with badges, commit and push. The game is now submittable.

**Tier 2: visual impact**
11. Shadows, the sky's time-of-day cycle, fog, water.
12. Night point lights, window glow, neon, bloom/tone mapping, rain with wet roads.
13. The full character animation set, cinematic cutscene cameras, traffic lights.
14. SMG/shotgun, the helicopter with its spotlight, radio stations, the GPS line.
15. **Checkpoint 2.** Re-run the full play-through, then retake the screenshots and review each one critically. If one doesn't look like a modern 3D city game, improve the scene and capture it again. Commit and push.

**Tier 3: extra polish**
16. Roadblocks, shooting down the helicopter, the third radio station, the side content and stats screen.
17. Quality presets and adaptive resolution, feel tuning, slow-motion moments, extra props, damage indicators.
18. **Final checkpoint.** A full automated play-through, the final screenshots, the README gallery. Commit and push.

Commit after each step with a clear message.

Finish by printing:
- the final commit SHA
- the list of screenshots
- a reminder of the submit command from the kit
