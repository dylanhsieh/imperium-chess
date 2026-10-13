export type BattleSound = 'select' | 'move' | 'charge' | 'impact' | 'capture' | 'check' | 'victory' | 'land' | 'step' | 'undo' | 'invalid';
export type Announcement='begin'|'check'|'checkmate'|'draw'|'fear'|'relief';

type AudioSource = AudioBufferSourceNode | OscillatorNode;
type Voice = { source: AudioSource; nodes: AudioNode[]; gain: GainNode; end: number };
type ToneOptions = { at: number; duration: number; frequency: number; endFrequency?: number; volume: number; wave?: OscillatorType; attack?: number; cutoff?: number; pan?: number; wet?: number; ui?: boolean };
type NoiseOptions = { at: number; duration: number; frequency: number; endFrequency?: number; volume: number; filter?: BiquadFilterType; q?: number; attack?: number; pan?: number; wet?: number; ui?: boolean };

/** Locally synthesized foley. Construction is silent; call unlock from a user gesture. */
export class BattleAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfx: GainNode | null = null;
  private ui: GainNode | null = null;
  private ambience: GainNode | null = null;
  private reverb: ConvolverNode | null = null;
  private sharedNodes: AudioNode[] = [];
  private noiseBuffer: AudioBuffer | null = null;
  private voices: Voice[] = [];
  private ambienceSources: AudioSource[] = [];
  private ambienceNodes: AudioNode[] = [];
  private muted = false;
  private volume = 0.72;
  private unlocked = false;
  private disposed = false;
  private ambienceWanted = true;
  private unlocking: Promise<void> | null = null;
  private lastEvents = new Map<BattleSound, number>();
  private variant = 0;
  private readonly maxVoices = 76;
  private battlePan = 0;
  private paused = false;
  private scoreBuffer: AudioBuffer | null = null;

  private readonly onVisibility = () => {
    if (!this.ctx || this.ctx.state === 'closed' || this.disposed) return;
    if (document.hidden) {
      this.clearVoices();
      this.removeAmbience();
      void this.ctx.suspend().catch(() => {});
    } else if (this.unlocked && !this.paused) {
      void this.ctx.resume().then(() => {
        if (this.ambienceWanted && !this.disposed) this.startAmbience();
      }).catch(() => {});
    }
  };

  async unlock(): Promise<void> {
    if (this.disposed || this.paused || typeof window === 'undefined') return;
    if (this.unlocking) return this.unlocking;
    // Do not create an AudioContext from a timer or an animation callback.
    if (!this.unlocked && navigator.userActivation && !navigator.userActivation.isActive) return;
    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return;
      try {
        this.ctx = new AudioContextClass({ latencyHint: 'interactive' });
        this.buildGraph();
        document.addEventListener('visibilitychange', this.onVisibility);
      } catch {
        this.ctx = null;
        return;
      }
    }
    const ctx = this.ctx;
    if (ctx.state === 'closed') return;
    // resume() is invoked before the first await so Safari retains the gesture.
    this.unlocking = ctx.resume().then(() => {
      if (this.disposed || ctx.state !== 'running') return;
      this.unlocked = true;
      if (this.ambienceWanted) this.startAmbience();
    }).catch(() => {}).finally(() => { this.unlocking = null; });
    return this.unlocking;
  }

  /** Compatibility only: the game deliberately contains no human speech,
   * battle cries, vocal samples, synthesized vowels, or network audio loads. */
  voiceStatus(): { loaded: number; played: number; last: string | null; announcements: number; active: number } {
    return { loaded: 0, played: 0, last: null, announcements: 0, active: this.voices.length };
  }
  setBattlePosition(pan: number): void { this.battlePan = Math.max(-.75, Math.min(.75, pan * .65)); }
  setAnnouncer(_enabled: boolean): void {}
  announce(_event: Announcement): void {}
  battleCry(_event: 'attack' | 'defeat', _piece: string): void {}

  /** Independent from mute: film pause stops scheduled foley and the musical bed,
   * so resuming never plays a backlog of impacts. No autoplay outside a gesture. */
  setPaused(paused: boolean): void {
    if (this.paused === paused) return;
    this.paused = paused;
    if (paused) { this.clearVoices(); this.removeAmbience(); }
    else if (this.unlocked && this.ambienceWanted && !this.muted && !document.hidden) {
      if (this.ctx?.state === 'suspended') void this.ctx.resume().then(() => this.startAmbience()).catch(() => {});
      else this.startAmbience();
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.applyMaster();
    if (muted) { this.clearVoices(); this.removeAmbience(); }
    else if (!this.paused && this.ambienceWanted) this.startAmbience();
  }

  setVolume(volume: number): void {
    this.volume = Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : this.volume;
    this.applyMaster();
  }

  private applyMaster(): void {
    if (!this.master || !this.ctx || this.ctx.state === 'closed') return;
    const gain = this.master.gain;
    gain.cancelScheduledValues(this.ctx.currentTime);
    gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, 0.004);
  }

  private buildGraph(): void {
    const ctx = this.ctx!;
    const master = ctx.createGain();
    master.gain.value = this.muted ? 0 : this.volume;
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -15;
    compressor.knee.value = 10;
    compressor.ratio.value = 5;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.19;
    const sfx = ctx.createGain();
    sfx.gain.value = 0.78;
    const ui = ctx.createGain();
    ui.gain.value = 0.65;
    const ambience = ctx.createGain();
    ambience.gain.value = 0.14;
    const reverb = ctx.createConvolver();
    reverb.buffer = this.createImpulse();
    const wet = ctx.createGain();
    wet.gain.value = 0.48;
    const wetCut = ctx.createBiquadFilter();
    wetCut.type = 'lowpass';
    wetCut.frequency.value = 3500;
    sfx.connect(compressor);
    ui.connect(compressor);
    ambience.connect(compressor);
    reverb.connect(wetCut).connect(wet).connect(compressor);
    compressor.connect(master).connect(ctx.destination);
    this.master = master;
    this.sfx = sfx;
    this.ui = ui;
    this.ambience = ambience;
    this.reverb = reverb;
    this.sharedNodes = [master, compressor, sfx, ui, ambience, reverb, wetCut, wet];
    this.noiseBuffer = this.createNoise(4, 0x6e624eb7);
    this.scoreBuffer = this.createWordlessScore();
  }

  private random(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      return (state >>> 0) / 4294967296;
    };
  }

  private createNoise(seconds: number, seed: number): AudioBuffer {
    const ctx = this.ctx!;
    const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    const random = this.random(seed);
    // White noise is filtered separately for wind, leather, metal and stone.
    for (let i = 0; i < data.length; i++) data[i] = random() * 2 - 1;
    return buffer;
  }

  /** A quiet 24-second D/A string bed and three distant frame-drum phrases.
   * Render once at 22 kHz; one looping source, no musical timers or network files. */
  private createWordlessScore(): AudioBuffer {
    const rate = 22050, duration = 24;
    const buffer = this.ctx!.createBuffer(2, rate * duration, rate);
    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel), random = this.random(8421 + channel * 401);
      for (let i = 0; i < data.length; i++) {
        const t = i / rate, swell = Math.pow(Math.sin(Math.PI * t / duration), 2);
        let sample = 0;
        for (const [j, frequency] of [73.416, 110, 146.832].entries()) {
          const phase = 2 * Math.PI * (frequency + (channel ? .11 : -.09)) * t;
          const bowed = Math.sin(phase) + .22 * Math.sin(phase * 2) + .07 * Math.sin(phase * 3);
          const phrase = .65 + .35 * Math.sin(t * .32 + j * 1.7 + channel * .2);
          sample += bowed * phrase * swell * (j === 0 ? .035 : .018);
        }
        for (const beat of [1.2, 9.2, 17.2, 17.62]) {
          const since = t - beat;
          if (since < 0 || since > 1.6) continue;
          const phase = 2 * Math.PI * (48 * since + 1.25 * (1 - Math.exp(-since * 35)));
          const strike = Math.sin(phase) * Math.exp(-since * 5.2) + (random() * 2 - 1) * Math.exp(-since * 44) * .11;
          sample += strike * (beat === 17.62 ? .12 : .23) * Math.min(1, since * 350);
        }
        data[i] = sample;
      }
    }
    return buffer;
  }

  private createImpulse(): AudioBuffer {
    const ctx = this.ctx!;
    const duration = 1.85;
    const buffer = ctx.createBuffer(2, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);
      const random = this.random(0xabcdef + channel * 1973);
      let smooth = 0;
      for (let i = 0; i < data.length; i++) {
        smooth = smooth * 0.43 + (random() * 2 - 1) * 0.57;
        const time = i / ctx.sampleRate;
        const fadeIn = Math.min(1, time / 0.025);
        data[i] = smooth * Math.exp(-time * 4.5) * fadeIn * 0.5;
      }
      // Sparse early reflections suggest a stone arcade around the board.
      for (const [delay, amplitude] of [[0.036, 0.6], [0.079, 0.32], [0.123, 0.2]]) {
        data[Math.floor((delay + channel * 0.007) * ctx.sampleRate)] += amplitude;
      }
    }
    return buffer;
  }

  private prepareVoice(source: AudioSource, filter: BiquadFilterNode, options: ToneOptions | NoiseOptions): void {
    const ctx = this.ctx!;
    const gain = ctx.createGain();
    const pan = ctx.createStereoPanner();
    const send = ctx.createGain();
    pan.pan.value = options.pan ?? 0;
    send.gain.value = options.wet ?? 0.18;
    const attack = Math.min(options.duration * 0.4, options.attack ?? 0.006);
    const at = options.at;
    const end = at + options.duration;
    gain.gain.setValueAtTime(0.00001, at);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.00002, options.volume), at + attack);
    gain.gain.exponentialRampToValueAtTime(0.00001, end);
    source.connect(filter).connect(gain).connect(pan);
    pan.connect(options.ui ? this.ui! : this.sfx!);
    pan.connect(send).connect(this.reverb!);
    const voice = { source, gain, nodes: [source, filter, gain, pan, send], end };
    this.voices.push(voice);
    while (this.voices.length > this.maxVoices) this.releaseVoice(this.voices[0]);
    source.onended = () => this.releaseVoice(voice, false);
  }

  private tone(options: ToneOptions): void {
    const ctx = this.ctx!;
    const source = ctx.createOscillator();
    source.type = options.wave ?? 'sine';
    source.frequency.setValueAtTime(options.frequency, options.at);
    if (options.endFrequency !== undefined) source.frequency.exponentialRampToValueAtTime(Math.max(10, options.endFrequency), options.at + options.duration);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = options.cutoff ?? 5000;
    this.prepareVoice(source, filter, options);
    source.start(options.at);
    source.stop(options.at + options.duration + 0.01);
  }

  private noise(options: NoiseOptions): void {
    const ctx = this.ctx!;
    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = options.filter ?? 'bandpass';
    filter.Q.value = options.q ?? 0.75;
    filter.frequency.setValueAtTime(options.frequency, options.at);
    if (options.endFrequency !== undefined) filter.frequency.exponentialRampToValueAtTime(Math.max(30, options.endFrequency), options.at + options.duration);
    this.prepareVoice(source, filter, options);
    const offset = ((this.variant++ * 137) % 1500) / 1000;
    source.start(options.at, offset);
    source.stop(options.at + options.duration + 0.01);
  }

  private releaseVoice(voice: Voice, stop = true): void {
    const index = this.voices.indexOf(voice);
    if (index < 0) return;
    this.voices.splice(index, 1);
    voice.source.onended = null;
    if (stop) { try { voice.source.stop(); } catch { /* Source may have already ended. */ } }
    for (const node of voice.nodes) node.disconnect();
  }

  private clearVoices(): void {
    for (const voice of [...this.voices]) this.releaseVoice(voice);
  }

  private metal(at: number, force = 1, pan = 0): void {
    this.noise({ at, duration: 0.11, frequency: 3200, volume: 0.16 * force, pan, wet: 0.2 });
    for (const [frequency, duration, volume] of [[673, 0.36, 0.045], [1139, 0.25, 0.033], [1877, 0.16, 0.016]]) {
      this.tone({ at, duration, frequency, endFrequency: frequency * 0.99, volume: volume * force, pan, wet: 0.3 });
    }
  }

  private foot(at: number, heavy = false, pan = 0): void {
    this.tone({ at, duration: 0.12, frequency: heavy ? 119 : 156, endFrequency: 46, volume: heavy ? 0.15 : 0.08, pan, wet: 0.12 });
    this.noise({ at, duration: 0.085, frequency: 540, volume: heavy ? 0.11 : 0.08, filter: 'lowpass', pan, wet: 0.18 });
    this.noise({ at: at + 0.014, duration: 0.055, frequency: 3400, volume: 0.038, pan, wet: 0.12 });
  }

  private hoof(at: number, pan = 0): void {
    this.tone({ at, duration: 0.08, frequency: 650, endFrequency: 280, wave: 'triangle', volume: 0.08, cutoff: 1700, pan, wet: 0.22 });
    this.noise({ at, duration: 0.065, frequency: 900, q: 1.9, volume: 0.16, pan, wet: 0.2 });
    this.tone({ at: at + 0.012, duration: 0.13, frequency: 145, endFrequency: 58, volume: 0.07, pan, wet: 0.12 });
  }

  private swish(at: number, duration: number, force = 1, pan = 0): void {
    this.noise({ at, duration, frequency: 350, endFrequency: 3900, q: 0.8, volume: 0.25 * force, attack: duration * 0.33, pan, wet: 0.23 });
    this.noise({ at: at + duration * 0.2, duration: duration * 0.65, frequency: 2100, endFrequency: 530, volume: 0.09 * force, attack: duration * 0.13, pan, wet: 0.1 });
  }

  private chariot(at: number, charge: boolean): void {
    const duration = charge ? 0.94 : 0.64;
    this.noise({ at, duration, frequency: 110, endFrequency: 430, filter: 'lowpass', volume: charge ? 0.43 : 0.24, attack: 0.13, wet: 0.12 });
    this.tone({ at, duration, frequency: 38, endFrequency: 77, wave: 'sawtooth', cutoff: 170, volume: 0.06, attack: 0.1, wet: 0.08 });
    for (let i = 0; i < (charge ? 7 : 5); i++) {
      const t = at + i * (charge ? 0.103 : 0.115);
      this.noise({ at: t, duration: 0.075, frequency: 1300 + i * 130, volume: 0.08 + i * 0.007, pan: i % 2 ? 0.2 : -0.2, wet: 0.14 });
      this.tone({ at: t, duration: 0.09, frequency: 170 + (i % 3) * 35, endFrequency: 73, wave: 'triangle', volume: 0.075, cutoff: 800, wet: 0.1 });
    }
    if (charge) this.swish(at + 0.2, 0.67, 0.7);
  }

  play(event: BattleSound, type = 'p'): void {
    const ctx = this.ctx;
    if (!ctx || !this.unlocked || this.disposed || this.paused || this.muted || ctx.state !== 'running' || document.hidden) return;
    const now = ctx.currentTime;
    const cooldown = event === 'step' ? 0.055 : event === 'select' ? 0.065 : 0.08;
    if (now - (this.lastEvents.get(event) ?? -100) < cooldown) return;
    this.lastEvents.set(event, now);
    const at = now + 0.006;
    const kind = type.toLowerCase();
    const rook = kind === 'r' || kind === 'rook' || kind === 'chariot';
    const knight = kind === 'n' || kind === 'knight';
    const caster = kind === 'b' || kind === 'bishop' || kind === 'q' || kind === 'queen';
    const pan = this.battlePan + ((this.variant % 5) - 2) * 0.035;

    switch (event) {
      case 'invalid':
        this.tone({at,duration:.14,frequency:180,endFrequency:130,volume:.055,wave:'triangle',ui:true,wet:.04});
        this.noise({at,duration:.055,frequency:550,volume:.035,ui:true,wet:.03});
        break;
      case 'select':
        this.noise({ at, duration: 0.047, frequency: 1150, volume: 0.065, ui: true, wet: 0.13 });
        this.tone({ at, duration: 0.22, frequency: 420, endFrequency: 415, volume: 0.043, wave: 'triangle', cutoff: 1400, ui: true, wet: 0.25 });
        this.tone({ at: at + 0.015, duration: 0.18, frequency: 1052, volume: 0.009, ui: true, wet: 0.26 });
        break;
      case 'undo':
        this.noise({ at, duration: 0.2, frequency: 1400, endFrequency: 210, volume: 0.12, attack: 0.025, ui: true, wet: 0.2 });
        this.tone({ at, duration: 0.25, frequency: 311, endFrequency: 155.5, wave: 'triangle', volume: 0.055, cutoff: 1200, ui: true, wet: 0.2 });
        break;
      case 'step':
        if (rook) {
          this.noise({ at, duration: 0.14, frequency: 650, volume: 0.15, pan, wet: 0.1 });
          this.tone({ at, duration: 0.09, frequency: 190, endFrequency: 64, volume: 0.08, pan });
        } else if (knight) {
          this.hoof(at, pan);
          this.hoof(at + 0.078, -pan);
        } else this.foot(at, kind === 'k', pan);
        break;
      case 'move':
        if (rook) this.chariot(at, false);
        else if (knight) {
          for (const [i, delay] of [0, 0.1, 0.28, 0.36].entries()) this.hoof(at + delay, i % 2 ? 0.12 : -0.12);
          this.swish(at + 0.09, 0.38, 0.3);
        } else if (caster) {
          this.swish(at, 0.53, 0.55);
          this.foot(at + .1, false, pan); this.foot(at + .32, false, -pan);
          this.noise({at:at+.04,duration:.37,frequency:1900,endFrequency:650,volume:.042,pan,wet:.18});
          this.metal(at + .21, .18, pan);
        } else {
          this.foot(at, false, -0.08);
          this.foot(at + 0.2, true, 0.08);
          this.noise({ at, duration: 0.38, frequency: 2800, endFrequency: 950, volume: 0.055, attack: 0.06, wet: 0.15 });
        }
        break;
      case 'charge':
        if (rook) this.chariot(at, true);
        else if (knight) {
          for (const [i, delay] of [0, 0.1, 0.27, 0.35, 0.49, 0.56].entries()) this.hoof(at + delay, i % 2 ? 0.18 : -0.18);
          this.swish(at + 0.25, 0.47, 0.85);
        } else {
          this.swish(at, 0.46, 1);
          this.noise({ at: at + 0.04, duration: 0.29, frequency: 2300, volume: 0.07, wet: 0.15 });
          this.tone({ at, duration: 0.43, frequency: 48, endFrequency: 86, volume: 0.065, attack: 0.08, wet: 0.15 });
        }
        break;
      case 'impact':
        if(this.ambience){this.ambience.gain.cancelScheduledValues(at);this.ambience.gain.setValueAtTime(.05,at);this.ambience.gain.linearRampToValueAtTime(.14,at+.6);}
        if(rook){for(let i=0;i<4;i++)this.noise({at:at+i*.07,duration:.2,frequency:280+i*210,volume:.12-i*.02,filter:'lowpass',pan:i%2?.5:-.5,wet:.28});this.tone({at,duration:.65,frequency:53,endFrequency:24,volume:.16,pan,wet:.25});}
        else if(caster){this.noise({at,duration:.065,frequency:5400,endFrequency:1400,volume:.12,pan,wet:.12});this.metal(at+.036,.62,pan);}
        else{this.noise({at,duration:.045,frequency:6500,endFrequency:2300,volume:.16,pan,wet:.1});this.tone({at,duration:.3,frequency:knight?970:1511,endFrequency:knight?760:1470,volume:.038,pan,wet:.3});}
        this.tone({ at, duration: 0.48, frequency: 145, endFrequency: 36, volume: 0.39, wet: 0.13 });
        this.noise({ at, duration: 0.23, frequency: 750, endFrequency: 130, filter: 'lowpass', volume: 0.43, wet: 0.32 });
        this.metal(at + 0.005, 1.3);
        break;
      case 'capture':
        this.tone({ at, duration: 0.9, frequency: 80, endFrequency: 27, volume: 0.24, wet: 0.22 });
        this.noise({ at, duration: 0.64, frequency: 400, endFrequency: 60, filter: 'lowpass', volume: 0.42, wet: 0.43 });
        this.swish(at + 0.05, 0.52, 0.76, 0.2);
        this.metal(at + 0.015, 0.9, -0.13);
        for (let i = 0; i < 5; i++) {
          this.noise({ at: at + 0.22 + i * 0.073, duration: 0.11, frequency: 900 + i * 560, volume: 0.07 - i * 0.009, q: 1.3, pan: i % 2 ? 0.5 : -0.5, wet: 0.32 });
        }
        break;
      case 'land':
        this.foot(at, true);
        this.noise({ at, duration: 0.19, frequency: 460, endFrequency: 120, filter: 'lowpass', volume: 0.21, wet: 0.3 });
        if (rook || knight) this.metal(at + 0.035, 0.32);
        break;
      case 'check':
        this.tone({ at, duration: 1.1, frequency: 110, endFrequency: 108, wave: 'sawtooth', cutoff: 470, volume: 0.07, attack: 0.12, wet: 0.5 });
        this.tone({ at: at + 0.025, duration: 1.18, frequency: 164.81, endFrequency: 161, wave: 'triangle', cutoff: 850, volume: 0.08, attack: 0.11, wet: 0.45 });
        this.metal(at, 0.6);
        this.noise({ at, duration: 0.7, frequency: 150, filter: 'lowpass', volume: 0.22, attack: 0.06, wet: 0.3 });
        break;
      case 'victory':
        for (const [i, frequency] of [146.83, 220, 293.66, 369.99, 440].entries()) {
          this.tone({ at: at + i * 0.12, duration: 1.75 - i * 0.13, frequency, wave: i < 2 ? 'sawtooth' : 'triangle', cutoff: 700 + i * 230, volume: 0.035, attack: 0.19, wet: 0.5 });
        }
        this.tone({ at, duration: 1.3, frequency: 82, endFrequency: 37, volume: 0.2, wet: 0.4 });
        this.noise({ at, duration: 1.5, frequency: 1400, endFrequency: 220, volume: 0.16, attack: 0.12, wet: 0.5 });
        this.metal(at + 0.48, 0.4);
        break;
    }
  }

  startAmbience(): void {
    this.ambienceWanted = true;
    const ctx = this.ctx;
    if (!ctx || !this.unlocked || this.disposed || this.paused || this.muted || ctx.state !== 'running' || this.ambienceSources.length || document.hidden) return;
    const wind = ctx.createBufferSource();
    // Seamless noise boundary is masked by the low-pass and very low level.
    wind.buffer = this.noiseBuffer;
    wind.loop = true;
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 380;
    const highpass = ctx.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = 90;
    const windGain = ctx.createGain();
    windGain.gain.value = 0.052;
    wind.connect(lowpass).connect(highpass).connect(windGain).connect(this.ambience!);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.11;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.024;
    lfo.connect(lfoGain).connect(windGain.gain);
    this.ambienceNodes = [wind, lowpass, highpass, windGain, lfo, lfoGain];
    this.ambienceSources = [wind, lfo];
    const score = ctx.createBufferSource(), scoreGain = ctx.createGain();
    score.buffer = this.scoreBuffer; score.loop = true; scoreGain.gain.value = .78;
    score.connect(scoreGain).connect(this.ambience!);
    this.ambienceSources.push(score); this.ambienceNodes.push(score, scoreGain);
    const now = ctx.currentTime;
    this.ambience!.gain.cancelScheduledValues(now);
    this.ambience!.gain.setValueAtTime(0, now);
    this.ambience!.gain.linearRampToValueAtTime(0.14, now + 1.2);
    for (const source of this.ambienceSources) source.start(now);
  }

  stopAmbience(): void {
    this.ambienceWanted = false;
    this.removeAmbience();
  }

  private removeAmbience(): void {
    for (const source of this.ambienceSources) { try { source.stop(); } catch { /* Safe during disposal. */ } }
    for (const node of this.ambienceNodes) node.disconnect();
    this.ambienceSources = [];
    this.ambienceNodes = [];
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unlocked = false;
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.onVisibility);
    this.clearVoices();
    this.removeAmbience();
    for (const node of this.sharedNodes) node.disconnect();
    this.sharedNodes = [];
    this.noiseBuffer = null;
    this.scoreBuffer = null;
    this.lastEvents.clear();
    if (this.ctx && this.ctx.state !== 'closed') void this.ctx.close().catch(() => {});
  }
}
