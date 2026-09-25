#!/usr/bin/env python3
"""Render local macOS voices to WAV files. Never plays sound or accesses a network.

Usage: python3 scripts/generate-voices.py
Requires locally installed macOS say voices and /usr/bin/afconvert.
"""
from array import array
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import random
import subprocess
import sys
import tempfile
import wave

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public' / 'audio'
RATE = 22050
RECIPES = [
    ('male-attack-ha', '哈！', 'Eddy (Chinese (Taiwan))', 225, 0.89, 'attack'),
    ('male-attack-he', '喝！', 'Reed (Chinese (Taiwan))', 235, 0.92, 'attack'),
    ('female-attack-ha', '哈！', 'Meijia (Chinese (Taiwan))', 230, 1.02, 'attack'),
    ('female-attack-he', '喝！', 'Meijia (Chinese (Taiwan))', 240, 1.05, 'attack'),
    ('male-defeat', '呃啊！', 'Eddy (Chinese (Taiwan))', 190, 0.86, 'defeat'),
    ('female-defeat', '呃啊！', 'Meijia (Chinese (Taiwan))', 190, 0.98, 'defeat'),
]


def read_pcm(path):
    with wave.open(str(path), 'rb') as stream:
        if stream.getsampwidth() != 2 or stream.getnchannels() != 1:
            raise RuntimeError('Expected mono PCM16 from afconvert')
        values = array('h', stream.readframes(stream.getnframes()))
        if sys.byteorder != 'little':
            values.byteswap()
        return [value / 32768 for value in values]


def shape(values, playback_rate, event, seed):
    if not values or max(map(abs, values)) < 0.001:
        raise RuntimeError('The local voice engine returned no audible samples; check system speech permissions')
    peak = max(map(abs, values))
    frame = RATE // 100
    energies = [math.sqrt(sum(v * v for v in values[i:i + frame]) / max(1, len(values[i:i + frame]))) for i in range(0, len(values), frame)]
    gate = max(0.003, max(energies) * 0.028)
    active = [i for i, energy in enumerate(energies) if energy > gate]
    start = max(0, active[0] * frame - int(RATE * 0.012))
    end = min(len(values), (active[-1] + 1) * frame + int(RATE * 0.025))
    values = values[start:end]
    # Joint pitch/speed adjustment keeps a grunt short and weighty, without a vocoder.
    max_duration = 0.48 if event == 'attack' else 0.91
    effective_rate = max(playback_rate, len(values) / RATE / max_duration)
    length = max(2, int(len(values) / effective_rate))
    resampled = []
    for i in range(length):
        index = min(len(values) - 1.001, i * effective_rate)
        lo = int(index)
        fraction = index - lo
        resampled.append(values[lo] * (1 - fraction) + values[min(lo + 1, len(values) - 1)] * fraction)
    # Remove subsonics; mild saturation adds projected chest resonance.
    hp_alpha = 1 / (1 + 2 * math.pi * 80 / RATE)
    lp_alpha = 1 - math.exp(-2 * math.pi * 5500 / RATE)
    high = previous = low = 0.0
    shaped = []
    rng = random.Random(seed)
    hiss_previous = 0.0
    for i, value in enumerate(resampled):
        high = hp_alpha * (high + value - previous)
        previous = value
        low += lp_alpha * (high - low)
        value = math.tanh(low * 1.4)
        breath = rng.uniform(-1, 1)
        breath_high = breath - hiss_previous
        hiss_previous = breath
        time = i / RATE
        breath_envelope = math.exp(-time * (19 if event == 'attack' else 10))
        value += breath_high * peak * 0.018 * breath_envelope
        fade = min(1, i / (RATE * 0.008), (length - 1 - i) / (RATE * 0.045))
        shaped.append(value * max(0, fade))
    gain = 0.86 / max(map(abs, shaped))
    return [max(-0.92, min(0.92, value * gain)) for value in shaped], {'trimStartSeconds': round(start / RATE, 4), 'trimEndSeconds': round(end / RATE, 4), 'effectivePitchSpeedRatio': round(effective_rate, 4)}


def write_pcm(path, values):
    data = array('h', [round(value * 32767) for value in values])
    if sys.byteorder != 'little':
        data.byteswap()
    with wave.open(str(path), 'wb') as stream:
        stream.setnchannels(1)
        stream.setsampwidth(2)
        stream.setframerate(RATE)
        stream.writeframes(data.tobytes())


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    manifest = {'generator': 'macOS /usr/bin/say + /usr/bin/afconvert + Python standard library', 'generatedAt': datetime.now(timezone.utc).isoformat(), 'networkServices': [], 'playbackDuringGeneration': False, 'format': 'mono 22050 Hz PCM16 WAV', 'processing': 'silence trim; joint pitch/speed shaping; 80 Hz high-pass; 5.5 kHz low-pass; mild tanh saturation; deterministic breath layer; fades; peak normalized to 0.86', 'runtime': 'preloaded after user gesture; master mute/volume and temple reverb; immediate synthesized fallback when unavailable; no delayed playback', 'clips': []}
    audition = []
    with tempfile.TemporaryDirectory(prefix='.voice-generation-', dir=OUT) as temporary:
        temporary = Path(temporary)
        for index, (name, text, voice, rate, pitch, event) in enumerate(RECIPES):
            aiff, raw = temporary / f'{name}.aiff', temporary / f'{name}.wav'
            subprocess.run(['/usr/bin/say', '-v', voice, '-r', str(rate), '-o', str(aiff), text], check=True, timeout=45)
            subprocess.run(['/usr/bin/afconvert', '-f', 'WAVE', '-d', f'LEI16@{RATE}', '-c', '1', str(aiff), str(raw)], check=True, timeout=20)
            values, processing = shape(read_pcm(raw), pitch, event, 4100 + index)
            path = OUT / f'{name}.wav'
            write_pcm(path, values)
            clip = {'file': path.name, 'event': event, 'text': text, 'localVoice': voice, 'speechRateWordsPerMinute': rate, 'requestedPitchSpeedRatio': pitch, 'durationSeconds': round(len(values) / RATE, 4), 'peak': round(max(map(abs, values)), 4), 'rms': round(math.sqrt(sum(v*v for v in values) / len(values)), 4), 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(), **processing}
            manifest['clips'].append(clip)
            audition.extend(values)
            audition.extend([0.0] * int(RATE * 0.38))
            print(f'{name}: {clip["durationSeconds"]:.3f} s', flush=True)
    audition_path = ROOT / 'artifacts' / 'weapon-revision' / 'voice-audition.wav'
    audition_path.parent.mkdir(parents=True, exist_ok=True)
    write_pcm(audition_path, audition)
    manifest['audition'] = {'file': 'artifacts/weapon-revision/voice-audition.wav', 'order': [r[0] for r in RECIPES], 'silenceBetweenSeconds': 0.38}
    (OUT / 'voices-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    print('Local voice clips and manifest complete; no sound was played.', flush=True)


if __name__ == '__main__':
    main()
