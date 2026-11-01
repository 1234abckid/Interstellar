// Impact decals: scorched bullet marks left on world geometry. One instanced
// draw call for all marks; the oldest mark is recycled. Each mark glows hot
// for a moment and fades out at the end of its life (per-instance age).
import * as THREE from 'three'
import { genImpactDecal } from '../core/textures.js'

const MAX = 96
const LIFE = 24

export class Decals {
  constructor(ctx) {
    this.ctx = ctx
    const tex = genImpactDecal(128)
    const geo = new THREE.PlaneGeometry(1, 1)
    this.born = new Float32Array(MAX).fill(-1e6)
    const bornAttr = new THREE.InstancedBufferAttribute(this.born, 1)
    bornAttr.setUsage(THREE.DynamicDrawUsage)
    geo.setAttribute('aBorn', bornAttr)
    this.bornAttr = bornAttr
    const uTime = { value: 0 }
    this.uTime = uTime
    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      roughness: 0.95,
      metalness: 0,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    })
    mat.userData.noAO = true
    mat.customProgramCacheKey = () => 'dz-decal'
    mat.onBeforeCompile = (s) => {
      s.uniforms.uDecalTime = uTime
      s.vertexShader = s.vertexShader
        .replace(
          '#include <common>',
          '#include <common>\nattribute float aBorn; uniform float uDecalTime; varying float vAge;'
        )
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvAge = uDecalTime - aBorn;')
      s.fragmentShader = s.fragmentShader
        .replace('#include <common>', `#include <common>\nvarying float vAge;`)
        .replace(
          '#include <map_fragment>',
          `#include <map_fragment>
          diffuseColor.a *= 0.92 * clamp((${LIFE.toFixed(1)} - vAge) / 4.0, 0.0, 1.0);`
        )
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          totalEmissiveRadiance += vec3(1.0, 0.35, 0.05) * diffuseColor.a * max(0.0, 2.5 - vAge * 2.2) * (1.0 - diffuseColor.r * 3.0);`
        )
    }
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX)
    this.mesh.frustumCulled = false // marks are scattered across the whole arena
    this.mesh.renderOrder = 2
    this.mesh.count = 0
    // park every instance far away until it is used
    const hide = new THREE.Matrix4().makeScale(0, 0, 0)
    for (let i = 0; i < MAX; i++) this.mesh.setMatrixAt(i, hide)
    ctx.scene.add(this.mesh)
    this.head = 0
    this.used = 0
    this._o = new THREE.Object3D()
    this._v = new THREE.Vector3()
  }

  add(point, normal, size = 0.32) {
    const i = this.head
    this.head = (this.head + 1) % MAX
    this.used = Math.min(MAX, this.used + 1)
    const o = this._o
    o.position.copy(point).addScaledVector(normal, 0.012)
    o.lookAt(this._v.copy(o.position).add(normal))
    o.rotateZ(Math.random() * Math.PI * 2)
    const s = size * (0.75 + Math.random() * 0.5)
    o.scale.set(s, s, s)
    o.updateMatrix()
    this.mesh.setMatrixAt(i, o.matrix)
    this.mesh.instanceMatrix.needsUpdate = true
    this.born[i] = this.uTime.value
    this.bornAttr.needsUpdate = true
    this.mesh.count = this.used
  }

  update(dt) {
    this.uTime.value += dt
  }

  clear() {
    this.used = 0
    this.head = 0
    this.mesh.count = 0
    this.born.fill(-1e6)
    this.bornAttr.needsUpdate = true
  }
}
