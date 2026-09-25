# Local battle audio

Foley and ambience are synthesized in the browser by `src/audio.ts`. Six short battle-voice WAVs are generated locally with installed macOS Chinese speech, converted and processed using afconvert and Python. There are no external samples, remote APIs, credentials, or voice downloads. The packaged WAVs play without a system speech engine or internet connection.

## Event matrix

| Event | Locally synthesized layers |
| --- | --- |
| Select | Short stone/mechanical transient, muted resonant metal partials |
| Move: rook | Accelerating low wheel rumble, irregular axle knocks, metal rattle |
| Move: knight | Four hoof impacts, hollow wood/stone transients, light air movement |
| Move: pawn/king | Alternating armored footsteps, leather and mail scrape |
| Move: bishop/queen | Filtered fabric/air sweep with restrained overlapping resonances |
| Charge | Longer chariot acceleration or gallop; other pieces receive a blade swing and low weight layer |
| Step | Short type-specific wheel, hoof, or armored-foot contact |
| Impact | Falling bass thump, low stone noise, three inharmonic metal resonances |
| Capture | Low dramatic boom, body-flight air sweep, metal ring, staggered debris |
| Land | Heavy stone contact, dust/stone tail, optional equipment rattle |
| Check | Short low horn-like warning, metal strike, stone chamber tail |
| Victory | Brief rising layered brass-like chord, low impact, reverberant air |
| Undo | Soft descending fabric/mechanical sweep |
| Ambience | Quiet filtered wind, slow volume modulation, three low temple drones |

## Integration

Create one `BattleAudio` instance. From a real pointer/click/key gesture, call `await audio.unlock()`, then trigger gameplay sounds. The constructor does not create an audio context or start sound. The first successful unlock starts a restrained ambience bed unless `stopAmbience()` was called beforehand. `startAmbience()` is idempotent. Type values accept chess notation (`p`, `r`, `n`, `b`, `q`, `k`) and names used for rook/knight/bishop/queen.

`setMuted(boolean)` and `setVolume(0…1)` control one master output that includes effects, reverb, and ambience. Gain changes settle within milliseconds to avoid clicks. Muted game events are discarded; unmuting never replays old events. The default master volume is 72%. The interface can choose a different default before calling unlock.

Use `move`/`charge` at the beginning of a shot, `impact` at contact, `capture` when the defeated unit is thrown, and `land` at the destination. Use `step` only at observed foot/wheel contacts; do not call it every frame. The manager additionally throttles repeated events and bounds simultaneous effect sources to 76, releasing the oldest when necessary. The ambience uses five looping sources. Call `dispose()` when the game itself is destroyed.

## Sound generation and safety

- Deterministic xorshift noise buffers provide reproducible foley without network assets.
- Each effect combines filtered noise, multiple tonal partials, exponential envelopes, and restrained stereo placement. There are no single-beep stand-ins.
- A locally generated 1.85-second stereo impulse creates stone-arcade reflections and temple reverberation; a compressor controls overlapping impacts.
- Context creation and resume stay inside the user's gesture. Playback safely returns when the context is unavailable, suspended, closed, disposed, muted, or the page is hidden.
- Visibility changes stop existing effects and ambience and suspend the context. Returning to the page resumes the already-unlocked context and rebuilds one ambience instance.
- All source nodes disconnect after ending; disposal stops and disconnects every source and removes its visibility listener.

## Limits and verification

Strict TypeScript compilation of the standalone audio source passed using the project's ES2022/DOM settings. This is designed cinematic procedural foley, not a recorded orchestra or real horse/weapon sample library. Spatial placement is a restrained stereo composition rather than distance-based 3D positional audio. Playback timbre and loudness vary with headphones, speakers, and browser audio implementations. The standalone source must be checked through actual game event timing during the lead's browser QA; compilation alone is not an acoustic listening test.

## Local voice revision

`battleCry(attack|defeat, piece)` plays a preloaded voice at the actual swing/impact. Attack-only variation alternates 哈／喝; defeated units use 呃啊, with female voice for the queen. Six clips are 0.203–0.443 seconds, mono 22,050 Hz PCM16, peak 0.86. Recipe: `scripts/generate-voices.py`; provenance/hashes: `public/audio/voices-manifest.json`; audition: `artifacts/weapon-revision/voice-audition.wav`.

Production Chrome verified all six HTTP 200/decode results, voice event selection, alternating calls, mute suppressing calls, and playback after disabling network. See `weapon-revision/voices.json`. These are offline computer-synthesized voices, not actor recordings; waveform and playback behavior were verified, not an acoustic performance rating.
