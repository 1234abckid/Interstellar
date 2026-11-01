// Game orchestration: encounter waves, the Dimensional Core objective,
// environmental interactions (explosive canisters, barriers, portals, slam),
// pause/death/victory flow and the per-frame update order.
import * as THREE from 'three'
import { G } from '../world/materials.js'
import { DIMS } from '../world/dimension.js'
import { rockGeo, bevelBox } from '../world/geometry.js'
import { OPERATORS, SKINS, saveSelection } from '../ui/operators.js'
import { introShots, dropShots, outroShots } from '../story/shots.js'

const WAVES = [
  { name: 'FIRST CONTACT', sub: 'Rift Stalkers inbound', spawns: [['stalker', 4, 0]], later: [['stalker', 2, 9]] },
  {
    name: 'THE WARDENS',
    sub: 'Shift to the Fracture to break their shields',
    spawns: [
      ['stalker', 3, 0],
      ['warden', 2, 1.5],
    ],
    later: [['stalker', 2, 12]],
  },
  {
    name: 'CONVERGENCE',
    sub: 'Destroy the Dimension Spheres first',
    spawns: [
      ['stalker', 3, 0],
      ['warden', 2, 1],
      ['sphere', 2, 2],
    ],
    later: [['stalker', 3, 14]],
  },
]
const CHANNEL_TIME = 10

export class Game {
  constructor(ctx) {
    this.ctx = ctx
    this.state = 'intro'
    this.damageMulBase = 1
    this.enemyDamageMul = 1
    this.godMode = false
    this.wave = 0
    this.waveTotal = 0
    this.waveKilled = 0
    this.pendingLater = []
    this.breather = 0
    this.kills = 0
    this.startTime = 0
    this.elapsed = 0
    this.teleportCD = 0
    this.chainQueue = []
    this.channelSpawnT = 0
    this.propSpecs = []
    this.canisterGeo = null
    this.phase = 'waves' // tutorial | waves | core | done
    this.mode = 'combat' // campaign | combat
    this.waveDelay = 0
    this.checkpoint = 1
    this.said = new Set()
  }

  get damageMul() {
    return this.damageMulBase * (this.ctx.player.overcharge > 0 ? 1.5 : 1)
  }

  // ---------------------------------------------------------------- setup
  setupProps() {
    const ctx = this.ctx
    const M = ctx.M
    const A = ctx.arena
    this.canisterMat = new THREE.MeshStandardMaterial({ color: 0x2a2a30, metalness: 0.9, roughness: 0.35 })
    this.canisterGlow = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 1.5, 0.3) })
    const cg = new THREE.CylinderGeometry(0.42, 0.42, 1.2, 14)
    const capG = new THREE.CylinderGeometry(0.46, 0.46, 0.12, 14)
    const bandG = new THREE.CylinderGeometry(0.43, 0.43, 0.5, 14, 1, true)
    this.makeCanister = () => {
      const g = new THREE.Group()
      const body = new THREE.Mesh(cg, this.canisterMat)
      body.castShadow = true
      g.add(body)
      const band = new THREE.Mesh(bandG, this.canisterGlow)
      g.add(band)
      for (const y of [-0.6, 0.6]) {
        const cap = new THREE.Mesh(capG, this.canisterMat)
        cap.position.y = y
        cap.castShadow = true
        g.add(cap)
      }
      return g
    }
    const crateG = bevelBox(0.9, 0.9, 0.9, 0.05, 0.9)
    this.makeCrate = () => {
      const m = new THREE.Mesh(crateG, M.metal)
      m.castShadow = m.receiveShadow = true
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.92), M.glowCyan)
      m.add(strip)
      return m
    }
    this.debrisGeos = [0, 1, 2, 3].map((i) => rockGeo(8000 + i, 1, { round: 0.12 }))
    this.propSpecs = []
    for (const [x, y, z] of A.canisterSpots) this.propSpecs.push({ kind: 'canister', x, y, z, size: 0.86 })
    for (const [x, y, z] of A.crateSpots) this.propSpecs.push({ kind: 'crate', x, y, z, size: 0.9 })
    A.debrisSpots.forEach(([x, y, z, s], i) =>
      this.propSpecs.push({ kind: 'debris', x, y, z, size: s, geo: i % 4, float: true })
    )
    this.spawnProps()
  }

  spawnProps() {
    const ctx = this.ctx
    const P = ctx.props
    for (const p of P.props) {
      if (p.alive) P.world.removeBody(p.body)
      ctx.scene.remove(p.mesh)
    }
    P.props.length = 0
    const floatZone = ctx.arena.zones.find((z) => z.type === 'float')
    for (const s of this.propSpecs) {
      let mesh
      if (s.kind === 'canister') mesh = this.makeCanister()
      else if (s.kind === 'crate') mesh = this.makeCrate()
      else {
        mesh = new THREE.Mesh(this.debrisGeos[s.geo], ctx.M.rock)
        mesh.scale.setScalar(s.size * 0.6)
        mesh.castShadow = true
      }
      P.add(mesh, s.kind, s.x, s.y, s.z, {
        size: s.kind === 'debris' ? s.size * 0.8 : s.size,
        mass: s.kind === 'debris' ? 2 + s.size * 3 : undefined,
        floatZone: s.float ? floatZone : null,
        onDestroy:
          s.kind === 'canister'
            ? (p) =>
                this.chainQueue.push({
                  pos: new THREE.Vector3(p.body.position.x, p.body.position.y, p.body.position.z),
                  t: 0.05,
                })
            : null,
      })
    }
  }

  applyOperator() {
    const ctx = this.ctx
    const op = OPERATORS[ctx.selection.op]
    const m = op.mod || {}
    const pl = ctx.player
    pl.maxHealth = 100 + (m.health || 0)
    pl.DASH_CD = 3.2 * (m.dashCD || 1)
    pl.BOOST_DUR = 5 + (m.boostT || 0)
    pl.SLAM_CD = 6 * (m.slamCD || 1)
    pl.armorMul = m.armor || 1
    ctx.dims.STABILITY_TIME = 13 * (m.stability || 1)
    ctx.dims.COOLDOWN = 1.6 * (m.shiftCD || 1)
  }

  setSelection(sel) {
    const ctx = this.ctx
    ctx.selection.op = sel.op
    ctx.selection.skin = sel.skin
    saveSelection(ctx.selection)
    ctx.viewmodel.applySkin(ctx.selection)
    const hpFrac = ctx.player.health / ctx.player.maxHealth
    this.applyOperator()
    ctx.player.health = Math.max(1, Math.round(hpFrac * ctx.player.maxHealth))
  }

  // ---------------------------------------------------------------- flow
  setCine(on) {
    document.body.classList.toggle('cine', on)
  }

  // Title screen: a live demo with an invulnerable decoy.
  enterTitle() {
    const ctx = this.ctx
    this.reset()
    this.state = 'title'
    this.godMode = true
    this.setCine(true)
    ctx.narrator.clear()
    ctx.hud.clearTutorial()
    ctx.hud.setMarker(null)
  }

  lock() {
    const ctx = this.ctx
    ctx.audio.init()
    if (!ctx.input.testMode) ctx.input.lock()
  }

  startCampaign(opts = {}) {
    const ctx = this.ctx
    this.lock()
    this.reset()
    this.mode = 'campaign'
    this.godMode = false
    this.state = 'cinematic'
    this.setCine(true)
    ctx.audio.intensity = 0.4
    ctx.cinematic.play(introShots(ctx), {
      bars: 1,
      onEnd: () => {
        if (opts.introOnly) ctx.title.show()
        else this.beginGameplay('tutorial')
      },
    })
  }

  startCombat() {
    const ctx = this.ctx
    this.lock()
    this.reset()
    this.mode = 'combat'
    this.godMode = false
    this.state = 'cinematic'
    this.setCine(true)
    ctx.cinematic.play(dropShots(ctx), { bars: 0.6, onEnd: () => this.beginGameplay('waves') })
  }

  // Hand control to the player (after a cinematic).
  beginGameplay(phase, fromWave = 1) {
    const ctx = this.ctx
    ctx.narrator.clear()
    ctx.player.reset(new THREE.Vector3(0, 0, 18))
    this.applyOperator()
    ctx.player.health = ctx.player.maxHealth
    this.state = 'playing'
    this.phase = phase
    this.setCine(false)
    ctx.hud.boot()
    ctx.R.U.uRipple.value = 1
    if (phase === 'tutorial') {
      ctx.tutorial.start()
      this.updateObjective()
    } else {
      this.startWavesFrom(fromWave)
    }
    // the cinematic may have run without mouse capture: ask for a click
    if (!ctx.input.locked && !ctx.input.testMode) ctx.menu.pause()
  }

  startWavesFrom(n) {
    const ctx = this.ctx
    this.phase = n > WAVES.length ? 'core' : 'waves'
    this.checkpoint = n
    for (let i = 0; i < n - 1 && i < 3; i++) ctx.core.lockRing(i)
    ctx.core.state.stage = Math.min(3, n - 1)
    ctx.hud.setPips(Math.min(3, n - 1))
    if (n > WAVES.length) {
      ctx.core.state.ready = true
      this.wave = WAVES.length + 1
      ctx.hud.banner('CORE ONLINE', 'Stand on the core dais to channel it', '#62d8ff', 3)
    } else {
      this.wave = n - 1
      this.waveDelay = n === 1 ? 2.6 : 2.0
      if (n === 1)
        ctx.hud.banner('ENTER THE FRACTURE', 'Eliminate the alien threat · Activate the Dimensional Core', '#62d8ff', 3)
    }
    this.updateObjective()
  }

  onTutorialComplete() {
    this.phase = 'waves'
    this.wave = 0
    this.checkpoint = 1
    this.waveDelay = 4.5
    this.updateObjective()
  }

  // Death screen "Redeploy": resume from the last checkpoint.
  redeploy() {
    const ctx = this.ctx
    const cp = this.phase === 'tutorial' ? 'tutorial' : this.checkpoint
    this.reset()
    this.godMode = false
    this.state = 'cinematic'
    this.setCine(true)
    this.lock()
    ctx.cinematic.play(dropShots(ctx), {
      bars: 0.6,
      onEnd: () => (cp === 'tutorial' ? this.beginGameplay('tutorial') : this.beginGameplay('waves', cp)),
    })
  }

  toTitle() {
    const ctx = this.ctx
    ctx.input.unlock()
    ctx.tutorial.active && ctx.tutorial.skip()
    ctx.tutorial.active = false
    ctx.title.show()
  }

  // legacy entry point (tests / restart): straight into combat without a cinematic
  start() {
    this.reset()
    this.mode = 'combat'
    this.godMode = false
    this.ctx.audio.init()
    this.beginGameplay('waves')
  }

  reset() {
    const ctx = this.ctx
    ctx.enemies.clear()
    ctx.projectiles.clear()
    ctx.fx.clear()
    ctx.dims.reset()
    this.applyOperator()
    ctx.player.reset(new THREE.Vector3(0, 0, 18))
    ctx.weapons.reset()
    ctx.viewmodel.select(0)
    ctx.viewmodel.switchT = 1
    ctx.hud.onWeaponChange(0)
    ctx.hud.setDimension(0)
    ctx.core.reset()
    ctx.hud.setPips(0)
    // pickups
    for (const it of ctx.pickups.items) ctx.scene.remove(it.mesh)
    ctx.pickups.items.length = 0
    ctx.pickups.spawnMap(ctx.arena.pickupSpots)
    this.spawnProps()
    this.wave = 0
    this.waveTotal = 0
    this.waveKilled = 0
    this.pendingLater = []
    this.breather = 0
    this.kills = 0
    this.elapsed = 0
    this.chainQueue = []
    this.channelSpawnT = 0
    this.waveDelay = 0
    this.outroDelay = 0
    this.said.clear()
    this.phase = 'waves'
    ctx.decals?.clear()
    if (ctx.tutorial) {
      ctx.tutorial.active = false
      ctx.tutorial.clearDrones()
      ctx.tutorial.beacon.visible = false
    }
    ctx.hud.clearTutorial?.()
    ctx.hud.setMarker?.(null)
    ctx.weapons.shots = ctx.weapons.hits = 0
    ctx.player.damageTaken = 0
    this.updateObjective()
  }

  beginWave(n) {
    const ctx = this.ctx
    if (n < 1 || n > WAVES.length) return
    this.wave = n
    const W = WAVES[n - 1]
    const sp = ctx.arena.spawnPoints
    // spawn away from the player
    const pts = sp.slice().sort((a, b) => b.distanceToSquared(ctx.player.pos) - a.distanceToSquared(ctx.player.pos))
    let k = 0
    let total = 0
    for (const [type, count, delay] of W.spawns) {
      for (let i = 0; i < count; i++) {
        const p = pts[k++ % Math.min(5, pts.length)]
        const jitter = new THREE.Vector3((Math.random() - 0.5) * 3, 0, (Math.random() - 0.5) * 3)
        ctx.enemies.spawn(type, p.clone().add(jitter), delay + i * 0.35)
        total++
      }
    }
    this.pendingLater = W.later.map(([type, count, delay]) => ({ type, count, t: delay }))
    for (const l of this.pendingLater) total += l.count
    this.waveTotal = total
    this.waveKilled = 0
    this.checkpoint = n
    ctx.hud.banner(`WAVE ${n} · ${W.name}`, W.sub, n === 2 ? '#ff5ad2' : n === 3 ? '#b07bff' : '#62d8ff', 3)
    ctx.audio.play('objective')
    ctx.narrator.sayMany([['w1'], ['w2', 'w2choir'], ['w3', 'w3choir']][n - 1], 0.4)
    this.updateObjective()
  }

  waveCleared() {
    const ctx = this.ctx
    ctx.core.lockRing(this.wave - 1)
    ctx.core.state.stage = this.wave
    ctx.hud.setPips(this.wave)
    ctx.audio.play('objective')
    const lines = [['w1end'], ['w2end', 'w2end2', 'w2end3'], ['w3end']][this.wave - 1]
    if (lines) ctx.narrator.sayMany(lines, 0.5)
    if (this.wave >= WAVES.length) {
      ctx.core.state.ready = true
      ctx.hud.banner('CORE ONLINE', 'Stand on the core dais to channel it', '#62d8ff', 3.5)
      this.wave = WAVES.length + 1
      this.phase = 'core'
      this.checkpoint = WAVES.length + 1
    } else {
      ctx.hud.banner('WAVE CLEARED', `Core ring ${this.wave}/3 locked`, '#62d8ff', 2.5)
      this.breather = this.wave === 2 ? 9 : 5.5
      this.checkpoint = this.wave + 1
    }
    // reward
    ctx.weapons.addAmmo(0.25)
    this.updateObjective()
  }

  updateObjective() {
    const ctx = this.ctx
    const alive = ctx.enemies.aliveCount
    let text
    if (this.phase === 'done') text = 'Reality stabilised'
    else if (this.phase === 'tutorial') text = 'Calibrate your rig'
    else if (ctx.core.state.ready)
      text =
        ctx.core.state.charge > 0
          ? `Channeling the core · ${Math.floor(ctx.core.state.charge * 100)}%`
          : 'Activate the Dimensional Core'
    else if (this.wave === 0) text = 'Enter the fractured arena'
    else if (this.breather > 0) text = 'Next rift opening…'
    else text = 'Eliminate the alien threat'
    const remaining = Math.max(0, this.waveTotal - this.waveKilled)
    ctx.hud.setObjective(
      text,
      Math.max(1, this.wave),
      WAVES.length,
      ctx.core.state.ready ? alive : remaining,
      ctx.core.state.ready ? alive : this.waveTotal
    )
  }

  // ---------------------------------------------------------------- events
  onKill(e, info) {
    const ctx = this.ctx
    if (e.type === 'drone') {
      ctx.audio.play('kill')
      return
    }
    this.kills++
    if (this.wave === 1 && this.waveKilled >= 2 && !this.said.has('w1mid')) {
      this.said.add('w1mid')
      ctx.narrator.say('w1mid')
    }
    if (this.wave >= 1 && this.wave <= WAVES.length && !e.channelSpawn) this.waveKilled++
    const names = { stalker: 'RIFT STALKER', warden: 'VOID WARDEN', sphere: 'DIMENSION SPHERE' }
    ctx.hud.feed(`<b>${names[e.type]}</b> ELIMINATED${info.weapon ? ` <i>· ${info.weapon.toUpperCase()}</i>` : ''}`)
    ctx.audio.play('kill')
    const p = e.pos.clone()
    const r = Math.random()
    if (e.type === 'stalker') {
      if (r < 0.28) ctx.pickups.drop('health', p)
      else if (r < 0.55) ctx.pickups.drop('ammo', p)
    } else if (e.type === 'warden') {
      ctx.pickups.drop('ammo', p.clone().add(new THREE.Vector3(0.8, 0, 0)))
      if (r < 0.7) ctx.pickups.drop('health', p.clone().add(new THREE.Vector3(-0.8, 0, 0)))
    } else if (e.type === 'sphere') {
      if (r < 0.4) ctx.pickups.drop('overcharge', p.setY(0))
      else ctx.pickups.drop('health', p.setY(0))
    }
    this.updateObjective()
  }

  onPlayerDeath() {
    const ctx = this.ctx
    this.state = 'dead'
    ctx.narrator.say('death', { interrupt: true })
    ctx.audio.play('death')
    ctx.audio.stop('charge')
    ctx.menu.showDeath(this.stats())
  }

  onFractureEject() {
    const ctx = this.ctx
    ctx.player.takeDamage(10, null, 'rift')
    ctx.hud.toast('STABILITY COLLAPSED · EJECTED TO MATERIAL', 'red')
    ctx.audio.play('warn')
  }

  onSlam(pos) {
    const ctx = this.ctx
    ctx.fx.ring(pos.clone().setY(pos.y + 0.1), 7, 0x9a6bff, 0.5)
    ctx.fx.burst(pos.clone().setY(pos.y + 0.2), 50, {
      color: [1.4, 0.6, 3.0],
      speed: 10,
      size: 0.16,
      life: 0.6,
      gravity: 8,
      dir: new THREE.Vector3(0, 0.4, 0),
      spread: 1.2,
    })
    ctx.enemies.radial(pos.clone().setY(pos.y + 0.5), 6.5, 65 * this.damageMul, { weapon: 'slam', knock: 16 })
    ctx.props.blast(pos, 8, 9)
    for (const p of ctx.props.props)
      if (p.alive && p.kind === 'canister' && p.body.position.distanceTo(pos) < 3) ctx.props.damage(p, 40)
    ctx.player.trauma = Math.min(1, ctx.player.trauma + 0.5)
    ctx.player.invuln = Math.max(ctx.player.invuln, 0.3)
    ctx.audio.play('slam')
    ctx.hud.pulseAbility('C')
  }

  onBarrierHit(col, point) {
    const ctx = this.ctx
    const b = ctx.arena.barriers.find((x) => x.col === col)
    if (b) b.mat.uniforms.uHit.value = ctx.time
    ctx.audio.play('barrier', 0.6, point)
  }

  explodeCanister(pos) {
    const ctx = this.ctx
    ctx.fx.explosion(pos, 6, [3.2, 1.5, 0.35])
    ctx.enemies.radial(pos, 6.5, 95 * this.damageMulBase, { weapon: 'canister', knock: 18 })
    const d = ctx.player.pos
      .clone()
      .setY(ctx.player.pos.y + 0.9)
      .distanceTo(pos)
    if (d < 6) ctx.player.takeDamage(38 * (1 - d / 6), pos, 'explosion')
    if (d < 18) ctx.player.trauma = Math.min(1, ctx.player.trauma + 0.6 * (1 - d / 18))
    ctx.props.blast(pos, 9, 12)
    for (const p of ctx.props.props)
      if (p.alive && p.kind === 'canister' && p.body.position.distanceTo(pos) < 5.5) ctx.props.damage(p, 100)
    ctx.audio.play('explosion', 1, pos)
  }

  stats() {
    const w = this.ctx.weapons
    return {
      time: this.elapsed,
      kills: this.kills,
      acc: w.shots ? Math.round((w.hits / w.shots) * 100) : 0,
      wave: Math.min(this.wave, WAVES.length),
      dmg: Math.round(this.ctx.player.damageTaken),
    }
  }

  // ---------------------------------------------------------------- update
  update(dt) {
    const ctx = this.ctx
    const playing = this.state === 'playing'
    const input = ctx.input
    if (playing) this.elapsed += dt

    // dimension shift
    if (playing && ctx.player.alive && input.hit('KeyQ')) {
      if (ctx.dims.shift()) {
        // handled by listener
      } else ctx.hud.pulseAbility('Q')
    }

    ctx.player.update(dt, input, playing)
    ctx.weapons.update(dt, input, playing)
    ctx.dims.update(dt)
    ctx.enemies.update(dt)
    ctx.projectiles.update(dt)
    ctx.fx.update(dt)
    ctx.props.update(dt, ctx.arena.zones, ctx.dims.gravityScale)
    ctx.pickups.update(dt)
    for (const m of ctx.arena.morphers) m.update(dt, ctx)
    ctx.mega.update(dt, ctx)
    ctx.core.update(dt, ctx)

    // explosive chain reactions
    for (let i = this.chainQueue.length - 1; i >= 0; i--) {
      const c = this.chainQueue[i]
      c.t -= dt
      if (c.t <= 0) {
        this.chainQueue.splice(i, 1)
        this.explodeCanister(c.pos)
      }
    }

    // portals (Fracture only)
    this.teleportCD = Math.max(0, this.teleportCD - dt)
    if (ctx.dims.current === 2 && this.teleportCD <= 0 && ctx.player.alive) {
      for (const p of ctx.arena.portals) {
        const dx = ctx.player.pos.x - p.pos.x,
          dz = ctx.player.pos.z - p.pos.z,
          dy = ctx.player.pos.y - p.pos.y
        if (dx * dx + dz * dz < 1.4 * 1.4 && Math.abs(dy) < 2.2) {
          const t = p.target
          const fwd = new THREE.Vector3(Math.sin(t.ry), 0, Math.cos(t.ry))
          // exit on the side facing the arena centre
          if (fwd.dot(new THREE.Vector3(-t.pos.x, 0, -t.pos.z)) < 0) fwd.negate()
          ctx.fx.burst(ctx.player.pos.clone().setY(ctx.player.pos.y + 1), 30, {
            color: [1.6, 0.5, 3],
            speed: 5,
            size: 0.14,
            life: 0.5,
            gravity: 0,
          })
          ctx.player.pos.copy(t.pos).addScaledVector(fwd, 2.2)
          ctx.player.pos.y += 0.05
          const sp = Math.hypot(ctx.player.vel.x, ctx.player.vel.z)
          ctx.player.vel.set(fwd.x * Math.max(sp, 4), 0, fwd.z * Math.max(sp, 4))
          ctx.player.yaw = Math.atan2(-fwd.x, -fwd.z)
          this.teleportCD = 1.5
          ctx.audio.play('teleport')
          ctx.fx.burst(ctx.player.pos.clone().setY(ctx.player.pos.y + 1), 30, {
            color: [1.6, 0.5, 3],
            speed: 5,
            size: 0.14,
            life: 0.5,
            gravity: 0,
          })
          ctx.R.U.uRipple.value = 1
          break
        }
      }
    }

    if (this.state === 'victory' && this.outroDelay > 0) {
      this.outroDelay -= dt
      if (this.outroDelay <= 0) this.startOutro()
    }
    if (playing && this.phase === 'tutorial') ctx.tutorial.update(dt, input)
    if (playing && this.phase !== 'tutorial') {
      if (this.waveDelay > 0) {
        this.waveDelay -= dt
        if (this.waveDelay <= 0) this.beginWave(this.wave + 1)
      }
      // waves
      if (this.wave >= 1 && this.wave <= WAVES.length && this.waveDelay <= 0) {
        for (let i = this.pendingLater.length - 1; i >= 0; i--) {
          const l = this.pendingLater[i]
          l.t -= dt
          if (l.t <= 0) {
            const pts = ctx.arena.spawnPoints
              .slice()
              .sort((a, b) => b.distanceToSquared(ctx.player.pos) - a.distanceToSquared(ctx.player.pos))
            for (let k = 0; k < l.count; k++) ctx.enemies.spawn(l.type, pts[k % 4].clone(), k * 0.4)
            this.pendingLater.splice(i, 1)
          }
        }
        if (this.breather > 0) {
          this.breather -= dt
          if (this.breather <= 0) this.beginWave(this.wave + 1)
        } else if (
          this.waveKilled >= this.waveTotal &&
          this.pendingLater.length === 0 &&
          ctx.enemies.aliveCount === 0
        ) {
          this.waveCleared()
        }
      }
      // core channel
      const core = ctx.core
      if (core.state.ready && !core.state.done) {
        const inZone = core.zoneCheck(ctx.player.pos) && ctx.player.alive
        if (inZone) {
          core.state.charge = Math.min(1, core.state.charge + dt / CHANNEL_TIME)
          for (const [k, at] of [
            ['core1', 0.02],
            ['core2', 0.5],
            ['core3', 0.8],
          ])
            if (core.state.charge >= at && !this.said.has(k)) {
              this.said.add(k)
              ctx.narrator.say(k)
            }
          ctx.hud.prompt(`<b>CHANNELING CORE</b> ${Math.floor(core.state.charge * 100)}% · hold the dais`)
          // reality fights back
          this.channelSpawnT -= dt
          if (this.channelSpawnT <= 0 && ctx.enemies.aliveCount < 6) {
            this.channelSpawnT = 3.2
            const pts = ctx.arena.spawnPoints
            const p = pts[Math.floor(Math.random() * pts.length)]
            const type = Math.random() < 0.25 ? 'warden' : 'stalker'
            ctx.enemies.spawn(type, p.clone())
          }
          if (Math.random() < 0.5) {
            const a = Math.random() * Math.PI * 2
            ctx.fx.emit(
              Math.cos(a) * 3.4,
              1.6,
              Math.sin(a) * 3.4,
              -Math.cos(a) * 1.2,
              4 + Math.random() * 3,
              -Math.sin(a) * 1.2,
              0.4,
              1.6,
              2.6,
              0.18,
              1.0,
              -1,
              0.5
            )
          }
        } else {
          core.state.charge = Math.max(0, core.state.charge - dt / 20)
          const d = ctx.player.pos.length()
          ctx.hud.prompt(d < 16 ? '<b>CORE ONLINE</b> · step onto the dais to channel' : '')
        }
        if (core.state.charge >= 1) this.victory()
        this.updateObjective()
      } else ctx.hud.prompt('')
      if (Math.floor(this.elapsed * 4) !== this._objTick) {
        this._objTick = Math.floor(this.elapsed * 4)
        this.updateObjective()
      }
    }

    // audio intensity + listener
    if (this.state === 'title' || this.state === 'cinematic') {
      ctx.audio.intensity = this.state === 'cinematic' ? 0.45 : 0.25
      const cam = ctx.camera
      const f = cam.getWorldDirection(new THREE.Vector3())
      ctx.audio.setListener(cam.position, Math.atan2(-f.x, -f.z))
    } else {
      ctx.audio.intensity = ctx.enemies.aliveCount > 0 ? 1 : this.phase === 'tutorial' ? 0.25 : 0.15
      ctx.audio.setListener(ctx.player.pos, ctx.player.yaw)
    }

    // post fx
    const U = ctx.R.U
    U.uTime.value = ctx.time
    U.uDimW.value.copy(ctx.dims.w)
    U.uRipple.value = Math.max(0, U.uRipple.value - dt * 1.4)
    U.uAberr.value = Math.max(U.uRipple.value * 1.2, ctx.dims.w.z * 0.25)
    U.uDamage.value = Math.max(ctx.hud.dmgFlash * 0.8, ctx.player.health < 30 ? 0.25 : 0)
    U.uGlitch.value = ctx.dims.w.z * (ctx.dims.stability < 0.3 ? 1 : 0.2)
    for (let i = 0; i < 3; i++) U.uWells.value[i].z = 0
    let wi = 0
    for (const w of ctx.projectiles.wells) {
      if (wi >= 3) break
      const p = w.pos.clone().project(ctx.camera)
      if (p.z < 1 && p.z > -1) {
        U.uWells.value[wi].set(
          p.x * 0.5 + 0.5,
          p.y * 0.5 + 0.5,
          Math.min(1, w.t * 4) * (w.t > w.life - 0.3 ? Math.max(0, (w.life - w.t) / 0.3) : 1)
        )
        wi++
      }
    }
  }

  victory() {
    const ctx = this.ctx
    ctx.core.state.done = true
    ctx.core.state.burst = 1
    this.state = 'victory'
    this.phase = 'done'
    // reality stabilises: remaining enemies are erased
    for (const e of ctx.enemies.list) if (e.alive) e.damage(99999, { weapon: 'core' })
    ctx.fx.explosion(ctx.core.pos.clone(), 14, [0.6, 2.2, 3.2])
    ctx.fx.ring(new THREE.Vector3(0, 1.6, 0), 60, 0x62d8ff, 2.0)
    ctx.audio.play('victory')
    ctx.hud.prompt('')
    ctx.narrator.clear()
    if (ctx.dims.current !== 0) ctx.dims.shift(0, true)
    this.updateObjective()
    this.finalStats = this.stats()
    this.outroDelay = 2.6 // on the game clock, so pausing can't desync it
  }

  startOutro() {
    const ctx = this.ctx
    this.state = 'cinematic'
    this.setCine(true)
    ctx.cinematic.play(outroShots(ctx), {
      bars: 1,
      onEnd: () => {
        this.state = 'victory'
        ctx.menu.showVictory(this.finalStats)
      },
    })
  }
}
