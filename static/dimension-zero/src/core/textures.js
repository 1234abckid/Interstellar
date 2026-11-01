// Procedural PBR texture generation (albedo / normal / roughness / emissive).
// Everything is generated at load time on canvases, so the game ships with no
// texture downloads and every surface has real material variation.
import * as THREE from 'three'
import { tfbm, tnoise, rng, clamp, lerp } from './utils.js'

function makeCanvas(size) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  return c
}

function toTexture(canvas, srgb, repeat = 1) {
  const t = new THREE.CanvasTexture(canvas)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(repeat, repeat)
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
  t.anisotropy = 8
  t.generateMipmaps = true
  t.minFilter = THREE.LinearMipmapLinearFilter
  t.needsUpdate = true
  return t
}

// rgb: Float32Array size*size*3 in 0..1
function rgbCanvas(size, rgb) {
  const c = makeCanvas(size)
  const g = c.getContext('2d')
  const img = g.createImageData(size, size)
  const d = img.data
  for (let i = 0, j = 0; i < size * size; i++, j += 3) {
    d[i * 4] = clamp(rgb[j] * 255, 0, 255)
    d[i * 4 + 1] = clamp(rgb[j + 1] * 255, 0, 255)
    d[i * 4 + 2] = clamp(rgb[j + 2] * 255, 0, 255)
    d[i * 4 + 3] = 255
  }
  g.putImageData(img, 0, 0)
  return c
}

function grayCanvas(size, v) {
  const rgb = new Float32Array(size * size * 3)
  for (let i = 0; i < size * size; i++) rgb[i * 3] = rgb[i * 3 + 1] = rgb[i * 3 + 2] = v[i]
  return rgbCanvas(size, rgb)
}

// Height field -> tangent-space normal map (wraps at edges).
function normalCanvas(size, h, strength) {
  const rgb = new Float32Array(size * size * 3)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const xl = (x - 1 + size) % size,
        xr = (x + 1) % size
      const yu = (y - 1 + size) % size,
        yd = (y + 1) % size
      const dx = (h[y * size + xr] - h[y * size + xl]) * strength
      const dy = (h[yd * size + x] - h[yu * size + x]) * strength
      const l = Math.hypot(dx, dy, 1)
      const i = (y * size + x) * 3
      rgb[i] = (-dx / l) * 0.5 + 0.5
      rgb[i + 1] = (dy / l) * 0.5 + 0.5
      rgb[i + 2] = 1 / l
    }
  }
  return rgbCanvas(size, rgb)
}

// Random-walk cracks stamped into a height field.
function stampCracks(size, h, r, count, depth, len = 60) {
  for (let c = 0; c < count; c++) {
    let x = r() * size,
      y = r() * size,
      a = r() * Math.PI * 2
    const L = len * (0.5 + r())
    for (let s = 0; s < L; s++) {
      a += (r() - 0.5) * 0.9
      x += Math.cos(a)
      y += Math.sin(a)
      const xi = ((Math.floor(x) % size) + size) % size
      const yi = ((Math.floor(y) % size) + size) % size
      h[yi * size + xi] -= depth
      if (r() < 0.04) {
        // branch
        let bx = x,
          by = y,
          ba = a + (r() - 0.5) * 2.4
        for (let k = 0; k < 14; k++) {
          ba += (r() - 0.5) * 0.8
          bx += Math.cos(ba)
          by += Math.sin(ba)
          const bxi = ((Math.floor(bx) % size) + size) % size
          const byi = ((Math.floor(by) % size) + size) % size
          h[byi * size + bxi] -= depth * 0.6
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Stone masonry: pale, warm, weathered blocks (ruins).
export function genStone(size = 512, seed = 3) {
  const r = rng(seed)
  const h = new Float32Array(size * size)
  const blockId = new Float32Array(size * size)
  const rgb = new Float32Array(size * size * 3)
  const rough = new Float32Array(size * size)
  const rows = 6
  const rowH = size / rows
  // row layouts (running bond) — widths wrap horizontally
  const layouts = []
  for (let ry = 0; ry < rows; ry++) {
    const cuts = []
    let x = r() * size * 0.3
    while (x < size + (cuts.length ? 0 : 1)) {
      cuts.push(x)
      x += size * (0.22 + r() * 0.2)
    }
    layouts.push(cuts)
  }
  const per = 8
  for (let y = 0; y < size; y++) {
    const ry = Math.floor(y / rowH)
    const fy = (y % rowH) / rowH
    const cuts = layouts[ry]
    for (let x = 0; x < size; x++) {
      // find block
      let bi = cuts.length - 1
      let x0 = cuts[cuts.length - 1] - size,
        x1 = cuts[0]
      for (let k = 0; k < cuts.length; k++) {
        if (x >= cuts[k] && (k === cuts.length - 1 || x < cuts[k + 1])) {
          bi = k
          x0 = cuts[k]
          x1 = k === cuts.length - 1 ? cuts[0] + size : cuts[k + 1]
          break
        }
      }
      if (x < cuts[0]) {
        bi = cuts.length - 1
        x0 = cuts[cuts.length - 1] - size
        x1 = cuts[0]
      }
      const fx = (x - x0) / (x1 - x0)
      const edge = Math.min(fx * (x1 - x0), (1 - fx) * (x1 - x0), fy * rowH, (1 - fy) * rowH)
      const n = tfbm((x / size) * per, (y / size) * per, per, 5)
      const n2 = tfbm((x / size) * 32, (y / size) * 32, 32, 3)
      let bevel = clamp(edge / 7, 0, 1)
      bevel = Math.sqrt(bevel)
      // chipped edges
      const chip = tnoise((x / size) * 48, (y / size) * 48, 48)
      if (edge < 10 && chip > 0.62) bevel *= 0.35
      const i = y * size + x
      const id = ry * 31 + bi
      blockId[i] = id
      h[i] = bevel * (0.75 + n * 0.35) + n2 * 0.08
    }
  }
  stampCracks(size, h, r, 26, 0.18, 70)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x
      const br = rng(blockId[i] * 7 + seed)
      const tone = 0.72 + br() * 0.16
      const warm = br() * 0.05
      const n = tfbm((x / size) * 6, (y / size) * 6, 6, 4)
      const grime = clamp(1 - h[i] * 1.25, 0, 1)
      const moss =
        clamp((tfbm((x / size) * 4 + 9, (y / size) * 4, 4, 4) - 0.56) * 5, 0, 1) * clamp(1 - h[i] + 0.3, 0, 1)
      let R = tone + warm + (n - 0.5) * 0.18,
        G = tone + (n - 0.5) * 0.16,
        B = tone - warm * 1.4 - 0.03 + (n - 0.5) * 0.14
      const gm = 0.55 + 0.45 * (1 - grime)
      R *= gm
      G *= gm
      B *= gm
      R = lerp(R, 0.26, moss * 0.8)
      G = lerp(G, 0.36, moss * 0.8)
      B = lerp(B, 0.2, moss * 0.8)
      rgb[i * 3] = R
      rgb[i * 3 + 1] = G
      rgb[i * 3 + 2] = B
      rough[i] = clamp(0.78 + grime * 0.18 - moss * 0.1 + (n - 0.5) * 0.1, 0, 1)
    }
  }
  return {
    map: toTexture(rgbCanvas(size, rgb), true),
    normalMap: toTexture(normalCanvas(size, h, 3.2), false),
    roughnessMap: toTexture(grayCanvas(size, rough), false),
  }
}

// Large pavement slabs for the arena floor.
export function genPavement(size = 512, seed = 11) {
  const r = rng(seed)
  const h = new Float32Array(size * size)
  const rgb = new Float32Array(size * size * 3)
  const rough = new Float32Array(size * size)
  const cells = 4
  const cs = size / cells
  // per-cell random split for irregular slabs
  const splits = []
  for (let i = 0; i < cells * cells; i++) splits.push({ v: r() < 0.5, p: 0.3 + r() * 0.4, t: r() })
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cx = Math.floor(x / cs),
        cy = Math.floor(y / cs)
      let fx = (x % cs) / cs,
        fy = (y % cs) / cs
      const s = splits[cy * cells + cx]
      let sub = 0
      let e
      if (s.v) {
        if (fx < s.p) {
          e = Math.min(fx / s.p, (s.p - fx) / s.p) * s.p
        } else {
          e = Math.min(fx - s.p, 1 - fx)
          sub = 1
        }
        e = Math.min(e, fy, 1 - fy)
      } else {
        if (fy < s.p) {
          e = Math.min(fy, s.p - fy)
        } else {
          e = Math.min(fy - s.p, 1 - fy)
          sub = 1
        }
        e = Math.min(e, fx, 1 - fx)
      }
      const ex = e * cs
      const n = tfbm((x / size) * 8, (y / size) * 8, 8, 5)
      let bevel = Math.sqrt(clamp(ex / 5, 0, 1))
      const i = y * size + x
      h[i] = bevel * (0.8 + n * 0.25)
      const tone = 0.5 + s.t * 0.12 + sub * 0.04
      const dirt = clamp(1 - ex / 14, 0, 1)
      const n2 = tfbm((x / size) * 3, (y / size) * 3, 3, 4)
      let R = tone + (n - 0.5) * 0.2 + 0.02,
        G = tone + (n - 0.5) * 0.18,
        B = tone + (n - 0.5) * 0.16 + 0.03
      const dm = 1 - dirt * 0.45 - (n2 > 0.6 ? (n2 - 0.6) * 0.8 : 0)
      rgb[i * 3] = R * dm
      rgb[i * 3 + 1] = G * dm
      rgb[i * 3 + 2] = B * dm
      rough[i] = clamp(0.7 + dirt * 0.2 + (n - 0.5) * 0.25, 0, 1)
    }
  }
  stampCracks(size, h, r, 18, 0.22, 90)
  return {
    map: toTexture(rgbCanvas(size, rgb), true),
    normalMap: toTexture(normalCanvas(size, h, 2.6), false),
    roughnessMap: toTexture(grayCanvas(size, rough), false),
  }
}

// Dark gunmetal hull panels with seams, bolts and edge wear.
export function genMetal(size = 512, seed = 21) {
  const r = rng(seed)
  const h = new Float32Array(size * size).fill(1)
  const rgb = new Float32Array(size * size * 3)
  const rough = new Float32Array(size * size)
  const wear = new Float32Array(size * size)
  // recursive panel subdivision
  const panels = []
  function split(x, y, w, hh, d) {
    if (d > 3 || (d > 1 && r() < 0.3)) {
      panels.push([x, y, w, hh])
      return
    }
    if (w > hh) {
      const s = Math.floor(w * (0.3 + r() * 0.4))
      split(x, y, s, hh, d + 1)
      split(x + s, y, w - s, hh, d + 1)
    } else {
      const s = Math.floor(hh * (0.3 + r() * 0.4))
      split(x, y, w, s, d + 1)
      split(x, y + s, w, hh - s, d + 1)
    }
  }
  split(0, 0, size, size, 0)
  const tones = new Float32Array(size * size)
  for (const [px, py, pw, ph] of panels) {
    const t = r() * 0.08
    const inset = r() < 0.3
    for (let y = py; y < py + ph; y++) {
      for (let x = px; x < px + pw; x++) {
        const e = Math.min(x - px, px + pw - 1 - x, y - py, py + ph - 1 - y)
        const i = y * size + x
        let v = e < 2 ? 0.1 : e < 4 ? 0.6 : 1
        if (inset && e > 10) v -= 0.12
        h[i] = v
        tones[i] = t
        wear[i] = e < 7 ? 1 - e / 7 : 0
      }
    }
    // bolts at corners
    const bolts = [
      [px + 7, py + 7],
      [px + pw - 8, py + 7],
      [px + 7, py + ph - 8],
      [px + pw - 8, py + ph - 8],
    ]
    if (pw > 40 && ph > 40)
      for (const [bx, by] of bolts) {
        for (let y = -3; y <= 3; y++)
          for (let x = -3; x <= 3; x++) {
            const d = Math.hypot(x, y)
            if (d < 3.2) {
              const i = ((((by + y) % size) + size) % size) * size + ((((bx + x) % size) + size) % size)
              h[i] = 1.25 - d * 0.06
              wear[i] = 0.6
            }
          }
      }
  }
  // scratches
  const scratch = new Float32Array(size * size)
  for (let s = 0; s < 140; s++) {
    let x = r() * size,
      y = r() * size
    const a = r() * Math.PI
    const L = 10 + r() * 60
    for (let k = 0; k < L; k++) {
      x += Math.cos(a)
      y += Math.sin(a)
      const i = (((Math.floor(y) % size) + size) % size) * size + (((Math.floor(x) % size) + size) % size)
      scratch[i] = 1
    }
  }
  for (let i = 0; i < size * size; i++) {
    const x = i % size,
      y = (i / size) | 0
    const n = tfbm((x / size) * 10, (y / size) * 10, 10, 4)
    const base = 0.2 + tones[i] + (n - 0.5) * 0.05
    const w = wear[i] * clamp((n - 0.35) * 3, 0, 1)
    let R = base * 0.95 + w * 0.25 + scratch[i] * 0.12,
      G = base * 0.98 + w * 0.25 + scratch[i] * 0.12,
      B = base * 1.1 + w * 0.26 + scratch[i] * 0.12
    rgb[i * 3] = R
    rgb[i * 3 + 1] = G
    rgb[i * 3 + 2] = B
    rough[i] = clamp(0.42 + (n - 0.5) * 0.3 - w * 0.15 - scratch[i] * 0.15 + tones[i], 0.12, 1)
    h[i] += (n - 0.5) * 0.04 - scratch[i] * 0.05
  }
  return {
    map: toTexture(rgbCanvas(size, rgb), true),
    normalMap: toTexture(normalCanvas(size, h, 2.2), false),
    roughnessMap: toTexture(grayCanvas(size, rough), false),
  }
}

// Alien technology panels with circuit-like emissive traces.
export function genTech(size = 512, seed = 31) {
  const r = rng(seed)
  const h = new Float32Array(size * size).fill(0.6)
  const rgb = new Float32Array(size * size * 3)
  const em = new Float32Array(size * size)
  const rough = new Float32Array(size * size)
  // hex-ish cells via grid with offsets
  const g = 64
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const row = Math.floor(y / g)
      const ox = row % 2 ? g / 2 : 0
      const fx = ((x + ox) % g) / g,
        fy = (y % g) / g
      const e = Math.min(fx, 1 - fx, fy, 1 - fy) * g
      const i = y * size + x
      h[i] = e < 1.5 ? 0.2 : e < 3 ? 0.5 : 0.8
      const n = tfbm((x / size) * 12, (y / size) * 12, 12, 3)
      const b = 0.09 + n * 0.04
      rgb[i * 3] = b * 0.9
      rgb[i * 3 + 1] = b * 0.85
      rgb[i * 3 + 2] = b * 1.25
      rough[i] = 0.32 + n * 0.2
    }
  }
  // traces: manhattan walks
  for (let t = 0; t < 34; t++) {
    let x = Math.floor(r() * size),
      y = Math.floor(r() * size)
    let dir = r() < 0.5 ? 0 : 1
    const L = 40 + r() * 160
    for (let k = 0; k < L; k++) {
      if (r() < 0.04) dir = 1 - dir
      if (dir === 0) x = (x + 1) % size
      else y = (y + 1) % size
      for (let w = -1; w <= 1; w++) {
        const xi = dir === 0 ? x : (x + w + size) % size
        const yi = dir === 0 ? (y + w + size) % size : y
        const i = yi * size + xi
        em[i] = Math.max(em[i], w === 0 ? 1 : 0.35)
        h[i] = 0.75
      }
    }
    // node
    for (let yy = -3; yy <= 3; yy++)
      for (let xx = -3; xx <= 3; xx++) {
        if (Math.hypot(xx, yy) < 3.3) {
          const i = ((y + yy + size) % size) * size + ((x + xx + size) % size)
          em[i] = 1
          h[i] = 0.9
        }
      }
  }
  return {
    map: toTexture(rgbCanvas(size, rgb), true),
    normalMap: toTexture(normalCanvas(size, h, 2.0), false),
    roughnessMap: toTexture(grayCanvas(size, rough), false),
    emissiveMap: toTexture(grayCanvas(size, em), true),
  }
}

// Natural fractured rock (floating islands, debris, cliffs).
export function genRock(size = 512, seed = 41, tint = [0.33, 0.33, 0.37]) {
  const r = rng(seed)
  const h = new Float32Array(size * size)
  const rgb = new Float32Array(size * size * 3)
  const rough = new Float32Array(size * size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size,
        v = y / size
      const n = tfbm(u * 6, v * 6, 6, 6)
      const ridge = 1 - Math.abs(tfbm(u * 4 + 3, v * 4, 4, 5) * 2 - 1)
      const strata = Math.sin((v * 22 + n * 4) * Math.PI) * 0.5 + 0.5
      const i = y * size + x
      h[i] = n * 0.7 + ridge * 0.4 + strata * 0.08
    }
  }
  stampCracks(size, h, r, 30, 0.25, 50)
  for (let i = 0; i < size * size; i++) {
    const x = i % size,
      y = (i / size) | 0
    const n = tfbm((x / size) * 16, (y / size) * 16, 16, 3)
    const s = 0.65 + h[i] * 0.55 + (n - 0.5) * 0.25
    rgb[i * 3] = tint[0] * s
    rgb[i * 3 + 1] = tint[1] * s
    rgb[i * 3 + 2] = tint[2] * s
    rough[i] = clamp(0.85 - h[i] * 0.15 + (n - 0.5) * 0.2, 0.4, 1)
  }
  return {
    map: toTexture(rgbCanvas(size, rgb), true),
    normalMap: toTexture(normalCanvas(size, h, 3.5), false),
    roughnessMap: toTexture(grayCanvas(size, rough), false),
  }
}

// Emissive vein texture (energy cracks in stone / crystals).
export function genVeins(size = 256, seed = 51) {
  const r = rng(seed)
  const v = new Float32Array(size * size)
  stampCracks(size, v, r, 12, -1, 90)
  // blur slightly for glow falloff
  const o = new Float32Array(size * size)
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      let s = 0
      for (let yy = -2; yy <= 2; yy++)
        for (let xx = -2; xx <= 2; xx++) {
          const w = 1 / (1 + xx * xx + yy * yy)
          s += clamp(v[((y + yy + size) % size) * size + ((x + xx + size) % size)], 0, 1) * w
        }
      o[y * size + x] = clamp(s * 0.55, 0, 1)
    }
  return toTexture(grayCanvas(size, o), true)
}

// Soft round sprite for particles.
export function genSprite(size = 64) {
  const c = makeCanvas(size)
  const g = c.getContext('2d')
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  grd.addColorStop(0, 'rgba(255,255,255,1)')
  grd.addColorStop(0.25, 'rgba(255,255,255,0.8)')
  grd.addColorStop(0.6, 'rgba(255,255,255,0.18)')
  grd.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grd
  g.fillRect(0, 0, size, size)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

// Foliage (stylised leaf clusters) — albedo only.
export function genLeaves(size = 256, seed = 61) {
  const rgb = new Float32Array(size * size * 3)
  for (let i = 0; i < size * size; i++) {
    const x = i % size,
      y = (i / size) | 0
    const n = tfbm((x / size) * 8, (y / size) * 8, 8, 4)
    const n2 = tfbm((x / size) * 24, (y / size) * 24, 24, 2)
    const s = 0.55 + n * 0.6 + (n2 > 0.6 ? 0.2 : 0)
    rgb[i * 3] = 0.12 * s
    rgb[i * 3 + 1] = 0.3 * s
    rgb[i * 3 + 2] = 0.22 * s
  }
  return toTexture(rgbCanvas(size, rgb), true)
}
