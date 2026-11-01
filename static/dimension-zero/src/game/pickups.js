// Pickups: health crosses, ammo cells and Overcharge orbs. Map pickups respawn;
// enemy drops expire. All are pooled per type.
import * as THREE from 'three'
import { bevelBox } from '../world/geometry.js'

const TYPES = {
  health: { color: [0.4, 2.2, 3.0], respawn: 30 },
  ammo: { color: [2.6, 1.8, 0.5], respawn: 25 },
  overcharge: { color: [2.4, 0.6, 3.2], respawn: 50 },
}

export class Pickups {
  constructor(ctx) {
    this.ctx = ctx
    this.items = []
    const glow = (c) => new THREE.MeshBasicMaterial({ color: new THREE.Color(...c) })
    this.mats = {
      health: glow(TYPES.health.color),
      ammo: glow(TYPES.ammo.color),
      overcharge: glow(TYPES.overcharge.color),
    }
    this.dark = new THREE.MeshStandardMaterial({ color: 0x22222c, metalness: 0.9, roughness: 0.3 })
    this.halo = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.25,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  }

  makeMesh(type) {
    const g = new THREE.Group()
    if (type === 'health') {
      g.add(new THREE.Mesh(bevelBox(0.16, 0.5, 0.12, 0.03), this.mats.health))
      g.add(new THREE.Mesh(bevelBox(0.5, 0.16, 0.12, 0.03), this.mats.health))
    } else if (type === 'ammo') {
      g.add(new THREE.Mesh(bevelBox(0.5, 0.32, 0.32, 0.04), this.dark))
      g.add(new THREE.Mesh(bevelBox(0.52, 0.06, 0.34, 0.01), this.mats.ammo))
      g.add(new THREE.Mesh(bevelBox(0.1, 0.2, 0.34, 0.01), this.mats.ammo))
    } else {
      g.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 1), this.mats.overcharge))
      const r = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.025, 6, 32), this.mats.overcharge)
      r.name = 'ring'
      g.add(r)
    }
    const halo = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.55, 32), this.halo)
    halo.rotation.x = -Math.PI / 2
    halo.name = 'halo'
    g.add(halo)
    this.ctx.scene.add(g)
    return g
  }

  spawnMap(spots) {
    for (const s of spots) this.add(s.type, new THREE.Vector3(s.x, s.y, s.z), { respawn: TYPES[s.type].respawn })
  }

  add(type, pos, opts = {}) {
    const mesh = this.makeMesh(type)
    mesh.position.copy(pos)
    const it = {
      type,
      pos: pos.clone(),
      mesh,
      active: true,
      timer: 0,
      respawn: opts.respawn || 0,
      life: opts.life || 0,
      seed: Math.random() * 6,
    }
    this.items.push(it)
    return it
  }

  drop(type, pos) {
    const p = pos.clone()
    p.y = Math.max(p.y, this.ctx.cw.groundAt(p.x, p.z, p.y + 0.5, 0.2))
    this.add(type, p, { life: 22 })
  }

  update(dt) {
    const ctx = this.ctx
    const pl = ctx.player
    const t = ctx.time
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i]
      if (!it.active) {
        it.timer -= dt
        if (it.timer <= 0) {
          it.active = true
          it.mesh.visible = true
          ctx.fx.burst(it.pos.clone().setY(it.pos.y + 0.8), 14, {
            color: TYPES[it.type].color,
            speed: 3,
            size: 0.1,
            life: 0.5,
            gravity: 0,
          })
        }
        continue
      }
      if (it.life) {
        it.life -= dt
        if (it.life <= 0) {
          ctx.scene.remove(it.mesh)
          this.items.splice(i, 1)
          continue
        }
        it.mesh.visible = it.life > 4 || Math.sin(t * 20) > 0
      }
      it.mesh.position.set(it.pos.x, it.pos.y + 0.8 + Math.sin(t * 2 + it.seed) * 0.12, it.pos.z)
      it.mesh.rotation.y = t * 1.5 + it.seed
      const halo = it.mesh.getObjectByName('halo')
      if (halo) {
        halo.position.y = -0.75 - Math.sin(t * 2 + it.seed) * 0.12
        halo.scale.setScalar(1 + Math.sin(t * 3 + it.seed) * 0.1)
      }
      const ring = it.mesh.getObjectByName('ring')
      if (ring) ring.rotation.x = t * 2
      // collect
      const dx = pl.pos.x - it.pos.x,
        dy = pl.pos.y + 0.9 - (it.pos.y + 0.8),
        dz = pl.pos.z - it.pos.z
      if (pl.alive && dx * dx + dz * dz < 1.6 * 1.6 && Math.abs(dy) < 1.6) {
        if (this.apply(it.type)) {
          ctx.fx.burst(it.mesh.position, 20, {
            color: TYPES[it.type].color,
            speed: 4,
            size: 0.12,
            life: 0.5,
            gravity: 0,
          })
          if (it.respawn) {
            it.active = false
            it.mesh.visible = false
            it.timer = it.respawn
          } else {
            ctx.scene.remove(it.mesh)
            this.items.splice(i, 1)
          }
        }
      }
    }
  }

  apply(type) {
    const ctx = this.ctx
    const pl = ctx.player
    if (type === 'health') {
      if (pl.health >= pl.maxHealth) return false
      pl.heal(35)
      ctx.hud?.toast('+35 HEALTH', 'cyan')
      ctx.audio?.play('pickup')
    } else if (type === 'ammo') {
      ctx.weapons.addAmmo(0.4)
      ctx.hud?.toast('AMMO RESTORED', 'amber')
      ctx.audio?.play('pickup')
    } else {
      pl.overcharge = 15
      ctx.hud?.toast('OVERCHARGE · +50% DAMAGE', 'violet')
      ctx.audio?.play('power')
    }
    return true
  }

  clear() {
    for (const it of this.items) ctx_remove(this.ctx, it.mesh)
    this.items.length = 0
  }
}
function ctx_remove(ctx, m) {
  ctx.scene.remove(m)
}
