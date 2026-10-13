# Local sculpture and material upgrade — 2026-10-13

All geometry, textures, atlas glyphs and shaders are authored locally. No remote assets, paid generators, downloaded models, full-screen post-processing, transmission buffers or additional reflection renders were added. This report covers `models.ts`, `world.ts` and `surface-shading.ts`; rules, AI, UI, camera direction and audio are being validated by the lead integration pass.

## Visible changes

- Infantry: tall Roman scutum with lightning inlays, raised central boss, segmented shoulder plates, finger/thumb gauntlets, collar straps, toe lamellae and helmet ventilation/hinges. All six faces have inset eye whites, pupils and catchlights rather than flat dark eye squares.
- King: distinct cross-topped crown, inset jewels, beard and broad imperial silhouette. Queen: taller paired crown finials, long hair and hanging ceremonial tabard. Bishop: visibly split mitre, trailing ribbons and crozier.
- Knight: armored horse nostrils/cheek guards, saddle blanket trim, stirrup straps and flank stitches; the existing horse legs and rider grip are preserved.
- Rook: real wooden carriage floor, overlapping wheel fenders, armored hubs, riveted corner struts and a prominent battering prow.
- Factions: pale silver/ivory metal with antique gold and saturated teal cloth, versus blue-black plate, aged copper and crimson cloth. Blades have a separate bright cold-steel finish. Cloth remains matte.
- Board/hall: subtler multiscale marble veins, carved corner rosettes, recessed apron inlays, staggered stone paving joints, and coffered lintel relief.
- Enhanced shader: small, antialiased glints on metal facet edges in the existing material pass. Basic shader still uses stock Three.js PBR. No game-state changes on graphics switch.

## Performance work

The solid voxel hull generator emits exposed surfaces instead of retaining cube interiors. Axial weapon/axle shafts merge overlapping cubes into a single cuboid with the same silhouette. Resting piece batching, shared palettes, articulated attack rigs and all public animation/socket APIs remain intact.

The 32 board labels previously had 32 separate textures, geometries and draws. They now share one local 1024 × 64 atlas and one combined draw. Phone/coarse-pointer shadow maps use 1024; desktop retains 2048. One shadow-casting light remains.

| Whole-board active view | Before basic | Final basic | Before enhanced | Final enhanced |
| --- | ---: | ---: | ---: | ---: |
| Desktop draws | 130 | 101 | 132 | 103 |
| Desktop triangles | 323,140 | 316,592 | 323,208 | 316,660 |
| Desktop geometries | 130 | 101 | 130 | 101 |
| Textures | 38 | 7 | 38 | 7 |
| Extra post passes | 0 | 0 | 0 | 0 |

Final phone active-board view: 97 / 99 draws, 316,226 / 316,294 triangles (basic/enhanced), 97 geometries, 7 textures. Geometry is 5.4% above the generic 300k mobile starting budget; this is a deliberate preservation of the complete 32-piece sculpture, while it is lower than the old army's triangle count and draw/texture costs fall substantially. Close combat has fewer visible pieces. DPR is capped at 1.5 on the measured phone viewport.

In installed Chrome using the Apple M4 Pro Metal renderer, all four basic/enhanced × desktop/mobile-emulation samples ran at approximately 60 fps over 120 measured frames. Median synchronous CPU+GPU render completion is approximately 0.4–0.5 ms. These are desktop-GPU measurements with a phone viewport, not measurements on a physical phone. Per-frame snapshots from a frozen canvas inspector are not used as FPS evidence.

## Evidence and critique

- `before-board-{basic,enhanced}.png`, `final-desktop-{basic,enhanced}.png`: comparable full 32-piece active board.
- `before-*-close.png`, `final-*-close.png`: six actual real-input combat cinematics at approximately 38% action progress. Spare distant pawns in final bishop/knight fixtures prevent the intentional dead-position end screen from obscuring the model. UI evolved independently during capture; game geometry/viewports remain comparable.
- `final-mobile-{basic,enhanced}.png`: 390 × 844 touch viewport, full board, no model cutoff.
- `final-diagnostics.json`, `final-render-budget.json`: exact render counts, frame pacing, action progress and browser errors.
- `inspector/desktop-active-play.json`, `inspector/mobile-active-play.json`: real canvas pixel checks. Entropy 5.13 / 5.02 bits, edge density .336 / .333, luminance contrast 149.3 / 152.1, dominant color share .139 / .115. Both nonblank, zero browser/GLSL errors.

Focused scorecard, calibrated against the graphics skill anchors (0–3). This is a scoped art pass, not a claim that the complete release is showcase quality:

| Category | Before | After | Evidence |
| --- | ---: | ---: | --- |
| Art direction | 2.1 | 2.4 | Antique faction armor now has coherent cloth/metal separation. |
| Hero / selected piece | 2.1 | 2.5 | Distinct scutum, crown, mitre, horse and battering carriage in close gameplay shots. |
| Opposing pieces | 2.1 | 2.4 | Faces, crimson contrast and plated silhouette remain readable under fear animation. |
| Interactables / legal-square marks | unchanged | unchanged | Owned by the main UI/rules pass. |
| World | 2.0 | 2.3 | Better marble scale, corner relief and lower/mid/far carving detail without board clutter. |
| Materials | 2.0 | 2.4 | Cold blade, lacquered plate, antique trim and matte cloth separate by both color and roughness. |
| Lighting/render | 2.1 | 2.3 | Existing day/night turn light preserved, localized metal-edge glints and mobile shadow budget. |
| VFX/motion | unchanged | unchanged | Existing sockets and rig retained; camera/audio integration evaluated separately. |
| UI/HUD | separate pass | separate pass | Screenshots include evolving rule/AI UI and are not scored here. |
| Performance evidence | 2.0 | 2.6 | Paired measured counts, 31 fewer textures, frame samples and canvas inspector evidence. |

Remaining art limitation: the arena backdrop is intentionally restrained and some attack shots present the soldier from the side/back. The face/crown details read much better at three-quarter front angles; the lead camera pass can use those angles. At phone overview distance fine detail collapses naturally, so role silhouette and faction values remain the primary cues. No additional glows were used to compensate for missing sculpture.

Build: production TypeScript/Vite build passed after integration. Final six-piece browser pass and paired shader modes have zero console/page errors. Animation joint names, `createPiece`, `animatePiece`, `getWeaponPose`, `createWorld` and `BattleEffects` contracts are unchanged.
