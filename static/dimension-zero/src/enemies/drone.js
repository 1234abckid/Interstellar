// Training drone: a hovering holographic target projected by ARC during
// calibration. Never attacks. The shielded variant only takes full damage from
// the Phase Cannon or while the player is in the Fracture.
import * as THREE from 'three'
import { Enemy } from './enemy.js'

const DEF = { type: 'drone', hp: 30, radius: 0.6, height: 1.2, flying: true, knockScale: 0.6 }
let GEO = null

export class TrainingDrone extends Enemy {
  constructor(ctx, pos, opts = {}) {
    super(ctx, pos, { ...DEF, hp: opts.shielded ? 60 : 30 })
    if (!GEO)
      GEO = {
        ring: new THREE.TorusGeometry(0.55, 0.05, 8, 40),
        ring2: new THREE.TorusGeometry(0.38, 0.03, 6, 32),
        core: new THREE.IcosahedronGeometry(0.2, 1),
        shield: new THREE.IcosahedronGeometry(0.95, 2),
      }
    this.shieldedType = !!opts.shielded
    const col = opts.shielded ? new THREE.Color(0.4, 1.6, 2.8) : new THREE.Color(2.8, 1.5, 0.35)
    this.ringMat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.9 })
    this.coreMat = new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(1.3) })
    const g = new THREE.Group()
    const r1 = new THREE.Mesh(GEO.ring, this.ringMat)
    const r2 = new THREE.Mesh(GEO.ring2, this.ringMat)
    const core = new THREE.Mesh(GEO.core, this.coreMat)
    g.add(r1, r2, core)
    this.root.add(g)
    this.r1 = r1
    this.r2 = r2
    this.core = core
    if (opts.shielded) {
      this.shield = new THREE.Mesh(
        GEO.shield,
        new THREE.MeshBasicMaterial({
          color: new THREE.Color(0.3, 1.0, 1.8),
          transparent: true,
          opacity: 0.22,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          wireframe: true,
        })
      )
      this.root.add(this.shield)
    }
    this.hitSpheres.push({ obj: core, r: 0.62, mult: 1 })
    this.baseY = pos.y
    this.seed = Math.random() * 10
    this.root.scale.setScalar(0.01)
    this.drift = opts.drift || 0
  }

  get shielded() {
    return this.shieldedType && this.ctx.dims.current !== 2
  }

  armor(info) {
    if (this.shielded && info.weapon !== 'phase') return 0.06
    return 1
  }

  onHurt(dealt, info) {
    if (this.shielded && info.weapon !== 'phase') {
      this.ctx.fx.burst(info.point || this.center.clone(), 6, {
        color: [0.4, 1.6, 2.6],
        speed: 4,
        size: 0.08,
        life: 0.25,
      })
      this.ctx.audio?.play('shieldHit', 0.7, this.pos)
      if (!this._hinted) {
        this._hinted = true
        this.ctx.hud?.toast('SHIELDED · USE THE PHASE CANNON [3]', 'cyan')
      }
    } else this.ctx.audio?.play('sphereHit', 1, this.pos)
  }

  onDeath() {
    const c = this.center.clone()
    const col = this.shieldedType ? [0.4, 1.6, 2.8] : [2.8, 1.5, 0.35]
    this.ctx.fx.burst(c, 34, { color: col, speed: 6, size: 0.12, life: 0.6, gravity: 2 })
    this.ctx.fx.ring(c, 2.5, new THREE.Color(col[0] / 3, col[1] / 3, col[2] / 3), 0.35, new THREE.Vector3(0, 0, 1))
    this.ctx.audio?.play('sphereDie', 0.7, this.pos)
  }

  update(dt) {
    this.baseUpdate(dt)
    const t = this.animT
    if (this.state === 'dead') {
      this.deathT += dt
      this.root.scale.setScalar(Math.max(0.001, 1 - this.deathT * 4))
      if (this.deathT > 0.3) this.dispose()
      return
    }
    if (this.state === 'spawn') {
      const k = Math.min(1, this.st / 0.5)
      this.root.scale.setScalar(Math.max(0.01, k))
      if (k >= 1) this.state = 'hover'
    }
    this.pos.y = this.baseY + Math.sin(t * 1.6 + this.seed) * 0.25
    if (this.drift) this.pos.x += Math.sin(t * 0.7 + this.seed) * this.drift * dt
    this.root.position.copy(this.pos)
    const pl = this.ctx.player
    this.root.lookAt(pl.pos.x, pl.pos.y + 1.6, pl.pos.z)
    this.r1.rotation.z = t * 1.2
    this.r2.rotation.z = -t * 2.0
    this.core.scale.setScalar(1 + this.flash * 0.6)
    if (this.shield) {
      this.shield.visible = this.shielded
      this.shield.rotation.y = t * 0.6
      this.shield.material.opacity = 0.18 + this.flash * 0.5
    }
  }
}
