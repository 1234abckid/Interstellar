// Shared math / noise helpers. No allocations in hot paths.
import * as THREE from 'three'

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)
export const lerp = (a, b, t) => a + (b - a) * t
export const smooth = (t) => t * t * (3 - 2 * t)
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt))
export const TAU = Math.PI * 2

// Deterministic PRNG (mulberry32) so the world is identical every run.
export function rng(seed = 1) {
  let a = seed >>> 0
  const f = () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  f.range = (a0, b0) => a0 + (b0 - a0) * f()
  f.int = (a0, b0) => Math.floor(a0 + (b0 - a0 + 1) * f())
  f.pick = (arr) => arr[Math.floor(f() * arr.length)]
  f.sign = () => (f() < 0.5 ? -1 : 1)
  return f
}

// Value noise (2D/3D), tileable 2D variant for textures.
const PERM = new Uint8Array(512)
{
  const r = rng(1337)
  const p = Array.from({ length: 256 }, (_, i) => i)
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r() * (i + 1))
    ;[p[i], p[j]] = [p[j], p[i]]
  }
  for (let i = 0; i < 512; i++) PERM[i] = p[i & 255]
}
const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10)
function hash2(x, y) {
  return PERM[(PERM[x & 255] + y) & 511] / 255
}
function hash3(x, y, z) {
  return PERM[(PERM[(PERM[x & 255] + y) & 511] + z) & 511] / 255
}

// Tileable value noise with period p (integer lattice).
export function tnoise(x, y, p) {
  const xi = Math.floor(x),
    yi = Math.floor(y)
  const xf = x - xi,
    yf = y - yi
  const x0 = ((xi % p) + p) % p,
    y0 = ((yi % p) + p) % p
  const x1 = (x0 + 1) % p,
    y1 = (y0 + 1) % p
  const u = fade(xf),
    v = fade(yf)
  const a = hash2(x0, y0),
    b = hash2(x1, y0),
    c = hash2(x0, y1),
    d = hash2(x1, y1)
  return lerp(lerp(a, b, u), lerp(c, d, u), v)
}
export function tfbm(x, y, p, oct = 5, gain = 0.5) {
  let s = 0,
    amp = 0.5,
    f = 1,
    norm = 0
  for (let i = 0; i < oct; i++) {
    s += amp * tnoise(x * f, y * f, p * f)
    norm += amp
    amp *= gain
    f *= 2
  }
  return s / norm
}

export function noise3(x, y, z) {
  const xi = Math.floor(x),
    yi = Math.floor(y),
    zi = Math.floor(z)
  const xf = x - xi,
    yf = y - yi,
    zf = z - zi
  const u = fade(xf),
    v = fade(yf),
    w = fade(zf)
  const X = xi & 255,
    Y = yi & 255,
    Z = zi & 255
  const c000 = hash3(X, Y, Z),
    c100 = hash3(X + 1, Y, Z),
    c010 = hash3(X, Y + 1, Z),
    c110 = hash3(X + 1, Y + 1, Z)
  const c001 = hash3(X, Y, Z + 1),
    c101 = hash3(X + 1, Y, Z + 1),
    c011 = hash3(X, Y + 1, Z + 1),
    c111 = hash3(X + 1, Y + 1, Z + 1)
  return lerp(lerp(lerp(c000, c100, u), lerp(c010, c110, u), v), lerp(lerp(c001, c101, u), lerp(c011, c111, u), v), w)
}
export function fbm3(x, y, z, oct = 4) {
  let s = 0,
    amp = 0.5,
    f = 1,
    n = 0
  for (let i = 0; i < oct; i++) {
    s += amp * noise3(x * f, y * f, z * f)
    n += amp
    amp *= 0.5
    f *= 2.03
  }
  return s / n
}

// Smooth pseudo-random signal for organic motion (sum of incommensurate sines).
export function wobble(t, seed) {
  return (
    Math.sin(t * 0.731 + seed * 12.9898) * 0.5 +
    Math.sin(t * 1.379 + seed * 78.233) * 0.3 +
    Math.sin(t * 2.117 + seed * 37.719) * 0.2
  )
}

// Yield to the browser so loading animations keep running.
export const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()))

export const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z)

// Shortest signed angle difference.
export function angleDiff(a, b) {
  let d = (b - a) % TAU
  if (d > Math.PI) d -= TAU
  if (d < -Math.PI) d += TAU
  return d
}

// Ray vs sphere; returns distance or -1.
export function raySphere(o, d, c, r) {
  const ox = o.x - c.x,
    oy = o.y - c.y,
    oz = o.z - c.z
  const b = ox * d.x + oy * d.y + oz * d.z
  const cc = ox * ox + oy * oy + oz * oz - r * r
  const h = b * b - cc
  if (h < 0) return -1
  const s = Math.sqrt(h)
  let t = -b - s
  if (t < 0) t = -b + s
  return t < 0 ? -1 : t
}
