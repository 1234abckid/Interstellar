// First-person player controller: kinematic AABB body with per-axis sweeps,
// step-up, ground snapping, coyote time, jump buffering, sprint, slide,
// Void Dash, Speed Boost and Dimension Slam. Movement is always relative to
// the camera yaw so controls stay predictable inside gravity anomalies.
import * as THREE from 'three'
import { clamp, damp, lerp } from '../core/utils.js'

const R = 0.38
const H = 1.8
const STEP = 0.62
const EPS = 0.001
const _hits = []

export class Player {
  constructor(ctx) {
    this.ctx = ctx
    this.pos = new THREE.Vector3(0, 0, 20)
    this.vel = new THREE.Vector3()
    this.yaw = 0
    this.pitch = 0
    this.onGround = false
    this.wasGround = false
    this.coyote = 0
    this.jumpBuf = 0
    this.maxHealth = 100
    this.health = 100
    this.alive = true
    this.eye = 1.62
    this.eyeCur = 1.62
    this.stepSmooth = 0
    this.landDip = 0
    this.bobPhase = 0
    this.bob = 0
    this.recoil = 0 // camera pitch kick (radians), recovers
    this.recoilYaw = 0
    this.trauma = 0
    this.fovKick = 0
    this.sprinting = false
    this.moving = false
    this.slideT = 0
    this.dashT = 0
    this.dashCD = 0
    this.boostT = 0
    this.boostCD = 0
    this.slamCD = 0
    this.slamming = false
    this.invuln = 0
    this.overcharge = 0
    this.lastSafe = this.pos.clone()
    this.dashDir = new THREE.Vector3()
    this.inLowGrav = false
    this.inLift = false
    this.damageTaken = 0
    this.regenDelay = 0
    this.DASH_CD = 3.2
    this.BOOST_CD = 16
    this.SLAM_CD = 6
    this.fallVel = 0
  }

  reset(spawn) {
    this.pos.copy(spawn)
    this.vel.set(0, 0, 0)
    this.yaw = 0
    this.pitch = 0
    this.health = this.maxHealth
    this.alive = true
    this.slideT = this.dashT = this.boostT = 0
    this.dashCD = this.boostCD = this.slamCD = 0
    this.slamming = false
    this.invuln = 0
    this.overcharge = 0
    this.recoil = this.recoilYaw = this.trauma = 0
    this.lastSafe.copy(spawn)
  }

  get speedMul() {
    return this.boostT > 0 ? 1.35 : 1
  }

  forward(out) {
    return out.set(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch))
  }

  // ------------------------------------------------------------ collision
  overlaps(px, py, pz, out = _hits) {
    return this.ctx.cw.overlap(px - R, py, pz - R, px + R, py + H, pz + R, out)
  }

  // Resolve penetration (geometry that appeared around us, moving slabs, etc.)
  depenetrate() {
    const p = this.pos
    for (let iter = 0; iter < 4; iter++) {
      const hits = this.overlaps(p.x, p.y, p.z)
      if (!hits.length) return
      const c = hits[0]
      const up = c.max.y - p.y
      const opts = [
        [up, 0, up + EPS, 0],
        [p.x + R - c.min.x, -(p.x + R - c.min.x) - EPS, 0, 0],
        [c.max.x - (p.x - R), c.max.x - (p.x - R) + EPS, 0, 0],
        [p.z + R - c.min.z, 0, 0, -(p.z + R - c.min.z) - EPS],
        [c.max.z - (p.z - R), 0, 0, c.max.z - (p.z - R) + EPS],
      ]
      // prefer popping up when only a short ledge rose under us
      let best = up < 1.2 ? opts[0] : null
      if (!best) for (const o of opts) if (!best || o[0] < best[0]) best = o
      p.x += best[1]
      p.y += best[2]
      p.z += best[3]
      if (best[2] > 0) {
        this.vel.y = Math.max(0, this.vel.y)
        this.onGround = true
      }
    }
  }

  moveAxis(axis, amt) {
    if (amt === 0) return false
    const p = this.pos
    p[axis] += amt
    const hits = this.overlaps(p.x, p.y, p.z)
    if (!hits.length) return false
    if (axis === 'y') {
      if (amt < 0) {
        let top = -Infinity
        for (const c of hits) top = Math.max(top, c.max.y)
        p.y = top + EPS
        this.onGround = true
        this.fallVel = this.vel.y
        this.vel.y = 0
      } else {
        let bot = Infinity
        for (const c of hits) bot = Math.min(bot, c.min.y)
        p.y = bot - H - EPS
        this.vel.y = Math.min(0, this.vel.y)
      }
      return true
    }
    // horizontal: try stepping up onto low obstacles
    let top = -Infinity
    for (const c of hits) top = Math.max(top, c.max.y)
    if ((this.onGround || this.coyote > 0) && top - p.y <= STEP && top - p.y > 0) {
      const oy = p.y
      if (!this.overlaps(p.x, top + EPS, p.z).length) {
        p.y = top + EPS
        this.stepSmooth -= p.y - oy
        return false
      }
    }
    // slide along: push out of the deepest contact on this axis
    if (amt > 0) {
      let m = Infinity
      for (const c of hits) m = Math.min(m, c.min[axis])
      p[axis] = m - R - EPS
    } else {
      let m = -Infinity
      for (const c of hits) m = Math.max(m, c.max[axis])
      p[axis] = m + R + EPS
    }
    this.vel[axis] = 0
    return true
  }

  // ------------------------------------------------------------ update
  update(dt, input, active) {
    const ctx = this.ctx
    const dims = ctx.dims
    this.invuln = Math.max(0, this.invuln - dt)
    this.dashCD = Math.max(0, this.dashCD - dt)
    this.boostCD = Math.max(0, this.boostCD - dt)
    this.slamCD = Math.max(0, this.slamCD - dt)
    this.boostT = Math.max(0, this.boostT - dt)
    this.overcharge = Math.max(0, this.overcharge - dt)
    this.regenDelay = Math.max(0, this.regenDelay - dt)

    // look
    if (active) {
      const s = 0.0022 * input.sensitivity
      this.yaw -= input.mouse.dx * s
      this.pitch -= input.mouse.dy * s
      this.pitch = clamp(this.pitch, -1.5, 1.5)
    }
    // recoil recovery
    this.recoil = damp(this.recoil, 0, 9, dt)
    this.recoilYaw = damp(this.recoilYaw, 0, 9, dt)
    this.trauma = Math.max(0, this.trauma - dt * 1.6)

    if (!this.alive) {
      this.vel.set(0, this.vel.y - 20 * dt, 0)
      this.eye = damp(this.eye, 0.4, 3, dt)
      this.integrate(dt)
      return
    }

    // zones
    let gScale = dims.gravityScale
    this.inLift = false
    this.inLowGrav = false
    let liftZone = null
    for (const z of ctx.arena.zones) {
      if (!z.active) continue
      const p = this.pos
      if (p.x > z.min.x && p.x < z.max.x && p.z > z.min.z && p.z < z.max.z && p.y > z.min.y - 0.1 && p.y < z.max.y + 1.5) {
        if (z.type === 'float') {
          gScale *= z.gravity
          this.inLowGrav = true
        } else if (z.type === 'lift') {
          liftZone = z
          this.inLift = true
        }
      }
    }
    const G = 24 * gScale

    // input
    let fx = 0,
      fz = 0
    if (active) {
      if (input.down('KeyW')) fz -= 1
      if (input.down('KeyS')) fz += 1
      if (input.down('KeyA')) fx -= 1
      if (input.down('KeyD')) fx += 1
    }
    const len = Math.hypot(fx, fz)
    if (len > 0) {
      fx /= len
      fz /= len
    }
    const sin = Math.sin(this.yaw),
      cos = Math.cos(this.yaw)
    const wx = fx * cos + fz * sin
    const wz = -fx * sin + fz * cos
    this.moving = len > 0
    this.sprinting = active && input.down('ShiftLeft') && fz < 0 && this.slideT <= 0
    const maxSpeed = (this.sprinting ? 10.6 : 7.0) * this.speedMul

    // abilities
    if (active) {
      if (input.hit('Space')) this.jumpBuf = 0.13
      const crouch = input.hit('KeyC')
      if (crouch) {
        const hsp = Math.hypot(this.vel.x, this.vel.z)
        if (this.onGround && hsp > 6 && this.slideT <= 0) {
          this.slideT = 0.85
          const k = Math.max(hsp, 13.5) / hsp
          this.vel.x *= k
          this.vel.z *= k
          ctx.audio?.play('slide')
        } else if (!this.onGround && this.slamCD <= 0 && !this.slamming) {
          const g = ctx.cw.groundAt(this.pos.x, this.pos.z, this.pos.y, R)
          if (this.pos.y - g > 1.1) {
            this.slamming = true
            this.vel.set(this.vel.x * 0.2, -34, this.vel.z * 0.2)
            this.slamCD = this.SLAM_CD
            ctx.audio?.play('slamStart')
          }
        }
      }
      if (input.hit('KeyE') && this.dashCD <= 0) {
        this.dashT = 0.17
        this.dashCD = this.DASH_CD
        this.invuln = Math.max(this.invuln, 0.25)
        if (len > 0) this.dashDir.set(wx, 0, wz)
        else this.dashDir.set(-sin, 0, -cos)
        this.fovKick = 1
        ctx.audio?.play('dash')
        ctx.hud?.pulseAbility('E')
      }
      if (input.hit('KeyF') && this.boostCD <= 0) {
        this.boostT = this.BOOST_DUR || 5
        this.boostCD = this.BOOST_CD
        ctx.audio?.play('boost')
        ctx.hud?.pulseAbility('F')
      }
    }
    this.jumpBuf = Math.max(0, this.jumpBuf - dt)

    // horizontal velocity
    if (this.dashT > 0) {
      this.dashT -= dt
      this.vel.x = this.dashDir.x * 30
      this.vel.z = this.dashDir.z * 30
      this.vel.y = Math.max(this.vel.y, 0.5)
      ctx.fx.emit(this.pos.x + (Math.random() - 0.5), this.pos.y + 0.6 + Math.random(), this.pos.z + (Math.random() - 0.5), 0, 0, 0, 0.6, 0.4, 1.6, 0.25, 0.35, 0, 0)
      if (this.dashT <= 0) {
        this.vel.x *= 0.45
        this.vel.z *= 0.45
      }
    } else if (this.slideT > 0) {
      this.slideT -= dt
      const f = Math.exp(-1.6 * dt)
      this.vel.x *= f
      this.vel.z *= f
      // slight steering
      this.vel.x += wx * 8 * dt
      this.vel.z += wz * 8 * dt
      if (!this.onGround) this.slideT = Math.min(this.slideT, 0.1)
    } else if (this.onGround) {
      const tx = wx * maxSpeed,
        tz = wz * maxSpeed
      const ax = tx - this.vel.x,
        az = tz - this.vel.z
      const al = Math.hypot(ax, az)
      const acc = (len > 0 ? 75 : 55) * dt
      if (al > acc) {
        this.vel.x += (ax / al) * acc
        this.vel.z += (az / al) * acc
      } else {
        this.vel.x = tx
        this.vel.z = tz
      }
    } else if (len > 0) {
      // air control: steer toward wish direction without exceeding speed cap
      const hsp = Math.hypot(this.vel.x, this.vel.z)
      const cap = Math.max(hsp, maxSpeed)
      this.vel.x += wx * 26 * dt
      this.vel.z += wz * 26 * dt
      const n = Math.hypot(this.vel.x, this.vel.z)
      if (n > cap) {
        this.vel.x *= cap / n
        this.vel.z *= cap / n
      }
    }

    // vertical
    if (this.onGround) this.coyote = 0.12
    else this.coyote = Math.max(0, this.coyote - dt)
    if (this.jumpBuf > 0 && this.coyote > 0 && this.dashT <= 0) {
      this.vel.y = 8.4
      this.onGround = false
      this.coyote = 0
      this.jumpBuf = 0
      if (this.slideT > 0) this.slideT = 0
      ctx.audio?.play('jump')
    }
    if (liftZone) {
      this.vel.y = Math.min(this.vel.y + 44 * dt, 10)
      if (this.pos.y > liftZone.topY - 3) {
        this.vel.x += liftZone.push.x * 30 * dt
        this.vel.z += liftZone.push.z * 30 * dt
      }
      if (this.pos.y > liftZone.topY) this.vel.y = Math.min(this.vel.y, 2)
      this.onGround = false
    } else {
      // gravity always applies so the ground probe stays stable every frame
      this.vel.y -= G * dt
      if (this.vel.y < -55) this.vel.y = -55
    }

    this.integrate(dt)

    // hazards (Fracture rifts)
    if (dims.current === 2) {
      for (const hz of ctx.arena.hazards) {
        const dx = this.pos.x - hz.x,
          dz = this.pos.z - hz.z
        if (dx * dx + dz * dz < hz.r * hz.r && this.pos.y < 0.8) {
          this.takeDamage(22 * dt, null, 'rift')
          if (Math.random() < 0.3) ctx.fx.emit(this.pos.x, 0.2, this.pos.z, (Math.random() - 0.5) * 3, 4, (Math.random() - 0.5) * 3, 3, 1, 0.2, 0.2, 0.4, 6, 1)
        }
      }
    }

    // passive regeneration after not taking damage for a while
    if (this.regenDelay <= 0 && this.health < 50) this.health = Math.min(50, this.health + 6 * dt)

    // camera feel
    const hsp = Math.hypot(this.vel.x, this.vel.z)
    const targetEye = this.slideT > 0 ? 1.0 : 1.62
    this.eye = damp(this.eye, targetEye, 12, dt)
    this.stepSmooth = damp(this.stepSmooth, 0, 14, dt)
    this.landDip = damp(this.landDip, 0, 8, dt)
    if (this.onGround && hsp > 1 && this.slideT <= 0) {
      this.bobPhase += dt * hsp * 1.15
      this.bob = damp(this.bob, 1, 8, dt)
    } else this.bob = damp(this.bob, 0, 6, dt)
    this.fovKick = damp(this.fovKick, 0, 5, dt)
  }

  integrate(dt) {
    const ctx = this.ctx
    this.depenetrate()
    const wasGround = this.onGround
    const maxD = Math.max(Math.abs(this.vel.x), Math.abs(this.vel.y), Math.abs(this.vel.z)) * dt
    const n = Math.min(8, Math.max(1, Math.ceil(maxD / 0.22)))
    const sdt = dt / n
    let landedThisFrame = false
    for (let i = 0; i < n; i++) {
      this.moveAxis('x', this.vel.x * sdt)
      this.moveAxis('z', this.vel.z * sdt)
      this.onGround = false
      const hitY = this.moveAxis('y', this.vel.y * sdt)
      if (hitY && this.onGround) landedThisFrame = true
    }
    // keep grounded when walking down steps/slopes
    if (!this.onGround && wasGround && this.vel.y <= 0) {
      const g = ctx.cw.groundAt(this.pos.x, this.pos.z, this.pos.y + 0.01, R - 0.02)
      if (g > -Infinity && this.pos.y - g < STEP + 0.05 && this.pos.y - g > 0) {
        this.stepSmooth += this.pos.y - g
        this.pos.y = g + EPS
        this.onGround = true
        this.vel.y = 0
      }
    }
    if (landedThisFrame && !wasGround) {
      const impact = -this.fallVel
      if (impact > 6) {
        this.landDip = -Math.min(0.22, impact * 0.012)
        ctx.audio?.play('land', Math.min(1, impact / 20))
      }
      if (this.slamming) {
        this.slamming = false
        ctx.game?.onSlam(this.pos.clone())
      }
    }
    // arena boundary
    const r = Math.hypot(this.pos.x, this.pos.z)
    if (r > ctx.cw.boundsR) {
      this.pos.x *= ctx.cw.boundsR / r
      this.pos.z *= ctx.cw.boundsR / r
    }
    if (this.onGround && this.alive) this.lastSafe.copy(this.pos)
    if (this.pos.y < -30) {
      this.pos.copy(this.lastSafe).y += 1
      this.vel.set(0, 0, 0)
      this.takeDamage(15, null, 'fall')
    }
  }

  applyCamera(cam, t) {
    const bobY = Math.sin(this.bobPhase * 2) * 0.03 * this.bob
    const bobX = Math.cos(this.bobPhase) * 0.02 * this.bob
    const shake = this.trauma * this.trauma
    const sx = (Math.sin(t * 47) + Math.sin(t * 31)) * 0.5 * shake * 0.02
    const sy = (Math.sin(t * 53) + Math.sin(t * 29)) * 0.5 * shake * 0.02
    this.eyeCur = this.eye
    cam.position.set(this.pos.x + bobX * Math.cos(this.yaw), this.pos.y + this.eye + bobY + this.stepSmooth + this.landDip, this.pos.z - bobX * Math.sin(this.yaw))
    cam.rotation.order = 'YXZ'
    cam.rotation.set(this.pitch + this.recoil + sy, this.yaw + this.recoilYaw + sx, 0)
  }

  heal(n) {
    this.health = Math.min(this.maxHealth, this.health + n)
  }

  takeDamage(amount, fromPos, type) {
    if (!this.alive || amount <= 0) return
    if (this.invuln > 0 && type !== 'rift') return
    if (this.ctx.game?.godMode) return
    amount *= this.armorMul || 1
    this.health -= amount
    this.regenDelay = 5
    this.damageTaken += amount
    if (type !== 'rift') this.trauma = Math.min(1, this.trauma + amount / 40)
    this.ctx.hud?.onDamage(amount, fromPos, type)
    if (type !== 'rift' || Math.random() < 0.1) this.ctx.audio?.play('hurt', Math.min(1, amount / 25))
    if (this.health <= 0) {
      this.health = 0
      this.alive = false
      this.ctx.game?.onPlayerDeath()
    }
  }
}
