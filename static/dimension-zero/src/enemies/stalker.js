// RIFT STALKER — fast melee hunter. Long asymmetric limbs, one oversized eye,
// luminous markings. Closes distance, telegraphs (crouch + screech) and lunges.
// Inverted: loses footing (slow, floaty, cannot lunge).
// Fracture: enraged (faster) and blinks through space toward the player.
import * as THREE from 'three'
import { Enemy, alienMaterial } from './enemy.js'
import { bevelBox } from '../world/geometry.js'
import { clamp, damp } from '../core/utils.js'

const DEF = { type: 'stalker', hp: 70, radius: 0.55, height: 2.0, knockScale: 1.2 }
let GEO = null
function geos() {
  if (GEO) return GEO
  GEO = {
    torso: new THREE.SphereGeometry(1, 16, 12),
    rib: bevelBox(0.5, 0.05, 0.3, 0.02),
    head: new THREE.ConeGeometry(0.2, 0.62, 8),
    carapace: new THREE.SphereGeometry(1, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55),
    mandible: new THREE.ConeGeometry(0.04, 0.3, 5),
    jaw: new THREE.ConeGeometry(0.1, 0.32, 5),
    eyeBig: new THREE.SphereGeometry(0.075, 12, 10),
    eyeSmall: new THREE.SphereGeometry(0.03, 8, 6),
    limb: new THREE.CylinderGeometry(0.075, 0.05, 1, 8),
    limbThick: new THREE.CylinderGeometry(0.11, 0.075, 1, 8),
    claw: new THREE.ConeGeometry(0.045, 0.46, 5),
    spike: new THREE.ConeGeometry(0.04, 0.26, 5),
    strip: new THREE.BoxGeometry(0.012, 1, 0.012),
    joint: new THREE.SphereGeometry(0.085, 10, 8),
  }
  // pivot limbs at the top
  GEO.limb.translate(0, -0.5, 0)
  GEO.limbThick.translate(0, -0.5, 0)
  GEO.strip.translate(0, -0.5, 0)
  GEO.claw.translate(0, -0.17, 0)
  GEO.claw.rotateX(Math.PI)
  return GEO
}

export class RiftStalker extends Enemy {
  constructor(ctx, pos) {
    super(ctx, pos, DEF)
    const g = geos()
    const body = alienMaterial(0x1e1530, [0.9, 0.25, 1.8], { pulse: 0.3, transparent: true })
    const plate = alienMaterial(0x2a2140, [0.5, 0.2, 1.0], { roughness: 0.25, metalness: 0.6 })
    this.mats.push(body, plate)
    this.bodyMat = body
    const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.0, 0.35, 1.2) })
    const glowSoft = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.4, 2.6), transparent: true, opacity: 0.85 })
    this.glowMat = glow
    const M = (geo, m, x = 0, y = 0, z = 0) => {
      const o = new THREE.Mesh(geo, m)
      o.position.set(x, y, z)
      o.castShadow = true
      return o
    }
    const root = this.root
    const hips = new THREE.Group()
    hips.position.y = 0.95
    root.add(hips)
    const spine = new THREE.Group()
    spine.rotation.x = 0.55
    hips.add(spine)
    const torso = M(g.torso, body, 0, 0.42, 0)
    torso.scale.set(0.32, 0.55, 0.27)
    spine.add(torso)
    // armoured carapace over the back, asymmetric shoulder hump
    const shell = M(g.carapace, plate, 0.04, 0.5, -0.06)
    shell.scale.set(0.4, 0.55, 0.36)
    shell.rotation.x = -1.2
    spine.add(shell)
    const hump = M(g.torso, plate, -0.16, 0.78, -0.1)
    hump.scale.set(0.16, 0.14, 0.15)
    spine.add(hump)
    for (let i = 0; i < 4; i++) {
      const r = M(g.rib, plate, 0, 0.2 + i * 0.15, 0.08)
      r.scale.set(1 - i * 0.12, 1, 1)
      r.rotation.x = -0.2
      spine.add(r)
    }
    // back spikes w/ glowing tips
    for (let i = 0; i < 5; i++) {
      const s = M(g.spike, plate, 0, 0.15 + i * 0.16, -0.17)
      s.rotation.x = -0.9
      spine.add(s)
      const tip = M(g.eyeSmall, glowSoft, 0, 0.27 + i * 0.16, -0.27)
      spine.add(tip)
    }
    // head (asymmetric)
    const neck = new THREE.Group()
    neck.position.set(0, 0.9, 0.05)
    spine.add(neck)
    const head = new THREE.Group()
    neck.add(head)
    const skull = M(g.head, body, 0, 0.05, 0.18)
    skull.rotation.x = Math.PI / 2 + 0.25
    skull.scale.set(1.15, 1, 0.8)
    head.add(skull)
    const crest = M(g.spike, plate, 0.06, 0.18, -0.02)
    crest.rotation.set(-1.0, 0, -0.3)
    crest.scale.set(1.3, 1.8, 1.3)
    head.add(crest)
    const jaw = M(g.jaw, plate, 0, -0.1, 0.24)
    jaw.rotation.x = Math.PI / 2 + 0.5
    jaw.scale.set(1.4, 1.2, 1.4)
    head.add(jaw)
    this.jaw = jaw
    for (const sx of [-1, 1]) {
      const md = M(g.mandible, plate, sx * 0.11, -0.06, 0.3)
      md.rotation.set(Math.PI / 2 + 0.3, 0, sx * 0.5)
      head.add(md)
    }
    const eye = M(g.eyeBig, glow, 0.08, 0.08, 0.27)
    eye.scale.set(1.35, 1.6, 0.9)
    head.add(eye)
    head.add(M(g.eyeSmall, glow, -0.06, 0.06, 0.3), M(g.eyeSmall, glow, -0.09, 0.0, 0.26))
    // arms — left noticeably longer than right
    const mkArm = (side, len) => {
      const sh = new THREE.Group()
      sh.position.set(side * 0.22, 0.75, 0.05)
      spine.add(sh)
      sh.add(M(g.joint, plate))
      const up = M(g.limbThick, body)
      up.scale.set(1, len * 0.55, 1)
      sh.add(up)
      const strip = M(g.strip, glowSoft, side * 0.05, 0, 0.03)
      strip.scale.y = len * 0.5
      sh.add(strip)
      const el = new THREE.Group()
      el.position.y = -len * 0.55
      sh.add(el)
      el.add(M(g.joint, plate))
      const fo = M(g.limb, body)
      fo.scale.set(1, len * 0.6, 1)
      el.add(fo)
      const wr = new THREE.Group()
      wr.position.y = -len * 0.6
      el.add(wr)
      for (let k = -1; k <= 1; k++) {
        const c = M(g.claw, plate, k * 0.035, 0, 0)
        c.rotation.set(0.3, 0, k * 0.25)
        c.scale.set(1, 1 + (k === 0 ? 0.4 : 0), 1)
        wr.add(c)
      }
      return { sh, el, wr }
    }
    this.armL = mkArm(-1, 1.25)
    this.armR = mkArm(1, 1.0)
    // digitigrade legs
    const mkLeg = (side) => {
      const th = new THREE.Group()
      th.position.set(side * 0.16, 0, 0)
      hips.add(th)
      const thigh = M(g.limbThick, body)
      thigh.scale.set(1.1, 0.5, 1.1)
      th.add(thigh)
      const kn = new THREE.Group()
      kn.position.y = -0.5
      th.add(kn)
      kn.add(M(g.joint, plate))
      const shin = M(g.limb, body)
      shin.scale.set(1.1, 0.52, 1.1)
      kn.add(shin)
      const strip = M(g.strip, glowSoft, 0, 0, 0.05)
      strip.scale.y = 0.45
      kn.add(strip)
      const an = new THREE.Group()
      an.position.y = -0.52
      kn.add(an)
      const foot = M(g.limb, plate)
      foot.scale.set(0.9, 0.3, 0.9)
      an.add(foot)
      return { th, kn, an }
    }
    this.legL = mkLeg(-1)
    this.legR = mkLeg(1)
    this.hips = hips
    this.spine = spine
    this.neck = neck
    this.root.userData.baseScale = 1.22
    this.hitSpheres.push({ obj: torso, r: 0.48, mult: 1 }, { obj: hips, r: 0.36, mult: 0.9 }, { obj: head, offset: null, r: 0.26, mult: 1.8, crit: true }, { obj: this.legL.kn, r: 0.16, mult: 0.7 }, { obj: this.legR.kn, r: 0.16, mult: 0.7 })
    this.root.scale.setScalar(0.01)
    this.gait = 0
    this.attackCD = 0
    this.blinkCD = 3 + Math.random() * 2
    this.lungeDir = new THREE.Vector3()
    this.hitDone = false
    this.floatPhase = Math.random() * 6
  }

  armor(info) {
    let m = super.armor(info)
    return m
  }

  onHurt(dealt, info) {
    if (this.alive && dealt > 18 && this.state !== 'lunge') {
      this.state = 'flinch'
      this.st = 0
    }
    if (info.weapon === 'phase') this.stun = Math.max(this.stun, 0.9)
    this.ctx.audio?.play('stalkerHit', 1, this.pos)
  }

  onDeath(info) {
    this.ctx.audio?.play('stalkerDie', 1, this.pos)
    const c = this.center.clone()
    this.ctx.fx.burst(c, 40, { color: [1.6, 0.4, 2.6], speed: 7, size: 0.16, life: 0.8, gravity: 6 })
    this.ctx.fx.burst(c, 20, { color: [3, 0.4, 1.2], speed: 4, size: 0.1, life: 0.5, gravity: 10 })
    this.deathDir = info.dir ? info.dir.clone() : new THREE.Vector3(0, 0, 1)
  }

  update(dt) {
    this.baseUpdate(dt)
    const ctx = this.ctx
    const pl = ctx.player
    const dim = ctx.dims.current
    this.attackCD = Math.max(0, this.attackCD - dt)
    this.blinkCD = Math.max(0, this.blinkCD - dt)
    // dimension-dependent body: translucent and drifting in Inverted
    const wb = ctx.dims.w.y
    this.bodyMat.opacity = 1 - wb * 0.45
    this.bodyMat.userData.u.uRim.value.setRGB(0.9 + ctx.dims.w.z * 1.4, 0.25, 1.8 - ctx.dims.w.z * 0.4)

    if (this.state === 'dead') {
      this.deathT += dt
      const k = Math.min(1, this.deathT / 0.5)
      this.root.rotation.x = -k * 1.4
      this.root.position.y = this.pos.y - k * 0.2
      this.root.scale.setScalar(1.22 * Math.max(0.001, 1 - Math.max(0, this.deathT - 0.6) * 2))
      if (this.deathT > 1.2) this.dispose()
      return
    }
    if (this.state === 'spawn') {
      const k = Math.min(1, this.st / 0.8)
      this.root.scale.setScalar(Math.max(0.01, k) * 1.22)
      if (k >= 1) {
        this.state = 'chase'
        this.st = 0
        ctx.audio?.play('stalkerScreech', 0.6, this.pos)
      }
      this.physics(dt)
      return
    }
    const sp = dim === 1 ? 0.6 : dim === 2 ? 1.3 : 1
    const toP = pl.pos.clone().sub(this.pos)
    const flatD = Math.hypot(toP.x, toP.z)
    const vertD = pl.pos.y - this.pos.y

    if (this.stun > 0 && this.state !== 'lunge') {
      this.dir.set(0, 0, 0)
      this.steer(dt, 0, 6)
      this.animate(dt, 0, 'stun')
      this.physics(dt)
      return
    }

    switch (this.state) {
      case 'chase': {
        this.pathTo(pl.pos, dt)
        this.steer(dt, 8.2 * sp)
        this.faceToward(this.pos.x + this.vel.x, this.pos.z + this.vel.z, dt, 10)
        if (pl.alive && flatD < 2.1 && Math.abs(vertD) < 1.6 && this.attackCD <= 0) {
          this.state = 'swipe'
          this.st = 0
          this.hitDone = false
        } else if (pl.alive && dim !== 1 && flatD < 8 && flatD > 3.5 && Math.abs(vertD) < 3.5 && this.attackCD <= 0 && ctx.cw.los(this.pos.x, this.pos.y + 1, this.pos.z, pl.pos.x, pl.pos.y + 1, pl.pos.z)) {
          this.state = 'windup'
          this.st = 0
          ctx.audio?.play('stalkerScreech', 1, this.pos)
        } else if (dim === 2 && this.blinkCD <= 0 && flatD > 9 && flatD < 30) {
          this.blink(toP, flatD)
        }
        this.animate(dt, Math.hypot(this.vel.x, this.vel.z), 'run')
        break
      }
      case 'windup': {
        this.dir.set(0, 0, 0)
        this.steer(dt, 0, 10)
        this.faceToward(pl.pos.x, pl.pos.z, dt, 14)
        this.animate(dt, 0, 'windup')
        if (this.st > 0.42) {
          this.state = 'lunge'
          this.st = 0
          this.hitDone = false
          this.lungeDir.set(toP.x / flatD, 0, toP.z / flatD)
          this.vel.set(this.lungeDir.x * 15 * Math.min(1.2, sp), 0, this.lungeDir.z * 15 * Math.min(1.2, sp))
          this.vy = 4.5 + Math.max(0, vertD) * 1.4
          ctx.audio?.play('lunge', 1, this.pos)
        }
        break
      }
      case 'lunge': {
        this.animate(dt, 0, 'lunge')
        if (!this.hitDone && pl.alive) {
          const d = this.pos.distanceTo(pl.pos)
          if (d < 1.8) {
            this.hitDone = true
            pl.takeDamage(16 * ctx.game.enemyDamageMul, this.pos, 'melee')
            ctx.fx.burst(pl.pos.clone().setY(pl.pos.y + 1.2), 10, { color: [3, 0.3, 0.6], speed: 4, size: 0.08, life: 0.3 })
          }
        }
        if (this.st > 0.55 && !this.airborne) {
          this.state = 'recover'
          this.st = 0
          this.attackCD = 1.0
        }
        break
      }
      case 'swipe': {
        this.dir.set(0, 0, 0)
        this.steer(dt, 1.5, 6)
        this.faceToward(pl.pos.x, pl.pos.z, dt, 12)
        this.animate(dt, 0, 'swipe')
        if (!this.hitDone && this.st > 0.26) {
          this.hitDone = true
          if (pl.alive && this.pos.distanceTo(pl.pos) < 2.6 && Math.abs(vertD) < 1.8) {
            pl.takeDamage(11 * ctx.game.enemyDamageMul, this.pos, 'melee')
            ctx.audio?.play('claw', 1, this.pos)
          } else ctx.audio?.play('whoosh', 0.6, this.pos)
        }
        if (this.st > 0.6) {
          this.state = 'chase'
          this.st = 0
          this.attackCD = 0.55
        }
        break
      }
      case 'recover':
      case 'flinch': {
        this.dir.set(0, 0, 0)
        this.steer(dt, 0, 8)
        this.animate(dt, 0, this.state)
        if (this.st > (this.state === 'flinch' ? 0.28 : 0.45)) {
          this.state = 'chase'
          this.st = 0
        }
        break
      }
    }
    this.physics(dt)
    // Inverted: lose footing, hover slightly
    if (wb > 0.01) this.root.position.y = this.pos.y + wb * (0.35 + Math.sin(this.animT * 2 + this.floatPhase) * 0.2)
  }

  blink(toP, flatD) {
    const ctx = this.ctx
    const step = Math.min(6, flatD - 4)
    const nx = this.pos.x + (toP.x / flatD) * step,
      nz = this.pos.z + (toP.z / flatD) * step
    // only blink into open, walkable space
    const g = ctx.cw.groundAt(nx, nz, this.pos.y + 0.6, 0.3)
    const blocked = ctx.cw.overlap(nx - 0.4, g + 0.6, nz - 0.4, nx + 0.4, g + 1.7, nz + 0.4, []).length > 0
    this.blinkCD = 3.5 + Math.random() * 2
    if (blocked || g < -1) return
    ctx.fx.burst(this.center.clone(), 24, { color: [2.4, 0.4, 2.2], speed: 3, size: 0.14, life: 0.4, gravity: 0 })
    this.pos.set(nx, g, nz)
    this.root.position.copy(this.pos)
    ctx.fx.burst(this.center.clone(), 24, { color: [2.4, 0.4, 2.2], speed: 3, size: 0.14, life: 0.4, gravity: 0 })
    ctx.audio?.play('blink', 1, this.pos)
  }

  animate(dt, speed, mode) {
    const t = this.animT
    if (mode === 'run') this.gait += dt * (2 + speed * 1.25)
    const p = this.gait
    const run = clamp(speed / 8, 0, 1)
    const L = this.legL,
      R = this.legR
    const lerpTo = (o, prop, v, k = 12) => (o[prop] = damp(o[prop], v, k, dt))
    if (mode === 'run' || mode === 'stun') {
      const s = Math.sin(p),
        c = Math.sin(p + Math.PI)
      lerpTo(L.th.rotation, 'x', -0.4 + s * 0.8 * run)
      lerpTo(R.th.rotation, 'x', -0.4 + c * 0.8 * run)
      lerpTo(L.kn.rotation, 'x', 0.9 + Math.max(0, Math.cos(p)) * 0.8 * run)
      lerpTo(R.kn.rotation, 'x', 0.9 + Math.max(0, Math.cos(p + Math.PI)) * 0.8 * run)
      lerpTo(L.an.rotation, 'x', -0.7)
      lerpTo(R.an.rotation, 'x', -0.7)
      lerpTo(this.armL.sh.rotation, 'x', 0.2 + c * 0.7 * run)
      lerpTo(this.armR.sh.rotation, 'x', 0.2 + s * 0.7 * run)
      lerpTo(this.armL.el.rotation, 'x', -0.6)
      lerpTo(this.armR.el.rotation, 'x', -0.6)
      lerpTo(this.spine.rotation, 'x', 0.55 + run * 0.35 + (mode === 'stun' ? Math.sin(t * 30) * 0.08 : 0))
      this.hips.position.y = 0.95 + Math.abs(Math.sin(p)) * 0.08 * run
      lerpTo(this.jaw.rotation, 'x', Math.PI / 2 + 0.5)
      // subtly unnatural: head twitches
      this.neck.rotation.z = Math.sin(t * 7.3) * 0.05 + (Math.sin(t * 1.1) > 0.97 ? 0.4 : 0)
    } else if (mode === 'windup') {
      lerpTo(this.hips.position, 'y', 0.65, 10)
      lerpTo(this.spine.rotation, 'x', 1.05, 10)
      lerpTo(this.armL.sh.rotation, 'x', -1.8, 10)
      lerpTo(this.armR.sh.rotation, 'x', -1.6, 10)
      lerpTo(this.armL.sh.rotation, 'z', -0.6, 10)
      lerpTo(this.armR.sh.rotation, 'z', 0.6, 10)
      lerpTo(this.jaw.rotation, 'x', Math.PI / 2 + 1.1, 14)
      lerpTo(L.th.rotation, 'x', -1.0)
      lerpTo(R.th.rotation, 'x', -1.0)
      lerpTo(L.kn.rotation, 'x', 1.8)
      lerpTo(R.kn.rotation, 'x', 1.8)
      this.root.position.x = this.pos.x + Math.sin(t * 60) * 0.02
    } else if (mode === 'lunge') {
      lerpTo(this.hips.position, 'y', 0.95, 10)
      lerpTo(this.spine.rotation, 'x', 1.2, 14)
      lerpTo(this.armL.sh.rotation, 'x', -2.6, 16)
      lerpTo(this.armR.sh.rotation, 'x', -2.5, 16)
      lerpTo(this.armL.el.rotation, 'x', -0.1, 16)
      lerpTo(this.armR.el.rotation, 'x', -0.1, 16)
      lerpTo(L.th.rotation, 'x', 0.6)
      lerpTo(R.th.rotation, 'x', 0.6)
      lerpTo(L.kn.rotation, 'x', 0.4)
      lerpTo(R.kn.rotation, 'x', 0.4)
    } else if (mode === 'swipe') {
      const k = clamp(this.st / 0.3, 0, 1)
      this.armR.sh.rotation.x = -2.2 + k * 2.6
      this.armR.sh.rotation.z = 0.9 - k * 1.6
      this.armR.el.rotation.x = -0.3
      lerpTo(this.spine.rotation, 'y', -0.4 + k * 0.8, 20)
      lerpTo(this.jaw.rotation, 'x', Math.PI / 2 + 1.0, 14)
    } else {
      // recover / flinch
      lerpTo(this.spine.rotation, 'x', mode === 'flinch' ? 0.1 : 0.7, 14)
      lerpTo(this.hips.position, 'y', 0.9, 10)
      lerpTo(this.armL.sh.rotation, 'z', 0, 8)
      lerpTo(this.armR.sh.rotation, 'z', 0, 8)
      lerpTo(this.spine.rotation, 'y', 0, 8)
    }
    if (mode !== 'swipe') lerpTo(this.spine.rotation, 'y', 0, 8)
    if (mode !== 'windup') {
      lerpTo(this.armL.sh.rotation, 'z', 0, 8)
      lerpTo(this.armR.sh.rotation, 'z', 0, 8)
    }
  }
}
