// Fully synthesised audio (WebAudio): weapon/enemy/UI effects with simple
// spatialisation, an ambient bed per dimension and an adaptive soundtrack
// (pads + bass + arps, with percussion layered in during combat).
export class AudioEngine {
  constructor() {
    this.ctx = null
    this.ready = false
    this.last = new Map()
    this.loops = new Map()
    this.listener = { x: 0, y: 0, z: 0, yaw: 0 }
    this.dim = 0
    this.intensity = 0
    this.settings = { master: 0.8, music: 0.55, sfx: 0.9 }
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume()
      return
    }
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return
    const c = (this.ctx = new AC())
    this.comp = c.createDynamicsCompressor()
    this.comp.threshold.value = -16
    this.comp.ratio.value = 4
    this.master = c.createGain()
    this.sfx = c.createGain()
    this.music = c.createGain()
    this.amb = c.createGain()
    this.sfx.connect(this.comp)
    this.music.connect(this.comp)
    this.amb.connect(this.comp)
    this.comp.connect(this.master)
    this.master.connect(c.destination)
    // shared reverb (generated impulse)
    this.verb = c.createConvolver()
    this.verb.buffer = this.makeImpulse(2.6)
    this.verbGain = c.createGain()
    this.verbGain.gain.value = 0.28
    this.verb.connect(this.verbGain)
    this.verbGain.connect(this.comp)
    this.noise = this.makeNoise(2)
    this.applySettings()
    this.ready = true
    this.startAmbience()
    this.startMusic()
  }

  applySettings() {
    if (!this.ctx) return
    this.master.gain.value = this.settings.master
    this.music.gain.value = this.settings.music * 0.5
    this.sfx.gain.value = this.settings.sfx
    this.amb.gain.value = this.settings.sfx * 0.35
  }

  makeNoise(sec) {
    const c = this.ctx
    const b = c.createBuffer(1, c.sampleRate * sec, c.sampleRate)
    const d = b.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
    return b
  }
  makeImpulse(sec) {
    const c = this.ctx
    const len = c.sampleRate * sec
    const b = c.createBuffer(2, len, c.sampleRate)
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch)
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3)
    }
    return b
  }

  setListener(pos, yaw) {
    this.listener.x = pos.x
    this.listener.y = pos.y
    this.listener.z = pos.z
    this.listener.yaw = yaw
  }

  // output node for a sound at an optional world position
  out(vol, pos, verb = 0.2) {
    const c = this.ctx
    const g = c.createGain()
    let v = vol
    let pan = 0
    if (pos) {
      const dx = pos.x - this.listener.x,
        dz = pos.z - this.listener.z,
        dy = pos.y - this.listener.y
      const d = Math.hypot(dx, dy, dz)
      v *= 1 / (1 + d * 0.07)
      // angle relative to facing (yaw 0 = -z)
      const ang = Math.atan2(dx, -dz) + this.listener.yaw
      pan = Math.max(-1, Math.min(1, Math.sin(ang) * Math.min(1, d / 3)))
    }
    g.gain.value = v
    if (c.createStereoPanner) {
      const p = c.createStereoPanner()
      p.pan.value = pan
      g.connect(p)
      p.connect(this.sfx)
      if (verb) {
        const vg = c.createGain()
        vg.gain.value = verb
        p.connect(vg)
        vg.connect(this.verb)
      }
    } else g.connect(this.sfx)
    return g
  }

  osc(type, f0, f1, dur, dest, t0 = 0, vol = 1, attack = 0.005) {
    const c = this.ctx
    const t = c.currentTime + t0
    const o = c.createOscillator()
    o.type = type
    o.frequency.setValueAtTime(f0, t)
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur)
    const g = c.createGain()
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(vol, t + attack)
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur)
    o.connect(g)
    g.connect(dest)
    o.start(t)
    o.stop(t + dur + 0.05)
    return o
  }
  nz(dur, dest, { t0 = 0, vol = 1, type = 'bandpass', f0 = 1000, f1 = null, q = 1, attack = 0.003 } = {}) {
    const c = this.ctx
    const t = c.currentTime + t0
    const s = c.createBufferSource()
    s.buffer = this.noise
    s.loop = true
    const f = c.createBiquadFilter()
    f.type = type
    f.frequency.setValueAtTime(f0, t)
    if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur)
    f.Q.value = q
    const g = c.createGain()
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(vol, t + attack)
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur)
    s.connect(f)
    f.connect(g)
    g.connect(dest)
    s.start(t, Math.random())
    s.stop(t + dur + 0.05)
  }

  play(name, vol = 1, pos = null) {
    if (!this.ready) return
    const now = this.ctx.currentTime
    const minGap = { hit: 0.03, pulse: 0.02, stalkerHit: 0.06, shieldHit: 0.05, impact: 0.05, step: 0.1, portal: 0.1 }[name] ?? 0.012
    const l = this.last.get(name) || 0
    if (now - l < minGap) return
    this.last.set(name, now)
    const o = (v, verb) => this.out(v * vol, pos, verb)
    switch (name) {
      case 'pulse': {
        const d = o(0.32, 0.12)
        this.osc('square', 1400 + Math.random() * 200, 180, 0.09, d, 0, 0.35)
        this.osc('sawtooth', 600, 90, 0.12, d, 0, 0.3)
        this.nz(0.06, d, { f0: 3000, q: 0.7, vol: 0.5 })
        break
      }
      case 'launcher': {
        const d = o(0.6, 0.35)
        this.osc('sine', 160, 40, 0.45, d, 0, 0.9)
        this.osc('sawtooth', 420, 60, 0.3, d, 0, 0.25)
        this.nz(0.35, d, { f0: 800, f1: 120, q: 1.2, vol: 0.7 })
        break
      }
      case 'phase': {
        const d = o(0.6, 0.5)
        this.osc('sawtooth', 2200, 140, 0.5, d, 0, 0.35)
        this.osc('square', 90, 45, 0.45, d, 0, 0.4)
        this.osc('sine', 880, 1760, 0.18, d, 0, 0.25)
        this.nz(0.4, d, { f0: 5000, f1: 400, q: 2, vol: 0.4 })
        break
      }
      case 'charge':
        this.loop('charge', () => {
          const c = this.ctx
          const g = this.out(0.18)
          const os = c.createOscillator()
          os.type = 'sawtooth'
          os.frequency.setValueAtTime(220, c.currentTime)
          os.frequency.exponentialRampToValueAtTime(1100, c.currentTime + 0.55)
          const f = c.createBiquadFilter()
          f.type = 'lowpass'
          f.frequency.value = 2500
          os.connect(f)
          f.connect(g)
          os.start()
          return { stop: () => os.stop(), gain: g }
        })
        break
      case 'empty': {
        const d = o(0.3, 0)
        this.osc('square', 900, 700, 0.04, d, 0, 0.3)
        break
      }
      case 'reload': {
        const d = o(0.35, 0.05)
        this.nz(0.05, d, { f0: 2000, q: 3, vol: 0.6 })
        this.nz(0.05, d, { t0: 0.35, f0: 1400, q: 3, vol: 0.6 })
        this.osc('sine', 300, 900, 0.25, d, 0.5, 0.3)
        this.nz(0.06, d, { t0: 0.9, f0: 2600, q: 4, vol: 0.7 })
        break
      }
      case 'switch': {
        const d = o(0.25, 0)
        this.nz(0.05, d, { f0: 2500, q: 4, vol: 0.5 })
        this.osc('sine', 500, 800, 0.08, d, 0.05, 0.2)
        break
      }
      case 'hit': {
        const d = o(0.3, 0)
        this.osc('triangle', 1800, 1200, 0.05, d, 0, 0.4)
        break
      }
      case 'hitCrit': {
        const d = o(0.35, 0)
        this.osc('triangle', 2600, 1800, 0.08, d, 0, 0.45)
        this.osc('sine', 3900, 3900, 0.06, d, 0.02, 0.2)
        break
      }
      case 'kill': {
        const d = o(0.35, 0.1)
        this.osc('sine', 660, 990, 0.12, d, 0, 0.35)
        this.osc('sine', 990, 1320, 0.16, d, 0.07, 0.3)
        break
      }
      case 'impact':
      case 'impactMetal': {
        const d = o(0.25, 0.1)
        this.nz(0.08, d, { f0: name === 'impact' ? 1600 : 3200, q: 2, vol: 0.6 })
        break
      }
      case 'jump': {
        const d = o(0.12, 0)
        this.nz(0.08, d, { f0: 600, q: 0.8, vol: 0.5 })
        break
      }
      case 'land': {
        const d = o(0.3, 0.05)
        this.osc('sine', 120, 50, 0.15, d, 0, 0.6)
        this.nz(0.1, d, { f0: 400, q: 0.7, vol: 0.5 })
        break
      }
      case 'slide': {
        const d = o(0.3, 0.05)
        this.nz(0.6, d, { f0: 900, f1: 300, q: 0.6, vol: 0.5, attack: 0.03 })
        break
      }
      case 'dash': {
        const d = o(0.4, 0.3)
        this.nz(0.3, d, { f0: 300, f1: 3000, q: 1.5, vol: 0.6, attack: 0.02 })
        this.osc('sine', 200, 900, 0.2, d, 0, 0.25)
        break
      }
      case 'boost': {
        const d = o(0.4, 0.3)
        this.osc('sawtooth', 200, 1600, 0.4, d, 0, 0.2)
        this.osc('sine', 400, 1200, 0.5, d, 0.05, 0.25)
        break
      }
      case 'slamStart': {
        const d = o(0.35, 0.2)
        this.nz(0.35, d, { f0: 2000, f1: 200, q: 1, vol: 0.5 })
        break
      }
      case 'slam': {
        const d = o(0.8, 0.5)
        this.osc('sine', 110, 30, 0.6, d, 0, 1)
        this.nz(0.5, d, { type: 'lowpass', f0: 1200, f1: 100, q: 0.5, vol: 0.9 })
        break
      }
      case 'shift': {
        const d = o(0.6, 0.6)
        this.osc('sine', 80, 320, 0.7, d, 0, 0.5, 0.05)
        this.osc('sawtooth', 1200, 120, 0.8, d, 0, 0.18, 0.02)
        this.nz(0.8, d, { f0: 200, f1: 6000, q: 3, vol: 0.4, attack: 0.1 })
        break
      }
      case 'hurt': {
        const d = o(0.45, 0.05)
        this.osc('sine', 180, 60, 0.18, d, 0, 0.7)
        this.nz(0.12, d, { f0: 700, q: 0.8, vol: 0.4 })
        break
      }
      case 'stalkerScreech': {
        const d = o(0.4, 0.4)
        const f = 900 + Math.random() * 400
        this.osc('sawtooth', f, f * 1.6, 0.35, d, 0, 0.18)
        this.osc('square', f * 0.51, f * 0.7, 0.35, d, 0, 0.1)
        this.nz(0.3, d, { f0: 3000, q: 6, vol: 0.25 })
        break
      }
      case 'lunge': {
        const d = o(0.35, 0.2)
        this.nz(0.25, d, { f0: 600, f1: 2400, q: 2, vol: 0.5 })
        break
      }
      case 'claw':
      case 'whoosh': {
        const d = o(name === 'claw' ? 0.45 : 0.25, 0.1)
        this.nz(0.15, d, { f0: 1800, f1: 600, q: 2, vol: 0.6 })
        break
      }
      case 'stalkerHit': {
        const d = o(0.3, 0.1)
        this.osc('sawtooth', 500 + Math.random() * 200, 300, 0.1, d, 0, 0.15)
        break
      }
      case 'stalkerDie': {
        const d = o(0.5, 0.4)
        this.osc('sawtooth', 1100, 120, 0.6, d, 0, 0.22)
        this.nz(0.5, d, { f0: 1500, f1: 200, q: 3, vol: 0.4 })
        break
      }
      case 'blink': {
        const d = o(0.4, 0.4)
        this.osc('sine', 1800, 300, 0.25, d, 0, 0.3)
        break
      }
      case 'wardenCharge':
      case 'wardenChargeHeavy': {
        const heavy = name === 'wardenChargeHeavy'
        const d = o(heavy ? 0.6 : 0.4, 0.3)
        this.osc('sawtooth', 80, heavy ? 600 : 400, heavy ? 1.3 : 0.8, d, 0, 0.18, 0.2)
        this.osc('sine', 160, heavy ? 1200 : 800, heavy ? 1.3 : 0.8, d, 0, 0.15, 0.2)
        break
      }
      case 'wardenShot': {
        const d = o(0.4, 0.3)
        this.osc('square', 300, 80, 0.2, d, 0, 0.3)
        this.nz(0.15, d, { f0: 900, q: 1, vol: 0.4 })
        break
      }
      case 'wardenHeavy': {
        const d = o(0.7, 0.5)
        this.osc('sawtooth', 200, 40, 0.5, d, 0, 0.4)
        this.nz(0.4, d, { type: 'lowpass', f0: 2000, f1: 100, vol: 0.7 })
        break
      }
      case 'wardenHit': {
        const d = o(0.35, 0.1)
        this.nz(0.08, d, { f0: 2600, q: 5, vol: 0.5 })
        this.osc('square', 220, 160, 0.08, d, 0, 0.12)
        break
      }
      case 'shieldHit': {
        const d = o(0.25, 0.2)
        this.osc('sine', 2400, 2000, 0.12, d, 0, 0.25)
        this.osc('sine', 3600, 3000, 0.1, d, 0, 0.12)
        break
      }
      case 'wardenDie':
      case 'explosion': {
        const d = o(name === 'explosion' ? 0.9 : 0.8, 0.6)
        this.osc('sine', 90, 25, 0.9, d, 0, 1)
        this.nz(1.0, d, { type: 'lowpass', f0: 3000, f1: 80, q: 0.5, vol: 1 })
        break
      }
      case 'sphereShot': {
        const d = o(0.3, 0.2)
        this.osc('triangle', 1400, 500, 0.12, d, 0, 0.3)
        break
      }
      case 'sphereHit': {
        const d = o(0.25, 0.1)
        this.osc('sine', 1700, 1300, 0.06, d, 0, 0.25)
        break
      }
      case 'sphereDie': {
        const d = o(0.6, 0.4)
        this.osc('sine', 1200, 100, 0.5, d, 0, 0.4)
        this.nz(0.4, d, { f0: 2000, f1: 300, q: 2, vol: 0.5 })
        break
      }
      case 'portal': {
        const d = o(0.45, 0.6)
        this.osc('sine', 60, 240, 0.9, d, 0, 0.4, 0.2)
        this.nz(0.9, d, { f0: 300, f1: 2400, q: 6, vol: 0.3, attack: 0.3 })
        break
      }
      case 'well': {
        const d = o(0.6, 0.6)
        this.osc('sine', 300, 40, 2.2, d, 0, 0.7, 0.05)
        this.nz(2.2, d, { f0: 3000, f1: 200, q: 4, vol: 0.3, attack: 0.2 })
        break
      }
      case 'collapse': {
        const d = o(0.9, 0.7)
        this.osc('sine', 40, 200, 0.12, d, 0, 0.8)
        this.osc('sine', 200, 30, 0.8, d, 0.1, 0.9)
        this.nz(0.8, d, { type: 'lowpass', f0: 4000, f1: 100, vol: 0.9, t0: 0.08 })
        break
      }
      case 'pickup': {
        const d = o(0.35, 0.2)
        this.osc('sine', 700, 700, 0.1, d, 0, 0.3)
        this.osc('sine', 1050, 1050, 0.14, d, 0.06, 0.3)
        break
      }
      case 'power': {
        const d = o(0.45, 0.4)
        ;[523, 659, 784, 1046].forEach((f, i) => this.osc('triangle', f, f, 0.25, d, i * 0.06, 0.25))
        break
      }
      case 'objective': {
        const d = o(0.5, 0.6)
        ;[392, 523, 659].forEach((f, i) => this.osc('sawtooth', f, f, 0.8, d, i * 0.12, 0.08, 0.05))
        this.osc('sine', 98, 98, 1.2, d, 0, 0.4, 0.05)
        break
      }
      case 'victory': {
        const d = o(0.6, 0.8)
        ;[262, 330, 392, 523, 659, 784].forEach((f, i) => this.osc('triangle', f, f, 1.6, d, i * 0.1, 0.18, 0.05))
        this.osc('sine', 65, 65, 2.5, d, 0, 0.5, 0.2)
        break
      }
      case 'death': {
        const d = o(0.6, 0.8)
        this.osc('sawtooth', 220, 40, 1.6, d, 0, 0.25, 0.05)
        this.osc('sine', 110, 30, 1.8, d, 0, 0.5, 0.05)
        break
      }
      case 'warn': {
        const d = o(0.3, 0.1)
        this.osc('square', 880, 880, 0.08, d, 0, 0.15)
        this.osc('square', 660, 660, 0.08, d, 0.12, 0.15)
        break
      }
      case 'ui': {
        const d = o(0.2, 0)
        this.osc('sine', 1200, 1500, 0.05, d, 0, 0.2)
        break
      }
      case 'barrier': {
        const d = o(0.25, 0.2)
        this.osc('sine', 600, 300, 0.15, d, 0, 0.2)
        break
      }
      case 'teleport': {
        const d = o(0.5, 0.6)
        this.osc('sine', 200, 2000, 0.3, d, 0, 0.3)
        this.nz(0.4, d, { f0: 500, f1: 5000, q: 3, vol: 0.3 })
        break
      }
    }
  }

  loop(name, make) {
    if (!this.ready || this.loops.has(name)) return
    this.loops.set(name, make())
  }
  stop(name) {
    const l = this.loops.get(name)
    if (!l) return
    try {
      l.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.03)
      setTimeout(() => {
        try {
          l.stop()
        } catch {}
      }, 120)
    } catch {}
    this.loops.delete(name)
  }

  // ------------------------------------------------------------ ambience
  startAmbience() {
    const c = this.ctx
    // wind / void hum
    const s = c.createBufferSource()
    s.buffer = this.noise
    s.loop = true
    this.windF = c.createBiquadFilter()
    this.windF.type = 'bandpass'
    this.windF.frequency.value = 400
    this.windF.Q.value = 0.6
    const wg = c.createGain()
    wg.gain.value = 0.25
    s.connect(this.windF)
    this.windF.connect(wg)
    wg.connect(this.amb)
    s.start()
    this.drones = []
    ;[55, 82.4, 110.3].forEach((f, i) => {
      const o = c.createOscillator()
      o.type = i === 1 ? 'triangle' : 'sine'
      o.frequency.value = f
      const g = c.createGain()
      g.gain.value = 0.06
      o.connect(g)
      g.connect(this.amb)
      o.start()
      this.drones.push(o)
    })
  }

  setDimension(d) {
    this.dim = d
    if (!this.ready) return
    const t = this.ctx.currentTime
    const sets = [
      [55, 82.4, 110.3],
      [58.3, 87.3, 123.5],
      [51.9, 73.4, 116.5],
    ]
    this.drones.forEach((o, i) => o.frequency.setTargetAtTime(sets[d][i], t, 0.3))
    this.windF.frequency.setTargetAtTime([400, 900, 220][d], t, 0.4)
    if (this.padF) this.padF.frequency.setTargetAtTime([900, 1600, 600][d], t, 0.5)
  }

  // ------------------------------------------------------------ music
  startMusic() {
    const c = this.ctx
    this.padF = c.createBiquadFilter()
    this.padF.type = 'lowpass'
    this.padF.frequency.value = 900
    this.padF.Q.value = 0.8
    this.padF.connect(this.music)
    const mv = c.createGain()
    mv.gain.value = 0.35
    this.padF.connect(mv)
    mv.connect(this.verb)
    this.step = 0
    this.nextT = c.currentTime + 0.1
    this.bpm = 86
    // chord progressions (semitones from A1) per dimension
    this.prog = [
      [
        [0, 7, 12, 15],
        [-4, 3, 8, 12],
        [-2, 5, 10, 14],
        [-5, 2, 7, 10],
      ],
      [
        [0, 7, 11, 18],
        [2, 9, 14, 18],
        [-3, 4, 9, 16],
        [5, 12, 16, 19],
      ],
      [
        [0, 6, 13, 15],
        [1, 7, 10, 16],
        [-1, 6, 11, 13],
        [0, 3, 6, 13],
      ],
    ]
    this.timer = setInterval(() => this.schedule(), 90)
  }

  schedule() {
    if (!this.ready || this.ctx.state !== 'running') return
    const c = this.ctx
    const spb = 60 / this.bpm / 2 // eighth notes
    while (this.nextT < c.currentTime + 0.25) {
      const s = this.step
      const t = this.nextT
      const bar = Math.floor(s / 16) % 4
      const chord = this.prog[this.dim][bar]
      const A = 55
      const f = (n) => A * Math.pow(2, n / 12)
      if (s % 16 === 0) {
        for (const n of chord) this.pad(f(n + 12), t, spb * 16)
      }
      // bass pulse
      if (s % 4 === 0 || (this.intensity > 0.5 && s % 4 === 3)) this.bass(f(chord[0]), t, spb * 1.6)
      // arpeggio
      if (s % 2 === 0 && (this.intensity > 0.2 || s % 4 === 0)) {
        const n = chord[(s / 2) % 4] + 24 + (s % 8 === 6 ? 12 : 0)
        this.pluck(f(n), t, 0.35)
      }
      // percussion in combat
      if (this.intensity > 0.3) {
        if (s % 8 === 0 || s % 8 === 5) this.kick(t)
        if (s % 8 === 4) this.snare(t)
        if (s % 2 === 1) this.hat(t, 0.5)
      }
      this.step++
      this.nextT += spb
    }
  }
  pad(freq, t, dur) {
    const c = this.ctx
    for (const det of [-7, 6]) {
      const o = c.createOscillator()
      o.type = 'sawtooth'
      o.frequency.value = freq
      o.detune.value = det
      const g = c.createGain()
      g.gain.setValueAtTime(0, t)
      g.gain.linearRampToValueAtTime(0.035, t + 1.2)
      g.gain.setValueAtTime(0.035, t + dur - 1.2)
      g.gain.linearRampToValueAtTime(0, t + dur)
      o.connect(g)
      g.connect(this.padF)
      o.start(t)
      o.stop(t + dur + 0.1)
    }
  }
  bass(freq, t, dur) {
    const c = this.ctx
    const o = c.createOscillator()
    o.type = 'triangle'
    o.frequency.value = freq
    const g = c.createGain()
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(0.22, t + 0.02)
    g.gain.exponentialRampToValueAtTime(0.001, t + dur)
    o.connect(g)
    g.connect(this.music)
    o.start(t)
    o.stop(t + dur + 0.05)
  }
  pluck(freq, t, dur) {
    const c = this.ctx
    const o = c.createOscillator()
    o.type = 'square'
    o.frequency.value = freq
    const f = c.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.setValueAtTime(3000, t)
    f.frequency.exponentialRampToValueAtTime(300, t + dur)
    const g = c.createGain()
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(0.045, t + 0.005)
    g.gain.exponentialRampToValueAtTime(0.001, t + dur)
    o.connect(f)
    f.connect(g)
    g.connect(this.music)
    const vg = c.createGain()
    vg.gain.value = 0.5
    g.connect(vg)
    vg.connect(this.verb)
    o.start(t)
    o.stop(t + dur + 0.05)
  }
  kick(t) {
    const c = this.ctx
    const o = c.createOscillator()
    o.frequency.setValueAtTime(140, t)
    o.frequency.exponentialRampToValueAtTime(40, t + 0.15)
    const g = c.createGain()
    g.gain.setValueAtTime(0.5, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3)
    o.connect(g)
    g.connect(this.music)
    o.start(t)
    o.stop(t + 0.35)
  }
  snare(t) {
    const c = this.ctx
    const s = c.createBufferSource()
    s.buffer = this.noise
    const f = c.createBiquadFilter()
    f.type = 'bandpass'
    f.frequency.value = 1800
    const g = c.createGain()
    g.gain.setValueAtTime(0.18, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18)
    s.connect(f)
    f.connect(g)
    g.connect(this.music)
    s.start(t, Math.random())
    s.stop(t + 0.2)
  }
  hat(t, v) {
    const c = this.ctx
    const s = c.createBufferSource()
    s.buffer = this.noise
    const f = c.createBiquadFilter()
    f.type = 'highpass'
    f.frequency.value = 7000
    const g = c.createGain()
    g.gain.setValueAtTime(0.05 * v, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.05)
    s.connect(f)
    f.connect(g)
    g.connect(this.music)
    s.start(t, Math.random())
    s.stop(t + 0.06)
  }

  suspend() {
    if (this.ctx && this.ctx.state === 'running') this.ctx.suspend()
  }
  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume()
  }
}
