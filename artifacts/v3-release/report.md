# IMPERIUM v3 — war chronicles

2026-10-13. All models, textures, shaders, music and effects are locally authored/generated. No external asset service or downloaded model. Current release replaces voxel construction with stylized sculptural military miniatures; it is not photorealistic human rendering.

## Delivered

- Dual AI spectator mode continues the current game. Full-width cinema stage, slower deployment/duel pacing, a gentle establishing camera, pause/resume, explained journal, and takeover of white, black or both sides.
- Pause freezes animation/VFX/AI and stops sound. Menus freeze spectator action too. Generation guards cancel stale workers. Production reload preserves mode, pause and committed PGN, including during an unfinished cinematic.
- Six remodeled roles: continuous fitted armor, adult facial proportions, sculpted helmets, folded capes, bowed shields, crowns, articulated horses and curved chariots. Existing weapon sockets and shoulder/elbow/wrist choreography are retained.
- Fortified gate, legion standards, towers, weapon racks, fire and inexpensive enhanced light shafts. Basic/enhanced remain switchable; only one shadowed light, no postprocessing passes.
- All speech, cries, announcer clips and synthesis scripts removed. Local string/drum score, wind, sword/plate, footsteps, hooves, wheels and impacts remain.

## Verification

- TypeScript/Vite production build passed. Three.js vendor chunk is 534 kB (136 kB gzip); Vite's >500 kB warning is informational.
- 34/34 rule and AI engine cases. Existing 12 real-input gameplay checks and 11 browser rules/AI regression checks passed, including 4× CPU-throttled phone AI.
- 36 touch checks across 390×844, 844×390, 360×640: move/capture, camera drag/pinch, promotion, undo, graphics selection and orientation. Zero browser errors.
- [Spectator report](spectator/report.json): four viewport sizes, mouse/touch start/pause/resume, cancelled thinking, exact frozen action state, modal freeze, local/side takeover without losing history, 20 consecutive AI plies, production paused reload, zero voice-file requests.
- [Unpaused motion report](motion/report.json): all six role attacks plus phone chariot. Four timed captures per shot establish approach/windup/contact/followthrough. Weapon contact XZ error <0.007 world units in this pass. Real clicks/taps initiated every move; no frozen screenshots substitute for motion verification.
- [Independent review](../v3-review/review.txt) found and resolved mid-animation reload loss and invisible bystanders after pausing then orbiting. Dedicated rechecks live in that folder.
- Audio graph checks: vocal compatibility calls create zero sources; impact creates 8 layers; pause/mute clear transient and ambience nodes; resume restores ambience only. [Audio evidence](../v3-world/audio-metrics.json).
- Six declared canvas states in [evidence manifest](evidence.json): desktop active/threat/checkmate/spectator, phone active/spectator. All nonblank, no JS/shader errors. Root visually inspected active boards, phone spectator, knight approach, queen contact and phone chariot contact.

## Renderer and visual evidence

Final full-army desktop basic/enhanced: 99/102 draws, 313654/313728 triangles. Phone emulation: 97/100 draws, 312934/313008 triangles. Enhanced adds three draws and 74 triangles, no extra scene pass. Phone shadow resolution 1024; desktop 2048. Current inspector phone spectator: 93 draws, 312716 triangles, 8 textures. The phone geometry count is ~4.3% over the generic 300k starting budget, retained for the sculpted silhouettes; draw and texture budgets remain comfortably below their guides.

Desktop M4 Pro / Chrome Metal 120-frame measurements are about 60 fps with 16.7 ms median intervals; synchronized render completion 0.4–0.5 ms. These are **not physical phone measurements**. Phone defaults to basic lighting; reduced motion remains available.

Current active-play inspector: desktop entropy 5.17, edge density .342, contrast154.6; phone 4.77/.346/163.6. Spectator desktop4.91/.279/114.7, phone4.60/.329/136.3. The checkmate view has entropy2.82 because its modal deliberately dims the board; it is scored as a result overlay, not evidence of an empty active world. Full raw metrics are under `visual/`; [model budgets and silhouettes](../v3-models/report.md) and [world/audio](../v3-world/review.md) contain specialized evidence.

Subjective 0–3 scorecard calibrated against the skill's active-scene anchors; before values are the documented v2 baseline. Genre equivalents: hero=selected warrior, enemy=opposing army, interactables=board/routes/legal choices. No claim of AAA or scanned-character quality.

| Category | Before | After | Evidence |
|---|---:|---:|---|
| Art direction |2.4|2.5|Military sculpture language across units, standards and fortifications|
| Hero |2.5|2.6|Six continuous armor/body/cloth/vehicle silhouettes|
| Opponents |2.4|2.5|Shared authored rig/detail, readable faction colors|
| Interactables |2.7|2.7|Distinct move/attack marks, every candidate and historical move explained|
| World |2.3|2.4|Fortifications, racks, banners and flames in battle framing|
| Materials |2.4|2.5|Curved metal highlights, marble, leather and cloth separation|
| Lighting/render |2.3|2.4|Turn-specific warm/cool light, enhanced contact/shafts, no full-screen passes|
| VFX/motion |2.6|2.6|Verified weapon contact, articulated gallop, impacts and flight, voice-free layered sound|
| UI/HUD |2.5|2.6|Full-width watch stage, accessible transport/takeover, four viewport tests|
| Performance evidence |2.6|2.7|Measured budgets, pacing and actual-input automation with device caveat|

Average 2.55; no observed automatic failure. Sculptural facial detail remains intentionally modest. The tactical phone overview prioritizes seeing all 64 cells; close-up detail appears during cinematics or manual inspection.

## Reproduce and limitations

Run `npm ci`, `npm run test:rules`, `npm run build`, `npm run preview -- --port 5195`. Set `TEST_URL=http://127.0.0.1:5195` for `npm test`, `npm run test:v2`, `npm run test:mobile`, `npm run test:cinematics`, `npm run test:spectator`. Visual capture: `TEST_OUT=artifacts/v3-release/visual TEST_RUN=v3-release npm run verify:visual`.

AI is a basic local alpha-beta engine, not Stockfish or a rated opponent. FIDE play rules retain the documented limitation around rare blocked dead-position reachability; no tournament clocks/arbiters. Physical iOS/Android GPU, Safari behavior and thermal limits remain unmeasured. Assets are offline after serving the supplied build, while initial installation of npm dependencies requires network.

Publishing uses the existing public GitHub Pages workflow. The final public smoke report is saved outside this repository in `outputs/public-release/imperium-v3` after deployment, verifying the actual hosted bundle, worker, touch controls and absence of speech assets.
