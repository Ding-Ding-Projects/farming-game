/**
 * Runtime sound synthesis (DESIGN.md section 7). No files, no network.
 *
 * Square waves for the interface, triangle for the world, everything under 200 ms
 * except `newday`. One AudioContext, created lazily on the first input so nothing
 * ever starts before the player touches something. Every export is safe to call
 * before unlock, and in an environment with no WebAudio at all.
 */

import type { SoundId } from '../game/types'

const MUTE_KEY = 'sprout-hollow.muted'
const MASTER_GAIN = 0.15

type AudioCtor = new () => AudioContext

let audio: AudioContext | null = null
let master: GainNode | null = null
let noiseBuffer: AudioBuffer | null = null
let muted = readMuted()

function storage(): Storage | null {
  try {
    return (globalThis as { localStorage?: Storage }).localStorage ?? null
  } catch {
    return null
  }
}

function readMuted(): boolean {
  try {
    return storage()?.getItem(MUTE_KEY) === 'true'
  } catch {
    return false
  }
}

function contextCtor(): AudioCtor | null {
  const g = globalThis as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor }
  return g.AudioContext ?? g.webkitAudioContext ?? null
}

/** Call on first input. Safe to call repeatedly. */
export function unlockAudio(): void {
  try {
    if (audio === null) {
      const Ctor = contextCtor()
      if (Ctor === null) return
      const ctx = new Ctor()
      const gain = ctx.createGain()
      gain.gain.value = muted ? 0 : MASTER_GAIN
      gain.connect(ctx.destination)
      audio = ctx
      master = gain
    }
    if (audio.state !== 'running') {
      void audio.resume().catch(() => undefined)
    }
  } catch {
    audio = null
    master = null
  }
}

export function setMuted(next: boolean): void {
  muted = next
  try {
    storage()?.setItem(MUTE_KEY, next ? 'true' : 'false')
  } catch {
    // A locked-down profile is not a reason to fail a mute toggle.
  }
  try {
    if (master !== null) master.gain.value = next ? 0 : MASTER_GAIN
  } catch {
    // ignore
  }
}

export function isMuted(): boolean {
  return muted
}

export function playSound(id: SoundId): void {
  if (muted) return
  const ctx = audio
  if (ctx === null || master === null) return
  const voice = VOICES[id]
  if (voice === undefined) return
  try {
    if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined)
    voice(ctx.currentTime + 0.005)
  } catch {
    // A sound is never worth breaking a frame over.
  }
}

interface ToneOpts {
  type: OscillatorType
  start: number
  dur: number
  gain: number
  freq: number
  freqEnd?: number
  attack?: number
}

function tone(o: ToneOpts): void {
  const ctx = audio
  const out = master
  if (ctx === null || out === null) return
  try {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = o.type
    osc.frequency.setValueAtTime(Math.max(20, o.freq), o.start)
    if (o.freqEnd !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.freqEnd), o.start + o.dur)
    }
    const attack = Math.min(o.attack ?? 0.008, o.dur * 0.5)
    gain.gain.setValueAtTime(0.0001, o.start)
    gain.gain.exponentialRampToValueAtTime(o.gain, o.start + attack)
    gain.gain.exponentialRampToValueAtTime(0.0001, o.start + o.dur)
    osc.connect(gain)
    gain.connect(out)
    osc.onended = () => {
      try {
        osc.disconnect()
        gain.disconnect()
      } catch {
        // already torn down
      }
    }
    osc.start(o.start)
    osc.stop(o.start + o.dur + 0.02)
  } catch {
    // ignore
  }
}

interface NoiseOpts {
  start: number
  dur: number
  gain: number
  type: BiquadFilterType
  freq: number
  freqEnd?: number
  q?: number
}

function noise(o: NoiseOpts): void {
  const ctx = audio
  const out = master
  if (ctx === null || out === null) return
  try {
    const buf = getNoiseBuffer(ctx)
    if (buf === null) return
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.loop = true
    const filter = ctx.createBiquadFilter()
    filter.type = o.type
    filter.Q.value = o.q ?? 0.8
    filter.frequency.setValueAtTime(o.freq, o.start)
    if (o.freqEnd !== undefined) {
      filter.frequency.exponentialRampToValueAtTime(Math.max(40, o.freqEnd), o.start + o.dur)
    }
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.0001, o.start)
    gain.gain.exponentialRampToValueAtTime(o.gain, o.start + Math.min(0.01, o.dur * 0.4))
    gain.gain.exponentialRampToValueAtTime(0.0001, o.start + o.dur)
    src.connect(filter)
    filter.connect(gain)
    gain.connect(out)
    src.onended = () => {
      try {
        src.disconnect()
        filter.disconnect()
        gain.disconnect()
      } catch {
        // already torn down
      }
    }
    src.start(o.start)
    src.stop(o.start + o.dur + 0.02)
  } catch {
    // ignore
  }
}

/** Half a second of white noise, generated once from a fixed 32-bit stream. */
function getNoiseBuffer(ctx: AudioContext): AudioBuffer | null {
  if (noiseBuffer !== null) return noiseBuffer
  try {
    const len = Math.max(1, Math.floor(ctx.sampleRate * 0.5))
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const data = buf.getChannelData(0)
    let s = 0x9e3779b9
    for (let i = 0; i < len; i++) {
      s ^= s << 13
      s ^= s >>> 17
      s ^= s << 5
      s |= 0
      data[i] = s / 2147483648
    }
    noiseBuffer = buf
    return buf
  } catch {
    return null
  }
}

const VOICES: Record<SoundId, (t: number) => void> = {
  // Descending two-tone thud with a scrape of dirt under it.
  till: (t) => {
    tone({ type: 'triangle', start: t, dur: 0.07, gain: 0.9, freq: 210, freqEnd: 120 })
    tone({ type: 'triangle', start: t + 0.06, dur: 0.1, gain: 0.7, freq: 130, freqEnd: 70 })
    noise({ start: t, dur: 0.05, gain: 0.22, type: 'lowpass', freq: 900 })
  },
  water: (t) => {
    noise({ start: t, dur: 0.16, gain: 0.5, type: 'bandpass', freq: 1900, freqEnd: 480, q: 1.2 })
  },
  plant: (t) => {
    tone({ type: 'triangle', start: t, dur: 0.09, gain: 0.55, freq: 330, freqEnd: 560 })
  },
  // Bright major third: C5 over E5.
  harvest: (t) => {
    tone({ type: 'triangle', start: t, dur: 0.15, gain: 0.5, freq: 523.25 })
    tone({ type: 'triangle', start: t + 0.02, dur: 0.16, gain: 0.38, freq: 659.25 })
  },
  chop: (t) => {
    noise({ start: t, dur: 0.08, gain: 0.42, type: 'lowpass', freq: 1600, freqEnd: 400 })
    tone({ type: 'triangle', start: t, dur: 0.12, gain: 0.65, freq: 150, freqEnd: 60 })
  },
  // Three ascending notes, C5 E5 G5.
  sell: (t) => {
    tone({ type: 'square', start: t, dur: 0.06, gain: 0.3, freq: 523.25 })
    tone({ type: 'square', start: t + 0.05, dur: 0.06, gain: 0.3, freq: 659.25 })
    tone({ type: 'square', start: t + 0.1, dur: 0.07, gain: 0.3, freq: 783.99 })
  },
  buy: (t) => {
    tone({ type: 'square', start: t, dur: 0.05, gain: 0.28, freq: 392 })
    tone({ type: 'square', start: t + 0.055, dur: 0.08, gain: 0.28, freq: 587.33 })
  },
  deny: (t) => {
    tone({ type: 'square', start: t, dur: 0.14, gain: 0.4, freq: 104, attack: 0.004 })
  },
  select: (t) => {
    tone({ type: 'square', start: t, dur: 0.035, gain: 0.2, freq: 880 })
  },
  wither: (t) => {
    tone({ type: 'triangle', start: t, dur: 0.18, gain: 0.45, freq: 300, freqEnd: 90 })
    tone({ type: 'triangle', start: t + 0.03, dur: 0.14, gain: 0.2, freq: 220, freqEnd: 70 })
  },
  // Four-note morning phrase over a held fifth, C3 + G3 under C5 E5 G5 C6.
  newday: (t) => {
    tone({ type: 'triangle', start: t, dur: 0.9, gain: 0.16, freq: 130.81, attack: 0.06 })
    tone({ type: 'triangle', start: t, dur: 0.9, gain: 0.12, freq: 196.0, attack: 0.06 })
    const melody = [523.25, 659.25, 783.99, 1046.5]
    for (let i = 0; i < melody.length; i++) {
      tone({
        type: 'triangle',
        start: t + i * 0.19,
        dur: 0.22,
        gain: 0.36,
        freq: melody[i],
        attack: 0.012,
      })
    }
  },
}
