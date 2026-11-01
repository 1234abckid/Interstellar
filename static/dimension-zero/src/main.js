// DIMENSION ZERO — bootstrap. Shows the cinematic loading scene immediately,
// builds the game in measurable steps (driving the real progress bar), then
// opens the title screen (a live demo reel), from which the campaign
// (intro cinematic -> calibration -> story waves -> ending) or combat begins.
import * as THREE from 'three'
import { Renderer } from './core/renderer.js'
import { LoadingScene } from './loading/loading.js'
import { nextFrame } from './core/utils.js'
import * as TX from './core/textures.js'
import { createMaterials, G } from './world/materials.js'
import { createSky } from './world/sky.js'
import { buildArena } from './world/arena.js'
import { buildScatter } from './world/scatter.js'
import { createMegastructure } from './world/megastructure.js'
import { createCore } from './world/core.js'
import { DimensionManager, DIMS } from './world/dimension.js'
import { CollisionWorld } from './physics/collision.js'
import { PropSystem } from './physics/props.js'
import { Effects } from './fx/effects.js'
import { Decals } from './fx/decals.js'
import { Player } from './player/player.js'
import { Input } from './player/input.js'
import { Viewmodel } from './player/viewmodel.js'
import { Weapons } from './weapons/weapons.js'
import { Projectiles } from './weapons/projectiles.js'
import { EnemyManager } from './enemies/manager.js'
import { setAlienTextures } from './enemies/enemy.js'
import { RiftStalker } from './enemies/stalker.js'
import { VoidWarden } from './enemies/warden.js'
import { DimensionSphere } from './enemies/sphere.js'
import { TrainingDrone } from './enemies/drone.js'
import { Pickups } from './game/pickups.js'
import { Game } from './game/game.js'
import { HUD } from './ui/hud.js'
import { Menu, loadSettings } from './ui/menu.js'
import { TitleScreen } from './ui/title.js'
import { AudioEngine } from './audio/audio.js'
import { Narrator } from './story/narrator.js'
import { Cinematic } from './story/cinematic.js'
import { Tutorial } from './story/tutorial.js'
import { OPERATORS, SKINS, loadSelection, createShowcase } from './ui/operators.js'

const TEST = new URLSearchParams(location.search).has('test')
const canvas = document.getElementById('c')

function fail(msg) {
  const d = document.getElementById('fatal')
  d.hidden = false
  d.querySelector('p').textContent = msg
}

let R
try {
  R = new Renderer(canvas)
} catch (e) {
  fail('WebGL 2 is required to enter the fracture. ' + (e.message || ''))
  throw e
}
const SETTINGS = loadSettings()
R.setQuality(SETTINGS.quality)

const loading = new LoadingScene(R, document.getElementById('loading'))
R.setView(loading.scene, loading.camera)
R.bloom.strength = 0.75
R.bloom.threshold = 0.82
R.U.uGrain.value = 0.03

const ctx = {
  R,
  renderer: R.renderer,
  G: { uTime: { value: 0 } }, // real-time clock for menu visuals
  time: 0,
  baseFov: 78,
  exposureBias: 1.0,
  selection: loadSelection(),
  operatorData: { OPERATORS, SKINS },
}
window.__dz = ctx // exposed for automated browser tests

let mode = 'loading'
const clock = new THREE.Clock()

// ---------------------------------------------------------------- build
async function build() {
  const steps = []
  const step = (label, w, fn) => steps.push({ label, w, fn })
  const T = {}
  const big = SETTINGS.quality === 'low' ? 512 : 1024
  step('Forging masonry', big > 512 ? 4 : 2, () => (T.stone = TX.genStone(big)))
  step('Laying the plaza', big > 512 ? 4 : 2, () => (T.pave = TX.genPavement(big)))
  step('Plating alien hulls', 2, () => (T.metal = TX.genMetal(512)))
  step('Etching rift circuitry', 2, () => (T.tech = TX.genTech(512)))
  step('Fracturing bedrock', 2, () => {
    T.rock = TX.genRock(512)
    T.veins = TX.genVeins(256)
    T.leaves = TX.genLeaves(256)
  })
  step('Growing alien chitin', 1, () => {
    T.chitin = TX.genChitin(256)
    setAlienTextures(T.chitin)
  })
  step('Composing materials', 1, () => {
    ctx.T = T
    ctx.M = createMaterials(T)
  })
  step('Raising the fractured arena', 4, () => {
    const scene = (ctx.scene = new THREE.Scene())
    scene.fog = new THREE.FogExp2(0xa9c0dc, 0.006)
    scene.environmentIntensity = 0.85
    const camera = (ctx.camera = new THREE.PerspectiveCamera(78, innerWidth / innerHeight, 0.1, 1500))
    camera.rotation.order = 'YXZ'
    const sun = new THREE.DirectionalLight(0xffffff, 3)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    const S = 40
    Object.assign(sun.shadow.camera, { left: -S, right: S, top: S, bottom: -S, near: 1, far: 170 })
    sun.shadow.bias = -0.0004
    sun.shadow.normalBias = 0.05
    sun.shadow.radius = 3
    scene.add(sun, sun.target)
    const hemi = new THREE.HemisphereLight(0xbcd6ff, 0x6b5a4a, 1.1)
    scene.add(hemi)
    ctx.lights = { sun, hemi }
    ctx.sunDir = new THREE.Vector3(0.45, 0.62, -0.35).normalize()
    G.uSunDir.value.copy(ctx.sunDir)
    lightBasis()
    const sky = createSky()
    scene.add(sky.mesh)
    ctx.sky = sky
    ctx.cw = new CollisionWorld()
    ctx.arena = buildArena(ctx)
  })
  step('Scattering rubble and grass', 2, () => {
    ctx.scatter = buildScatter(ctx)
  })
  step('Assembling the megastructure', 2, () => {
    ctx.mega = createMegastructure(ctx)
    ctx.core = createCore(ctx)
  })
  step('Binding physics', 2, () => {
    ctx.props = new PropSystem(ctx)
    ctx.props.mirrorColliders(ctx.cw)
  })
  step('Mapping rift paths', 3, () => {
    ctx.fx = new Effects(ctx)
    ctx.decals = new Decals(ctx)
    ctx.enemies = new EnemyManager(ctx)
  })
  step('Arming the operator', 3, () => {
    ctx.input = new Input(canvas)
    ctx.audio = new AudioEngine()
    ctx.player = new Player(ctx)
    ctx.dims = new DimensionManager(ctx)
    ctx.viewmodel = new Viewmodel(ctx)
    ctx.weapons = new Weapons(ctx)
    ctx.projectiles = new Projectiles(ctx)
    ctx.pickups = new Pickups(ctx)
    ctx.hud = new HUD(ctx, document.getElementById('hud'))
    ctx.game = new Game(ctx)
    ctx.showcase = createShowcase(ctx)
    ctx.menu = new Menu(ctx, document.getElementById('menu'))
    ctx.narrator = new Narrator(ctx)
    ctx.cinematic = new Cinematic(ctx)
    ctx.tutorial = new Tutorial(ctx)
    ctx.title = new TitleScreen(ctx)
    ctx.game.setupProps()
    ctx.dims.onChange((d, forced) => {
      ctx.hud.setDimension(d)
      ctx.audio.play('shift')
      ctx.audio.setDimension(d)
      ctx.R.U.uRipple.value = forced && ctx.game.state !== 'playing' ? 0.6 : 1
      if (!forced) ctx.hud.banner(DIMS[d].name, DIMS[d].rules[0], DIMS[d].css, 1.4)
      ctx.hud.pulseAbility('Q')
      if (ctx.game.state === 'playing')
        ctx.fx.ring(ctx.player.pos.clone().setY(ctx.player.pos.y + 0.1), 14, new THREE.Color(DIMS[d].css), 0.7)
    })
    ctx.menu.applySettings()
    ctx.applyQuality = applyQuality
    applyQuality(ctx.menu.settings.quality)
    ctx.player.reset(new THREE.Vector3(0, 0, 18))
    ctx.player.applyCamera(ctx.camera, 0)
    ctx.viewmodel.resize(innerWidth, innerHeight)
    ctx.showcase.resize(innerWidth, innerHeight)
  })
  step('Capturing three realities', 3, () => {
    // reflections captured from inside the arena itself, once per reality
    const pm = new THREE.PMREMGenerator(R.renderer)
    ctx.envMaps = []
    const saved = G.uDimW.value.clone()
    const at = new THREE.Vector3(0, 4.5, 13)
    ctx.sky.mesh.position.copy(at)
    for (let i = 0; i < 3; i++) {
      G.uDimW.value.set(i === 0 ? 1 : 0, i === 1 ? 1 : 0, i === 2 ? 1 : 0)
      ctx.dims.applyAtmosphere()
      ctx.envMaps.push(pm.fromScene(ctx.scene, 0.025, 0.1, 1000, { size: 256, position: at }).texture)
    }
    G.uDimW.value.copy(saved)
    ctx.dims.applyAtmosphere()
    pm.dispose()
    ctx.dims.envMaps = ctx.envMaps
    ctx.scene.environment = ctx.envMaps[0]
  })
  step('Compiling shaders', 4, async () => {
    // pre-warm every program the encounter will need (enemies, dimension variants)
    const tmp = [
      new RiftStalker(ctx, new THREE.Vector3(0, -50, 0)),
      new VoidWarden(ctx, new THREE.Vector3(2, -50, 0)),
      new DimensionSphere(ctx, new THREE.Vector3(-2, -50, 0)),
      new TrainingDrone(ctx, new THREE.Vector3(4, -50, 0), { shielded: true }),
    ]
    tmp.forEach((e) => e.root.scale.setScalar(1))
    const savedW = G.uDimW.value.clone()
    G.uDimW.value.set(0.34, 0.33, 0.33) // make every dimension-exclusive mesh visible
    for (const m of ctx.arena.morphers)
      m.update(0.016, { ...ctx, time: 0, dims: { w: G.uDimW.value, current: 0, mask: 7, changedAt: 0 } })
    for (const t of Object.values(ctx.T)) {
      if (t.isTexture) R.renderer.initTexture(t)
      else for (const x of Object.values(t)) x.isTexture && R.renderer.initTexture(x)
    }
    // pooled/invisible objects must be compiled now, not on first use
    const hidden = []
    ctx.scene.traverse((o) => {
      if (!o.visible) {
        hidden.push(o)
        o.visible = true
      }
    })
    try {
      await R.renderer.compileAsync(ctx.scene, ctx.camera)
      await R.renderer.compileAsync(ctx.viewmodel.scene, ctx.viewmodel.camera)
    } catch (e) {
      R.renderer.compile(ctx.scene, ctx.camera)
    }
    // one real frame of the arena into an offscreen target (shadow programs, uploads)
    const rt = new THREE.WebGLRenderTarget(256, 144)
    R.renderer.setRenderTarget(rt)
    R.renderer.render(ctx.scene, ctx.camera)
    R.renderer.setRenderTarget(null)
    rt.dispose()
    for (const o of hidden) o.visible = false
    tmp.forEach((e) => e.dispose())
    G.uDimW.value.copy(savedW)
    for (const m of ctx.arena.morphers) m.update(0.016, { ...ctx, time: 0, dims: ctx.dims })
  })

  const total = steps.reduce((a, s) => a + s.w, 0)
  let doneW = 0
  for (const s of steps) {
    loading.setProgress(doneW / total, s.label)
    await nextFrame()
    await nextFrame()
    await s.fn()
    doneW += s.w
    loading.setProgress(doneW / total)
  }
}

// Shadow resolution follows the active quality profile; in Auto, the
// dynamic-resolution controller may step it down as a last resort.
function applyQuality() {
  if (!ctx.lights) return
  const sun = ctx.lights.sun
  const P = R.profile
  const size = R.degrade >= 3 ? Math.min(1024, P.shadow) : P.shadow
  if (sun.shadow.mapSize.x !== size) {
    sun.shadow.mapSize.set(size, size)
    sun.shadow.map?.dispose()
    sun.shadow.map = null
  }
  const type = P.soft ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap
  if (R.renderer.shadowMap.type !== type) {
    R.renderer.shadowMap.type = type
    R.renderer.shadowMap.needsUpdate = true
  }
}
R.onProfile = () => applyQuality()

// If the GPU driver resets, say so instead of leaving a blank canvas.
canvas.addEventListener('webglcontextlost', (e) => {
  e.preventDefault()
  fail('The graphics driver was reset. Click to reload the game.')
  const d = document.getElementById('fatal')
  d.style.cursor = 'pointer'
  d.onclick = () => location.reload()
})

// ---------------------------------------------------------------- start
function enterGame() {
  ctx.audio.init()
  ctx.narrator.unlock()
  setTimeout(() => {
    loading.dispose()
    document.getElementById('hud').hidden = false
    R.bloom.strength = 0.5
    R.bloom.threshold = 0.95
    mode = 'game'
    ctx.title.show()
    R.U.uFadeColor.value.setRGB(0, 0, 0)
    R.U.uFade.value = 1
  }, 1050)
}

ctx.input_lockHandler = (locked) => {
  if (mode !== 'game' || TEST) return
  if (!locked && ctx.game.state === 'playing') ctx.menu.pause()
}

build()
  .then(() => {
    ctx.input.onLockChange = ctx.input_lockHandler
    ctx.input.testMode = TEST
    // clicking the game view re-captures the mouse if it was lost
    canvas.addEventListener('click', () => {
      if (mode === 'game' && ctx.game.state === 'playing' && !ctx.input.locked) ctx.input.lock()
    })
    if (TEST) {
      ctx.input.locked = true
      ctx.input.lock = () => (ctx.input.locked = true)
      ctx.input.unlock = () => {}
    }
    loading.ready(enterGame)
    window.__dzReady = true
    if (TEST) {
      // deterministic stepping for automated tests: real input events + the real update code
      window.__dzManual = (on) => (ctx.manual = on)
      window.__dzStep = (sec, dt = 1 / 60) => {
        const n = Math.max(1, Math.round(sec / dt))
        for (let i = 0; i < n; i++) {
          simStep(dt)
          ctx.camera.updateMatrixWorld()
          ctx.input.endFrame()
        }
      }
    }
  })
  .catch((e) => {
    console.error(e)
    fail('Failed to build the arena: ' + e.message)
  })

// ---------------------------------------------------------------- loop
const SIM_STATES = new Set(['playing', 'dead', 'victory', 'title', 'cinematic'])

// One simulation tick: world, story, camera, viewmodel, HUD.
function simStep(dt) {
  const game = ctx.game
  if (SIM_STATES.has(game.state)) {
    ctx.time += dt
    G.uTime.value = ctx.time
    game.update(dt)
    ctx.decals.update(dt)
    ctx.title.update(dt)
  }
  if (game.state !== 'paused') ctx.narrator.update(dt)
  const pl = ctx.player
  const directed = ctx.cinematic.update(dt, ctx.input)
  if (!directed) {
    pl.applyCamera(ctx.camera, ctx.time)
    // FOV: base + sprint/dash kick, zoom while aiming
    const fov = ctx.baseFov + (pl.sprinting ? 4 : 0) + pl.fovKick * 10 - ctx.viewmodel.ads * 14
    if (Math.abs(ctx.camera.fov - fov) > 0.01) {
      ctx.camera.fov += (fov - ctx.camera.fov) * Math.min(1, dt * 12)
      ctx.camera.updateProjectionMatrix()
    }
  }
  ctx.viewmodel.update(dt, pl, game.state === 'playing' ? ctx.input : null, ctx)
  ctx.hud.update(dt)
}

const _sunPos = new THREE.Vector3(),
  _fwd = new THREE.Vector3(),
  _sp = new THREE.Vector3(),
  _lp = new THREE.Vector3(),
  _lsX = new THREE.Vector3(),
  _lsY = new THREE.Vector3()
// light-space axes perpendicular to the sun direction (for texel snapping)
function lightBasis() {
  _lsX.set(0, 1, 0).cross(ctx.sunDir).normalize()
  _lsY.copy(ctx.sunDir).cross(_lsX).normalize()
}
function renderFrame(dt) {
  const cam = ctx.camera
  cam.updateMatrixWorld()
  // shadow frustum follows the view (texel-snapped to avoid shimmer)
  // shadow frustum centred on the player (or the cinematic camera), snapped to
  // whole shadow-map texels in light space so edges never crawl or shimmer
  const sun = ctx.lights.sun
  cam.getWorldDirection(_fwd)
  const st0 = ctx.game.state
  const fp =
    st0 === 'title' || st0 === 'cinematic' ? _lp.copy(cam.position).addScaledVector(_fwd, 14) : _lp.copy(ctx.player.pos)
  const texel = (40 * 2) / sun.shadow.mapSize.x
  const lx = fp.dot(_lsX),
    ly = fp.dot(_lsY),
    lz = fp.dot(ctx.sunDir)
  _sunPos
    .copy(_lsX)
    .multiplyScalar(Math.round(lx / texel) * texel)
    .addScaledVector(_lsY, Math.round(ly / texel) * texel)
    .addScaledVector(ctx.sunDir, lz)
  sun.target.position.copy(_sunPos)
  sun.position.copy(_sunPos).addScaledVector(ctx.sunDir, 85)
  ctx.sky.mesh.position.copy(cam.position)
  R.U.uFade.value = Math.max(0, R.U.uFade.value - dt * 1.2)
  // god rays from the sun (Material/Inverted) or the vortex (Fracture)
  const w = ctx.dims.w
  const src = w.z > 0.5 ? ctx.sky.uniforms.uPortalDir.value : ctx.sunDir
  _sp.copy(cam.position).addScaledVector(src, 500).project(cam)
  const facing = Math.max(0, _fwd.dot(src))
  const onScreen = Math.max(0, 1 - Math.max(Math.abs(_sp.x), Math.abs(_sp.y)) / 1.6)
  R.R.uSun.value.set(_sp.x * 0.5 + 0.5, _sp.y * 0.5 + 0.5)
  R.R.uInt.value = _sp.z < 1 ? facing * onScreen * (w.x * 1.0 + w.y * 0.7 + w.z * 0.9) : 0
  R.R.uTint.value.setRGB(1 * (1 - w.z) + 0.85 * w.z, 0.9 * (1 - w.z) + 0.45 * w.z, 0.78 * (1 - w.z) + 1.0 * w.z)
  const st = ctx.game.state
  const cine = st === 'title' || st === 'cinematic'
  if (ctx.menu.showcaseActive) {
    ctx.showcase.update(dt, ctx.G.uTime.value, ctx.menu.drag)
    R.setView(ctx.showcase.scene, ctx.showcase.cam, null, null, { ao: true })
    R.U.uDimW.value.set(1, 0, 0)
    R.U.uDamage.value = 0
  } else if (cine) {
    R.setView(ctx.scene, cam, null, null, { ao: true, rays: true, dof: ctx.cinematic.active && R.dof.enabled })
  } else R.setView(ctx.scene, cam, ctx.viewmodel.scene, ctx.viewmodel.camera, { ao: true, rays: true })
  R.U.uGrain.value = cine ? 0.05 : 0.03
  R.render()
}

let steadyAt = 0
let smoothDt = 1 / 60
function frame() {
  requestAnimationFrame(frame)
  const raw = clock.getDelta()
  // lightly smoothed time step: browser frame timestamps jitter by a few ms,
  // and feeding that jitter straight into motion reads as micro-stutter
  const clamped = Math.min(0.05, raw)
  smoothDt = Math.abs(clamped - smoothDt) > 0.02 ? clamped : smoothDt + (clamped - smoothDt) * 0.3
  const dt = smoothDt
  ctx.G.uTime.value += dt
  if (mode === 'loading') {
    loading.update(dt)
    R.render()
    return
  }
  if (!ctx.manual) simStep(dt)
  renderFrame(dt)
  if (!ctx.manual) ctx.input.endFrame()
  // adaptive quality: only judge steady gameplay/cinematic frames
  const now = clock.elapsedTime
  if (!steadyAt) steadyAt = now + 2.5
  if (now > steadyAt && !document.hidden && !ctx.menu.open) R.tune(raw, now)
}
requestAnimationFrame(frame)

window.addEventListener('resize', () => {
  R.resize()
  if (ctx.camera) {
    ctx.camera.aspect = innerWidth / innerHeight
    ctx.camera.updateProjectionMatrix()
    ctx.viewmodel.resize(innerWidth, innerHeight)
    ctx.showcase.resize(innerWidth, innerHeight)
  }
})
// pause when the tab is hidden
document.addEventListener('visibilitychange', () => {
  if (document.hidden && mode === 'game' && ctx.game.state === 'playing' && !TEST) ctx.menu.pause()
})
