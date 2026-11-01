// Player arsenal: Pulse Rifle (hitscan), Singularity Launcher (projectile ->
// gravity well) and Phase Cannon (charged piercing beam that passes through
// energy barriers, enemies and destabilises Warden shields).
import * as THREE from 'three'
import { clamp } from '../core/utils.js'

export const WEAPON_DEFS = [
  { id: 'pulse', name: 'PULSE RIFLE', short: 'PULSE', mag: 30, reserve: 150, reserveMax: 300, rate: 10.5, dmg: 15, reload: 1.35, icon: 'rifle' },
  { id: 'singularity', name: 'SINGULARITY LAUNCHER', short: 'SINGULARITY', mag: 3, reserve: 6, reserveMax: 12, rate: 1.0, dmg: 80, reload: 1.9, icon: 'launcher' },
  { id: 'phase', name: 'PHASE CANNON', short: 'PHASE', energy: true, cost: 34, regen: 9, charge: 0.55, dmg: 95, icon: 'cannon' },
]

const _o = new THREE.Vector3(),
  _d = new THREE.Vector3(),
  _p = new THREE.Vector3(),
  _m = new THREE.Vector3()
const _hit = {}
const _eh = []

export class Weapons {
  constructor(ctx) {
    this.ctx = ctx
    this.reset()
  }

  reset() {
    this.state = WEAPON_DEFS.map((d) => ({ mag: d.mag ?? 0, reserve: d.reserve ?? 0, energy: 100 }))
    this.current = 0
    this.cd = 0
    this.reloading = 0
    this.bloom = 0
    this.charge = 0
    this.charging = false
    this.shots = 0
    this.hits = 0
    this.switchLock = 0
  }

  get def() {
    return WEAPON_DEFS[this.current]
  }
  get cur() {
    return this.state[this.current]
  }

  select(i) {
    if (i === this.current || i < 0 || i >= WEAPON_DEFS.length) return
    this.current = i
    this.reloading = 0
    this.charging = false
    this.charge = 0
    this.switchLock = 0.3
    this.ctx.viewmodel.select(i)
    this.ctx.audio?.play('switch')
    this.ctx.hud?.onWeaponChange(i)
  }

  startReload() {
    const d = this.def,
      s = this.cur
    if (d.energy || this.reloading > 0 || s.mag >= d.mag || s.reserve <= 0) return
    this.reloading = d.reload
    this.ctx.viewmodel.reload(d.reload)
    this.ctx.audio?.play('reload')
  }

  addAmmo(frac = 0.5) {
    for (let i = 0; i < WEAPON_DEFS.length; i++) {
      const d = WEAPON_DEFS[i]
      if (d.energy) this.state[i].energy = 100
      else this.state[i].reserve = Math.min(d.reserveMax, this.state[i].reserve + Math.ceil(d.reserveMax * frac))
    }
  }

  // ------------------------------------------------------------ update
  update(dt, input, active) {
    const ctx = this.ctx
    const pl = ctx.player
    this.cd = Math.max(0, this.cd - dt)
    this.switchLock = Math.max(0, this.switchLock - dt)
    this.bloom = Math.max(0, this.bloom - dt * 2.4)
    // energy regen (phase cannon)
    const ps = this.state[2]
    ps.energy = Math.min(100, ps.energy + WEAPON_DEFS[2].regen * dt)

    if (this.reloading > 0) {
      this.reloading -= dt
      if (this.reloading <= 0) {
        const d = this.def,
          s = this.cur
        const need = d.mag - s.mag
        const take = Math.min(need, s.reserve)
        s.mag += take
        s.reserve -= take
      }
    }
    if (!active || !pl.alive) {
      this.charging = false
      this.charge = 0
      ctx.viewmodel.charge = 0
      return
    }
    // switching
    if (input.hit('Digit1')) this.select(0)
    if (input.hit('Digit2')) this.select(1)
    if (input.hit('Digit3')) this.select(2)
    if (input.mouse.wheel) this.select((this.current + (input.mouse.wheel > 0 ? 1 : 2)) % 3)
    if (input.hit('KeyR')) this.startReload()

    const d = this.def,
      s = this.cur
    const canFire = this.switchLock <= 0 && this.reloading <= 0 && !pl.sprinting
    if (d.id === 'pulse') {
      if (input.mouse.left && canFire && this.cd <= 0) {
        if (s.mag > 0) {
          this.firePulse()
          s.mag--
          this.cd = 1 / (d.rate * (pl.boostT > 0 ? 1.25 : 1))
        } else if (input.mouse.leftPressed) ctx.audio?.play('empty')
      }
      if (s.mag === 0 && s.reserve > 0 && this.reloading <= 0) this.startReload()
    } else if (d.id === 'singularity') {
      if (input.mouse.leftPressed && canFire && this.cd <= 0) {
        if (s.mag > 0) {
          this.fireOrb()
          s.mag--
          this.cd = 1 / d.rate
        } else ctx.audio?.play('empty')
      }
      if (s.mag === 0 && s.reserve > 0 && this.reloading <= 0 && this.cd <= 0) this.startReload()
    } else if (d.id === 'phase') {
      if (input.mouse.left && canFire && this.cd <= 0 && s.energy >= d.cost) {
        if (!this.charging) {
          this.charging = true
          ctx.audio?.play('charge')
        }
        this.charge = Math.min(1, this.charge + dt / d.charge)
      } else if (input.mouse.left && s.energy < d.cost && input.mouse.leftPressed) ctx.audio?.play('empty')
      if (this.charging && (!input.mouse.left || !canFire)) {
        if (this.charge >= 0.3 && canFire) {
          this.firePhase(this.charge)
          s.energy -= d.cost
          this.cd = 0.45
        }
        this.charging = false
        this.charge = 0
        ctx.audio?.stop('charge')
      }
      ctx.viewmodel.charge = this.charge
    }
  }

  aimRay(spread) {
    const cam = this.ctx.camera
    _o.copy(cam.position)
    cam.getWorldDirection(_d)
    if (spread > 0) {
      // cone sampling
      const a = Math.random() * Math.PI * 2,
        r = Math.sqrt(Math.random()) * spread
      const right = _p.set(1, 0, 0).applyQuaternion(cam.quaternion)
      const up = _m.set(0, 1, 0).applyQuaternion(cam.quaternion)
      _d.addScaledVector(right, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r).normalize()
    }
  }

  muzzleWorld(out) {
    const ctx = this.ctx
    ctx.viewmodel.muzzleCamSpace(out)
    return ctx.camera.localToWorld(out)
  }

  // trace the world + enemies + props; returns closest hit info
  trace(maxT, pierceBarrier = false) {
    const ctx = this.ctx
    let best = { t: maxT, kind: 'none' }
    const wh = ctx.cw.raycast(_o.x, _o.y, _o.z, _d.x, _d.y, _d.z, maxT, { pierceBarrier }, _hit)
    if (wh) best = { t: wh.t, kind: wh.c.kind === 'barrier' ? 'barrier' : 'world', n: new THREE.Vector3(wh.nx, wh.ny, wh.nz), c: wh.c }
    if (_d.y < 0) {
      const tg = -_o.y / _d.y
      if (tg < best.t) best = { t: tg, kind: 'world', n: new THREE.Vector3(0, 1, 0) }
    }
    const ph = ctx.props.raycast(_o, _d, best.t)
    if (ph) best = { t: ph.t, kind: 'prop', p: ph.p, n: _d.clone().negate() }
    const eh = ctx.enemies.raycast(_o, _d, best.t, _eh)
    if (eh.length) best = { t: eh[0].t, kind: 'enemy', e: eh[0].enemy, crit: eh[0].crit, mult: eh[0].mult, n: _d.clone().negate() }
    return best
  }

  firePulse() {
    const ctx = this.ctx
    const pl = ctx.player
    const vm = ctx.viewmodel
    const moving = Math.hypot(pl.vel.x, pl.vel.z) > 1 ? 0.012 : 0
    const air = pl.onGround ? 0 : 0.02
    const spread = (0.004 + this.bloom * 0.022 + moving + air) * (1 - vm.ads * 0.7)
    this.aimRay(spread)
    const hit = this.trace(160)
    const end = _p.copy(_o).addScaledVector(_d, hit.t)
    this.applyHit(hit, end, WEAPON_DEFS[0].dmg, 'pulse', 2.5)
    const from = this.muzzleWorld(new THREE.Vector3())
    const acc = vm.accentRGB
    ctx.fx.tracer(from, end, [acc[0] * 0.3 + 0.35, acc[1] * 0.3 + 0.35, acc[2] * 0.3 + 0.35], 0.009, 0.05)
    vm.fire(0.55)
    pl.recoil += 0.011 * (1 - vm.ads * 0.4)
    pl.recoilYaw += (Math.random() - 0.5) * 0.006
    this.bloom = Math.min(1, this.bloom + 0.12)
    ctx.audio?.play('pulse')
    this.shots++
  }

  fireOrb() {
    const ctx = this.ctx
    const pl = ctx.player
    this.aimRay(0)
    const from = this.muzzleWorld(new THREE.Vector3())
    // aim the orb so it converges on the crosshair target
    const hit = this.trace(80)
    const target = _p.copy(_o).addScaledVector(_d, Math.max(4, hit.t))
    const dir = target.sub(from).normalize()
    ctx.projectiles.playerOrb(from, dir.multiplyScalar(36).add(new THREE.Vector3(0, 1.5, 0)))
    ctx.viewmodel.fire(1.4)
    pl.recoil += 0.05
    pl.trauma = Math.min(1, pl.trauma + 0.15)
    ctx.audio?.play('launcher')
    this.shots++
  }

  firePhase(charge) {
    const ctx = this.ctx
    const pl = ctx.player
    this.aimRay(0)
    const dmg = WEAPON_DEFS[2].dmg * (0.45 + 0.55 * charge) * ctx.game.damageMul
    // beam passes through barriers and enemies; stops at solid geometry
    const wh = ctx.cw.raycast(_o.x, _o.y, _o.z, _d.x, _d.y, _d.z, 200, { pierceBarrier: true }, _hit)
    let maxT = wh ? wh.t : 200
    if (_d.y < 0) maxT = Math.min(maxT, -_o.y / _d.y)
    const hits = ctx.enemies.raycast(_o, _d, maxT, _eh)
    let n = 0
    const seen = new Set()
    for (const h of hits) {
      if (seen.has(h.enemy)) continue
      seen.add(h.enemy)
      const point = _o.clone().addScaledVector(_d, h.t)
      const crit = h.crit ? 1.5 : 1
      const dealt = h.enemy.damage(dmg * crit * Math.pow(0.85, n), { weapon: 'phase', point, dir: _d.clone(), knock: 6 })
      ctx.hud?.hitMarker(h.crit, !h.enemy.alive)
      ctx.hud?.damageNumber(point, dealt, h.crit)
      ctx.fx.burst(point, 16, { color: [1.6, 0.6, 3.2], speed: 6, size: 0.12, life: 0.4 })
      this.hits++
      if (++n >= 4) break
    }
    // props along the beam
    for (const p of ctx.props.props) {
      if (!p.alive) continue
      const c = p.body.position
      const along = (c.x - _o.x) * _d.x + (c.y - _o.y) * _d.y + (c.z - _o.z) * _d.z
      if (along < 0 || along > maxT) continue
      const px = c.x - _o.x - _d.x * along,
        py = c.y - _o.y - _d.y * along,
        pz = c.z - _o.z - _d.z * along
      if (px * px + py * py + pz * pz < (p.radius + 0.3) ** 2) {
        ctx.props.impulse(p, _d.x * 20, _d.y * 20 + 4, _d.z * 20)
        ctx.props.damage(p, 40)
      }
    }
    // barriers crossed flare up
    for (const b of ctx.arena.barriers) {
      if (!ctx.cw.active(b.col)) continue
      const r = ctx.cw.raycast(_o.x, _o.y, _o.z, _d.x, _d.y, _d.z, maxT, { only: b.col }, {})
      if (r) {
        b.mat.uniforms.uHit.value = ctx.time
        ctx.fx.burst(_o.clone().addScaledVector(_d, r.t), 20, { color: [1.6, 0.5, 3.0], speed: 5, size: 0.1, life: 0.4 })
      }
    }
    const end = _o.clone().addScaledVector(_d, maxT)
    const from = this.muzzleWorld(new THREE.Vector3())
    const acc = ctx.viewmodel.accentRGB
    ctx.fx.beam(from, end, [acc[0] * 0.55 + 0.2, acc[1] * 0.55 + 0.15, acc[2] * 0.55 + 0.4])
    if (wh) ctx.fx.impact(end, new THREE.Vector3(wh.nx, wh.ny, wh.nz), [1.6, 0.6, 3.2], true)
    ctx.viewmodel.fire(1.6)
    pl.recoil += 0.06
    pl.trauma = Math.min(1, pl.trauma + 0.2)
    ctx.audio?.play('phase')
    ctx.fx.light(end, 0xa070ff, 25, 0.15, 10)
    this.shots++
  }

  applyHit(hit, end, baseDmg, weapon, knock) {
    const ctx = this.ctx
    const dmgMul = ctx.game.damageMul
    if (hit.kind === 'enemy') {
      const crit = hit.crit
      const dmg = baseDmg * (hit.mult || 1) * dmgMul
      const dealt = hit.e.damage(dmg, { weapon, point: end.clone(), dir: _d.clone(), knock })
      const shielded = dealt < dmg * 0.5
      ctx.fx.impact(end, hit.n, shielded ? [0.4, 1.6, 2.6] : [3, 0.5, 1.2])
      ctx.hud?.hitMarker(crit, !hit.e.alive, shielded)
      ctx.hud?.damageNumber(end, dealt, crit, shielded)
      if (!shielded) ctx.audio?.play(crit ? 'hitCrit' : 'hit')
      this.hits++
    } else if (hit.kind === 'prop') {
      ctx.props.impulse(hit.p, _d.x * knock * 2, _d.y * knock * 2 + 1, _d.z * knock * 2)
      ctx.props.damage(hit.p, baseDmg)
      ctx.fx.impact(end, hit.n, [2.6, 1.6, 0.6])
      ctx.audio?.play('impactMetal', 0.5, end)
    } else if (hit.kind === 'barrier') {
      ctx.game.onBarrierHit(hit.c, end)
      ctx.fx.impact(end, hit.n, [1.6, 0.5, 3.0])
    } else if (hit.kind === 'world') {
      ctx.fx.impact(end, hit.n, [1.4, 1.6, 2.2])
      if (Math.random() < 0.3) ctx.audio?.play('impact', 0.4, end)
    }
  }
}
