// Geometry helpers: world-scaled UV boxes, fractured rocks, misc shapes.
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { rng, fbm3 } from '../core/utils.js'

// Box whose UVs are scaled by face size so textures keep a consistent texel density.
export function boxGeo(w, h, d, texScale = 4, segs = 1) {
  const g = new THREE.BoxGeometry(w, h, d, segs, segs, segs)
  const uv = g.attributes.uv
  const n = g.attributes.normal
  for (let i = 0; i < uv.count; i++) {
    const nx = Math.abs(n.getX(i)),
      ny = Math.abs(n.getY(i))
    let su, sv
    if (nx > 0.5) {
      su = d
      sv = h
    } else if (ny > 0.5) {
      su = w
      sv = d
    } else {
      su = w
      sv = h
    }
    uv.setXY(i, (uv.getX(i) * su) / texScale, (uv.getY(i) * sv) / texScale)
  }
  return g
}

// Bevelled box (chamfered edges catch highlights — reads far less "primitive").
export function bevelBox(w, h, d, b = 0.08, texScale = 4) {
  const shape = new THREE.Shape()
  const hw = w / 2 - b,
    hh = h / 2 - b
  shape.moveTo(-hw, -hh)
  shape.lineTo(hw, -hh)
  shape.lineTo(hw, hh)
  shape.lineTo(-hw, hh)
  shape.lineTo(-hw, -hh)
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.001, d - b * 2),
    bevelEnabled: true,
    bevelThickness: b,
    bevelSize: b,
    bevelSegments: 1,
    curveSegments: 1,
  })
  g.translate(0, 0, -(d - b * 2) / 2)
  // planar UVs from world-ish coordinates (triplanar-like by dominant normal)
  g.computeVertexNormals()
  const p = g.attributes.position,
    n = g.attributes.normal
  const uv = new Float32Array(p.count * 2)
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)),
      ay = Math.abs(n.getY(i)),
      az = Math.abs(n.getZ(i))
    let u, v
    if (ax >= ay && ax >= az) {
      u = p.getZ(i)
      v = p.getY(i)
    } else if (ay >= az) {
      u = p.getX(i)
      v = p.getZ(i)
    } else {
      u = p.getX(i)
      v = p.getY(i)
    }
    uv[i * 2] = u / texScale
    uv[i * 2 + 1] = v / texScale
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  return g
}

// Fractured stone chunk: a jittered, partially rounded box with random planar
// cuts (chipped faces). Flat-shaded so each fracture plane catches light.
export function rockGeo(seed, size = 1, opts = {}) {
  const r = rng(seed)
  const seg = opts.seg ?? 3
  const sx = size * (opts.sx ?? r.range(0.8, 1.25))
  const sy = size * (opts.sy ?? r.range(0.7, 1.2))
  const sz = size * (opts.sz ?? r.range(0.8, 1.25))
  let g = new THREE.BoxGeometry(1, 1, 1, seg, seg, seg)
  g = g.toNonIndexed()
  const p = g.attributes.position
  const round = opts.round ?? r.range(0.05, 0.3)
  const v = new THREE.Vector3()
  const cuts = []
  const nCuts = opts.cuts ?? r.int(2, 5)
  for (let i = 0; i < nCuts; i++) {
    const nrm = new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize()
    cuts.push({ n: nrm, d: r.range(0.3, 0.46) })
  }
  const off = r() * 100
  // displace per unique position (keep faces welded: hash positions)
  const cache = new Map()
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i)
    const key = `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`
    let out = cache.get(key)
    if (!out) {
      const s = v.clone()
      const sph = s.clone().normalize().multiplyScalar(0.62)
      s.lerp(sph, round)
      const n = fbm3(s.x * 2.3 + off, s.y * 2.3, s.z * 2.3, 3)
      s.multiplyScalar(0.9 + n * 0.25)
      for (const c of cuts) {
        const dd = s.dot(c.n)
        if (dd > c.d) s.addScaledVector(c.n, c.d - dd)
      }
      s.x *= sx
      s.y *= sy
      s.z *= sz
      out = s
      cache.set(key, out)
    }
    p.setXYZ(i, out.x, out.y, out.z)
  }
  g.computeVertexNormals()
  // box-projected UVs
  const n = g.attributes.normal
  const uv = g.attributes.uv
  const ts = opts.texScale ?? 2.5
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)),
      ay = Math.abs(n.getY(i)),
      az = Math.abs(n.getZ(i))
    if (ax >= ay && ax >= az) uv.setXY(i, p.getZ(i) / ts + off, p.getY(i) / ts)
    else if (ay >= az) uv.setXY(i, p.getX(i) / ts, p.getZ(i) / ts + off)
    else uv.setXY(i, p.getX(i) / ts + off, p.getY(i) / ts)
  }
  return g
}

// Floating island: flat top, jagged stalactite underside.
export function islandGeo(seed, radius, depth, topY = 0) {
  const r = rng(seed)
  const seg = 28
  const g = new THREE.CylinderGeometry(radius, radius * 0.25, depth, seg, 6, false)
  g.translate(0, -depth / 2 + topY, 0)
  const p = g.attributes.position
  const v = new THREE.Vector3()
  const off = r() * 50
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i)
    const t = (topY - v.y) / depth // 0 top .. 1 bottom
    const a = Math.atan2(v.z, v.x)
    const n = fbm3(Math.cos(a) * 1.5 + off, v.y * 0.25, Math.sin(a) * 1.5, 4)
    const rad = Math.hypot(v.x, v.z)
    if (rad > 0.001) {
      const k = (0.75 + n * 0.5) * (1 - t * t * 0.4)
      v.x *= k
      v.z *= k
    }
    if (t > 0.05) v.y -= n * depth * 0.5 * t
    p.setXYZ(i, v.x, v.y, v.z)
  }
  const ng = g.toNonIndexed()
  ng.computeVertexNormals()
  const uv = ng.attributes.uv,
    pp = ng.attributes.position
  for (let i = 0; i < pp.count; i++) uv.setXY(i, (pp.getX(i) + pp.getZ(i)) / 6, pp.getY(i) / 6)
  return ng
}

export function merge(geos) {
  // ensure attribute compatibility (all non-indexed with uv+normal)
  const list = geos.map((g) => {
    let x = g.index ? g.toNonIndexed() : g
    if (!x.attributes.uv)
      x.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(x.attributes.position.count * 2), 2))
    for (const k of Object.keys(x.attributes)) if (!['position', 'normal', 'uv'].includes(k)) x.deleteAttribute(k)
    return x
  })
  return mergeGeometries(list, false)
}

// Collects transformed geometries per material and merges them (few draw calls).
export class GeoBatch {
  constructor() {
    this.groups = new Map()
  }
  add(geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1) {
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
      new THREE.Vector3(s, s, s)
    )
    const g = geo.clone().applyMatrix4(m)
    if (!this.groups.has(mat)) this.groups.set(mat, [])
    this.groups.get(mat).push(g)
    return g
  }
  addMatrix(geo, mat, m) {
    const g = geo.clone().applyMatrix4(m)
    if (!this.groups.has(mat)) this.groups.set(mat, [])
    this.groups.get(mat).push(g)
  }
  build(parent, { cast = true, receive = true } = {}) {
    const meshes = []
    for (const [mat, list] of this.groups) {
      const mesh = new THREE.Mesh(merge(list), mat)
      mesh.castShadow = cast
      mesh.receiveShadow = receive
      parent.add(mesh)
      meshes.push(mesh)
      list.forEach((g) => g.dispose())
    }
    this.groups.clear()
    return meshes
  }
}
