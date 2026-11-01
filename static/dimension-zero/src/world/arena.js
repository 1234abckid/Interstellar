// The Fractured Arena: a ruined sky-island where a material-world plaza,
// an alien foundry, a folding hall and a gravity garden surround the
// Dimensional Core. Builds visuals, collision boxes, gravity zones and all
// dimension-reactive structures.
import * as THREE from 'three'
import { boxGeo, bevelBox, rockGeo, islandGeo, GeoBatch } from './geometry.js'
import { barrierMaterial, enhance, G } from './materials.js'
import { DIM_A, DIM_B, DIM_C, DIM_ALL } from '../physics/collision.js'
import { rng, smooth, clamp, lerp, TAU } from '../core/utils.js'

const _q = new THREE.Quaternion()
const _e = new THREE.Euler()
const _m = new THREE.Matrix4()
const _v = new THREE.Vector3()
const _s = new THREE.Vector3(1, 1, 1)

export function buildArena(ctx) {
  const { scene, M, cw } = ctx
  const R = rng(2024)
  const root = new THREE.Group()
  root.name = 'arena'
  scene.add(root)
  const batch = new GeoBatch()
  const out = {
    root,
    zones: [],
    morphers: [],
    barriers: [],
    pickupSpots: [],
    canisterSpots: [],
    crateSpots: [],
    debrisSpots: [],
    spawnPoints: [],
    portals: [],
    hazards: [],
    lifts: [],
  }

  // helpers -----------------------------------------------------------------
  const solid = (cx, y0, cz, w, h, d, mat, opts = {}) => {
    if (mat)
      batch.add(
        opts.bevel ? bevelBox(w, h, d, opts.bevel, opts.ts || 4) : boxGeo(w, h, d, opts.ts || 4),
        mat,
        cx,
        y0 + h / 2,
        cz
      )
    if (opts.noCollide) return null
    return cw.addBlock(cx, y0, cz, w, h, d, opts)
  }
  const glowStrip = (cx, cy, cz, w, h, d, mat = M.glowViolet) => batch.add(boxGeo(w, h, d), mat, cx, cy, cz)

  // ---------------------------------------------------------------- island
  {
    const top = new THREE.CylinderGeometry(52, 52, 1, 72, 1)
    // planar UVs on the cap
    const p = top.attributes.position,
      uv = top.attributes.uv
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 7, p.getZ(i) / 7)
    const topMesh = new THREE.Mesh(top, M.pavement)
    topMesh.position.y = -0.5
    topMesh.receiveShadow = true
    root.add(topMesh)
    const under = new THREE.Mesh(islandGeo(7, 54, 46, -1), M.island)
    under.receiveShadow = true
    root.add(under)
    cw.addBlock(0, -3, 0, 130, 3, 130, { nav: true, tag: 'ground' })
    // edge rim: broken parapet + glowing boundary line
    const rimSegs = 40
    for (let i = 0; i < rimSegs; i++) {
      const a = (i / rimSegs) * TAU
      if (R() < 0.3) continue
      const h = R.range(0.6, 2.4)
      const x = Math.cos(a) * 50.6,
        z = Math.sin(a) * 50.6
      batch.add(bevelBox(R.range(3, 6.5), h, 1.1, 0.1), M.stoneStatic, x, h / 2, z, 0, -a + Math.PI / 2, 0)
    }
    const ringG = new THREE.TorusGeometry(49.6, 0.06, 6, 160)
    ringG.rotateX(Math.PI / 2)
    const ring = new THREE.Mesh(ringG, M.glowCyan)
    ring.position.y = 0.05
    root.add(ring)
  }

  // ------------------------------------------------------------ core dais
  {
    solid(0, 0, 0, 20, 0.5, 20, M.stoneStatic, { bevel: 0.06 })
    solid(0, 0.5, 0, 14, 0.5, 14, M.stoneStatic, { bevel: 0.06 })
    solid(0, 1.0, 0, 8, 0.5, 8, M.metal, { bevel: 0.05 })
    // glowing inlays
    for (const s of [-1, 1]) {
      glowStrip(0, 1.51, s * 3.6, 6.6, 0.02, 0.12, M.glowCyan)
      glowStrip(s * 3.6, 1.51, 0, 0.12, 0.02, 6.6, M.glowCyan)
      glowStrip(0, 1.01, s * 6.8, 13, 0.02, 0.08, M.glowViolet)
      glowStrip(s * 6.8, 1.01, 0, 0.08, 0.02, 13, M.glowViolet)
    }
    // corner pylons
    for (const [sx, sz] of [
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ]) {
      const x = sx * 5.6,
        z = sz * 5.6
      solid(x, 1.0, z, 1.1, 4.2, 1.1, M.tech, { bevel: 0.08 })
      batch.add(boxGeo(0.5, 0.5, 0.5), M.glowViolet, x, 5.5, z, 0.6, 0.6, 0)
    }
  }

  // ------------------------------------------------------------ colonnade
  const pillar = (x, z, h, broken, mat = M.stone, y0 = 0) => {
    batch.add(bevelBox(2.0, 0.7, 2.0, 0.1), mat, x, y0 + 0.35, z)
    const shaftH = h - 1.3
    const shaft = new THREE.CylinderGeometry(0.62, 0.7, shaftH, 14, 3)
    const uv = shaft.attributes.uv
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 1.2, (uv.getY(i) * shaftH) / 4)
    batch.add(shaft, mat, x, y0 + 0.7 + shaftH / 2, z)
    if (!broken) batch.add(bevelBox(1.9, 0.6, 1.9, 0.1), mat, x, y0 + h - 0.3, z)
    else batch.add(rockGeo(R.int(1, 9999), 0.9, { round: 0.1 }), mat, x, y0 + 0.7 + shaftH, z, R(), R(), R())
    cw.addBlock(x, y0, z, 1.5, broken ? h - 0.4 : h, 1.5)
  }
  {
    const n = 16
    const pts = []
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + TAU / 32
      // keep the four cardinal avenues open
      const x = Math.cos(a) * 19,
        z = Math.sin(a) * 19
      const broken = i % 5 === 2 || i % 7 === 4
      const h = broken ? R.range(2.6, 4.2) : 7.2
      pillar(x, z, h, broken)
      pts.push({ x, z, broken, h })
    }
    // lintels between intact neighbours
    for (let i = 0; i < n; i++) {
      const a = pts[i],
        b = pts[(i + 1) % n]
      if (a.broken || b.broken) continue
      const mx = (a.x + b.x) / 2,
        mz = (a.z + b.z) / 2
      const len = Math.hypot(b.x - a.x, b.z - a.z) + 1.6
      const ang = Math.atan2(b.z - a.z, b.x - a.x)
      batch.add(bevelBox(len, 0.8, 1.4, 0.1), M.stone, mx, 7.4, mz, 0, -ang, 0)
      glowStrip(mx, 7.0, mz, 0.1, 0.06, 0.1)
    }
  }

  // ----------------------------------------------------- mid-ring cover
  // Stable cyan cover walls: solid in Material + Inverted, intangible in Fracture.
  const coverDefs = [
    [10.5, -12, 4.5, 1.0],
    [-10.5, -12, 4.5, 1.0],
    [10.5, 12, 4.5, 1.0],
    [-10.5, 12, 4.5, 1.0],
    [26, 5, 1.0, 4.5],
    [-25, -5, 1.0, 4.5],
    [5, 27, 4.0, 1.0],
    [28, -14, 1.0, 4.0],
  ]
  {
    const coverRoot = new THREE.Group()
    root.add(coverRoot)
    const geos = []
    for (const [x, z, w, d] of coverDefs) {
      const h = 1.7
      const g = bevelBox(w, h, d, 0.08, 3)
      g.translate(x, h / 2, z)
      geos.push(g)
      cw.addBlock(x, 0, z, w, h, d, { dims: DIM_A | DIM_B })
      glowStrip(x, h + 0.01, z, w * 0.9, 0.03, d * 0.9, M.glowCyan)
    }
    const b2 = new GeoBatch()
    for (const g of geos) b2.add(g, M.coverAB)
    const meshes = b2.build(coverRoot)
    out.morphers.push({
      update(dt, c) {
        const v = c.dims.w.x + c.dims.w.y
        for (const m of meshes) m.visible = v > 0.01
      },
    })
  }

  // Stone cover: broken walls, rock outcrops, crates
  const brokenWall = (x, z, w, rot) => {
    const h = R.range(1.2, 2.6)
    const along = rot ? [0.9, w] : [w, 0.9]
    batch.add(bevelBox(along[0], h, along[1], 0.08), M.stone, x, h / 2, z)
    // jagged top chunks
    for (let i = 0; i < 3; i++) {
      const t = (i - 1) * (w / 3)
      batch.add(
        rockGeo(R.int(1, 9999), 0.55, { round: 0.05 }),
        M.stone,
        x + (rot ? 0 : t),
        h + 0.15,
        z + (rot ? t : 0),
        R(),
        R(),
        R()
      )
    }
    cw.addBlock(x, 0, z, along[0], h, along[1])
  }
  brokenWall(-11, -21, 5, false)
  brokenWall(16, 26, 6, false)
  brokenWall(-30, 18, 5, true)
  brokenWall(32, 14, 4, true)
  brokenWall(-6, -38, 4, false)
  brokenWall(-36, -24, 4, false)

  const outcrop = (x, z, s, seed) => {
    const g = rockGeo(seed, s, { round: 0.2, sy: R.range(0.8, 1.3) })
    batch.add(g, M.rock, x, s * 0.45, z, 0, R() * TAU, 0)
    cw.addBlock(x, 0, z, s * 1.4, s * 1.05, s * 1.4)
  }
  outcrop(-14, 30, 2.2, 101)
  outcrop(36, 26, 2.8, 102)
  outcrop(-40, 30, 3.0, 103)
  outcrop(22, -8, 1.8, 104)
  outcrop(-22, 6, 1.6, 105)
  outcrop(40, -30, 3.2, 106)

  // static metal crate stacks
  const crateStack = (x, z, n) => {
    for (let i = 0; i < n; i++) {
      const s = 1.4
      const ox = i === 2 ? 0.7 : i * 1.45 - 0.7
      const oy = i === 2 ? s : 0
      batch.add(bevelBox(s, s, s, 0.06, 1.4), M.metal, x + ox, oy + s / 2, z, 0, i * 0.2, 0)
      glowStrip(x + ox, oy + s * 0.5, z + s / 2 + 0.01, s * 0.6, 0.06, 0.02, M.glowCyan)
    }
    cw.addBlock(x, 0, z, 3.0, 1.4, 1.6)
    if (n > 2) cw.addBlock(x, 1.4, z, 1.4, 1.4, 1.4)
  }
  crateStack(14, -22, 3)
  crateStack(-20, 22, 2)
  crateStack(30, 32, 3)
  crateStack(-34, -36, 2)

  // ---------------------------------------------------------- NORTH: foundry
  {
    const WY = 4 // walkway top
    solid(0, WY - 0.5, -33.5, 40, 0.5, 5, M.metal, { bevel: 0.05 })
    // railing (north side) + glow
    solid(0, WY, -35.9, 40, 1.0, 0.2, M.darkChrome)
    glowStrip(0, WY + 1.0, -35.9, 40, 0.05, 0.25, M.glowCyan)
    glowStrip(0, WY - 0.52, -31.0, 40, 0.06, 0.06, M.glowViolet)
    for (const x of [-18, -9, 0, 9, 18]) {
      solid(x, 0, -33.5, 0.9, WY - 0.5, 0.9, M.metal, { bevel: 0.06 })
      glowStrip(x, 2, -33.04, 0.12, 2.6, 0.02, M.glowViolet)
    }
    // west stairs down to the plaza (south-facing)
    for (let k = 1; k <= 7; k++) {
      const top = WY - 0.5 * k
      solid(-18.5, 0, -31 + (k - 0.5), 3, top, 1, M.metal, { bevel: 0.03, ts: 2 })
      glowStrip(-18.5, top + 0.01, -31 + k - 0.08, 2.6, 0.02, 0.06, M.glowCyan)
    }
    // foundry hall facade
    solid(0, 0, -41, 46, 12, 6, M.metal, { bevel: 0.15, ts: 6 })
    batch.add(boxGeo(44, 9, 0.3, 6), M.tech, 0, 6.5, -37.9)
    // arch gate
    batch.add(new THREE.TorusGeometry(5.2, 0.7, 10, 32, Math.PI), M.darkChrome, 0, 4.2 + 3, -37.6)
    batch.add(new THREE.TorusGeometry(5.2, 0.12, 6, 48, Math.PI), M.glowViolet, 0, 7.2, -37.2)
    // conduits / chimneys
    for (const x of [-19, -11, 11, 19]) {
      const g = new THREE.CylinderGeometry(1.1, 1.3, 14, 16, 1)
      batch.add(g, M.metal, x, 13, -42)
      batch.add(new THREE.CylinderGeometry(1.15, 1.15, 0.3, 16), M.glowViolet, x, 17, -42)
      batch.add(new THREE.CylinderGeometry(1.15, 1.15, 0.2, 16), M.glowViolet, x, 11.5, -42)
    }
    // pipes along facade
    for (let i = 0; i < 3; i++) {
      const g = new THREE.CylinderGeometry(0.28, 0.28, 44, 10)
      g.rotateZ(Math.PI / 2)
      batch.add(g, M.darkChrome, 0, 9.2 + i * 0.8, -37.6)
    }
    // machinery blocks on the walkway
    solid(-12, WY, -35, 3, 2.2, 1.6, M.tech, { bevel: 0.08 })
    solid(12, WY, -35, 3, 2.2, 1.6, M.tech, { bevel: 0.08 })
    // ground-level machinery as cover
    solid(-8, 0, -27.5, 3.2, 1.6, 1.4, M.metal, { bevel: 0.08 })
    glowStrip(-8, 1.61, -27.5, 2.8, 0.03, 0.12, M.glowAmber)

    out.pickupSpots.push({ x: 6, y: WY, z: -33.5, type: 'ammo' })
    out.pickupSpots.push({ x: -6, y: WY, z: -33.5, type: 'health' })
    out.canisterSpots.push([-15, WY + 1, -33], [15, WY + 1, -34], [-4, 1, -28.5], [10, 1, -27], [22, 1, -26])
    out.crateSpots.push([4, 1, -27], [5.2, 1, -28.3], [4.6, 2.4, -27.6], [-14, 1, -26.5], [17, 1, -29])
    // gravity lift up to the walkway (Material + Inverted)
    out.lifts.push(addLift(ctx, root, -1.5, 1.5, -29.5, -26.5, WY + 1.8, { x: 0, z: -1 }, DIM_A | DIM_B, out))
  }

  // ------------------------------------------------- EAST: the perch
  {
    const PY = 7
    // rock pillar + platform
    const g = islandGeo(31, 8.5, 14, 0)
    batch.add(g, M.rock, 39, PY - 0.6, 0, 0, 0.4, 0)
    const pg = new THREE.CylinderGeometry(7.2, 6.4, PY, 10, 2)
    batch.add(pg, M.rock, 39, PY / 2 - 0.3, 0)
    cw.addBlock(39, 0, 0, 10, PY, 12)
    solid(39, PY - 0.3, 0, 10, 0.3, 12, M.pavement, { noCollide: true, ts: 6 })
    // shrine
    for (const [x, z] of [
      [35.5, -4.5],
      [42.5, -4.5],
      [35.5, 4.5],
      [42.5, 4.5],
    ])
      pillar(x, z, 5, false, M.stoneStatic, PY)
    out.pickupSpots.push({ x: 39, y: PY, z: 0, type: 'overcharge' })
    out.pickupSpots.push({ x: 41, y: PY, z: 3, type: 'health' })
    out.pickupSpots.push({ x: 37, y: PY, z: -3, type: 'ammo' })
    batch.add(new THREE.TorusGeometry(1.6, 0.08, 6, 40), M.glowAmber, 39, PY + 0.05, 0, Math.PI / 2, 0, 0)
  }

  // ------------------------------------------------- SOUTH: the fold hall
  {
    const H = 7
    // west wall with a 4.4m window sealed by a phase barrier
    solid(-13.5, 0, 27.4, 1, H, 6.8, M.stone, { bevel: 0.08 })
    solid(-13.5, 0, 38.6, 1, H, 6.8, M.stone, { bevel: 0.08 })
    solid(-13.5, 4, 33, 1, H - 4, 4.4, M.stone, { bevel: 0.08 })
    solid(13.5, 0, 33, 1, H, 18, M.stone, { bevel: 0.08 })
    solid(0, 0, 41.5, 28, H, 1, M.stone, { bevel: 0.08 })
    solid(-8.5, 0, 24.5, 11, H, 1, M.stone, { bevel: 0.08 })
    solid(8.5, 0, 24.5, 11, H, 1, M.stone, { bevel: 0.08 })
    solid(0, 4.2, 24.5, 6, H - 4.2, 1, M.stone, { bevel: 0.08 })
    glowStrip(0, 4.15, 24.0, 6, 0.08, 0.08, M.glowCyan)
    // interior columns
    for (const x of [-7, 7])
      for (const z of [29, 33]) {
        solid(x, 0, z, 1.2, H, 1.2, M.stoneStatic, { bevel: 0.06 })
      }
    // vault wall with door gap
    solid(-8, 0, 35.5, 10, H, 1, M.metal, { bevel: 0.08 })
    solid(8, 0, 35.5, 10, H, 1, M.metal, { bevel: 0.08 })
    solid(0, 4, 35.5, 6, H - 4, 1, M.metal, { bevel: 0.08 })
    out.pickupSpots.push(
      { x: -4, y: 0, z: 38.5, type: 'ammo' },
      { x: 4, y: 0, z: 38.5, type: 'health' },
      { x: 0, y: 0, z: 39.5, type: 'overcharge' }
    )
    out.pickupSpots.push({ x: -10, y: 0, z: 27, type: 'ammo' })
    out.canisterSpots.push([10, 1, 27.5])
  }

  // ------------------------------------------------- WEST: gravity garden
  {
    // float zone (always active): props hover, player gets low gravity
    const zone = {
      type: 'float',
      min: { x: -44, y: 0, z: -9 },
      max: { x: -28, y: 12, z: 9 },
      dims: DIM_ALL,
      active: true,
      gravity: 0.32,
    }
    out.zones.push(zone)
    // amber ground ring marking the anomaly
    const ringGeo = new THREE.RingGeometry(0, 1, 64)
    ringGeo.rotateX(-Math.PI / 2)
    const anomalyMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: G.uTime },
      vertexShader: `varying vec2 vP; void main(){ vP = position.xz; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `uniform float uTime; varying vec2 vP; void main(){ float r = length(vP);
        float rings = smoothstep(0.08,0.0,abs(fract(r*6.0 - uTime*0.4)-0.5)-0.4);
        float edge = smoothstep(0.03,0.0,abs(r-0.98));
        float a = (rings*0.25 + edge*0.9) * smoothstep(1.0,0.2,r)*0.8 + edge*0.6;
        gl_FragColor = vec4(vec3(1.0,0.55,0.12)*a, a); }`,
    })
    const ringMesh = new THREE.Mesh(ringGeo, anomalyMat)
    ringMesh.scale.set(8.5, 1, 8.5)
    ringMesh.position.set(-36, 0.03, 0)
    root.add(ringMesh)
    for (let i = 0; i < 12; i++)
      out.debrisSpots.push([-36 + R.range(-6, 6), R.range(1, 5), R.range(-6, 6), R.range(0.5, 1.2)])
    // aqueduct ledge + lift
    solid(-37, 5.5, -14.5, 14, 0.5, 3, M.stone, { bevel: 0.06 })
    for (const x of [-43, -37, -31]) solid(x, 0, -14.5, 1.4, 5.5, 1.4, M.stone, { bevel: 0.06 })
    batch.add(new THREE.TorusGeometry(2.4, 0.5, 8, 20, Math.PI), M.stone, -40, 3.0, -14.5)
    batch.add(new THREE.TorusGeometry(2.4, 0.5, 8, 20, Math.PI), M.stone, -34, 3.0, -14.5)
    out.pickupSpots.push({ x: -41, y: 6, z: -14.5, type: 'health' }, { x: -33, y: 6, z: -14.5, type: 'ammo' })
    out.lifts.push(addLift(ctx, root, -28.5, -25.5, -15.5, -12.5, 7.6, { x: -1, z: 0 }, DIM_A | DIM_B, out))
    // stylised trees
    const tree = (x, z, s) => {
      const trunk = new THREE.CylinderGeometry(0.25 * s, 0.45 * s, 4 * s, 8, 3)
      const p = trunk.attributes.position
      for (let i = 0; i < p.count; i++) {
        const y = p.getY(i)
        p.setX(i, p.getX(i) + Math.sin(y * 0.8) * 0.3 * s)
      }
      trunk.computeVertexNormals()
      batch.add(trunk, M.bark, x, 2 * s, z)
      for (let i = 0; i < 5; i++) {
        const blob = new THREE.IcosahedronGeometry(R.range(1.2, 1.9) * s, 1)
        batch.add(
          blob,
          M.leaves,
          x + R.range(-1.4, 1.4) * s + Math.sin(3.2) * 0.3 * s,
          R.range(4, 5.4) * s,
          z + R.range(-1.4, 1.4) * s
        )
      }
      cw.addBlock(x, 0, z, 0.8 * s, 4 * s, 0.8 * s)
    }
    tree(-44, 12, 1.1)
    tree(-30, 13, 0.9)
    tree(-46, -6, 1.0)
    tree(-24, -20, 0.8)
    tree(20, 40, 0.9)
    tree(42, 16, 1.0)
    // ruined arches
    batch.add(new THREE.TorusGeometry(3, 0.55, 8, 22, Math.PI), M.stone, -45, 4.2, 4, 0, Math.PI / 2, 0)
    for (const z of [1, 7]) solid(-45, 0, z, 1.1, 4.2, 1.1, M.stone, { bevel: 0.06 })
  }

  // ---------------------------------------- dimension: Inverted bridge (east)
  {
    const slabs = []
    const path = []
    // L-shaped route kept inside the island boundary (r < 49): east along the walkway line, then south to the perch
    for (let i = 0; i < 5; i++) path.push([21.8 + i * 3.1, -33.5])
    for (let i = 1; i <= 9; i++) path.push([34.2, -33.5 + i * 3.0])
    const n = path.length
    // all slabs share three instanced meshes (plate, rock underside, glowing
    // edges): 3 draw calls for the whole bridge instead of 4 per slab
    const plateIM = new THREE.InstancedMesh(bevelBox(3.1, 0.35, 3.1, 0.06, 3), M.techCyan, n)
    const rockIM = new THREE.InstancedMesh(rockGeo(500, 1.5, { sy: 0.7, round: 0.15 }), M.rockDark, n)
    const edgeIM = new THREE.InstancedMesh(boxGeo(3.15, 0.04, 0.08), M.glowCyan, n * 2)
    for (const im of [plateIM, rockIM, edgeIM]) {
      im.frustumCulled = false // instances fly around the east void
      root.add(im)
    }
    plateIM.castShadow = plateIM.receiveShadow = true
    rockIM.castShadow = true
    const rockLocal = [],
      edgeLocal = [
        new THREE.Matrix4().makeTranslation(0, 0.18, 1.52),
        new THREE.Matrix4().makeTranslation(0, 0.18, -1.52),
      ]
    for (let i = 0; i < n; i++) {
      const [x, z] = path[i]
      const top = 4 + ((i + 1) / n) * 3.0
      const grp = new THREE.Object3D() // transform holder (rendered via the instanced meshes)
      rockLocal.push(
        new THREE.Matrix4().compose(
          new THREE.Vector3(0, -0.9, 0),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(0, R() * 6.28, 0)),
          new THREE.Vector3(R.range(0.85, 1.15), R.range(0.8, 1.2), R.range(0.85, 1.15))
        )
      )
      const col = cw.addBlock(x, top - 0.35, z, 3.1, 0.35, 3.1, { dims: DIM_B, nav: false, enabled: false })
      // scattered "Material" pose: hovering, tumbling around the east void
      const ap = new THREE.Vector3(x + R.range(-6, 6), top + R.range(2, 9), z + R.range(-5, 5))
      const cp = new THREE.Vector3(x + R.range(-3, 3), top + R.range(10, 18), z + R.range(-3, 3))
      slabs.push({
        grp,
        col,
        bridge: new THREE.Vector3(x, top - 0.175, z),
        ap,
        cp,
        seed: R() * 10,
        axis: new THREE.Vector3(R() - 0.5, R() - 0.5, R() - 0.5).normalize(),
        t: 0,
        i,
      })
    }
    out.morphers.push({
      update(dt, c) {
        const target = c.dims.current === 1 ? 1 : 0
        const time = c.time
        for (const s of slabs) {
          // staggered assembly so the bridge visibly builds itself from the walkway outward
          const rate = target ? 2.2 : 1.6
          const delay = target ? s.i * 0.035 : 0
          s.d = (s.d || 0) + dt
          if (c.dims.changedAt !== s.lastChange) {
            s.lastChange = c.dims.changedAt
            s.d = 0
          }
          if (s.d > delay) s.t = clamp(s.t + (target ? 1 : -1) * rate * dt, 0, 1)
          const k = smooth(s.t)
          const fw = c.dims.w.z
          const wob = Math.sin(time * 0.5 + s.seed) * 0.6
          _v.copy(s.ap).lerp(s.cp, fw)
          _v.y += wob
          s.grp.position.lerpVectors(_v, s.bridge, k)
          _q.setFromAxisAngle(s.axis, (time * 0.25 + s.seed) * (1 - k) * 1.0)
          s.grp.quaternion.copy(_q)
          s.col.enabled = target === 1 && s.t > 0.94
          s.grp.updateMatrix()
          const i = s.i
          plateIM.setMatrixAt(i, s.grp.matrix)
          rockIM.setMatrixAt(i, _m.multiplyMatrices(s.grp.matrix, rockLocal[i]))
          edgeIM.setMatrixAt(i * 2, _m.multiplyMatrices(s.grp.matrix, edgeLocal[0]))
          edgeIM.setMatrixAt(i * 2 + 1, _m.multiplyMatrices(s.grp.matrix, edgeLocal[1]))
        }
        plateIM.instanceMatrix.needsUpdate = true
        rockIM.instanceMatrix.needsUpdate = true
        edgeIM.instanceMatrix.needsUpdate = true
      },
      slabs,
    })
    out.bridgeSlabs = slabs
  }

  // ---------------------------------------- dimension: Fracture staircase (east)
  {
    const steps = 14
    const sgeo = []
    for (let k = 1; k <= steps; k++) {
      const x = 20 + k - 0.5
      const top = 0.5 * k
      const g = rockGeo(700 + k, 1, { sx: 1.0, sy: 0.4, sz: 3.0, round: 0.05, cuts: 2 })
      g.translate(x, top - 0.2, 0)
      sgeo.push(g)
      cw.addBlock(x, top - 0.4, 0, 1.0, 0.4, 3.0, { dims: DIM_C, nav: false })
    }
    const b2 = new GeoBatch()
    sgeo.forEach((g) => b2.add(g, M.stairC))
    const [stairMesh] = b2.build(root)
    // ghost echoes: the staircase appears to occupy several positions at once
    const ghostMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0.8, 0.3, 1.6),
      transparent: true,
      opacity: 0.12,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    const ghosts = [0, 1].map(() => {
      const gm = new THREE.Mesh(stairMesh.geometry, ghostMat)
      root.add(gm)
      return gm
    })
    out.morphers.push({
      update(dt, c) {
        const w = c.dims.w.z
        stairMesh.visible = w > 0.01
        ghosts.forEach((g, i) => {
          g.visible = w > 0.3
          g.position.set(
            Math.sin(c.time * 0.7 + i * 2) * 0.6,
            Math.cos(c.time * 0.9 + i) * 0.35,
            Math.sin(c.time * 0.5 + i * 3) * 0.8
          )
          ghostMat.opacity = 0.12 * w
        })
      },
    })
  }

  // ---------------------------------------- phase barriers (Material + Inverted)
  {
    const defs = [
      // [cx, cz, w, d] vertical energy walls
      [-13.5, 33, 0.3, 4.5], // hall west window shortcut (wall gap made below)
      [0, -19, 6, 0.3], // north avenue gate
      [-19, 0, 0.3, 6], // west avenue gate
    ]
    // cut the window in the hall's west wall: replace with two wall pieces + lintel
    // (simplest: the wall above remains; barrier occupies a 4.5m gap)
    for (const [x, z, w, d] of defs) {
      const h = 4
      const mat = barrierMaterial()
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(Math.max(w, d), h), mat)
      mesh.position.set(x, h / 2, z)
      if (d > w) mesh.rotation.y = Math.PI / 2
      root.add(mesh)
      const col = cw.addBlock(x, 0, z, Math.max(w, 0.3), h, Math.max(d, 0.3), { dims: DIM_A | DIM_B, kind: 'barrier' })
      // emitter posts
      for (const s of [-1, 1]) {
        const px = d > w ? x : x + (s * w) / 2
        const pz = d > w ? z + (s * d) / 2 : z
        batch.add(bevelBox(0.5, h + 0.4, 0.5, 0.05), M.darkChrome, px, (h + 0.4) / 2, pz)
        batch.add(boxGeo(0.15, h, 0.15), M.glowViolet, px + (d > w ? 0.26 : 0), h / 2, pz + (d > w ? 0 : 0.26))
        cw.addBlock(px, 0, pz, 0.5, h + 0.4, 0.5)
      }
      out.barriers.push({ mesh, mat, col })
    }
  }

  // ---------------------------------------- vault door (opens in Fracture)
  {
    const halves = []
    for (const s of [-1, 1]) {
      const g = new THREE.Group()
      const m = new THREE.Mesh(bevelBox(3, 4, 0.6, 0.06, 2), M.vaultDoor)
      m.castShadow = m.receiveShadow = true
      g.add(m)
      const strip = new THREE.Mesh(boxGeo(0.1, 3.6, 0.65), M.glowViolet)
      strip.position.x = -s * 1.45
      g.add(strip)
      g.position.set(s * 1.5, 2, 35.5)
      root.add(g)
      halves.push({ g, s })
    }
    cw.addBlock(0, 0, 35.5, 6, 4, 0.6, { dims: DIM_A | DIM_B })
    out.morphers.push({
      update(dt, c) {
        const w = c.dims.w.z
        for (const h of halves) {
          // the door doesn't slide: it folds along an impossible diagonal
          h.g.position.x = h.s * (1.5 + w * 2.6)
          h.g.rotation.y = h.s * w * 1.2
          h.g.rotation.z = h.s * w * 0.3
          h.g.position.y = 2 + Math.sin(w * Math.PI) * 0.6
        }
      },
    })
  }

  // hall roof: in Fracture its plates unfold to the sky
  {
    const plates = []
    for (let i = 0; i < 6; i++) {
      const g = new THREE.Mesh(boxGeo(28, 0.5, 3.0, 4), M.metalFrac)
      g.castShadow = g.receiveShadow = true
      const z = 25.5 + i * 3 + 1.0
      g.position.set(0, 7.25, z)
      root.add(g)
      plates.push({ g, z, i })
    }
    out.morphers.push({
      update(dt, c) {
        const w = smooth(c.dims.w.z)
        for (const p of plates) {
          const k = clamp(w * 1.4 - p.i * 0.07, 0, 1)
          p.g.position.y = 7.25 + k * (3 + p.i * 1.5)
          p.g.rotation.x = k * (p.i % 2 ? 0.6 : -0.6)
          p.g.rotation.z = k * (p.i - 2.5) * 0.08
        }
      },
    })
  }

  // ---------------------------------------- fracture hazards (C only)
  for (const [x, z, r] of [
    [-12, -4, 2.6],
    [14, 4, 2.4],
    [2, -24, 2.4],
    [-26, 22, 2.6],
  ]) {
    const geo = new THREE.CircleGeometry(r, 40)
    geo.rotateX(-Math.PI / 2)
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: G.uTime, uDimW: G.uDimW, uR: { value: r } },
      vertexShader: `varying vec2 vP; void main(){ vP = position.xz; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `uniform float uTime; uniform vec3 uDimW; uniform float uR; varying vec2 vP;
        float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
        void main(){ float r = length(vP)/uR; float a = atan(vP.y, vP.x);
          float spokes = smoothstep(0.12, 0.0, abs(sin(a*7.0 + h(floor(vec2(a*7.0,0.0)))*3.0 + r*4.0)) - 0.02) * (1.0-r);
          float pulse = 0.6+0.4*sin(uTime*6.0 + r*10.0);
          float edge = smoothstep(0.05,0.0,abs(r-0.95));
          float w = uDimW.z;
          float a2 = (spokes*pulse + edge*0.7 + (1.0-r)*0.25) * w;
          gl_FragColor = vec4(vec3(1.6,0.45,0.1)*a2, a2); }`,
    })
    const m = new THREE.Mesh(geo, mat)
    m.position.set(x, 0.04, z)
    root.add(m)
    out.hazards.push({ x, z, r, mesh: m })
  }

  // ---------------------------------------- Fracture portals (teleport pair)
  {
    const make = (x, y, z, ry) => {
      const grp = new THREE.Group()
      const ringM = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.18, 10, 48), M.darkChrome)
      const glow = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.06, 6, 64), M.glowViolet)
      glow.position.z = 0.12
      const disc = new THREE.Mesh(
        new THREE.CircleGeometry(1.5, 48),
        new THREE.ShaderMaterial({
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
          uniforms: { uTime: G.uTime, uDimW: G.uDimW },
          vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
          fragmentShader: `uniform float uTime; uniform vec3 uDimW; varying vec2 vUv;
            void main(){ vec2 p = vUv*2.0-1.0; float r = length(p); float a = atan(p.y,p.x);
              float s = 0.5+0.5*sin(a*5.0 - r*12.0 + uTime*4.0);
              float k = (s*0.6 + 0.4) * smoothstep(1.0, 0.2, r) * uDimW.z;
              gl_FragColor = vec4(vec3(0.7,0.3,1.6)*k*1.2 + vec3(0.4,0.8,1.8)*smoothstep(0.3,0.0,r)*uDimW.z, k); }`,
        })
      )
      grp.add(ringM, glow, disc)
      grp.position.set(x, y + 1.8, z)
      grp.rotation.y = ry
      root.add(grp)
      return { grp, pos: new THREE.Vector3(x, y, z), ry }
    }
    const a = make(-38, 0, 12, 0.3)
    const b = make(-6, 4, -33.5, Math.PI / 2)
    a.target = b
    b.target = a
    out.portals.push(a, b)
    out.morphers.push({
      update(dt, c) {
        const w = c.dims.w.z
        for (const p of out.portals) {
          p.grp.visible = w > 0.01
          p.grp.scale.setScalar(0.2 + 0.8 * smooth(w))
          p.grp.children[1].rotation.z += dt * 0.5
        }
      },
    })
  }

  // ---------------------------------------- Inverted: pylons stretch & split
  {
    const pyl = []
    for (const [x, z] of [
      [12, -2],
      [-2, -14],
      [-12, 2],
      [2, 14],
    ]) {
      const segs = []
      for (let i = 0; i < 4; i++) {
        const m = new THREE.Mesh(bevelBox(0.9, 1.2, 0.9, 0.08, 2), i % 2 ? M.tech : M.metal)
        m.castShadow = true
        m.position.set(x, 0.6 + i * 1.2, z)
        root.add(m)
        segs.push(m)
      }
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1, 6), M.glowViolet)
      root.add(beam)
      cw.addBlock(x, 0, z, 0.9, 4.8, 0.9)
      pyl.push({ segs, x, z, beam, seed: x * 0.3 + z })
    }
    out.morphers.push({
      update(dt, c) {
        const wb = smooth(c.dims.w.y)
        const wc = c.dims.w.z
        for (const p of pyl) {
          for (let i = 0; i < p.segs.length; i++) {
            const s = p.segs[i]
            // Inverted: segments separate upward and spin; Fracture: they drift sideways
            const lift = i === 0 ? 0 : wb * (i * 1.6 + Math.sin(c.time * 0.8 + i + p.seed) * 0.3)
            s.position.set(
              p.x + wc * Math.sin(c.time * 0.6 + i * 1.7) * 0.5 * i,
              0.6 + i * 1.2 + lift,
              p.z + wc * Math.cos(c.time * 0.5 + i) * 0.5 * i
            )
            s.rotation.y = wb * (c.time * 0.4 * (i % 2 ? 1 : -1)) + i * 0.2
            s.scale.y = 1 + wb * 0.35 * (i % 2)
          }
          const top = p.segs[3].position.y
          p.beam.visible = wb > 0.05
          p.beam.position.set(p.x, (0.6 + top) / 2, p.z)
          p.beam.scale.set(1, Math.max(0.01, top - 0.6), 1)
        }
      },
    })
  }

  // ---------------------------------------- spawn points (rift portals)
  out.spawnPoints.push(
    new THREE.Vector3(-30, 0, -30),
    new THREE.Vector3(28, 0, -22),
    new THREE.Vector3(30, 0, 22),
    new THREE.Vector3(-24, 0, 30),
    new THREE.Vector3(-44, 0, -2),
    new THREE.Vector3(24, 0, 44),
    new THREE.Vector3(-8, 0, 46),
    new THREE.Vector3(44, 0, -14)
  )

  // ------------------------------------------------------------- backdrop
  buildBackdrop(ctx, root, out, R)

  batch.build(root)
  return out
}

// Gravity lift: amber column that reverses gravity and nudges riders onto a ledge.
function addLift(ctx, root, x0, x1, z0, z1, topY, push, dims, out) {
  const { M } = ctx
  const cx = (x0 + x1) / 2,
    cz = (z0 + z1) / 2
  const w = x1 - x0,
    d = z1 - z0
  const zone = {
    type: 'lift',
    min: { x: x0, y: -1, z: z0 },
    max: { x: x1, y: topY, z: z1 },
    dims,
    active: true,
    push,
    topY,
  }
  out.zones.push(zone)
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: G.uTime, uOn: { value: 1 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `uniform float uTime; uniform float uOn; varying vec2 vUv;
      void main(){ float s = smoothstep(0.3, 0.0, abs(fract(vUv.y*6.0 - uTime*1.4)-0.5)-0.2);
        float f = (1.0 - vUv.y) * (0.15 + s*0.35) * uOn;
        gl_FragColor = vec4(vec3(1.0,0.6,0.15)*f, f); }`,
  })
  const col = new THREE.Mesh(
    new THREE.CylinderGeometry(Math.min(w, d) * 0.55, Math.min(w, d) * 0.62, topY, 24, 1, true),
    mat
  )
  col.position.set(cx, topY / 2, cz)
  root.add(col)
  const base = new THREE.Mesh(new THREE.TorusGeometry(Math.min(w, d) * 0.6, 0.08, 6, 40), M.glowAmber)
  base.rotation.x = Math.PI / 2
  base.position.set(cx, 0.06, cz)
  root.add(base)
  const pad = new THREE.Mesh(
    new THREE.CylinderGeometry(Math.min(w, d) * 0.66, Math.min(w, d) * 0.7, 0.12, 24),
    M.darkChrome
  )
  pad.position.set(cx, 0.04, cz)
  pad.receiveShadow = true
  root.add(pad)
  const lift = { zone, mat, col, base, dims }
  out.morphers.push({
    update(dt, c) {
      const on = (c.dims.mask & dims) !== 0
      zone.active = on
      mat.uniforms.uOn.value = lerp(mat.uniforms.uOn.value, on ? 1 : 0, 1 - Math.exp(-8 * dt))
      base.visible = mat.uniforms.uOn.value > 0.05
    },
  })
  return lift
}

// Distant world: floating islands with ruins, spires, a giant orbital ring,
// orbiting stone cubes. These invert in the Inverted reality.
function buildBackdrop(ctx, root, out, R) {
  const { M } = ctx
  const islands = []
  const defs = [
    [-120, 30, -160, 26],
    [150, 50, -120, 34],
    [170, 10, 90, 22],
    [-160, 60, 80, 30],
    [40, 85, -230, 40],
    [-60, -30, 190, 26],
    [240, 70, -10, 28],
    [-230, 20, -40, 24],
  ]
  defs.forEach(([x, y, z, r], i) => {
    const grp = new THREE.Group()
    const isl = new THREE.Mesh(islandGeo(900 + i, r, r * 1.6, 0), M.island)
    grp.add(isl)
    // ruins on top
    const b = new GeoBatch()
    const rr = rng(77 + i)
    const towers = rr.int(2, 5)
    for (let t = 0; t < towers; t++) {
      const a = rr() * TAU,
        d = rr() * r * 0.5
      const h = rr.range(8, 34)
      const w = rr.range(3, 8)
      b.add(
        boxGeo(w, h, w, 6),
        rr() < 0.5 ? M.stoneStatic : M.metal,
        Math.cos(a) * d,
        h / 2,
        Math.sin(a) * d,
        0,
        rr() * TAU,
        0
      )
      if (rr() < 0.6) b.add(boxGeo(w * 1.2, 0.8, w * 1.2), M.glowViolet, Math.cos(a) * d, h + 0.65, Math.sin(a) * d)
    }
    b.build(grp, { cast: false, receive: false })
    grp.position.set(x, y, z)
    root.add(grp)
    islands.push({ grp, base: new THREE.Vector3(x, y, z), seed: rr() * 10, flip: 0 })
  })
  // giant tilted orbital ring around the vortex direction
  const ringGrp = new THREE.Group()
  const ring = new THREE.Mesh(new THREE.TorusGeometry(120, 3.5, 12, 160), M.darkChrome)
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(120, 0.9, 6, 200), M.glowViolet)
  ring2.position.z = 2
  ringGrp.add(ring, ring2)
  // segmented blocks on the ring
  const blockGeo = boxGeo(10, 7, 9)
  const inst = new THREE.InstancedMesh(blockGeo, M.metal, 46)
  for (let i = 0; i < 46; i++) {
    const a = (i / 46) * TAU
    _m.compose(
      _v.set(Math.cos(a) * 120, Math.sin(a) * 120, 0),
      _q.setFromEuler(_e.set(0, 0, a)),
      _s.set(1, R.range(0.6, 1.6), 1)
    )
    inst.setMatrixAt(i, _m)
  }
  ringGrp.add(inst)
  ringGrp.position.set(330, 250, -430)
  ringGrp.lookAt(0, 0, 0)
  root.add(ringGrp)
  // orbiting stone cubes around the arena
  const cubeCount = 60
  const cubes = new THREE.InstancedMesh(
    rockGeo(4242, 1, { sx: 1, sy: 1, sz: 1, round: 0.05, cuts: 3 }),
    M.rockDark,
    cubeCount
  )
  cubes.castShadow = false
  cubes.frustumCulled = false // instances orbit far from their initial bounds
  const cubeData = []
  for (let i = 0; i < cubeCount; i++) {
    cubeData.push({
      r: R.range(62, 140),
      a: R() * TAU,
      y: R.range(-20, 60),
      s: R.range(1.5, 6),
      sp: R.range(0.01, 0.04) * R.sign(),
      rs: R.range(0.05, 0.3),
      ax: new THREE.Vector3(R() - 0.5, R() - 0.5, R() - 0.5).normalize(),
      seed: R() * 10,
    })
  }
  root.add(cubes)
  out.morphers.push({
    update(dt, c) {
      const wb = c.dims.w.y,
        wc = c.dims.w.z
      for (const is of islands) {
        is.grp.position.set(
          is.base.x,
          is.base.y + Math.sin(c.time * 0.1 + is.seed) * 3 + wb * 20 * Math.sin(is.seed),
          is.base.z
        )
        // Inverted: islands turn upside-down
        is.grp.rotation.set(
          wb * Math.PI + Math.sin(c.time * 0.05 + is.seed) * 0.05,
          c.time * 0.01 + is.seed,
          wc * 0.4 * Math.sin(is.seed * 3)
        )
      }
      ringGrp.rotation.z += dt * (0.01 + wc * 0.04)
      for (let i = 0; i < cubeCount; i++) {
        const d = cubeData[i]
        const a = d.a + c.time * d.sp * (1 + wc * 2)
        const y = d.y + Math.sin(c.time * 0.2 + d.seed) * 4 + wb * 30 * Math.sin(d.seed * 2)
        _q.setFromAxisAngle(d.ax, c.time * d.rs + d.seed)
        _m.compose(
          _v.set(Math.cos(a) * d.r, y, Math.sin(a) * d.r),
          _q,
          _s.setScalar(d.s * (1 + wc * 0.3 * Math.sin(c.time + d.seed)))
        )
        cubes.setMatrixAt(i, _m)
      }
      cubes.instanceMatrix.needsUpdate = true
    },
  })
}
