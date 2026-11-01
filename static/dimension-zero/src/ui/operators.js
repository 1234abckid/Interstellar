// Operators & skins (from the Dimension Zero operator sheet). Each operator is
// a procedurally modelled 3D character; skins re-dress any operator and also
// recolour the first-person sleeves, gloves and weapon energy accents.
import * as THREE from 'three'
import { bevelBox, rockGeo } from '../world/geometry.js'
import { rng, TAU } from '../core/utils.js'

export const OPERATORS = [
  {
    id: 'executioner',
    name: 'THE EXECUTIONER',
    tagline: 'No dimension can hide you.',
    head: 'hood',
    portrait: 'assets/ui/op_0.jpg',
    trait: 'Void Dash recharges 20% faster',
    mod: { dashCD: 0.8 },
  },
  {
    id: 'static',
    name: 'STATIC',
    tagline: 'Signal through the noise.',
    head: 'goggles',
    portrait: 'assets/ui/op_1.jpg',
    trait: 'Speed Boost lasts 2s longer',
    mod: { boostT: 2 },
  },
  {
    id: 'wraith',
    name: 'WRAITH',
    tagline: 'A face the void forgot.',
    head: 'blank',
    portrait: 'assets/ui/op_2.jpg',
    trait: 'Fracture stability lasts 25% longer',
    mod: { stability: 1.25 },
  },
  {
    id: 'vanguard',
    name: 'VANGUARD',
    tagline: 'Armor forged between realities.',
    head: 'visor',
    portrait: 'assets/ui/op_3.jpg',
    trait: '+25 maximum health',
    mod: { health: 25 },
  },
  {
    id: 'drifter',
    name: 'DRIFTER',
    tagline: 'Walked out of a collapsing world.',
    head: 'bare',
    portrait: 'assets/ui/op_4.jpg',
    trait: 'Dimension Shift cooldown -30%',
    mod: { shiftCD: 0.7 },
  },
  {
    id: 'sentinel',
    name: 'SENTINEL',
    tagline: 'Holds the line in every timeline.',
    head: 'helmet',
    portrait: 'assets/ui/op_5.jpg',
    trait: 'Takes 15% less damage',
    mod: { armor: 0.85 },
  },
  {
    id: 'halcyon',
    name: 'HALCYON',
    tagline: 'Calm at the edge of zero.',
    head: 'silver',
    portrait: 'assets/ui/op_6.jpg',
    trait: 'Dimension Slam recharges twice as fast',
    mod: { slamCD: 0.5 },
  },
]

const C = (r, g, b) => [r, g, b]
export const SKINS = [
  {
    id: 'default',
    name: 'DEFAULT',
    thumb: 'assets/ui/skin_default.jpg',
    cloth: 0x16141d,
    cloth2: 0x25202f,
    pants: 0x1a1820,
    glove: 0x0f0e13,
    metal: 0x2b2b35,
    accent: C(1.5, 0.55, 3.2),
    eyes: C(1.8, 0.6, 3.4),
  },
  {
    id: 'monarch',
    name: 'MONARCH',
    thumb: 'assets/ui/skin_monarch.jpg',
    cloth: 0x18160f,
    cloth2: 0x2a2416,
    pants: 0x1b1a16,
    glove: 0x14120d,
    metal: 0x4a3c1c,
    accent: C(3.0, 2.0, 0.55),
    eyes: C(3.0, 2.2, 0.7),
    crown: true,
  },
  {
    id: 'techno',
    name: 'TECHNO',
    thumb: 'assets/ui/skin_techno.jpg',
    cloth: 0x10152a,
    cloth2: 0x1b2244,
    pants: 0x121731,
    glove: 0x0c0f1c,
    metal: 0x2a3150,
    accent: C(1.1, 0.7, 3.4),
    eyes: C(1.6, 0.8, 3.6),
    armor: true,
  },
  {
    id: 'viridian',
    name: 'VIRIDIAN',
    thumb: 'assets/ui/skin_viridian.jpg',
    cloth: 0x101510,
    cloth2: 0x1c261c,
    pants: 0x151a15,
    glove: 0x0d100d,
    metal: 0x283228,
    accent: C(0.7, 3.0, 0.7),
    eyes: C(0.8, 3.2, 0.8),
  },
  {
    id: 'ritual',
    name: 'RITUAL',
    thumb: 'assets/ui/skin_ritual.jpg',
    cloth: 0xd4cfc6,
    cloth2: 0xb8b2a8,
    pants: 0x2a2626,
    glove: 0x1d1b1b,
    metal: 0x5a2222,
    accent: C(3.0, 0.35, 0.35),
    eyes: C(3.2, 0.4, 0.4),
  },
  {
    id: 'blackout',
    name: 'BLACKOUT',
    thumb: 'assets/ui/skin_blackout.jpg',
    cloth: 0x09090b,
    cloth2: 0x111114,
    pants: 0x0b0b0d,
    glove: 0x070708,
    metal: 0x16161a,
    accent: C(0.7, 0.7, 0.85),
    eyes: C(0.9, 0.9, 1.1),
  },
  {
    id: 'haven',
    name: 'HAVEN',
    thumb: 'assets/ui/skin_haven.jpg',
    cloth: 0xc7cbd6,
    cloth2: 0x8f9bb4,
    pants: 0x283a5c,
    glove: 0x1b2a46,
    metal: 0x34507a,
    accent: C(0.4, 1.7, 3.2),
    eyes: C(0.5, 1.8, 3.4),
  },
  {
    id: 'requiem',
    name: 'REQUIEM',
    thumb: 'assets/ui/skin_requiem.jpg',
    cloth: 0x151010,
    cloth2: 0x241818,
    pants: 0x161111,
    glove: 0x100c0c,
    metal: 0x3a1a1a,
    accent: C(3.2, 0.25, 0.25),
    eyes: C(3.4, 0.3, 0.3),
  },
  {
    id: 'omega',
    name: 'OMEGA',
    thumb: 'assets/ui/skin_omega.jpg',
    cloth: 0x1c1036,
    cloth2: 0x2c1a50,
    pants: 0x170d2c,
    glove: 0x120a22,
    metal: 0x3a2a66,
    accent: C(2.6, 0.6, 3.4),
    eyes: C(2.0, 1.2, 3.6),
    armor: true,
    iridescent: true,
  },
]

export function loadSelection() {
  try {
    const s = JSON.parse(localStorage.getItem('dz.operator') || '{}')
    return {
      op: Math.min(OPERATORS.length - 1, Math.max(0, s.op | 0)),
      skin: Math.min(SKINS.length - 1, Math.max(0, s.skin | 0)),
    }
  } catch {
    return { op: 0, skin: 0 }
  }
}
export function saveSelection(sel) {
  try {
    localStorage.setItem('dz.operator', JSON.stringify(sel))
  } catch {}
}

// ---------------------------------------------------------------------------
const matCache = new Map()
function mat(key, make) {
  if (!matCache.has(key)) matCache.set(key, make())
  return matCache.get(key)
}
export function skinMaterials(skin) {
  const k = skin.id
  return {
    cloth: mat(k + 'cloth', () =>
      skin.iridescent
        ? new THREE.MeshPhysicalMaterial({
            color: skin.cloth,
            roughness: 0.45,
            metalness: 0.3,
            iridescence: 1,
            iridescenceIOR: 1.6,
            sheen: 0.6,
            sheenColor: new THREE.Color(0.8, 0.4, 1),
            side: THREE.DoubleSide,
          })
        : new THREE.MeshStandardMaterial({ color: skin.cloth, roughness: 0.92, metalness: 0.0, side: THREE.DoubleSide })
    ),
    cloth2: mat(
      k + 'cloth2',
      () => new THREE.MeshStandardMaterial({ color: skin.cloth2, roughness: 0.8, metalness: 0.05 })
    ),
    pants: mat(k + 'pants', () => new THREE.MeshStandardMaterial({ color: skin.pants, roughness: 0.95 })),
    glove: mat(
      k + 'glove',
      () => new THREE.MeshStandardMaterial({ color: skin.glove, roughness: 0.6, metalness: 0.1 })
    ),
    metal: mat(
      k + 'metal',
      () => new THREE.MeshStandardMaterial({ color: skin.metal, roughness: 0.35, metalness: 0.9 })
    ),
    accent: mat(k + 'accent', () => new THREE.MeshBasicMaterial({ color: new THREE.Color(...skin.accent) })),
    eyes: mat(k + 'eyes', () => new THREE.MeshBasicMaterial({ color: new THREE.Color(...skin.eyes) })),
    mask: mat(k + 'mask', () => new THREE.MeshStandardMaterial({ color: 0x0b0b0e, roughness: 0.3, metalness: 0.6 })),
    gold: mat('gold', () => new THREE.MeshStandardMaterial({ color: 0xd8a640, roughness: 0.25, metalness: 1 })),
  }
}
const skinTone = new THREE.MeshStandardMaterial({ color: 0xc89a7a, roughness: 0.7 })
const hairBrown = new THREE.MeshStandardMaterial({ color: 0x3a2516, roughness: 0.8, flatShading: true })
const hairSilver = new THREE.MeshStandardMaterial({
  color: 0xd8dae2,
  roughness: 0.5,
  metalness: 0.2,
  flatShading: true,
})
const whiteMask = new THREE.MeshStandardMaterial({ color: 0xa8a6a2, roughness: 0.6, side: THREE.DoubleSide })
const lensBlue = new THREE.MeshPhysicalMaterial({
  color: 0x2a6cff,
  roughness: 0.05,
  metalness: 0.4,
  emissive: new THREE.Color(0.1, 0.3, 0.9),
  emissiveIntensity: 0.8,
})

function mesh(geo, m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const o = new THREE.Mesh(geo, m)
  o.position.set(x, y, z)
  o.rotation.set(rx, ry, rz)
  o.castShadow = true
  o.receiveShadow = true
  return o
}
const cyl = (rt, rb, h, s = 12) => new THREE.CylinderGeometry(rt, rb, h, s)

// Build a stylised operator (~1.85m). Returns a Group with .userData.parts for idle animation.
export function buildOperator(op, skin) {
  const m = skinMaterials(skin)
  const root = new THREE.Group()
  const body = new THREE.Group()
  root.add(body)
  // legs
  for (const s of [-1, 1]) {
    const leg = new THREE.Group()
    leg.position.set(s * 0.13, 0.95, 0)
    leg.add(mesh(cyl(0.11, 0.095, 0.48), m.pants, 0, -0.24, 0))
    leg.add(mesh(cyl(0.095, 0.08, 0.46), m.pants, 0, -0.68, 0.02))
    leg.add(mesh(bevelBox(0.16, 0.13, 0.22, 0.03), m.cloth2, 0, -0.5, 0.06)) // knee pad
    leg.add(mesh(bevelBox(0.15, 0.12, 0.3, 0.03), m.glove, 0, -0.9, 0.05)) // boot
    leg.add(mesh(bevelBox(0.17, 0.2, 0.06, 0.02), m.cloth2, s * 0.06, -0.26, 0.09)) // cargo pocket
    leg.rotation.x = s * 0.05
    body.add(leg)
  }
  // pelvis + torso
  body.add(mesh(bevelBox(0.38, 0.18, 0.24, 0.05), m.pants, 0, 1.0, 0))
  body.add(mesh(bevelBox(0.4, 0.06, 0.26, 0.02), m.metal, 0, 1.08, 0)) // belt
  const torso = new THREE.Group()
  torso.position.y = 1.1
  body.add(torso)
  torso.add(mesh(cyl(0.2, 0.17, 0.5, 14), m.cloth, 0, 0.25, 0))
  if (op.head === 'hood' || op.head === 'blank' || op.head === 'silver') {
    // open long coat: flared skirt from the waist to the knees, split at the front
    const coat = mesh(
      new THREE.CylinderGeometry(0.22, 0.3, 0.62, 20, 1, true, Math.PI * 0.62, Math.PI * 1.76),
      m.cloth,
      0,
      -0.3,
      -0.01
    )
    coat.material = m.cloth
    torso.add(coat)
  }
  torso.add(mesh(bevelBox(0.38, 0.4, 0.27, 0.06), m.cloth2, 0, 0.3, 0.01)) // vest
  for (const sx of [-1, 1]) torso.add(mesh(bevelBox(0.07, 0.09, 0.04, 0.012), m.cloth2, sx * 0.1, 0.18, 0.15)) // pouches
  torso.add(mesh(bevelBox(0.2, 0.14, 0.06, 0.02), m.metal, -0.08, 0.22, 0.16))
  torso.add(mesh(bevelBox(0.03, 0.3, 0.02, 0.01), m.accent, 0.13, 0.3, 0.155))
  // shoulders
  for (const s of [-1, 1]) {
    torso.add(mesh(new THREE.SphereGeometry(0.1, 12, 10), m.cloth, s * 0.24, 0.5, 0))
    if (skin.armor || op.head === 'visor')
      torso.add(mesh(bevelBox(0.18, 0.08, 0.22, 0.03), m.metal, s * 0.26, 0.58, 0, 0, 0, s * -0.3))
  }
  // arms in a rifle-ready pose
  const armL = new THREE.Group(),
    armR = new THREE.Group()
  armR.position.set(0.25, 0.48, 0)
  armL.position.set(-0.25, 0.48, 0)
  for (const [arm, s] of [
    [armR, 1],
    [armL, -1],
  ]) {
    const up = mesh(cyl(0.075, 0.065, 0.32), m.cloth, 0, -0.16, 0)
    arm.add(up)
    const fore = new THREE.Group()
    fore.position.y = -0.32
    fore.add(mesh(cyl(0.065, 0.055, 0.28), m.cloth, 0, -0.14, 0))
    fore.add(mesh(bevelBox(0.09, 0.1, 0.1, 0.02), m.glove, 0, -0.32, 0))
    arm.add(fore)
    arm.userData.fore = fore
    torso.add(arm)
  }
  // low-ready carry: right hand on the grip at the hip, left hand across the body on the handguard
  armR.rotation.set(-0.35, 0, 0.18)
  armR.userData.fore.rotation.x = -1.15
  armL.rotation.set(-0.75, 0.25, 0.55)
  armL.userData.fore.rotation.set(-1.05, 0, 0)
  // rifle held across the body
  const rifle = new THREE.Group()
  rifle.add(mesh(bevelBox(0.07, 0.11, 0.7, 0.015), m.metal, 0, 0, 0))
  rifle.add(mesh(bevelBox(0.05, 0.13, 0.18, 0.015), m.metal, 0, -0.1, 0.15))
  rifle.add(mesh(bevelBox(0.072, 0.02, 0.5, 0.005), m.accent, 0, 0.04, -0.05))
  rifle.add(mesh(cyl(0.02, 0.02, 0.3, 8), m.metal, 0, 0, -0.48, Math.PI / 2))
  rifle.position.set(0.04, 0.12, 0.27)
  rifle.rotation.set(0.25, 0.25, 0.75)
  torso.add(rifle)
  // neck + head
  const head = new THREE.Group()
  head.position.y = 0.62
  torso.add(head)
  head.add(mesh(cyl(0.06, 0.07, 0.1), m.cloth, 0, 0.0, 0))
  buildHead(head, op.head, m, skin)
  if (skin.crown) {
    const crown = new THREE.Group()
    crown.add(mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.05, 16, 1, true), m.gold, 0, 0, 0))
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU
      crown.add(mesh(new THREE.ConeGeometry(0.025, 0.09, 4), m.gold, Math.cos(a) * 0.13, 0.06, Math.sin(a) * 0.13))
    }
    crown.position.y = op.head === 'hood' ? 0.36 : 0.32
    head.add(crown)
  }
  root.userData.parts = { body, torso, head, armL, armR }
  return root
}

function buildHead(head, type, m, skin) {
  const y = 0.18
  if (type === 'hood' || type === 'blank') {
    const face = type === 'blank' ? whiteMask : m.mask
    const cloth = type === 'blank' ? whiteMask : m.cloth
    head.add(mesh(new THREE.SphereGeometry(0.108, 18, 14), face, 0, y, 0.015))
    // hood shell with a real face opening toward +z
    const gap = 1.7
    const hoodG = new THREE.SphereGeometry(0.165, 22, 16, Math.PI / 2 + gap / 2, Math.PI * 2 - gap, 0, Math.PI * 0.78)
    const hood = mesh(hoodG, cloth, 0, y + 0.015, -0.015)
    hood.material = cloth
    hood.scale.set(1.0, 1.18, 1.12)
    hood.children.length = 0
    head.add(hood)
    // inner shadow so the opening reads as depth
    const inner = mesh(
      new THREE.SphereGeometry(0.155, 18, 12, Math.PI / 2 + gap / 2, Math.PI * 2 - gap, 0, Math.PI * 0.78),
      new THREE.MeshBasicMaterial({ color: 0x050308, side: THREE.BackSide }),
      0,
      y + 0.015,
      -0.015
    )
    inner.scale.copy(hood.scale)
    head.add(inner)
    // pointed peak + cowl draping onto the shoulders
    head.add(mesh(new THREE.ConeGeometry(0.11, 0.16, 12), cloth, 0, y + 0.2, -0.05, -0.5))
    const cowl = mesh(new THREE.CylinderGeometry(0.15, 0.27, 0.2, 18, 1, true), cloth, 0, y - 0.17, -0.01)
    head.add(cowl)
    if (type === 'hood') {
      for (const s of [-1, 1])
        head.add(mesh(bevelBox(0.045, 0.014, 0.012, 0.004), m.eyes, s * 0.042, y + 0.02, 0.118, 0, 0, s * -0.18))
    }
  } else if (type === 'goggles') {
    head.add(mesh(new THREE.SphereGeometry(0.11, 18, 14), m.mask, 0, y, 0.01))
    head.add(mesh(new THREE.SphereGeometry(0.12, 18, 10, 0, TAU, 0, Math.PI / 2), m.cloth2, 0, y + 0.02, 0))
    head.add(mesh(bevelBox(0.21, 0.06, 0.05, 0.015), lensBlue, 0, y + 0.03, 0.095))
    head.add(mesh(new THREE.TorusGeometry(0.115, 0.012, 6, 24), m.metal, 0, y + 0.03, 0, Math.PI / 2))
  } else if (type === 'visor') {
    const helm = mesh(new THREE.SphereGeometry(0.13, 20, 16), m.metal, 0, y + 0.01, 0)
    helm.scale.set(1, 1.1, 1.08)
    head.add(helm)
    head.add(mesh(bevelBox(0.17, 0.035, 0.05, 0.01), m.eyes, 0, y + 0.02, 0.12))
    head.add(mesh(new THREE.ConeGeometry(0.05, 0.12, 4), m.metal, 0, y + 0.14, -0.05, -0.6))
  } else if (type === 'bare') {
    head.add(mesh(new THREE.SphereGeometry(0.11, 18, 14), skinTone, 0, y, 0.01))
    const r = rng(9)
    for (let i = 0; i < 9; i++)
      head.add(
        mesh(
          new THREE.IcosahedronGeometry(0.055, 0),
          hairBrown,
          r.range(-0.08, 0.08),
          y + 0.08 + r() * 0.04,
          r.range(-0.08, 0.05)
        )
      )
    head.add(
      mesh(new THREE.SphereGeometry(0.105, 16, 10, 0, TAU, Math.PI * 0.55, Math.PI * 0.35), m.mask, 0, y - 0.005, 0.02)
    )
  } else if (type === 'helmet') {
    head.add(mesh(new THREE.SphereGeometry(0.11, 18, 14), m.mask, 0, y, 0.01))
    head.add(mesh(new THREE.SphereGeometry(0.135, 18, 10, 0, TAU, 0, Math.PI * 0.55), m.cloth2, 0, y + 0.02, -0.005))
    for (const s of [-1, 1]) head.add(mesh(cyl(0.045, 0.045, 0.04, 12), m.metal, s * 0.12, y, 0, 0, 0, Math.PI / 2))
    for (const s of [-1, 1]) head.add(mesh(bevelBox(0.035, 0.01, 0.01, 0.003), m.eyes, s * 0.04, y + 0.03, 0.11))
  } else {
    // silver
    head.add(mesh(new THREE.SphereGeometry(0.11, 18, 14), skinTone, 0, y, 0.01))
    const r = rng(17)
    for (let i = 0; i < 12; i++) {
      const c = mesh(
        new THREE.ConeGeometry(0.04, 0.14, 4),
        hairSilver,
        r.range(-0.09, 0.09),
        y + 0.08,
        r.range(-0.1, 0.04)
      )
      c.rotation.set(r.range(-1.2, -0.3), r() * TAU, r.range(-0.6, 0.6))
      head.add(c)
    }
    head.add(
      mesh(new THREE.SphereGeometry(0.105, 16, 10, 0, TAU, Math.PI * 0.55, Math.PI * 0.35), m.mask, 0, y - 0.005, 0.02)
    )
  }
}

// ---------------------------------------------------------------------------
// Operator showcase scene (rendered behind the Operators menu).
export function createShowcase(ctx) {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x07040f)
  scene.fog = new THREE.FogExp2(0x12082a, 0.045)
  const cam = new THREE.PerspectiveCamera(34, 1, 0.1, 200)
  cam.position.set(0, 1.25, 6.2)
  cam.lookAt(0, 1.05, 0)
  const key = new THREE.DirectionalLight(0xe8e0ff, 3.4)
  key.position.set(2.5, 4, 6)
  key.castShadow = true
  key.shadow.mapSize.set(1024, 1024)
  key.shadow.camera.left = key.shadow.camera.bottom = -5
  key.shadow.camera.right = key.shadow.camera.top = 5
  scene.add(key)
  const rim = new THREE.DirectionalLight(0x9a50ff, 4)
  rim.position.set(-3, 3, -5)
  scene.add(rim)
  scene.add(new THREE.HemisphereLight(0x8a70d0, 0x1a1028, 1.3))
  const front = new THREE.PointLight(0xc8b8ff, 18, 14, 1.4)
  front.position.set(-1.5, 1.8, 4)
  scene.add(front)
  const vortexLight = new THREE.PointLight(0xa060ff, 30, 20)
  vortexLight.position.set(0, 3.5, -4)
  scene.add(vortexLight)
  // vortex backdrop
  const vort = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 18),
    new THREE.ShaderMaterial({
      uniforms: { uTime: ctx.G.uTime },
      depthWrite: false,
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `uniform float uTime; varying vec2 vUv;
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
        float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
        float fbm(vec2 p){ float s=0.0,a=0.5; for(int i=0;i<5;i++){ s+=a*n(p); p*=2.0; a*=0.5;} return s; }
        void main(){ vec2 p = (vUv - vec2(0.5,0.62))*vec2(1.7,1.0); float r = length(p); float a = atan(p.y,p.x);
          float sw = fbm(vec2(a*2.0 + r*10.0 - uTime*0.3, r*5.0));
          float ring = smoothstep(0.35,0.0,abs(r-0.22));
          vec3 c = vec3(0.004,0.002,0.012) + vec3(0.7,0.3,1.5)*ring*sw*0.45 + vec3(0.3,0.1,0.6)*pow(fbm(p*3.0+uTime*0.05),2.0)*0.12;
          c += vec3(1.2,0.6,2.0)*smoothstep(0.02,0.0,abs(r-0.18))*0.5;
          gl_FragColor = vec4(c,1.0); }`,
    })
  )
  vort.position.set(0, 4, -9)
  scene.add(vort)
  // ground: dark broken stone steps
  const ground = new THREE.Mesh(
    new THREE.CylinderGeometry(9, 9, 0.4, 48),
    new THREE.MeshStandardMaterial({ color: 0x15121c, roughness: 0.85, metalness: 0.2 })
  )
  ground.position.y = -0.2
  ground.receiveShadow = true
  scene.add(ground)
  const stoneMat = new THREE.MeshStandardMaterial({
    color: 0x1d1928,
    roughness: 0.9,
    emissive: new THREE.Color(0.25, 0.08, 0.5),
    emissiveIntensity: 0.25,
  })
  const R = rng(55)
  const floaters = []
  for (let i = 0; i < 26; i++) {
    const s = R.range(0.15, 0.7)
    const m = new THREE.Mesh(rockGeo(3000 + i, s, { round: 0.05 }), stoneMat)
    const p = new THREE.Vector3(R.range(-7, 7), R.range(0.5, 6), R.range(-8, -1.5))
    m.position.copy(p)
    scene.add(m)
    floaters.push({ m, p, seed: R() * 10, ax: new THREE.Vector3(R() - 0.5, R() - 0.5, R() - 0.5).normalize() })
  }
  // spotlight on the selected operator
  const spot = new THREE.SpotLight(0xffffff, 40, 12, 0.5, 0.6, 1.5)
  spot.position.set(0, 6, 3)
  spot.target.position.set(0, 1, 0)
  scene.add(spot, spot.target)

  const lineup = new THREE.Group()
  scene.add(lineup)
  let figures = []
  const slots = [
    [0, 0, 0.6],
    [-1.25, 0.05, -0.7],
    [1.25, 0.05, -0.7],
    [-2.4, 0.1, -1.6],
    [2.4, 0.1, -1.6],
    [-3.4, 0.15, -2.6],
    [3.4, 0.15, -2.6],
  ]
  function rebuild(sel) {
    for (const f of figures) lineup.remove(f.obj)
    figures = []
    const order = [sel.op, ...OPERATORS.map((_, i) => i).filter((i) => i !== sel.op)]
    order.forEach((opIdx, k) => {
      const skin = k === 0 ? SKINS[sel.skin] : SKINS[0]
      const obj = buildOperator(OPERATORS[opIdx], skin)
      const [x, y, z] = slots[k]
      obj.position.set(x, y, z)
      obj.rotation.y = k === 0 ? 0 : -x * 0.12
      if (k > 0) obj.scale.setScalar(0.96)
      lineup.add(obj)
      figures.push({ obj, k, seed: k * 1.7 })
    })
  }
  function update(dt, t, drag) {
    for (const f of floaters) {
      f.m.position.set(f.p.x + Math.sin(t * 0.3 + f.seed) * 0.3, f.p.y + Math.sin(t * 0.5 + f.seed * 2) * 0.25, f.p.z)
      f.m.quaternion.setFromAxisAngle(f.ax, t * 0.15 + f.seed)
    }
    for (const f of figures) {
      const parts = f.obj.userData.parts
      parts.torso.rotation.x = Math.sin(t * 1.4 + f.seed) * 0.02
      parts.body.position.y = Math.sin(t * 1.4 + f.seed) * 0.006
      parts.head.rotation.y = Math.sin(t * 0.4 + f.seed) * 0.12
      if (f.k === 0) f.obj.rotation.y = drag + Math.sin(t * 0.3) * 0.12
    }
  }
  function resize(w, h) {
    cam.aspect = w / h
    // keep the lineup framed on narrow screens
    cam.position.z = w / h < 1.3 ? 8.6 : 6.2
    cam.updateProjectionMatrix()
  }
  return { scene, cam, rebuild, update, resize }
}
