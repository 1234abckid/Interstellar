// Impact decals: scorched bullet marks left on world geometry. Fixed pool,
// oldest mark is recycled, each fades out over its last seconds.
import * as THREE from 'three'
import { genImpactDecal } from '../core/textures.js'

const MAX = 90
const LIFE = 24

export class Decals {
  constructor(ctx) {
    this.ctx = ctx
    const tex = genImpactDecal(128)
    this.geo = new THREE.PlaneGeometry(1, 1)
    this.items = []
    for (let i = 0; i < MAX; i++) {
      const mat = new THREE.MeshStandardMaterial({
        map: tex,
        transparent: true,
        depthWrite: false,
        roughness: 0.95,
        metalness: 0,
        polygonOffset: true,
        polygonOffsetFactor: -4,
        polygonOffsetUnits: -4,
        emissive: new THREE.Color(1.0, 0.35, 0.05),
        emissiveMap: tex,
        emissiveIntensity: 0,
      })
      const m = new THREE.Mesh(this.geo, mat)
      m.visible = false
      m.renderOrder = 2
      ctx.scene.add(m)
      this.items.push({ m, t: 0 })
    }
    this.head = 0
    this._v = new THREE.Vector3()
  }

  add(point, normal, size = 0.32) {
    const d = this.items[this.head]
    this.head = (this.head + 1) % MAX
    const m = d.m
    m.position.copy(point).addScaledVector(normal, 0.012)
    m.lookAt(this._v.copy(m.position).add(normal))
    m.rotateZ(Math.random() * Math.PI * 2)
    const s = size * (0.75 + Math.random() * 0.5)
    m.scale.set(s, s, s)
    m.visible = true
    m.material.opacity = 0.92
    m.material.emissiveIntensity = 2.5 // glowing hot for a moment
    d.t = 0
  }

  update(dt) {
    for (const d of this.items) {
      if (!d.m.visible) continue
      d.t += dt
      const mat = d.m.material
      if (mat.emissiveIntensity > 0) mat.emissiveIntensity = Math.max(0, 2.5 - d.t * 2.2)
      if (d.t > LIFE - 4) mat.opacity = Math.max(0, (LIFE - d.t) / 4) * 0.92
      if (d.t > LIFE) d.m.visible = false
    }
  }

  clear() {
    for (const d of this.items) d.m.visible = false
  }
}
