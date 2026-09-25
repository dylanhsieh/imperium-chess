# Imperium — 王權戰棋

## Intent / constraints
Local same-computer two-player 3D chess. Traditional Chinese UI. Authored ancient soldier, rider, chariot, priest, sovereign models; legal destinations; cinematic piece-specific movement and attacks; captured units fly off board. User explicitly requires all assets generated locally. No external asset calls, web fonts, image/audio fetches or paid services.

## Design brief
Command a miniature ancient army across a monumental carved battlefield. Primary action: select own piece, inspect legal destinations, commit move. Secondary: rotate/zoom camera, undo, flip view, inspect army, change cinematic/audio options. Each 5–30 seconds players choose a legal move under opposing tactical pressure. Captures and checks alter material/position; checkmate or rule draw ends play. Restart/undo make recovery quick. Better players anticipate attacks, pins, and king safety. Non-goals: AI opponent, online multiplayer.

## Core loop
Players choose legal chess moves to checkmate the opposing sovereign while legal enemy threats force tactical compromises. Captures reduce opposing material and produce a cinematic defeat. Checkmate/draw clearly explains ending; a new match resets immediately. Standard chess rules use bundled chess.js.

## Board plan
8×8 grid, cell 1.42; white near z+, black far z−; armies face inward. Overview sees whole board and surrounding altar. Columned twilight environment with torches and engraved metal frame. Cinematic zoom temporarily follows action then returns to exact prior user view. Golden ring denotes selection; blue tile overlays and diamonds denote movement; red tiles and crossed swords denote captures. Hovering a legal destination previews a route in the matching color. Rank/file coordinates and selected unit information connect 3D to rules.

## Ownership
Lead: scene/world, gameplay integration, camera/VFX, UI, tests, final verification.
army_models: src/models.ts — 6 articulated unit models in two faction materials.
battle_audio: src/audio.ts — local layered Web Audio synthesis.

## Status
Revision completed: articulated weapon swings with blade-following trails and contact-synchronized cinematics; clearer blue movement / red attack tiles with route previews. All generation stays local. Model joints and independent timing review completed by army_models; six offline battle voices and provenance completed by battle_audio; production integration and browser verification completed by lead. New voices use installed macOS speech and local WAV files; no online voice service.

## Completed
All six fine-voxel army roles, board/hall, legal chess, promotion/castling/en-passant/draws, local save/undo/restart, per-role cinematic movement/capture, particles + voxel shards + blade-following trails, synthesized audio, responsive Chinese UI, reduced-motion option, fear and relief reactions. User reference was used for style understanding only.

Production build passed. Actual-pointer tests passed all 12 checks; official canvas inspector passed desktop active/threat/checkmate and mobile active captures. Runtime errors: 0. Baked resting army instancing reduced active board calls from 244 to132. Final visual/input evidence is under artifacts/release-check; six-piece motion/touch/offline evidence is under artifacts/final-pass. Consolidated report: final-evidence.md. No external asset jobs pending.

Current server: production preview http://127.0.0.1:5188/. Main remaining limit is unmeasured real-phone performance; mobile triangle count is 11% above advisory target. This is a complete local game, not online or AI chess.

## September 25 revision verification

Shoulder/elbow/wrist/waist strike rig, planted stance, exact contact frame at action .69 / strike .50; actual cutting edge meets victim center even across frame skips. Eight actual-pointer captures cover swords, lance, staff, ram, reverse-facing queen and en passant. Blue movement/red attack full tiles, symbols, same-color hover routes and knight L paths, separate counts; highlight batching avoids per-icon draw overhead. Voice preload/variant/mute/offline tests pass, as do 12 full chess regressions. Latest artifacts under weapon-revision and release-check. No pending asset tasks.
