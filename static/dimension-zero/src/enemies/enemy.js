// Base enemy: hit volumes, damage/armor, flinch, death, ground movement with
// collision against the arena boxes, external forces (knockback, singularity
// pull) and separation from other enemies.
import * as THREE from 'three'
import { clamp, damp } from '../core/utils.js'

const _hits = []
const _v = new THREE.Vector3()

let ALIEN_TEX = null
// Shared chitin texture set (generated once at load).
export function setAlienTextures(t) {
  ALIEN_TEX = t
}

// Chitinous alien material with fresnel rim light and a hit-flash uniform.
export function alienMaterial(color, rim, opts = {}) {
  const m = new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.32,
    metalness: opts.metalness ?? 0.45,
    transparent: !!opts.transparent,
    flatShading: !!opts.flat,
  })
  if (ALIEN_TEX && !opts.plain) {
    m.map = ALIEN_TEX.map
    m.normalMap = ALIEN_TEX.normalMap
    m.roughnessMap = ALIEN_TEX.roughnessMap
    m.normalScale.set(1.3, 1.3)
    m.roughness = 1
    m.color.multiplyScalar(1.7)
  }
  const u = {
    uRim: { value: new THREE.Color(...rim) },
    uFlash: { value: 0 },
    uTime: { value: 0 },
    uPulse: { value: opts.pulse ?? 0 },
  }
  m.userData.u = u
  m.customProgramCacheKey = () => 'alien' + (opts.flat ? 'f' : '') + (m.map ? 't' : '')
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, u)
    s.fragmentShader = s.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform vec3 uRim; uniform float uFlash; uniform float uTime; uniform float uPulse;'
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        { vec3 Vv = normalize(vViewPosition); float fr = pow(clamp(1.0 - abs(dot(normal, Vv)), 0.0, 1.0), 2.6);
          float pulse = 1.0 + uPulse * sin(uTime*5.0 + vViewPosition.y*6.0);
          totalEmissiveRadiance += uRim * fr * pulse + vec3(3.0,1.2,1.4) * uFlash; }`
      )
  }
  return m
}

export class Enemy {
  constructor(ctx, pos, def) {
    this.ctx = ctx
    this.def = def
    this.type = def.type
    this.pos = pos.clone()
    this.vel = new THREE.Vector3()
    this.ext = new THREE.Vector3()
    this.vy = 0
    this.yaw = Math.random() * Math.PI * 2
    this.hp = def.hp
    this.maxHp = def.hp
    this.radius = def.radius
    this.height = def.height
    this.state = 'spawn'
    this.st = 0
    this.alive = true
    this.removed = false
    this.deathT = 0
    this.flash = 0
    this.stun = 0
    this.destab = 0 // destabilised by Phase Cannon
    this.linked = null // shield link from a Dimension Sphere
    this.airborne = false
    this.flying = !!def.flying
    this.mats = []
    this.hitSpheres = [] // {obj, offset, r, mult, crit}
    this.root = new THREE.Group()
    this.root.position.copy(this.pos)
    ctx.scene.add(this.root)
    this.spawnT = 0
    this.lastSeen = 0
    this.flowTimer = Math.random() * 0.3
    this.dir = new THREE.Vector3()
    this.stuckT = 0
    this.lastPos = this.pos.clone()
    this.sideStep = 0
    this.animT = Math.random() * 10
  }

  // Armor multiplier (overridden for dimension-dependent defences)
  armor(info) {
    return this.linked && this.linked.alive ? 0.5 : 1
  }

  damage(amount, info = {}) {
    if (!this.alive) return 0
    const mult = this.armor(info)
    const dealt = amount * mult
    this.hp -= dealt
    this.flash = 1
    this.onHurt?.(dealt, info, mult)
    if (info.dir && info.knock) this.ext.addScaledVector(info.dir, info.knock * (this.def.knockScale ?? 1))
    if (this.hp <= 0) {
      this.hp = 0
      this.alive = false
      this.state = 'dead'
      this.st = 0
      this.onDeath?.(info)
      this.ctx.enemies.onEnemyKilled(this, info)
    }
    return dealt
  }

  // ray vs hit spheres (world space). returns {t, crit, mult} or null
  raycast(o, d, maxT) {
    let best = null
    for (const h of this.hitSpheres) {
      h.obj.getWorldPosition(_v)
      if (h.offset) _v.add(h.offset)
      const ox = o.x - _v.x,
        oy = o.y - _v.y,
        oz = o.z - _v.z
      const b = ox * d.x + oy * d.y + oz * d.z
      const c = ox * ox + oy * oy + oz * oz - h.r * h.r
      const disc = b * b - c
      if (disc < 0) continue
      let t = -b - Math.sqrt(disc)
      if (t < 0) t = 0
      if (t < maxT && (!best || t < best.t)) best = { t, crit: h.crit, mult: h.mult ?? 1, h }
    }
    return best
  }

  get center() {
    return _v.set(this.pos.x, this.pos.y + this.height * 0.55, this.pos.z)
  }

  // --------------------------------------------------------------- movement
  steer(dt, speed, accel = 14) {
    // dir is a unit xz vector set by the AI
    const tx = this.dir.x * speed,
      tz = this.dir.z * speed
    const k = 1 - Math.exp(-accel * dt)
    this.vel.x += (tx - this.vel.x) * k
    this.vel.z += (tz - this.vel.z) * k
  }

  // choose a direction toward the target using LOS shortcut or the flow field
  pathTo(target, dt) {
    const ctx = this.ctx
    const dx = target.x - this.pos.x,
      dz = target.z - this.pos.z
    const d = Math.hypot(dx, dz) || 1
    this.flowTimer -= dt
    const close = d < 14 && Math.abs(target.y - this.pos.y) < 1.5
    if (close && ctx.cw.los(this.pos.x, this.pos.y + 0.8, this.pos.z, target.x, target.y + 0.8, target.z)) {
      this.dir.set(dx / d, 0, dz / d)
    } else if (!ctx.enemies.nav.flow(this.pos.x, this.pos.z, _v)) {
      this.dir.set(dx / d, 0, dz / d)
    } else {
      this.dir.set(_v.x, 0, _v.z)
    }
    // anti-stuck: if barely moving while trying to, sidestep briefly
    if (this.sideStep > 0) {
      this.sideStep -= dt
      const sx = -this.dir.z * this.sideSign,
        sz = this.dir.x * this.sideSign
      this.dir.set(this.dir.x * 0.3 + sx, 0, this.dir.z * 0.3 + sz).normalize()
    }
    return d
  }

  physics(dt, grounded = true) {
    const ctx = this.ctx
    const cw = ctx.cw
    // external forces decay
    const ed = Math.exp(-3.2 * dt)
    // separation
    for (const o of ctx.enemies.list) {
      if (o === this || !o.alive) continue
      const dx = this.pos.x - o.pos.x,
        dz = this.pos.z - o.pos.z
      const rr = this.radius + o.radius
      const d2 = dx * dx + dz * dz
      if (d2 < rr * rr && d2 > 1e-6 && Math.abs(this.pos.y - o.pos.y) < 2) {
        const d = Math.sqrt(d2)
        const push = (rr - d) * 6
        this.vel.x += (dx / d) * push * dt * 8
        this.vel.z += (dz / d) * push * dt * 8
      }
    }
    let mx = (this.vel.x + this.ext.x) * dt
    let mz = (this.vel.z + this.ext.z) * dt
    this.ext.x *= ed
    this.ext.z *= ed
    if (this.flying) {
      this.pos.x += mx
      this.pos.z += mz
      this.pos.y += (this.vel.y + this.ext.y) * dt
      this.ext.y *= ed
    } else {
      const steps = Math.max(1, Math.ceil(Math.max(Math.abs(mx), Math.abs(mz)) / 0.25))
      mx /= steps
      mz /= steps
      for (let s = 0; s < steps; s++) {
        this.pos.x += mx
        this.pos.z += mz
        this.collideXZ(cw)
      }
      // vertical
      const floor = cw.groundAt(this.pos.x, this.pos.z, this.pos.y + 0.65, this.radius * 0.5)
      this.vy += this.ext.y
      this.ext.y = 0
      if (this.vy > 0 || this.pos.y > floor + 0.05) {
        this.airborne = true
        this.vy -= 22 * ctx.dims.gravityScale * dt
        this.pos.y += this.vy * dt
        if (this.pos.y <= floor) {
          this.pos.y = floor
          this.vy = 0
          this.airborne = false
          this.onLand?.()
        }
        // head bump
        const top = cw.overlap(
          this.pos.x - 0.2,
          this.pos.y + this.height - 0.2,
          this.pos.z - 0.2,
          this.pos.x + 0.2,
          this.pos.y + this.height,
          this.pos.z + 0.2,
          _hits
        )
        if (top.length && this.vy > 0) this.vy = 0
      } else {
        this.pos.y = floor
        this.vy = 0
        this.airborne = false
      }
    }
    // island boundary
    const r = Math.hypot(this.pos.x, this.pos.z)
    if (r > 48.5) {
      this.pos.x *= 48.5 / r
      this.pos.z *= 48.5 / r
    }
    if (this.pos.y < -20) this.pos.set(0, 0, 30)
    // stuck detection
    this.stuckT += dt
    if (this.stuckT > 0.8) {
      const moved = Math.hypot(this.pos.x - this.lastPos.x, this.pos.z - this.lastPos.z)
      const wanted = Math.hypot(this.vel.x, this.vel.z) * this.stuckT
      if (wanted > 1.5 && moved < wanted * 0.2) {
        this.sideStep = 0.7
        this.sideSign = Math.random() < 0.5 ? -1 : 1
      }
      this.lastPos.copy(this.pos)
      this.stuckT = 0
    }
    this.root.position.copy(this.pos)
  }

  collideXZ(cw) {
    const r = this.radius
    const p = this.pos
    const feet = p.y
    cw.overlap(p.x - r, feet + 0.55, p.z - r, p.x + r, feet + this.height, p.z + r, _hits)
    for (const c of _hits) {
      if (c.max.y <= feet + 0.6) continue
      const cx = clamp(p.x, c.min.x, c.max.x),
        cz = clamp(p.z, c.min.z, c.max.z)
      let dx = p.x - cx,
        dz = p.z - cz
      const d2 = dx * dx + dz * dz
      if (d2 > r * r) continue
      if (d2 < 1e-8) {
        // centre inside the box: push along the shallowest axis
        const l = p.x - c.min.x,
          rr = c.max.x - p.x,
          b = p.z - c.min.z,
          f = c.max.z - p.z
        const m = Math.min(l, rr, b, f)
        if (m === l) p.x = c.min.x - r
        else if (m === rr) p.x = c.max.x + r
        else if (m === b) p.z = c.min.z - r
        else p.z = c.max.z + r
      } else {
        const d = Math.sqrt(d2)
        p.x = cx + (dx / d) * r
        p.z = cz + (dz / d) * r
      }
    }
  }

  faceToward(x, z, dt, rate = 8) {
    const target = Math.atan2(x - this.pos.x, z - this.pos.z)
    let d = target - this.yaw
    while (d > Math.PI) d -= Math.PI * 2
    while (d < -Math.PI) d += Math.PI * 2
    this.yaw += d * (1 - Math.exp(-rate * dt))
    this.root.rotation.y = this.yaw
  }

  baseUpdate(dt) {
    this.st += dt
    this.animT += dt
    this.flash = Math.max(0, this.flash - dt * 6)
    this.stun = Math.max(0, this.stun - dt)
    this.destab = Math.max(0, this.destab - dt)
    for (const m of this.mats) {
      m.userData.u.uFlash.value = this.flash * 0.7
      m.userData.u.uTime.value += dt
    }
  }

  // Small parts (claws, eyes, spikes) don't need their own shadow draw call.
  trimShadows(minRadius = 0.16) {
    this.root.traverse((o) => {
      if (!o.isMesh || !o.castShadow) return
      if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere()
      const s = Math.max(o.scale.x, o.scale.y, o.scale.z)
      if (o.geometry.boundingSphere.radius * s < minRadius) o.castShadow = false
    })
  }

  dispose() {
    this.ctx.scene.remove(this.root)
    this.root.traverse((o) => {
      if (o.isMesh && o.userData.ownGeo) o.geometry.dispose()
    })
    this.removed = true
  }
}
