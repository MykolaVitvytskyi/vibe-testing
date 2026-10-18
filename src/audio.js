// Entirely optional, quiet procedural ambience. Creating the helper does not
// create an AudioContext: call setEnabled(true) from the sound toggle gesture.
export function createMuseumAudio() {
  let context = null, master = null, noise = null, ambience = null;
  let enabled = false, paused = true, disposed = false, distance = 0, foot = 1, playbackRequest = 0;
  const activeSources = new Set();

  function stopSources() {
    for (const source of activeSources) {
      try { source.stop(); } catch { /* A short sound may have just ended. */ }
    }
    activeSources.clear();
    ambience = null;
  }

  function makeNoise() {
    const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * .5), context.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
    return buffer;
  }

  function track(source) {
    activeSources.add(source);
    source.onended = () => activeSources.delete(source);
    return source;
  }

  function roomTone() {
    if (!context || ambience) return;
    const source = track(context.createBufferSource());
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = noise; source.loop = true;
    filter.type = 'lowpass'; filter.frequency.value = 230;
    gain.gain.value = .0017;
    source.connect(filter); filter.connect(gain); gain.connect(master);
    source.start(); ambience = source;
  }

  function step(roomId, speed) {
    const now = context.currentTime, wood = roomId === 'library';
    const source = track(context.createBufferSource());
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = noise;
    filter.type = 'bandpass'; filter.frequency.value = wood ? 550 : 1150;
    filter.Q.value = wood ? .65 : .45;
    const strength = Math.min(1.15, .65 + speed * .075);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(.022 * strength, now + .009);
    gain.gain.exponentialRampToValueAtTime(.0001, now + (wood ? .15 : .11));
    source.connect(filter); filter.connect(gain);
    if (context.createStereoPanner) {
      const panner = context.createStereoPanner();
      panner.pan.value = foot * .1;
      gain.connect(panner); panner.connect(master);
    } else gain.connect(master);
    source.start(now); source.stop(now + .18);

    const heel = track(context.createOscillator());
    const heelGain = context.createGain();
    heel.type = 'sine';
    heel.frequency.setValueAtTime(wood ? 105 : 125, now);
    heel.frequency.exponentialRampToValueAtTime(wood ? 48 : 66, now + .065);
    heelGain.gain.setValueAtTime(0, now);
    heelGain.gain.linearRampToValueAtTime(.011 * strength, now + .008);
    heelGain.gain.exponentialRampToValueAtTime(.0001, now + .09);
    heel.connect(heelGain); heelGain.connect(master);
    heel.start(now); heel.stop(now + .11);
    foot *= -1;
  }

  async function resume() {
    if (!enabled || !context || disposed) return false;
    const request = ++playbackRequest;
    try {
      await context.resume();
      // An immediately opened menu or disabled toggle wins over an earlier
      // asynchronous browser resume. It must not restart ambience afterwards.
      if (request !== playbackRequest || !enabled || disposed) return false;
      if (context.state !== 'running') { enabled = false; paused = true; return false; }
      paused = false;
      master.gain.setValueAtTime(.5, context.currentTime);
      roomTone();
      return true;
    } catch {
      if (request === playbackRequest) { paused = true; enabled = false; }
      return false;
    }
  }

  function pause() {
    playbackRequest++; paused = true; distance = 0;
    if (!context) return;
    stopSources();
    master.gain.setValueAtTime(0, context.currentTime);
    try { context.suspend()?.catch(() => {}); } catch { /* Optional audio. */ }
  }

  return {
    get enabled() { return enabled; },
    async setEnabled(nextEnabled) {
      if (disposed) return false;
      if (!nextEnabled) { enabled = false; pause(); return false; }
      if (!context) {
        const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext;
        if (!AudioContext) return false;
        try {
          context = new AudioContext();
          master = context.createGain(); master.gain.value = 0;
          master.connect(context.destination);
          noise = makeNoise();
        } catch {
          try { context?.close()?.catch(() => {}); } catch { /* Optional audio. */ }
          context = null; master = null; return false;
        }
      }
      enabled = true;
      await resume();
      return enabled;
    },
    tick(dt, speed, roomId) {
      if (!enabled || paused || !context || context.state !== 'running') return;
      if (!Number.isFinite(dt) || !Number.isFinite(speed) || dt <= 0 || speed <= .035) {
        distance = 0; return;
      }
      const actualSpeed = Math.max(0, Math.min(8, speed));
      distance += Math.min(.1, dt) * actualSpeed;
      const stride = actualSpeed > 4 ? 1.55 : 1.25;
      if (distance >= stride) { distance %= stride; step(roomId, actualSpeed); }
    },
    pause,
    resume,
    dispose() {
      if (disposed) return;
      enabled = false; disposed = true; pause();
      try { context?.close()?.catch(() => {}); } catch { /* Optional audio. */ }
      context = null; master = null; noise = null;
    },
  };
}
