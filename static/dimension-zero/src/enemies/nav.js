// Ground navigation: a coarse height grid over the island and a Dijkstra flow
// field toward the player, rebuilt a few times per second. Separate walkability
// grids are kept for each dimension because cover and doors change between them.
const CELL = 1.25
const HALF = 52
const NX = Math.ceil((HALF * 2) / CELL)
const AGENT_H = 1.9

export class NavGrid {
  constructor(cw) {
    this.cw = cw
    this.n = NX
    this.grids = [] // per dimension: {h: Float32Array, ok: Uint8Array}
    for (let d = 0; d < 3; d++) this.grids.push(this.build(1 << d))
    this.dist = new Float32Array(NX * NX)
    this.heap = new Int32Array(NX * NX * 8)
    this.target = -1
    this.dim = 0
    this.timer = 0
  }

  cellOf(x, z) {
    const i = Math.floor((x + HALF) / CELL),
      j = Math.floor((z + HALF) / CELL)
    if (i < 0 || j < 0 || i >= NX || j >= NX) return -1
    return j * NX + i
  }
  center(c, out) {
    out.x = (c % NX) * CELL - HALF + CELL / 2
    out.z = Math.floor(c / NX) * CELL - HALF + CELL / 2
    return out
  }

  build(mask) {
    const h = new Float32Array(NX * NX).fill(0)
    const ok = new Uint8Array(NX * NX)
    const L = this.cw.list.filter((c) => c.nav && c.dims & mask && c.tag !== 'ground')
    for (let j = 0; j < NX; j++) {
      for (let i = 0; i < NX; i++) {
        const x0 = i * CELL - HALF,
          z0 = j * CELL - HALF
        const x1 = x0 + CELL,
          z1 = z0 + CELL
        const cx = x0 + CELL / 2,
          cz = z0 + CELL / 2
        const idx = j * NX + i
        if (Math.hypot(cx, cz) > 48.5) continue
        // floor height = highest low surface (steps/daises) under the cell
        let floor = 0
        const shrink = 0.25
        for (const c of L) {
          if (c.max.x <= x0 + shrink || c.min.x >= x1 - shrink || c.max.z <= z0 + shrink || c.min.z >= z1 - shrink)
            continue
          if (c.max.y <= floor + 0.7 && c.max.y > floor) floor = c.max.y
        }
        // repeat once to climb stacked steps
        for (const c of L) {
          if (c.max.x <= x0 + shrink || c.min.x >= x1 - shrink || c.max.z <= z0 + shrink || c.min.z >= z1 - shrink)
            continue
          if (c.max.y <= floor + 0.7 && c.max.y > floor) floor = c.max.y
        }
        let blocked = false
        const pad = 0.3 // agent radius clearance
        for (const c of L) {
          if (c.max.x <= x0 - pad || c.min.x >= x1 + pad || c.max.z <= z0 - pad || c.min.z >= z1 + pad) continue
          if (c.max.y > floor + 0.7 && c.min.y < floor + AGENT_H) {
            blocked = true
            break
          }
        }
        h[idx] = floor
        ok[idx] = blocked ? 0 : 1
      }
    }
    return { h, ok }
  }

  // Flow field from the player's cell. Cheap enough to rebuild ~4x/sec.
  compute(tx, tz, dim) {
    const g = this.grids[dim]
    let start = this.cellOf(tx, tz)
    if (start < 0) return
    if (!g.ok[start]) start = this.nearestOk(start, g)
    if (start < 0) return
    this.target = start
    this.dim = dim
    const dist = this.dist
    dist.fill(1e9)
    const heap = this.heap
    let hs = 0
    const push = (c, d) => {
      let i = hs++
      heap[i] = c
      while (i > 0) {
        const p = (i - 1) >> 1
        if (dist[heap[p]] <= d) break
        heap[i] = heap[p]
        i = p
      }
      heap[i] = c
    }
    const pop = () => {
      const top = heap[0]
      const last = heap[--hs]
      let i = 0
      const d = dist[last]
      while (true) {
        let l = i * 2 + 1
        if (l >= hs) break
        const r = l + 1
        if (r < hs && dist[heap[r]] < dist[heap[l]]) l = r
        if (dist[heap[l]] >= d) break
        heap[i] = heap[l]
        i = l
      }
      heap[i] = last
      return top
    }
    dist[start] = 0
    push(start, 0)
    const N = NX
    while (hs > 0 && hs < heap.length - 8) {
      const c = pop()
      const cd = dist[c]
      const ci = c % N,
        cj = (c / N) | 0
      const ch = g.h[c]
      for (let dj = -1; dj <= 1; dj++)
        for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue
          const ni = ci + di,
            nj = cj + dj
          if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue
          const n = nj * N + ni
          if (!g.ok[n]) continue
          if (Math.abs(g.h[n] - ch) > 0.65) continue
          if (di && dj && (!g.ok[cj * N + ni] || !g.ok[nj * N + ci])) continue // no corner cutting
          const nd = cd + (di && dj ? 1.414 : 1)
          if (nd < dist[n]) {
            dist[n] = nd
            push(n, nd)
          }
        }
    }
  }

  nearestOk(c, g) {
    const ci = c % NX,
      cj = (c / NX) | 0
    for (let r = 1; r < 6; r++)
      for (let dj = -r; dj <= r; dj++)
        for (let di = -r; di <= r; di++) {
          const ni = ci + di,
            nj = cj + dj
          if (ni < 0 || nj < 0 || ni >= NX || nj >= NX) continue
          const n = nj * NX + ni
          if (g.ok[n]) return n
        }
    return -1
  }

  // Direction (unit xz) to follow from a world position; returns false if unknown.
  flow(x, z, out) {
    let c = this.cellOf(x, z)
    if (c < 0) return false
    const dist = this.dist
    if (dist[c] >= 1e9) {
      const g = this.grids[this.dim]
      c = this.nearestOk(c, g)
      if (c < 0) return false
      // head toward the nearest valid cell first
      this.center(c, out)
      const dx = out.x - x,
        dz = out.z - z
      const l = Math.hypot(dx, dz) || 1
      out.x = dx / l
      out.z = dz / l
      return true
    }
    const ci = c % NX,
      cj = (c / NX) | 0
    let best = dist[c],
      bx = 0,
      bz = 0
    for (let dj = -1; dj <= 1; dj++)
      for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue
        const ni = ci + di,
          nj = cj + dj
        if (ni < 0 || nj < 0 || ni >= NX || nj >= NX) continue
        const d = dist[nj * NX + ni]
        if (d < best) {
          best = d
          bx = di
          bz = dj
        }
      }
    if (!bx && !bz) return false
    // aim at next cell centre for smoother lines
    const tx = (ci + bx) * CELL - HALF + CELL / 2,
      tz = (cj + bz) * CELL - HALF + CELL / 2
    const dx = tx - x,
      dz = tz - z
    const l = Math.hypot(dx, dz) || 1
    out.x = dx / l
    out.z = dz / l
    return true
  }

  heightAt(x, z, dim) {
    const c = this.cellOf(x, z)
    return c < 0 ? 0 : this.grids[dim].h[c]
  }
}
