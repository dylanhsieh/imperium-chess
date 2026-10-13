# IMPERIUM v3.1 — film light, surfaces and impact tempo

2026-10-13. This pass implements the user's four refinements: no piece pedestals, higher quality cinematic rendering, imagegen material textures, and slow anticipation → fast strike → impact pause for attacks and movement. Existing v3 AI spectator/pause/takeover and chess rules remain in place.

## Changes

All 12 faction/role models have no bottom discs. A separate grounded-sculpture transform lowers the boots, hooves or wheels to board level and survives movement/fear/attack resets. Resting and articulated poses match at zero-height contact; measured bounds live in `../v3.0.1/grounding.json`. Pointer selection already uses independent compact volumes, so removing model discs does not remove click/tap targets.

Enhanced lighting now renders one linear HDR scene, uses bounded small-resolution highlight bloom and a final AgX/sRGB output with restrained film color. Desktop uses two small glow draws plus output; mobile uses one combined small glow draw plus output. Mobile glow is capped at 192 pixels on its long axis; HDR DPR is capped at 1.25 (desktop1.5). Basic bypasses targets and uses direct ACES/PBR. Switching back disposes HDR/glow targets. No SSAO, SSR or extra reflection scene is rendered each frame. Existing single shadowed light remains 2048 desktop /1024 mobile. Primary sources: [Three.js bloom example](https://threejs.org/examples/webgl_postprocessing_unreal_bloom.html), [postprocessing/output guidance](https://threejs.org/manual/pages/how-to-use-post-processing.html), [PMREM environment lighting](https://threejs.org/docs/pages/PMREMGenerator.html). The installed r180 code was inspected for linear offscreen color and tone-mapping behavior.

Locally baked warm colonnade windows/cool sky/torch reflection cards supply metallic environment highlights; the cards are absent from gameplay. Neutral limestone/slate/ivory replace the yellow-brown wash, with warm side light and cooler fill/rim. HDR exposed an old negative fractional-power edge in sunlight shafts; it is now clamped so it cannot produce NaNs/black blocks.

Imagegen generated a steel/brass/leather/cloth atlas. Local preprocessing prepared two shared 1024² WebP maps totaling 956 kB. Enhanced materials use their respective swatch for subtle color, roughness and tangent-normal variation, preserving faction colors. No browser generation/API request exists. Neutral color/normal placeholders keep first-load and slow-network frames correctly lit while the real maps arrive. Original source, exact final prompt, built-in tool and saved asset paths: [imagegen materials](imagegen-materials.md).

Attack timing preserves exact weapon contact at action .690 / model .500. Lift takes 1.15–1.24 seconds, strike124–216 ms and measured pose freeze74–109 ms. During freeze the actors stop while impact VFX/sound continue. Recoil and settling follow. Normal movement preloads weight, accelerates with distance-driven gait, then settles. Cavalry bound is reduced from1.55 to.46 units to read as mounted charge. Chariot wheels accelerate with the rush. Normal capture duration remains4.5 seconds, spectator5.2 seconds; contrast comes from internal pacing. Reduced-motion remains a quick .6-second result. Full [11-case unpaused motion report](../v3.1-motion/README.md) includes 40 live phase screenshots and separate no-screenshot RAF measurements.

## Verification and cost

TypeScript and Vite build pass. The render matrix drives actual mouse/touch settings: eight day/night × basic/enhanced × desktop/phone views,32 mode switches, shader/resource errors,90-frame pacing samples per view, synchronized CPU+GPU completion and phone landscape reallocation. All errors empty; textures remain stable through repeat switches and targets release on basic. A separate4-second delayed-atlas load check showed normally lit placeholder surfaces before decode and17 textures both before/after, with no errors (`slow-atlas.json`). `render-metrics.json` holds raw data. This runs Chrome/Metal on Apple M4 Pro; phone means touch/viewport emulation, not physical iPhone/Android GPU or Safari validation.

| View | Basic calls | Enhanced calls | Median frame | Synchronized completion median |
|---|---:|---:|---:|---:|
| Desktop day |176|182|16.7 ms|.5/.5 ms|
| Desktop night |171|177|16.7 ms|.3/.5 ms|
| Phone view day |174|179|16.7 ms|.5/.5 ms|
| Phone view night |169|174|16.7 ms|.3/.3 ms|

Frame p95 stayed16.7–16.8 ms. Enhanced adds5/6 total draws and76/77 triangles relative to basic for the same position. Completion is a warm `gl.finish` CPU+GPU probe, not a pure GPU timer or a physical-phone guarantee. Shared generated maps are loaded only when enhanced is used. Texture counts after warm mode switches: desktop14 basic/17 enhanced, phone12/14. The target resolutions and samples are recorded per view.

Accounting changed to accumulate **shadows + main scene + screen draws**. Prior v3 counters reset after shadows and only counted the main scene; do not compare584k full-frame triangles to the older313k main-scene number as an increase in model detail. The new scene-only full army is about304k triangles after disc removal, slightly above the generic300k mobile starting guide. Including the same shadowed geometry makes full-frame totals about584k. Full-frame phone draws179 likewise include shadow draws; the primary pass was below100 before post.

The selected threat fixture animates three scared opponents, using articulated limb meshes instead of the resting batched army. It reaches371 desktop /368 phone total draws including shadows, and254/252 resident geometries; this is an inherited transient animated-state budget overrun, documented instead of hiding the count. This pass does not add articulated geometry; basic mode and reduced motion remain available. The new render cost is specifically the bounded film passes and two shared texture samples. Physical phone worst-case frame time remains unmeasured.

Four acknowledged enhanced canvas states are declared in `evidence.json`: desktop/phone active-play and threat-preview. Fresh inspector metrics: desktop active entropy4.87, edge density.316, contrast137.8; phone active4.84/.308/134.9. Threat states4.78/.285/138 desktop,4.73/.263/121.5 phone. All nonblank with zero runtime/shader errors. Root inspected whole boards, queen raised sword, king ready pose and portrait cavalry contact, in addition to raw phase samples.

Independent review found and resolved two small defects: mobile vertical bloom texel scale depended on width, and the legacy debug benchmark accidentally rendered only the final quad. Vertical taps now use height; the legacy entry delegates the verified complete pipeline. Resize/mode round trips showed no texture accumulation. [Review evidence](../v3.1-review/review.txt).

Scoped visual scores on the 0–3 graphics rubric, against documented v3 baseline: materials2.5→2.7 (woven/brushed detail and micro normals), lighting2.4→2.6 (neutral scene and shaped metal reflections, AgX highlights), motion2.6→2.7 (measured lift/strike/freeze contrast and contact). Other systems retain their earlier evidence; these scores are subjective, not an AAA or photorealism claim.

Rules/AI files did not change; the previous34 rule cases remain the workflow build gate. Current motion validation covers six roles, black orientation, en passant, phone capture/cavalry and reduced motion. The public release smoke separately verifies actual hosted touch e4/Worker reply, both graphics modes and atlas assets, journal, watch pause/resume/takeover, no speech assets and no debug helpers. Deployment/public evidence is recorded outside the repo under `outputs/public-release/imperium-v3.1` after publishing.
