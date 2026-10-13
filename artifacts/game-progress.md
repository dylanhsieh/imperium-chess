# IMPERIUM v2 work — 2026-10-13

Intent: make chess legality understandable and trustworthy, add local phone-capable AI, substantially improve ancient voxel models, camera, shading and local sound. Preserve both basic/enhanced graphics and phone touch controls. All assets local/procedural; no external model/audio services. Publish verified result to existing public imperium-chess GitHub Pages; truck is outside this request.

Player promise: command a sculpted ancient army, understand every legal choice, duel a friend or local AI. Select → see permitted destinations and reasons → move/capture → cinematic impact → explained history → opponent turn. Losing by checkmate teaches king safety; undo and new-game are available.

Board/encounter: standard 8x8, initial standard arrangement; explanations for check/pin/blocked path, specials, game status. A separate rule journal on phones keeps text clear of the board. Default retained local two-player; choose AI and side/difficulty in new-game/settings.

Implementation ownership:
- Root: main/UI, AI worker lifecycle, rule-status integration, history/selection explanations, cinematic shot changes, local audio/voice, browser QA, commit and deploy.
- chess_rules_ai: new rules-guide.ts, ai-search.ts, ai.worker.ts and rules-ai tests. Contract sent in task.
- chess_art_upgrade: models.ts, world.ts, surface-shading.ts with existing APIs and optimized batch structures.

Confirmed issue: chess.js isGameOver/isDraw treats threefold and fifty-move as automatic; replace app status with FIDE claim-vs-automatic logic. FIDE current handbook points to 2023 effective Laws; reference https://handbook.fide.com/chapter/E012023. No tournament clock/touch-move arbiter enforcement intended for this untimed casual app.

Completed: rules/AI implementation and independent review corrections; 34 rule/AI cases, 12 game regressions, 36 touch checks, 11 integration scenarios, a 40-ply bot game, seven unpaused combat shots, offline voice/mute and turn-lighting checks. Final report: artifacts/v2-release/report.md. Released application commit 44968fc to existing GitHub Pages; Actions build/deploy passed and real public-site phone smoke passed with a legal AI response, both shaders, rule journal and 12 local voice downloads. No required work remains.
