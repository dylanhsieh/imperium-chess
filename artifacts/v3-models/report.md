# Sculptural army models — v3

Completed 2026-10-13. Source ownership: `src/models.ts` only. All geometry is original and generated locally at runtime; no downloaded models, textures or external generation service. This pass replaces the previous voxel/chibi construction with stylized historical military miniatures. It is deliberately a miniature sculpture treatment, not a claim of photorealistic humans or archaeological reconstruction.

## Authored changes

- The geometry foundation now uses custom chamfered armor plates, tapered links, elliptical fitted-shell profiles, curved extrusions and continuous cloth surfaces. Fine details remain material-batched and all six archetypes retain cached resting meshes.
- Adult faces are a single custom mesh with a narrowing jaw, nasal bridge and brow, rather than large square eyes or separate cheek spheres. Domed helmets have rolled brows, neck guards, cheek hinges and continuous horsehair crests.
- Infantry carry a bowed scutum with brass boss and faction inlay; sculpted greaves, layered shoulders, leather elbow joints, finger segments and fitted cuirass replace the block assembly.
- King and queen have distinct circumferential crowns: crossed arched imperial crown and taller pointed diadem, with small jewels, royal shoulder ornaments and continuous hair/beard forms. Bishop has two embossed tapering mitre panels, ribbons, long cloth panels and a crozier.
- Every cape is a continuous folded cloth mesh with a gold hem and shoulder brooches. The opaque cloth material is double-sided, allowing both surfaces to light correctly without duplicating every triangle.
- Knight has a single tapered equine skull and curved neck profile, mane strands, shaped muzzle, real nostrils, bridle, saddle straps, barding and four additional hock joints. The hocks flex through the original gallop while the rider and lance stay on their established rig.
- Rook has continuous spoked wood/iron wheel rims, curved fenders, scrollwork on the battering prow, plank floor, armored side rails and a seated driver. Its original wheel animation and impact behavior remain compatible.

## Interfaces and dimensions

No public API changes: `createPiece`, `animatePiece`, `getWeaponPose` have the same signatures. Original joint names, resting/articulated groups, arm positions and blade-base/blade-tip sockets are preserved. New internal joints are `horse-knee-{side}-{front}` only. Attack timing, arm IK and weapon grip transforms were not changed. `userData.height` was adjusted to the new silhouette envelope for overhead status markers.

Measured idle bounds, width × height × depth:

| Piece | World-space size |
| --- | --- |
| Pawn | .900 × 1.455 × .900 |
| King | .944 × 1.660 × .900 |
| Queen | .918 × 1.534 × .900 |
| Bishop | .900 × 1.621 × .900 |
| Knight | .900 × 1.821 × 1.043 |
| Rook | 1.137 × 1.564 × 1.063 |

All resting silhouettes fit inside the existing 1.42-unit squares. Weapons, cape and limbs may extend during the already established cinematic attack poses.

## Browser evidence

- `final-{pawn,rook,knight,bishop,queen,king}-close.png`: six real-input capture cinematics, frozen near 38% action progress; their raw states and renderer diagnostics are in `final-diagnostics.json`.
- `final-desktop-{basic,enhanced}.png`, `final-mobile-{basic,enhanced}.png`: complete 32-piece active board in both graphics modes. Desktop 1440 × 940; touch viewport 390 × 844.
- `final-render-budget.json`: complete model bounds, renderer counts, 120-frame animation pacing samples, benchmark definition and captured errors.
- `inspector/*-active-play.json`: rendered canvas pixel checks.
- The v2 baseline is retained in `../v2-art/final-*-close.png`. The current world/UI evolved in parallel, so the comparison demonstrates model shape changes rather than an isolated pixel regression test.
- `prototype-*`, `v3-*`, `refined-*` files document intermediate critique/fixes; only `final-*` represents the delivered sculpture.

Final integrated whole-board measurements (Chrome / Apple M4 Pro Metal):

| View | Draws | Triangles | Geometries | Textures | Median render completion |
| --- | ---: | ---: | ---: | ---: | ---: |
| Desktop basic | 99 | 313,654 | 100 | 11 | .4 ms |
| Desktop enhanced | 102 | 313,728 | 100 | 11 | .5 ms |
| Phone basic | 97 | 312,934 | 98 | 9 | .5 ms |
| Phone enhanced | 100 | 313,008 | 98 | 9 | .4 ms |

All four animated frame samples were approximately 60 fps, with median frame interval 16.7 ms and p95 16.7–16.8 ms. Render completion includes CPU and GPU synchronization (`gl.finish`), not a pure GPU timer. The phone view runs on the desktop GPU; no physical-phone performance claim is made. Zero console/page/GLSL errors were recorded. The final scene is slightly below the previous ~316k whole-board triangles despite concurrently expanded architecture. The complete phone board remains 4.3% above the generic 300k triangle guideline, with only 100 draws, low texture count and no post-processing passes. Root-owned mobile shadows remain 1024, desktop 2048.

Canvas inspector: desktop entropy 5.17 bits, edge density .341, contrast 154.2; mobile 5.01 bits, .334, 152.1. Both views are nonblank, show complete pieces and have clear board/piece value separation. These metrics support readability, not a photorealism claim.

## Focused visual critique

The main improvement is actual silhouette and surface continuity: smooth fitted metal, adult head scale, continuous drape and recognizable horse anatomy remain visibly different from the cubical baseline even with the basic shader. Early rounded cheek components and a balloon-like horse muzzle were rejected during inspection and replaced with continuous custom meshes. Brass ball-like knee/elbow elements were reduced to fitted armor and leather.

Scorecard, calibrated against the graphics skill anchors (0–3):

| Category | Before | After | Scope/evidence |
| --- | ---: | ---: | --- |
| Art direction | 2.2 | 2.5 | Antique military forms replace voxel construction consistently. |
| Selected/hero piece | 2.3 | 2.6 | Six authored silhouettes and close-range sculptural surfaces. |
| Opposing army | 2.3 | 2.5 | Same sculpture quality in both factions; crimson and blue-black remain readable. |
| Interactables / move marks | unchanged | unchanged | Root-owned gameplay UI. |
| World | separate pass | separate pass | Root-owned architecture and lights changed alongside this work. |
| Materials | 2.4 | 2.5 | Existing shared palette now catches highlights on continuous curvature. |
| Lighting/render | unchanged | unchanged | Root-owned shader/atmosphere stack retained. |
| Model motion | 2.1 | 2.3 | Added horse hock articulation; weapon rig contract preserved. |
| UI/HUD | separate pass | separate pass | Spectator mode and takeover are root-owned. |
| Performance evidence | 2.6 | 2.7 | Full-board counts, both modes/viewports, real-input shots, measured frame pacing. |

Remaining limitation: these are locally authored stylized historical miniatures. Facial detail intentionally stays compact to fit browser/mobile budgets; this is not cinematic character scan fidelity. Full AI spectator sequencing, pause/takeover, absence of voice, and end-to-end release verification are owned by the integration pass.

Production TypeScript/Vite build passed. Source diff whitespace check passed. No commit or push performed by this model pass.
