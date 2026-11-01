// DIMENSION ZERO — bootstrap. Shows the cinematic loading scene immediately,
// builds the game in measurable steps (driving the real progress bar), then
// hands the renderer over to the playable arena.
import * as THREE from 'three'
import { Renderer } from './core/renderer.js'
import { LoadingScene } from './loading/loading.js'
import { nextFrame } from './core/utils.js'
import * as TX from './core/textures.js'
import { createMaterials, G } from './world/materials.js'
import { createSky } from './world/sky.js'
import { buildArena } from './world/arena.js'
import { createMegastructure } from './world/megastructure.js'
import { createCore } from './world/core.js'
import { DimensionManager, DIMS } from './world/dimension.js'
import { CollisionWorld } from './physics/collision.js'
import { PropSystem } from './physics/props.js'
import { Effects } from './fx/effects.js'
import { Player } from './player/player.js'
import { Input } from './player/input.js'
import { Viewmodel } from './player/viewmodel.js'
import { Weapons } from './weapons/weapons.js'
import { Projectiles } from './weapons/projectiles.js'
import { EnemyManager } from './enemies/manager.js'
import { RiftStalker } from './enemies/stalker.js'
import { VoidWarden } from './enemies/warden.js'
import { DimensionSphere } from './enemies/sphere.js'
import { Pickups } from './game/pickups.js'
import { Game } from './game/game.js'
import { HUD } from './ui/hud.js'
import { Menu } from './ui/menu.js'
import { AudioEngine } from './audio/audio.js'
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

const loading = new LoadingScene(R, document.getElementById('loading'))
R.setView(loading.scene, loading.camera)
R.bloom.strength = 0.75
R.bloom.threshold = 0.82

const ctx = {
  R,
  renderer: R.renderer,
  G: { uTime: { value: 0 } }, // real-time clock for menu visuals
  time: 0,
  baseFov: 78,
  exposureBias: 1,
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
  step('Forging masonry', 2, () => (T.stone = TX.genStone(512)))
  step('Laying the plaza', 2, () => (T.pave = TX.genPavement(512)))
  step('Plating alien hulls', 2, () => (T.metal = TX.genMetal(512)))
  step('Etching rift circuitry', 2, () => (T.tech = TX.genTech(512)))
  step('Fracturing bedrock', 2, () => {
    T.rock = TX.genRock(512)
    T.veins = TX.genVeins(256)
    T.leaves = TX.genLeaves(256)
  })
  step('Composing materials', 1, () => {
    ctx.T = T
    ctx.M = createMaterials(T)
  })
  step('Raising the fractured arena', 4, () => {
    const scene = (ctx.scene = new THREE.Scene())
    scene.fog = new THREE.FogExp2(0xa9c0dc, 0.006)
    scene.environmentIntensity = 0.55
    const camera = (ctx.camera = new THREE.PerspectiveCamera(78, innerWidth / innerHeight, 0.05, 1500))
    camera.rotation.order = 'YXZ'
    const sun = new THREE.DirectionalLight(0xffffff, 3)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    const S = 42
    Object.assign(sun.shadow.camera, { left: -S, right: S, top: S, bottom: -S, near: 1, far: 160 })
    sun.shadow.bias = -0.0005
    sun.shadow.normalBias = 0.04
    scene.add(sun, sun.target)
    const hemi = new THREE.HemisphereLight(0xbcd6ff, 0x6b5a4a, 1.1)
    scene.add(hemi)
    ctx.lights = { sun, hemi }
    ctx.sunDir = new THREE.Vector3(0.45, 0.62, -0.35).normalize()
    const sky = createSky()
    scene.add(sky.mesh)
    ctx.sky = sky
    ctx.cw = new CollisionWorld()
    ctx.arena = buildArena(ctx)
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
    ctx.enemies = new EnemyManager(ctx)
  })
  step('Capturing three realities', 2, () => {
    const pm = new THREE.PMREMGenerator(R.renderer)
    const es = new THREE.Scene()
    es.add(ctx.sky.mesh.clone())
    ctx.envMaps = []
    const saved = G.uDimW.value.clone()
    for (let i = 0; i < 3; i++) {
      G.uDimW.value.set(i === 0 ? 1 : 0, i === 1 ? 1 : 0, i === 2 ? 1 : 0)
      ctx.envMaps.push(pm.fromScene(es, 0.02, 0.1, 1000).texture)
    }
    G.uDimW.value.copy(saved)
    pm.dispose()
    ctx.scene.environment = ctx.envMaps[0]
  })
  step('Arming the operator', 3, () => {
    ctx.input = new Input(canvas)
    ctx.audio = new AudioEngine()
    ctx.player = new Player(ctx)
    ctx.dims = new DimensionManager(ctx)
    ctx.dims.envMaps = ctx.envMaps
    ctx.viewmodel = new Viewmodel(ctx)
    ctx.weapons = new Weapons(ctx)
    ctx.projectiles = new Projectiles(ctx)
    ctx.pickups = new Pickups(ctx)
    ctx.hud = new HUD(ctx, document.getElementById('hud'))
    ctx.game = new Game(ctx)
    ctx.showcase = createShowcase(ctx)
    ctx.menu = new Menu(ctx, document.getElementById('menu'))
    ctx.game.setupProps()
    ctx.dims.onChange((d, forced) => {
      ctx.hud.setDimension(d)
      ctx.audio.play('shift')
      ctx.audio.setDimension(d)
      ctx.R.U.uRipple.value = 1
      if (!forced) ctx.hud.banner(DIMS[d].name, DIMS[d].rules[0], DIMS[d].css, 1.4)
      ctx.hud.pulseAbility('Q')
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
  step('Compiling shaders', 4, async () => {
    // pre-warm every program the encounter will need (enemies, dimension variants)
    const tmp = [new RiftStalker(ctx, new THREE.Vector3(0, -50, 0)), new VoidWarden(ctx, new THREE.Vector3(2, -50, 0)), new DimensionSphere(ctx, new THREE.Vector3(-2, -50, 0))]
    tmp.forEach((e) => e.root.scale.setScalar(1))
    const savedW = G.uDimW.value.clone()
    G.uDimW.value.set(0.34, 0.33, 0.33) // make every dimension-exclusive mesh visible
    for (const m of ctx.arena.morphers) m.update(0.016, { ...ctx, time: 0, dims: { w: G.uDimW.value, current: 0, mask: 7, changedAt: 0 } })
    for (const t of Object.values(ctx.T)) {
      if (t.isTexture) R.renderer.initTexture(t)
      else for (const x of Object.values(t)) x.isTexture && R.renderer.initTexture(x)
    }
    // compile also hides nothing: pooled/invisible objects must be compiled now, not on first use
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

function applyQuality(q) {
  const sun = ctx.lights.sun
  const size = q === 'low' ? 1024 : 2048
  if (sun.shadow.mapSize.x !== size) {
    sun.shadow.mapSize.set(size, size)
    sun.shadow.map?.dispose()
    sun.shadow.map = null
  }
  R.renderer.shadowMap.type = q === 'high' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap
  R.renderer.shadowMap.needsUpdate = true
}

// ---------------------------------------------------------------- start
function enterGame() {
  ctx.audio.init()
  if (!TEST) ctx.input.lock()
  setTimeout(() => {
    loading.dispose()
    document.getElementById('hud').hidden = false
    R.bloom.strength = 0.55
    R.bloom.threshold = 0.92
    R.setView(ctx.scene, ctx.camera, ctx.viewmodel.scene, ctx.viewmodel.camera)
    mode = 'game'
    ctx.game.start()
    R.U.uRipple.value = 1
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
      // deterministic stepping for automated tests: real input events + real update code
      window.__dzManual = (on) => (ctx.manual = on)
      window.__dzStep = (sec, dt = 1 / 60) => {
        const n = Math.max(1, Math.round(sec / dt))
        for (let i = 0; i < n; i++) {
          const g = ctx.game
          if (g.state === 'playing' || g.state === 'dead' || g.state === 'victory') {
            ctx.time += dt
            G.uTime.value = ctx.time
            g.update(dt)
          }
          ctx.player.applyCamera(ctx.camera, ctx.time)
          ctx.camera.updateMatrixWorld()
          ctx.viewmodel.update(dt, ctx.player, g.state === 'playing' ? ctx.input : null, ctx)
          ctx.hud.update(dt)
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
const _sunPos = new THREE.Vector3()
function frame() {
  requestAnimationFrame(frame)
  const dt = Math.min(0.05, clock.getDelta())
  ctx.G.uTime.value += dt
  if (mode === 'loading') {
    loading.update(dt)
    R.render()
    return
  }
  const game = ctx.game
  const simulate = !ctx.manual && (game.state === 'playing' || game.state === 'dead' || game.state === 'victory')
  if (simulate) {
    ctx.time += dt
    G.uTime.value = ctx.time
    game.update(dt)
  }
  const pl = ctx.player
  pl.applyCamera(ctx.camera, ctx.time)
  // FOV: base + sprint/dash kick, zoom while aiming
  const vm = ctx.viewmodel
  const fov = ctx.baseFov + (pl.sprinting ? 4 : 0) + pl.fovKick * 10 - vm.ads * 14
  if (Math.abs(ctx.camera.fov - fov) > 0.01) {
    ctx.camera.fov += (fov - ctx.camera.fov) * Math.min(1, dt * 12)
    ctx.camera.updateProjectionMatrix()
  }
  vm.update(dt, pl, game.state === 'playing' ? ctx.input : null, ctx)
  ctx.hud.update(dt)
  // shadow frustum follows the player (texel-snapped to avoid shimmer)
  const sun = ctx.lights.sun
  const texel = (42 * 2) / sun.shadow.mapSize.x
  _sunPos.set(Math.round(pl.pos.x / texel) * texel, 0, Math.round(pl.pos.z / texel) * texel)
  sun.target.position.copy(_sunPos)
  sun.position.copy(_sunPos).addScaledVector(ctx.sunDir, 80)
  ctx.sky.mesh.position.copy(ctx.camera.position)
  R.U.uFade.value = Math.max(0, R.U.uFade.value - dt * 1.5)
  if (ctx.menu.showcaseActive) {
    ctx.showcase.update(dt, ctx.G.uTime.value, ctx.menu.drag)
    R.setView(ctx.showcase.scene, ctx.showcase.cam)
    R.U.uDimW.value.set(1, 0, 0)
    R.U.uDamage.value = 0
  } else R.setView(ctx.scene, ctx.camera, vm.scene, vm.camera)
  R.render()
  if (!ctx.manual) ctx.input.endFrame()
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
