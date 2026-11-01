// The Morphing Megastructure: ~500 metal blocks hovering above the core that
// continuously re-form between shapes. Material: a monolithic cube whose layers
// slide; Inverted: a twisting torus; Fracture: an exploded lattice collapsing
// into a sphere and back.
import * as THREE from 'three'
import { boxGeo } from './geometry.js'
import { TAU, clamp, smooth } from '../core/utils.js'

const N = 8
const COUNT = N * N * N
const _m = new THREE.Matrix4(),
  _q = new THREE.Quaternion(),
  _e = new THREE.Euler(),
  _s = new THREE.Vector3(),
  _p = new THREE.Vector3()

export function createMegastructure(ctx, center = new THREE.Vector3(0, 21, -4)) {
  const { M, scene } = ctx
  const geo = boxGeo(1.05, 1.05, 1.05, 2)
  const glowIdx = new Set()
  for (let i = 0; i < COUNT; i++) if ((i * 2654435761) % 97 < 9) glowIdx.add(i)
  const metalMesh = new THREE.InstancedMesh(geo, M.metal, COUNT - glowIdx.size)
  const glowMesh = new THREE.InstancedMesh(boxGeo(0.7, 0.7, 0.7), M.glowViolet, glowIdx.size)
  metalMesh.castShadow = true
  metalMesh.frustumCulled = false
  glowMesh.frustumCulled = false
  scene.add(metalMesh, glowMesh)

  const cube = [],
    torus = [],
    lattice = [],
    sphere = []
  const slot = [] // [mesh, index]
  let mi = 0,
    gi = 0
  for (let i = 0; i < COUNT; i++) {
    const x = i % N,
      y = Math.floor(i / N) % N,
      z = Math.floor(i / (N * N))
    const c = (N - 1) / 2
    cube.push(new THREE.Vector3((x - c) * 1.25, (y - c) * 1.25, (z - c) * 1.25))
    // twisted torus
    const u = (i % 64) / 64,
      v = Math.floor(i / 64) / 8
    const a = u * TAU,
      b = v * TAU + u * TAU * 3
    const Rr = 10,
      rr = 2.0
    torus.push(new THREE.Vector3((Rr + rr * Math.cos(b)) * Math.cos(a), rr * Math.sin(b) + Math.sin(a * 3) * 1.5, (Rr + rr * Math.cos(b)) * Math.sin(a)))
    // menger-like exploded lattice
    const cx = Math.abs(x - c) < 1.5,
      cy = Math.abs(y - c) < 1.5,
      cz = Math.abs(z - c) < 1.5
    const hole = (cx && cy) || (cy && cz) || (cx && cz)
    const s = hole ? 3.4 : 2.0
    lattice.push(new THREE.Vector3((x - c) * s, (y - c) * s, (z - c) * s))
    // fibonacci sphere
    const k = i + 0.5
    const phi = Math.acos(1 - (2 * k) / COUNT),
      th = Math.PI * (1 + Math.sqrt(5)) * k
    sphere.push(new THREE.Vector3(Math.cos(th) * Math.sin(phi) * 8, Math.cos(phi) * 8, Math.sin(th) * Math.sin(phi) * 8))
    if (glowIdx.has(i)) slot.push([glowMesh, gi++])
    else slot.push([metalMesh, mi++])
  }
  const cur = cube.map((p) => p.clone())
  const target = new THREE.Vector3()
  const delays = cube.map((p, i) => (p.length() / 6) * 0.6 + ((i * 7919) % 13) * 0.02)
  const group = { center, rot: 0 }

  function update(dt, c) {
    const t = c.time
    const w = c.dims.w
    // lattice<->sphere cycle inside Fracture
    const cyc = smooth(clamp(Math.sin(t * 0.35) * 1.5 + 0.5, 0, 1))
    group.rot += dt * (0.05 + w.y * 0.12 + w.z * 0.08)
    const cr = Math.cos(group.rot),
      sr = Math.sin(group.rot)
    for (let i = 0; i < COUNT; i++) {
      // Material: cube with sliding layers (impossible "Rubik" shuffle)
      const base = cube[i]
      const layer = Math.round(base.y / 1.25 + 3.5)
      const slide = Math.sin(t * 0.6 + layer * 0.9) * 1.2 * (layer % 2 ? 1 : -1)
      const ax = base.x * Math.cos(slide * 0.15) - base.z * Math.sin(slide * 0.15)
      const az = base.x * Math.sin(slide * 0.15) + base.z * Math.cos(slide * 0.15)
      const tx = ax * w.x + torus[i].x * w.y + (lattice[i].x * (1 - cyc) + sphere[i].x * cyc) * w.z
      const ty = base.y * w.x + torus[i].y * w.y + (lattice[i].y * (1 - cyc) + sphere[i].y * cyc) * w.z
      const tz = az * w.x + torus[i].z * w.y + (lattice[i].z * (1 - cyc) + sphere[i].z * cyc) * w.z
      target.set(tx, ty, tz)
      // per-instance lag gives a rippling, organic transformation
      const rate = 2.6 / (1 + delays[i] * 2)
      cur[i].lerp(target, 1 - Math.exp(-rate * dt))
      const p = cur[i]
      _p.set(p.x * cr - p.z * sr + center.x, p.y + center.y + Math.sin(t * 0.4) * 0.8, p.x * sr + p.z * cr + center.z)
      _q.setFromEuler(_e.set((t * 0.2 + i) * w.z, group.rot + w.y * i * 0.05, 0))
      const sc = 1 - w.z * 0.25 * (1 + Math.sin(t * 2 + i))
      _m.compose(_p, _q, _s.set(sc, sc, sc))
      const [mesh, idx] = slot[i]
      mesh.setMatrixAt(idx, _m)
    }
    metalMesh.instanceMatrix.needsUpdate = true
    glowMesh.instanceMatrix.needsUpdate = true
  }
  return { update, metalMesh, glowMesh }
}
