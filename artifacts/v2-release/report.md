# IMPERIUM v2 — rules, local AI and audiovisual release

Verified 2026-10-13. Source baseline: `20308a5`. This release updates chess only. All new models, textures, shaders, effects and voice files are authored or generated locally. The production payload is about 1.3 MiB, including both the main game and separate AI worker; no model/audio generation service or account is needed to play.

## Result and fixes

- The prior app used chess.js automatic draw semantics for threefold repetition and the fifty-move rule. The application now follows the distinction in [FIDE Laws effective 2023-01-01](https://handbook.fide.com/chapter/E012023), checked against the current handbook on 2026-10-13: threefold/50 can be claimed, fivefold/75 are automatic, and checkmate on move 75 takes precedence. Intended-next-move claims work without moving the piece.
- Legal destinations carry individual explanations; check, double check, pins, blockers, king safety, castling and en passant have explicit reasons. Illegal destinations keep the selected piece and explain the restriction. Every completed ply has a reason in the journal; phone users open a separate journal so the board stays clear.
- An independent integration review found and fixed a promotion explanation that incorrectly implied only knight promotion, AI-turn claim buttons that could do nothing, and repeated history reconstruction when listing intended draw claims. A stale debug-fixture result timer was also fixed.
- Local AI offers three time budgets (150 / 500 / 1200 ms) and either side. Iterative deepening alpha-beta with capture search runs in a dedicated module Worker. Modal pause, visibility changes, new game and Undo terminate old workers; replies are checked against current generation, position and legal moves. Errors expose Retry and preserve the board.
- Six detailed ancient voxel roles, refined armor and faces, matte cloth versus steel/gold materials, marble/graven stone, and inexpensive metal edge glints. Resting batching and exposed-surface voxel construction reduce cost.
- Camera profiles now differ for low chariot tracking, knight jump follow, priest crane, and sword-duel close-ups, with contact emphasis and defeat follow-through. Foreground bystanders are temporarily cut away if the camera would pass through them; all pieces return at the overview. An actual screenshot caught this obstruction before release.
- Added six local Chinese commander/reaction clips, layered debris/metal/sub-bass impact sounds, impact ambience ducking and camera-relative voice panning. The original six battle cries remain. Voice toggle, volume, mute and reduced motion are retained.

## Verification

| Coverage | Result | Evidence |
| --- | --- | --- |
| Rule edge cases and AI tactics/deadlines | 34/34 | [rules-report.json](rules-report.json) |
| Real-input regression: opening, capture, castling, en passant, underpromotion, mate, Undo, sound | 12/12 | [playtest.json](../release-check/playtest.json) |
| Real Chrome touch events, 390×844 / 844×390 / 360×640 | 36/36; all 64 cells clear | [mobile-playtest.json](../mobile-release/mobile-playtest.json) |
| AI lifecycle, reasons, reload, production gating and phone journal | 11/11 | [browser-report.json](browser-report.json) |
| Continuous human-bot versus Worker AI | 40 plies, 15 captures, 1 check, legal replay matches final board | [bot-report.json](bot-report.json) |
| Unpaused attacks for all six roles plus phone chariot | 7 completed duels, 4 timed images each; weapon contact XZ error below 0.008 world units | [motion/report.json](motion/report.json) |
| Gesture audio unlock, 12 clip downloads/decodes, actual attack/defeat cues, offline playback and mute | Passed; mute has zero active voices | [voices.json](../weapon-revision/voices.json) |
| Desktop / iPad / phone, both turns and both shader modes | 12 captures; white/black atmosphere preserved until move handoff | [atmosphere/report.json](atmosphere/report.json) |
| TypeScript and production bundle | Passed | `npm run build` |
| Current-run canvas inspection | Desktop active, threatened targets, mate; phone active | [evidence.json](evidence.json) |

The screenshot/state harness is retained because rules UI, mobile layout and cinematic framing are substantial parts of the game. Gameplay is driven by trusted pointer/touch input; fixtures only initialize special positions. Normal production URLs expose no test helpers. All browser suites above report zero unexpected page/console errors. Source review fixes and actual visual corrections are included in the final source.

The AI integration sample rendered 21 frames during 350 ms of a 1200 ms search. The 40-ply easy-engine game remained around 150–151 ms per search. This demonstrates bounded background search in the tested environment, not an Elo rating. The phone journal was additionally exercised with 4× CPU throttling.

## Render cost and visual evidence

[Art report and paired screenshots](../v2-art/report.md): active 32-piece desktop board changes from 130 / 132 draws to 101 / 103 (basic/enhanced), and 323,140 / 323,208 triangles to 316,592 / 316,660. Texture count falls from 38 to 7. There is one shadowed light, zero fullscreen post passes, and mobile/coarse-pointer shadow resolution is 1024 instead of desktop 2048. Basic/enhanced switching preserves the same game.

The complete army remains about 5.4% above the generic 300k mobile triangle guideline; the deliberate tradeoff preserves role detail while reducing draw and texture overhead. A 120-frame sample on Apple M4 Pro / Chrome Metal was about 60 fps in each desktop/mobile-viewport mode. The measured synchronous render completion was about 0.4–0.5 ms. These are desktop-GPU measurements, not physical-phone benchmarks.

Local capture highlights: [desktop AI journal](ai-desktop.png), [phone rule reasons](rules-phone.png), [phone journal](history-phone.png), [phone battle](motion/phone-rook-2.png), [queen contact](motion/desktop-queen-2.png), [chariot tracking](motion/desktop-rook-1.png). The full unpaused sequence is in `motion/`, with sampled joint/weapon/camera state beside it.

Subjective scoped visual scorecard (0–3, not a performance benchmark or an AAA claim):

| Category | Before | After | Observed change |
| --- | ---: | ---: | --- |
| Art direction | 2.1 | 2.4 | Antique faction colors and armor/cloth separation |
| Hero/model | 2.1 | 2.5 | Shield, crown, face, horse and chariot refinement |
| Opponents | 2.1 | 2.4 | Better silhouette and frightened face readability |
| Interactables | 2.0 | 2.7 | Every move and restriction is explained; clickable candidates |
| World | 2.0 | 2.3 | Marble detail and stone carving without board clutter |
| Materials | 2.0 | 2.4 | Blade, lacquer, cloth and gold separation |
| Lighting/render | 2.1 | 2.3 | Edge glints and preserved turn lighting, no extra post pass |
| VFX/motion/audio | 2.1 | 2.6 | Per-role tracking, foreground clearance, contact and layered sound |
| UI/HUD | 2.0 | 2.5 | AI mode/side/difficulty and readable phone journal |
| Performance evidence | 2.0 | 2.6 | Lower cost plus measured render and worker tests |

## Practical limits

Common dead positions are detected conservatively: bare kings, a lone bishop/knight against king, or only same-square-color bishops with kings. General reachability proofs for rare blocked dead positions are not implemented; local players can agree a draw. This untimed casual game does not implement tournament touch-move, clock or arbiter penalties. AI is a small local engine, not Stockfish or a rated opponent. Phone/tablet tests emulate touch on desktop Chrome; physical iOS Safari, thermal throttling and lower-end phone GPUs remain unmeasured. Basic shader and reduced motion remain available. Local synthesized Chinese voices are short stylized cues rather than professional voice acting; playback/energy/cleanup were verified, with no claim of a separate human listening panel.

## Reproduce / publish

Run `npm ci`, `npm run test:rules`, `npm run build`, then `npm run preview -- --port 5194`. Browser tests accept `TEST_URL`; Chrome path is configurable with `CHROME_PATH`. Run `npm test`, `npm run test:v2`, `npm run test:mobile`, `npm run test:cinematics`, and `node tests/ai-bot.mjs` against that production preview. Visual coverage uses `TEST_OUT=artifacts/v2-release/inspector TEST_RUN=imperium-v2-final npm run verify:visual` and the declared manifest.

The existing Pages workflow now gates its build on the 34 rules/AI tests. GitHub Pages deploys `dist` with relative base paths, including the hashed worker URL and local audio. Public URL: https://dylanhsieh.github.io/imperium-chess/ . Deployment and live-site smoke status are recorded separately after the source push.
