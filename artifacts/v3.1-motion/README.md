# v3.1 motion handoff

Only the assigned `src/models.ts` animation functions and `src/main.ts` `animateAction` changed. Grounding wrapper, model authoring, chess legality, audio library, render pipeline, imports and UI are untouched. Capture durations remain 4.5 s in normal cinematic play and 5.2 s in AI movie mode. The stronger contrast comes from the internal timeline.

## Exact phases

- Action 0–.12: body preload and .045-unit backward weight shift; camera enters the scene.
- Action .12–.39: armed units approach with accelerating travel and distance-driven leg/horse rhythms. Knight bound height reduced from 1.55 to .46 units.
- Action .39 onward: slow lift, short raised hold, then accelerated strike. Role release values on the model timeline: pawn .430, bishop .440, queen .445, king .450, knight .455.
- Exact contact remains **action .690 / model .500**. Contact poses, weapon sockets, rigid two-bone IK and .84 cutting-edge calibration are preserved.
- Actual pose freeze: pawn/bishop/queen 90 ms, king 110 ms, cavalry 75 ms, ram 100 ms. Action time stops; rendering, sound, particles and restrained camera shock continue. Victim rotation follows the frozen action timeline instead of accumulating real-time rotation.
- Attack .500–.590: follow-through; .590–.740: counter recoil; .740–1: settle. Shield and cloth lag follow impact.
- Chariot acceleration continues through the charge, followed by axle/driver recoil. Normal moves also build speed and settle on arrival.
- Camera: slow side dolly during lift, short 0.12–0.23 unit push during the blow, shock and recovery. Portrait is wider. Reduced-motion keeps the .6 s quick result with no deliberate freeze.

## Measured unpaused real input

Timing uses requestAnimationFrame samples on actual Chrome / Metal production gameplay without screenshot calls. A separate live screenshot run avoids screenshot readback stalls biasing a short freeze. Phone means touch/viewport emulation, not physical-device GPU testing.

| Scenario | Raise ms | Strike ms | Freeze ms | Strike/lift peak tip speed | Contact XZ error |
| --- | ---: | ---: | ---: | ---: | ---: |
| pawn | 1150 | 216 | 83 | 16.1× | 2.3e-15 |
| rook | 1150 | 208 | 109 | 0.0× | ram |
| knight | 1235 | 124 | 74 | 5.9× | 2.2e-15 |
| bishop | 1181 | 172 | 95 | 20.1× | 3.8e-15 |
| queen | 1201 | 157 | 91 | 23.0× | 3.5e-15 |
| king | 1218 | 140 | 108 | 22.1× | 2.8e-15 |
| black-queen | 1202 | 158 | 91 | 19.2× | 3.6e-15 |
| en-passant | 1152 | 209 | 87 | 13.9× | 2.3e-15 |

All 11 cases pass: six desktop archetypes, black queen, en passant, phone pawn/cavalry, phone reduced-motion. Weapon contact heights are .91–1.01 units; all XZ errors below 4e-15. King blade drops 1.25 units during strike, pawn .70. Zero runtime exceptions, external requests, or spoken voice playback. Reduced motion completes the capture with exact contact and no deliberate freeze.

Evidence:

- `report.json` and `*-frames.json`: measured time, camera positions, joints and weapon sockets.
- `screenshots.json`: 40 live screenshots on stable production 5195 (`index-CUolzNAP.js`), five phases per desktop role plus phone pawn/cavalry. No pause hook used.
- `watch-bubbles.json`: real UI start/pause from three threatened enemies hides all three relief sprites; resumed AI capture hides its fear sprite. Paused combat transforms remain identical for 350 ms. Scene object visibility read through the standard Three.js devtools observe event.
- `watch-*-no-bubbles.png`: spectator evidence.

Visual inspection: king, infantry and priest clearly raise the weapon before the downward stroke; shoulder/elbow/wrist maintain a consistent grip. Portrait infantry/cavalry contact frames retain both combatants. Chariot contact reads as a prow collision. Follow-through lowers the weapon across the body, then recovers as the defender flies out of the battlefield. Portrait is less intimate than desktop to retain both units and weapons. Feet, hooves and wheels remain free of removed pedestals.

Build passes. No added geometry, materials, textures, draw passes, or dependencies from choreography. Root owns final combined shader budget, QA, commit and publishing. All test Chrome processes closed.
