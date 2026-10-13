# V3 world and nonvocal sound pass

Changed files: `src/audio.ts`, `src/world.ts`, `src/surface-shading.ts`. Root owns spectator/UI/camera changes; the art agent owns models. No commits or remote publishing performed by this agent.

## Result

- All spoken/cry sample loading and vowel fallback synthesis removed. `announce`, `battleCry`, `setAnnouncer` are silent compatibility methods; `voiceStatus` reports zero loaded/played/announced human sounds.
- Local foley retained for sword/plate, boots, hooves, wheels, timber, impacts, debris and result cues. Bishop/queen movement now uses cloth/foot/armor layers instead of a magical chord.
- A quiet 24-second locally rendered string/drum bed replaces the electronic drone. One looping stereo score source at 22,050 Hz; no downloaded sound, music timer, or external synthesis service.
- `setPaused(boolean)` independently stops one-shots and ambience without changing mute. Resume does not replay impacts queued before pause. Hide/show, mute/unmute, and normal disposal retain cleanup.
- Local ashlar texture, deep military gate, battlements/watchtowers, spear/shield racks, and woven legion standards give lower cinematic views architectural scale. Standards sway around their anchored tops and freeze under reduced motion.
- Side light/dust shafts add one enhanced-only instanced draw. Existing ground mist remains one draw. No full-screen effect or extra scene rendering.
- Replaced spherical glow bulbs with four pooled crossed flame cards painted locally. Warm fire stays warm in the moonlit turn, while the existing day/night hall changes remain intact.
- Instanced irregular thin armor chips replace cube-shaped debris. Shader night tint is less saturated, preserving material color.

## Verification

`npm run build` passed. Real headless Chrome/ANGLE Metal had zero page/shader/console errors in desktop 1440×940 and emulated phone 390×844, day/night, basic/enhanced, plus a real-click queen capture with changing camera and hit state.

| View | Basic calls / triangles | Enhanced calls / triangles | Shadow |
|---|---:|---:|---:|
| Desktop | 94 / 325,588 | 97 / 325,662 | 2048, one caster |
| Phone emulation | 92 / 324,868 | 95 / 324,942 | 1024, one caster |

Geometry/texture allocations at measurement: desktop 95 / 11, phone 93 / 9. Enhanced adds 3 draws overall (contact shadows, mist, shafts), 74 triangles, and zero screen-space passes. The 325k full-army triangle count exceeds the skill's suggested 300k phone starting target by ~8%; this is a documented silhouette/detail tradeoff requiring the consolidated device performance check. Root/art work was ongoing during these captures, so root's final metrics take precedence.

The synchronous render-completion benchmark's medians were 0.4–0.5 ms, p95 0.6–0.7 ms on this Mac GPU. That is a CPU+GPU completion probe at DPR 1, **not mobile hardware FPS**, and the resolution is too coarse to claim enhanced is faster than basic.

Actual browser audio graph checks: zero audio-file requests; vocal compatibility calls create zero sources; impact created 8 transient layers; pause cleared all layers and all 3 ambience sources, ignored attempted playback while paused, resume restored 3 ambience sources, mute cleared them and unmute restored them. Zero errors. Details in `audio-metrics.json`.

## Evidence

- `desktop-day.png`, `desktop-night.png`, `desktop-low-angle.png`
- `mobile-day.png`, `mobile-night.png`
- `battle-approach.png`, `battle-swing.png`, `battle-impact.png`
- `metrics.json`, `audio-metrics.json`
- `nonvocal-sound-demo.webm`: eight-second recorded local movement/horse/chariot/impact/victory sample, no human voices.

Preview used for these checks: http://127.0.0.1:5193/ . Parent should use its consolidated production preview for final release validation.
