// Ground detail: instanced pebbles/rubble and wind-swayed grass tufts that
// gather around ruins, walls and the gravity garden. Placement avoids every
// collider so nothing grows through architecture.
import * as THREE from 'three'
import { rockGeo } from './geometry.js'
import { enhance, G } from './materials.js'
import { rng } from '../core/utils.js'

const _m = new THREE.Matrix4(),
  _q = new THREE.Quaternion(),
  _p = new THREE.Vector3(),
  _s = new THREE.Vector3(),
  _e = new THREE.Euler()

function blocked(cw, x, z, r) {
  for (const c of cw.list) {
    if (c.tag === 'ground') continue
    if (c.min.y > 1.0) continue
    if (x + r > c.min.x && x - r < c.max.x && z + r > c.min.z && z - r < c.max.z) return true
  }
  return false
}

// distance to the nearest collider footprint (for clustering detail along walls)
function nearWall(cw, x, z) {
  let best = 99
  for (const c of cw.list) {
    if (c.tag === 'ground' || c.min.y > 1.0 || c.max.y < 0.4) continue
    const dx = Math.max(c.min.x - x, 0, x - c.max.x)
    const dz = Math.max(c.min.z - z, 0, z - c.max.z)
    best = Math.min(best, Math.hypot(dx, dz))
  }
  return best
}

function grassGeo() {
  // five tapered blades fanned around the tuft centre
  const pos = [],
    col = [],
    nrm = []
  const blades = 6
  for (let b = 0; b < blades; b++) {
    const a = (b / blades) * Math.PI * 2 + b * 0.7
    const lean = 0.18 + (b % 3) * 0.08
    const h = 0.35 + (b % 4) * 0.08
    const w = 0.035
    const cx = Math.cos(a),
      sz = Math.sin(a)
    const px = -sz * w,
      pz = cx * w
    const tip = [cx * lean, h, sz * lean]
    pos.push(px, 0, pz, -px, 0, -pz, tip[0], tip[1], tip[2])
    col.push(0.16, 0.22, 0.1, 0.16, 0.22, 0.1, 0.55, 0.62, 0.3)
    for (let k = 0; k < 3; k++) nrm.push(cx * 0.3, 0.9, sz * 0.3)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3))
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  return g
}

export function buildScatter(ctx) {
  const { scene, cw, M } = ctx
  const R = rng(4711)
  // ------------------------------------------------ pebbles & rubble
  const pebbleGeos = [0, 1, 2].map((i) => rockGeo(9300 + i, 1, { round: 0.25, seg: 2, cuts: 2 }))
  const pebbles = pebbleGeos.map((g) => {
    const im = new THREE.InstancedMesh(g, M.rock, 260)
    im.castShadow = false
    im.receiveShadow = true
    scene.add(im)
    return im
  })
  const counts = [0, 0, 0]
  for (let tries = 0; tries < 6000 && counts.reduce((a, b) => a + b, 0) < 760; tries++) {
    const a = R() * Math.PI * 2,
      r = Math.sqrt(R()) * 48
    const x = Math.cos(a) * r,
      z = Math.sin(a) * r
    if (Math.abs(x) < 10.5 && Math.abs(z) < 10.5) continue // keep the dais clean
    if (blocked(cw, x, z, 0.3)) continue
    const near = nearWall(cw, x, z)
    if (near > 3 && R() > 0.25) continue // rubble collects against walls
    const k = R.int(0, 2)
    if (counts[k] >= 260) continue
    const s = (near < 1.5 ? R.range(0.08, 0.32) : R.range(0.04, 0.14)) * (R() < 0.06 ? 2.2 : 1)
    _m.compose(
      _p.set(x, s * 0.25, z),
      _q.setFromEuler(_e.set(R() * 3, R() * 6.28, R() * 3)),
      _s.set(s, s * R.range(0.5, 1), s)
    )
    pebbles[k].setMatrixAt(counts[k]++, _m)
  }
  pebbles.forEach((im, i) => {
    im.count = counts[i]
    im.instanceMatrix.needsUpdate = true
  })

  // ------------------------------------------------ grass
  const grassMat = enhance(
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, side: THREE.DoubleSide }),
    {}
  )
  grassMat.userData.noAO = true
  const prev = grassMat.onBeforeCompile
  grassMat.onBeforeCompile = (shader) => {
    prev(shader)
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      { vec4 iw = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float sway = sin(uTime * 1.7 + iw.x * 0.35 + iw.z * 0.27) * 0.5 + sin(uTime * 3.1 + iw.x * 0.9) * 0.2;
        float k = position.y * position.y * 2.2;
        transformed.x += sway * k * 0.35;
        transformed.z += cos(uTime * 1.3 + iw.z * 0.4) * k * 0.18; }`
    )
  }
  grassMat.customProgramCacheKey = () => 'dz-grass'
  const grass = new THREE.InstancedMesh(grassGeo(), grassMat, 1400)
  grass.receiveShadow = true
  scene.add(grass)
  let n = 0
  for (let tries = 0; tries < 12000 && n < 1400; tries++) {
    const a = R() * Math.PI * 2,
      r = Math.sqrt(R()) * 49
    const x = Math.cos(a) * r,
      z = Math.sin(a) * r
    if (Math.abs(x) < 10.5 && Math.abs(z) < 10.5) continue
    const garden = x < -24 && Math.abs(z) < 22
    const near = nearWall(cw, x, z)
    if (!garden && near > 2.2) continue
    if (garden && R() > 0.8) continue
    if (blocked(cw, x, z, 0.15)) continue
    const s = R.range(0.7, 1.5) * (garden ? 1.3 : 1)
    _m.compose(_p.set(x, 0, z), _q.setFromEuler(_e.set(0, R() * 6.28, 0)), _s.set(s, s * R.range(0.8, 1.4), s))
    grass.setMatrixAt(n++, _m)
  }
  grass.count = n
  grass.instanceMatrix.needsUpdate = true
  return { pebbles, grass }
}
