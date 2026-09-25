# Local voxel army sculptures

All geometry, materials, anatomy, armor, equipment and animation are authored locally in `src/models.ts`. No remote asset calls, external images, textures or generated downloads are used. Fine voxel sculpture is the user's chosen art direction.

## Art and roles

- Pawn: expressive open-faced legionary, block-built helmet plume, eagle breastplate, layered shoulder guards, segmented greaves, short sword and tower shield.
- Rook: fortified ancient wheeled war carriage, pixel-spoked wheels and scythed hubs, plated eagle prow, armored driver and command standard.
- Knight: barded voxel warhorse, individually articulated legs, stepped mane, mounted armored lancer, pennant and reins.
- Bishop: temple warrior with stepped mitre, cross staff, layered ceremonial robe and cape.
- Queen: crowned sovereign, long stepped hair locks, winged shoulders, ceremonial robe and long sword.
- King: broad crowned commander, tiered beard, broad sword, shield and winged shoulder guards.

Ivory, gold and linen distinguish the white army. Dark iron, copper and crimson distinguish the black army. All pieces face +Z and stand at Y=0. Geometric details generally use 0.025–0.065 unit blocks, with smaller edge inlays and eye highlights.

## Factory / animation contract

`createPiece(type, color)` returns a Three.js group. Type uses standard `p`, `r`, `n`, `b`, `q`, `k`; color is `w` or `b`. The root owns `userData.type`, `.color` and `.height`. Root translation, rotation and scale are reserved for game movement, death launches and camera targeting.

`animatePiece(root, mode, progress, time)` accepts `idle`, `move`, `attack`, `fear`, `relief`. Progress is normalized, time is seconds. Movement uses marching legs, running arm counter-motion, cape flutter, horse gallop, carriage wheel rotation and carriage bounce. Attack contains anticipation and a forward swing, with contact at progress 0.50. Fear raises arms, tucks equipment, tilts the head and trembles knees. Every call restores the original rig transforms before applying its pose, so idle and mode transitions do not accumulate rotation drift.

Idle uses a baked shared-material sculpture. Action/fear reveals the articulated equivalent. Prototype clones share geometries and materials: do not mutate a piece's shared material for a single-piece fade unless cloning that material first. Toggle the piece's visibility or animate its root for defeat instead.

## Verification

TypeScript typecheck passed. Geometry bounds, idle/fear/move transitions and local Chrome WebGL renders were checked. Preview screenshots exist in task work files: `work/models-review/white.png`, `black.png`, `fear.png`. The six-piece preview rendered 38 calls and 65,172 triangles including its floor, with no page errors. A scene-wide budget is still the responsibility of integration.

| Role | Bounds X / Y / Z | Idle triangles | Idle draw calls |
| --- | --- | ---: | ---: |
| Pawn | 0.890 / 1.452 / 0.884 | 8,256 | 6 |
| Rook | 1.137 / 1.557 / 1.010 | 8,220 | 6 |
| Knight | 0.890 / 1.815 / 1.066 | 15,684 | 7 |
| Bishop | 0.890 / 1.641 / 0.884 | 9,984 | 6 |
| Queen | 0.992 / 1.612 / 0.884 | 12,156 | 6 |
| King | 1.031 / 1.676 / 0.884 | 10,860 | 6 |

Character rigs contain more draw calls while active; only the moving piece and legally threatened pieces should use active modes. Lighting/exposure and board-level silhouette readability must be assessed in the final game rather than the neutral model preview.

Relief: raised fear stance transitions to shoulder drop, hand to chest, backward exhale and settling. Feed normalized progress over 1.45 seconds. Driver arms/head are articulated for chariot fear/relief.
