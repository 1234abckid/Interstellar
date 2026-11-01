// DIMENSION SPHERE — flying support drone. Tethers a protective link to the
// nearest ally (halving damage it takes) and spits spines at the player.
// In the Fracture it appears in several places at once (only one is real).
import * as THREE from 'three'
import { Enemy, alienMaterial } from './enemy.js'
import { damp } from '../core/utils.js'

const DEF = { type: 'sphere', hp: 55, radius: 0.7, height: 1.2, flying: true, knockScale: 1.5 }
let GEO = null
function geos() {
  if (GEO) return GEO
  GEO = { body: new THREE.IcosahedronGeometry(0.55, 2), spike: new THREE.ConeGeometry(0.08, 0.6, 5), eye: new THREE.SphereGeometry(0.2, 14, 10), ring: new THREE.TorusGeometry(0.85, 0.035, 6, 40), link: new THREE.CylinderGeometry(0.03, 0.03, 1, 6, 1, true) }
  GEO.link.translate(0, 0.5, 0)
  GEO.link.rotateX(Math.PI / 2)
  return GEO
}

export class DimensionSphere extends Enemy {
  constructor(ctx, pos) {
    super(ctx, pos, DEF)
    const g = geos()
    const shell = alienMaterial(0x24203a, [1.0, 0.3, 1.8], { roughness: 0.3, metalness: 0.7 })
    this.mats.push(shell)
    const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 0.5, 2.8) })
    const body = new THREE.Group()
    body.add(new THREE.Mesh(g.body, shell))
    const dirs = []
    for (let i = 0; i < 14; i++) {
      const k = i + 0.5
      const phi = Math.acos(1 - (2 * k) / 14),
        th = Math.PI * (1 + Math.sqrt(5)) * k
      dirs.push(new THREE.Vector3(Math.cos(th) * Math.sin(phi), Math.cos(phi), Math.sin(th) * Math.sin(phi)))
    }
    for (const d of dirs) {
      const s = new THREE.Mesh(g.spike, shell)
      s.position.copy(d).multiplyScalar(0.62)
      s.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d)
      body.add(s)
    }
    const eye = new THREE.Mesh(g.eye, glow)
    eye.position.z = 0.42
    body.add(eye)
    body.traverse((o) => o.isMesh && (o.castShadow = true))
    this.root.add(body)
    this.ring = new THREE.Mesh(g.ring, glow)
    this.root.add(this.ring)
    this.body = body
    this.eye = eye
    this.linkMesh = new THREE.Mesh(g.link, new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 1.6, 2.6), transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }))
    this.linkMesh.frustumCulled = false
    ctx.scene.add(this.linkMesh)
    // ghost echoes (Fracture)
    this.ghosts = [0, 1].map(() => {
      const gm = body.clone()
      gm.traverse((o) => {
        if (o.isMesh) o.material = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.2, 0.3, 1.8), transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false })
      })
      ctx.scene.add(gm)
      return gm
    })
    this.hitSpheres.push({ obj: body, r: 0.75, mult: 1 }, { obj: eye, r: 0.22, mult: 1.8, crit: true })
    this.root.scale.setScalar(0.01)
    this.orbitA = Math.random() * Math.PI * 2
    this.altitude = 4.5 + Math.random() * 2.5
    this.shotCD = 2 + Math.random() * 2
    this.target = null
    this.retarget = 0
    this.pos.y = this.altitude
  }

  onHurt() {
    this.ctx.audio?.play('sphereHit', 1, this.pos)
  }
  onDeath() {
    this.ctx.audio?.play('sphereDie', 1, this.pos)
    const c = this.pos.clone().setY(this.pos.y + 0.6)
    this.ctx.fx.explosion(c, 3, [2.4, 0.5, 2.8])
    if (this.target) this.target.linked = null
    this.linkMesh.visible = false
    this.vy = 0
  }
  dispose() {
    this.ctx.scene.remove(this.linkMesh)
    this.ghosts.forEach((g) => this.ctx.scene.remove(g))
    super.dispose()
  }

  update(dt) {
    this.baseUpdate(dt)
    const ctx = this.ctx
    const pl = ctx.player
    const t = this.animT
    if (this.state === 'dead') {
      this.deathT += dt
      this.vy -= 18 * dt
      this.pos.y = Math.max(0.5, this.pos.y + this.vy * dt)
      this.root.position.copy(this.pos)
      this.body.rotation.x += dt * 8
      this.ghosts.forEach((g) => (g.visible = false))
      if (this.deathT > 0.8) this.dispose()
      return
    }
    if (this.state === 'spawn') {
      const k = Math.min(1, this.st / 0.8)
      this.root.scale.setScalar(Math.max(0.01, k))
      if (k >= 1) this.state = 'hover'
    }
    // pick an ally to protect
    this.retarget -= dt
    if (this.retarget <= 0 || (this.target && !this.target.alive)) {
      this.retarget = 2
      if (this.target) this.target.linked = null
      this.target = null
      let best = 1e9
      for (const e of ctx.enemies.list) {
        if (!e.alive || e === this || e.type === 'sphere' || e.linked) continue
        const d = e.pos.distanceTo(this.pos)
        if (d < best) {
          best = d
          this.target = e
        }
      }
      if (this.target) this.target.linked = this
    }
    // orbit around the protected ally (or the player at a distance)
    const anchor = this.target ? this.target.pos : pl.pos
    const radius = this.target ? 4 : 12
    this.orbitA += dt * 0.6
    const tx = anchor.x + Math.cos(this.orbitA) * radius
    const tz = anchor.z + Math.sin(this.orbitA) * radius
    const ty = Math.max(anchor.y, 0) + this.altitude + Math.sin(t * 1.3) * 0.5
    this.vel.x = damp(this.vel.x, (tx - this.pos.x) * 1.5, 3, dt)
    this.vel.z = damp(this.vel.z, (tz - this.pos.z) * 1.5, 3, dt)
    this.vel.y = damp(this.vel.y, (ty - this.pos.y) * 1.5, 3, dt)
    const sp = Math.hypot(this.vel.x, this.vel.z)
    if (sp > 7) {
      this.vel.x *= 7 / sp
      this.vel.z *= 7 / sp
    }
    this.physics(dt)
    // look at player
    const eyeW = this.root.position
    this.body.lookAt(pl.pos.x, pl.pos.y + 1.4, pl.pos.z)
    this.ring.rotation.x = t * 1.4
    this.ring.rotation.y = t * 0.9
    // link beam
    if (this.target && this.target.alive) {
      const to = this.target.center.clone()
      this.linkMesh.visible = true
      this.linkMesh.position.copy(eyeW)
      this.linkMesh.lookAt(to)
      this.linkMesh.scale.set(1 + Math.sin(t * 20) * 0.3, 1 + Math.sin(t * 20) * 0.3, eyeW.distanceTo(to))
    } else this.linkMesh.visible = false
    // spines
    this.shotCD -= dt
    if (this.shotCD <= 0 && pl.alive && this.state !== 'spawn') {
      this.shotCD = 2.2 + Math.random() * 1.5
      const from = this.root.position.clone()
      const to = pl.pos.clone().setY(pl.pos.y + 1.2)
      if (ctx.cw.los(from.x, from.y, from.z, to.x, to.y, to.z)) {
        const dir = to.sub(from).normalize()
        ctx.projectiles.enemyShot(from, dir.multiplyScalar(24), { dmg: 7 * ctx.game.enemyDamageMul, size: 0.14, color: [2.4, 0.5, 2.8] })
        ctx.audio?.play('sphereShot', 1, this.pos)
      }
    }
    // Fracture echoes
    const wc = ctx.dims.w.z
    this.ghosts.forEach((g, i) => {
      g.visible = wc > 0.2
      const a = this.orbitA + (i + 1) * 2.1
      g.position.set(anchor.x + Math.cos(a) * radius, this.pos.y + Math.sin(t * 2 + i) * 0.6, anchor.z + Math.sin(a) * radius)
      g.rotation.copy(this.body.rotation)
      g.scale.setScalar(this.root.scale.x)
    })
  }
}
