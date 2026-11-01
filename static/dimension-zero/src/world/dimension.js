// Dimension state machine. Owns which reality is active, the smooth visual
// blend between realities, collision masks, lighting/atmosphere, the
// transition wavefront and the Fracture stability meter.
import * as THREE from 'three'
import { G } from './materials.js'
import { DIM_A, DIM_B, DIM_C } from '../physics/collision.js'
import { clamp, smooth, lerp } from '../core/utils.js'

export const DIMS = [
  {
    key: 'A',
    name: 'MATERIAL',
    mask: DIM_A,
    css: '#62d8ff',
    rules: ['Stable gravity', 'Void Wardens shielded', 'Cyan cover is solid'],
    gravity: 1,
    sun: new THREE.Color('#fff0dc'),
    sunI: 3.3,
    hemiSky: new THREE.Color('#bcd6ff'),
    hemiGround: new THREE.Color('#6b5a4a'),
    hemiI: 1.15,
    fog: new THREE.Color('#9fb8da'),
    fogD: 0.0036,
    exposure: 1.0,
    wave: new THREE.Color(0.4, 1.4, 2.4),
  },
  {
    key: 'B',
    name: 'INVERTED',
    mask: DIM_B,
    css: '#b07bff',
    rules: ['Low gravity · high jumps', 'East sky-bridge assembles', 'Rift Stalkers lose footing'],
    gravity: 0.5,
    sun: new THREE.Color('#ffb8d8'),
    sunI: 2.3,
    hemiSky: new THREE.Color('#9a7be0'),
    hemiGround: new THREE.Color('#2f6476'),
    hemiI: 1.1,
    fog: new THREE.Color('#6a4a86'),
    fogD: 0.0055,
    exposure: 1.05,
    wave: new THREE.Color(1.2, 0.5, 2.6),
  },
  {
    key: 'C',
    name: 'FRACTURE',
    mask: DIM_C,
    css: '#ff5ad2',
    rules: ['Warden shields shatter', 'Hidden paths & vault open', 'Stability drains · rifts burn'],
    gravity: 1,
    sun: new THREE.Color('#b890ff'),
    sunI: 1.4,
    hemiSky: new THREE.Color('#5a3490'),
    hemiGround: new THREE.Color('#1e0c30'),
    hemiI: 0.95,
    fog: new THREE.Color('#1d0d33'),
    fogD: 0.0075,
    exposure: 1.12,
    wave: new THREE.Color(2.4, 0.4, 2.2),
  },
]

const TRANSITION = 0.85

export class DimensionManager {
  constructor(ctx) {
    this.ctx = ctx
    this.current = 0
    this.mask = DIM_A
    this.w = G.uDimW.value
    this.from = new THREE.Vector3(1, 0, 0)
    this.to = new THREE.Vector3(1, 0, 0)
    this.p = 1
    this.changedAt = -1
    this.cooldown = 0
    this.COOLDOWN = 1.6
    this.stability = 1
    this.STABILITY_TIME = 13 // seconds of Fracture before forced ejection
    this.waveT = 99
    this.envMaps = null
    this.envSwapped = true
    this.listeners = []
  }
  get def() {
    return DIMS[this.current]
  }
  onChange(fn) {
    this.listeners.push(fn)
  }

  canShift() {
    return this.cooldown <= 0
  }

  shift(to = (this.current + 1) % 3, forced = false) {
    if (!forced && this.cooldown > 0) return false
    if (to === this.current) return false
    const ctx = this.ctx
    this.from.copy(this.w)
    this.to.set(to === 0 ? 1 : 0, to === 1 ? 1 : 0, to === 2 ? 1 : 0)
    this.p = 0
    this.current = to
    this.mask = DIMS[to].mask
    ctx.cw.dimMask = this.mask
    ctx.props?.syncDims(ctx.cw)
    this.changedAt = ctx.time
    this.cooldown = this.COOLDOWN
    this.waveT = 0
    this.envSwapped = false
    G.uWaveOrigin.value.copy(ctx.player.pos)
    G.uWaveColor.value.copy(DIMS[to].wave)
    for (const fn of this.listeners) fn(to, forced)
    return true
  }

  update(dt) {
    const ctx = this.ctx
    this.cooldown = Math.max(0, this.cooldown - dt)
    if (this.p < 1) {
      this.p = Math.min(1, this.p + dt / TRANSITION)
      const k = smooth(this.p)
      this.w.lerpVectors(this.from, this.to, k)
      if (!this.envSwapped && this.p > 0.4) {
        this.envSwapped = true
        if (this.envMaps) ctx.scene.environment = this.envMaps[this.current]
      }
    }
    // wavefront expands from the shift origin
    this.waveT += dt
    G.uWaveRadius.value = this.waveT < 2.2 ? this.waveT * 55 : 1e5

    // Fracture stability
    if (this.current === 2) {
      this.stability = Math.max(0, this.stability - dt / this.STABILITY_TIME)
      if (this.stability <= 0) {
        this.shift(0, true)
        ctx.game?.onFractureEject()
      }
    } else {
      this.stability = Math.min(1, this.stability + dt / 7)
    }

    this.applyAtmosphere()
  }

  // Blend sun, sky light, fog and exposure from the current dimension weights.
  applyAtmosphere() {
    const ctx = this.ctx
    const w = this.w
    const L = ctx.lights
    const mix3 = (out, key) => {
      out.setRGB(0, 0, 0)
      for (let i = 0; i < 3; i++) {
        const c = DIMS[i][key]
        out.r += c.r * w.getComponent(i)
        out.g += c.g * w.getComponent(i)
        out.b += c.b * w.getComponent(i)
      }
    }
    const num = (key) => DIMS[0][key] * w.x + DIMS[1][key] * w.y + DIMS[2][key] * w.z
    mix3(L.sun.color, 'sun')
    L.sun.intensity = num('sunI')
    G.uSunColor.value.copy(L.sun.color).multiplyScalar(0.55 + 0.45 * w.x)
    mix3(L.hemi.color, 'hemiSky')
    mix3(L.hemi.groundColor, 'hemiGround')
    L.hemi.intensity = num('hemiI')
    mix3(ctx.scene.fog.color, 'fog')
    ctx.scene.fog.density = num('fogD')
    ctx.renderer.toneMappingExposure = num('exposure') * (ctx.exposureBias || 1)
  }

  get gravityScale() {
    return DIMS[0].gravity * this.w.x + DIMS[1].gravity * this.w.y + DIMS[2].gravity * this.w.z
  }

  reset() {
    this.current = 0
    this.mask = DIM_A
    this.ctx.cw.dimMask = DIM_A
    this.w.set(1, 0, 0)
    this.from.set(1, 0, 0)
    this.to.set(1, 0, 0)
    this.p = 1
    this.cooldown = 0
    this.stability = 1
    this.waveT = 99
    if (this.envMaps) this.ctx.scene.environment = this.envMaps[0]
    this.ctx.props?.syncDims(this.ctx.cw)
  }
}
