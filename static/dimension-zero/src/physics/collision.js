// Static/kinematic collision world built from axis-aligned boxes.
// Collision volumes are deliberately simple and stable: visible meshes may morph,
// fracture and fold, but the boxes the player stands on never deform.
export const DIM_A = 1,
  DIM_B = 2,
  DIM_C = 4,
  DIM_ALL = 7

let NEXT_ID = 1

export class Collider {
  constructor(minx, miny, minz, maxx, maxy, maxz, opts = {}) {
    this.id = NEXT_ID++
    this.min = { x: minx, y: miny, z: minz }
    this.max = { x: maxx, y: maxy, z: maxz }
    this.dims = opts.dims ?? DIM_ALL
    this.kind = opts.kind ?? 'solid' // solid | barrier
    this.enabled = opts.enabled ?? true
    this.vel = { x: 0, y: 0, z: 0 } // for moving platforms (carry)
    this.tag = opts.tag || null
    this.nav = opts.nav ?? true // contributes to enemy navigation grid
    this.onHit = opts.onHit || null
  }
  setCenter(x, y, z, hx, hy, hz) {
    this.min.x = x - hx
    this.min.y = y - hy
    this.min.z = z - hz
    this.max.x = x + hx
    this.max.y = y + hy
    this.max.z = z + hz
  }
}

export class CollisionWorld {
  constructor() {
    this.list = []
    this.dimMask = DIM_A
    this.boundsR = 49 // circular arena boundary
  }
  addBox(cx, cy, cz, w, h, d, opts) {
    const c = new Collider(cx - w / 2, cy - h / 2, cz - d / 2, cx + w / 2, cy + h / 2, cz + d / 2, opts)
    this.list.push(c)
    return c
  }
  // box resting on y0 (bottom at y0)
  addBlock(cx, y0, cz, w, h, d, opts) {
    return this.addBox(cx, y0 + h / 2, cz, w, h, d, opts)
  }
  active(c) {
    return c.enabled && (c.dims & this.dimMask) !== 0
  }
  activeIn(c, mask) {
    return c.enabled && (c.dims & mask) !== 0
  }
  // Overlap query; pushes overlapping colliders into out.
  overlap(minx, miny, minz, maxx, maxy, maxz, out) {
    out.length = 0
    const L = this.list
    for (let i = 0; i < L.length; i++) {
      const c = L[i]
      if (!this.active(c)) continue
      if (
        c.max.x <= minx ||
        c.min.x >= maxx ||
        c.max.y <= miny ||
        c.min.y >= maxy ||
        c.max.z <= minz ||
        c.min.z >= maxz
      )
        continue
      out.push(c)
    }
    return out
  }
  // Highest active surface under (x,z) within horizontal radius r whose top <= yTop.
  groundAt(x, z, yTop, r = 0.3) {
    let best = -Infinity
    const L = this.list
    for (let i = 0; i < L.length; i++) {
      const c = L[i]
      if (!this.active(c)) continue
      if (c.max.x < x - r || c.min.x > x + r || c.max.z < z - r || c.min.z > z + r) continue
      if (c.max.y <= yTop + 1e-4 && c.max.y > best) best = c.max.y
    }
    return best
  }
  /**
   * Ray vs boxes (slab test). opts.pierceBarrier: ignore energy barriers.
   * Returns {t, nx, ny, nz, c} or null. `out` object is reused.
   */
  raycast(ox, oy, oz, dx, dy, dz, maxT, opts, out) {
    let bestT = maxT
    let hit = null
    let bnx = 0,
      bny = 0,
      bnz = 0
    const idx = 1 / (dx || 1e-9),
      idy = 1 / (dy || 1e-9),
      idz = 1 / (dz || 1e-9)
    const L = this.list
    const pierce = opts && opts.pierceBarrier
    const mask = (opts && opts.mask) || this.dimMask
    const only = opts && opts.only
    for (let i = 0; i < L.length; i++) {
      const c = L[i]
      if (only && c !== only) continue
      if (!this.activeIn(c, mask)) continue
      if (pierce && c.kind === 'barrier') continue
      let t1 = (c.min.x - ox) * idx,
        t2 = (c.max.x - ox) * idx
      let tmin = Math.min(t1, t2),
        tmax = Math.max(t1, t2)
      let nax = t1 < t2 ? -1 : 1,
        nx = nax,
        ny = 0,
        nz = 0
      t1 = (c.min.y - oy) * idy
      t2 = (c.max.y - oy) * idy
      let ty0 = Math.min(t1, t2),
        ty1 = Math.max(t1, t2)
      if (ty0 > tmin) {
        tmin = ty0
        nx = 0
        ny = t1 < t2 ? -1 : 1
        nz = 0
      }
      tmax = Math.min(tmax, ty1)
      t1 = (c.min.z - oz) * idz
      t2 = (c.max.z - oz) * idz
      let tz0 = Math.min(t1, t2),
        tz1 = Math.max(t1, t2)
      if (tz0 > tmin) {
        tmin = tz0
        nx = 0
        ny = 0
        nz = t1 < t2 ? -1 : 1
      }
      tmax = Math.min(tmax, tz1)
      if (tmax < 0 || tmin > tmax) continue
      const t = tmin < 0 ? 0 : tmin
      if (t < bestT) {
        bestT = t
        hit = c
        bnx = nx
        bny = ny
        bnz = nz
      }
    }
    if (!hit) return null
    out = out || {}
    out.t = bestT
    out.nx = bnx
    out.ny = bny
    out.nz = bnz
    out.c = hit
    return out
  }
  // Line of sight between two points.
  los(ax, ay, az, bx, by, bz) {
    const dx = bx - ax,
      dy = by - ay,
      dz = bz - az
    const L = Math.hypot(dx, dy, dz)
    if (L < 1e-4) return true
    return !this.raycast(ax, ay, az, dx / L, dy / L, dz / L, L, null, _losHit)
  }
}
const _losHit = {}
