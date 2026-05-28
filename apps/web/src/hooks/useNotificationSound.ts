/**
 * Plays a soft ting notification sound using the Web Audio API.
 * No audio file required — the tone is synthesized on demand.
 *
 * Returns a `play()` function. The first call creates an AudioContext;
 * subsequent calls reuse it. Browsers require a user gesture before
 * AudioContext can be created — the sound will silently skip if not yet
 * unlocked (which is fine for background events).
 */

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (ctx && ctx.state !== "closed") return ctx;
  try {
    ctx = new AudioContext();
    return ctx;
  } catch {
    return null;
  }
}

/** Synthesise a short bell-like ting tone. */
export function playNotificationSound(): void {
  const ac = getCtx();
  if (!ac) return;

  // Resume if suspended (browser autoplay policy).
  if (ac.state === "suspended") {
    ac.resume().then(() => _play(ac)).catch(() => {});
    return;
  }
  _play(ac);
}

function _play(ac: AudioContext): void {
  const now = ac.currentTime;

  // Primary tone — bell-like at 880 Hz
  const osc1  = ac.createOscillator();
  const gain1 = ac.createGain();
  osc1.type      = "sine";
  osc1.frequency.setValueAtTime(880, now);
  osc1.frequency.exponentialRampToValueAtTime(660, now + 0.18);
  gain1.gain.setValueAtTime(0.0, now);
  gain1.gain.linearRampToValueAtTime(0.35, now + 0.008);
  gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
  osc1.connect(gain1);
  gain1.connect(ac.destination);
  osc1.start(now);
  osc1.stop(now + 0.6);

  // Harmonic overtone — subtle shimmer
  const osc2  = ac.createOscillator();
  const gain2 = ac.createGain();
  osc2.type      = "sine";
  osc2.frequency.setValueAtTime(1760, now);
  gain2.gain.setValueAtTime(0.0, now);
  gain2.gain.linearRampToValueAtTime(0.12, now + 0.008);
  gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
  osc2.connect(gain2);
  gain2.connect(ac.destination);
  osc2.start(now);
  osc2.stop(now + 0.35);
}
