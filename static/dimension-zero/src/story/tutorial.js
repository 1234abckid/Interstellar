// "Calibration": an interactive tutorial voiced by ARC. Each step teaches one
// mechanic, shows an objective card with key caps, optionally places a 3D
// beacon or projects training drones, and advances when the player actually
// performs the action. ENTER skips the whole calibration.
import * as THREE from 'three'
import { TrainingDrone } from '../enemies/drone.js'
import { G } from '../world/materials.js'

const K = (k) => `<kbd>${k}</kbd>`

export class Tutorial {
  constructor(ctx) {
    this.ctx = ctx
    this.active = false
    this.i = -1
    // beacon: light column + ground ring
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: { uTime: G.uTime },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `uniform float uTime; varying vec2 vUv;
        void main(){ float s = 0.6 + 0.4*sin(vUv.y*30.0 - uTime*6.0);
          float a = (1.0 - vUv.y) * 0.55 * s; gl_FragColor = vec4(vec3(1.0,0.7,0.25)*a*1.6, a); }`,
    })
    this.beacon = new THREE.Group()
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 14, 24, 1, true), mat)
    col.position.y = 7
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.9, 0.05, 6, 48),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 1.8, 0.4) })
    )
    ring.rotation.x = Math.PI / 2
    ring.position.y = 0.05
    this.beacon.add(col, ring)
    this.beacon.visible = false
    this.ring = ring
    ctx.scene.add(this.beacon)
    this.drones = []
    this.steps = this.defineSteps()
  }

  defineSteps() {
    const ctx = this.ctx
    const pl = () => ctx.player
    return [
      {
        title: 'LOOK AROUND',
        text: `Move the ${K('MOUSE')} to look`,
        line: 't_look',
        setup: (s) => {
          s.acc = 0
          s.yaw = pl().yaw
          s.pitch = pl().pitch
        },
        check: (s) => {
          s.acc += Math.abs(pl().yaw - s.yaw) + Math.abs(pl().pitch - s.pitch)
          s.yaw = pl().yaw
          s.pitch = pl().pitch
          return s.acc > 1.4
        },
      },
      {
        title: 'MOVE',
        text: `Walk to the marker with ${K('W')}${K('A')}${K('S')}${K('D')}`,
        line: 't_move',
        marker: new THREE.Vector3(7, 0, 11),
        check: (s) => this.near(s.marker, 1.8),
      },
      {
        title: 'SPRINT',
        text: `Hold ${K('SHIFT')} while moving forward to sprint`,
        line: 't_sprint',
        marker: new THREE.Vector3(-13, 0, 3),
        setup: (s) => (s.sprint = 0),
        check: (s, dt) => {
          if (pl().sprinting) s.sprint += dt
          return this.near(s.marker, 1.9) && s.sprint > 0.4
        },
      },
      {
        title: 'JUMP',
        text: `Press ${K('SPACE')} to jump`,
        line: 't_jump',
        check: () => pl().vel.y > 4 && !pl().onGround,
      },
      {
        title: 'SHOOT',
        text: `Destroy the training drones · ${K('LMB')} fire · ${K('RMB')} aim`,
        line: 't_shoot',
        setup: () => {
          ctx.weapons.select(0)
          this.spawnDrones([
            [12, -3.5, 2.4],
            [14, 0, 3.4],
            [12, 3.5, 2.2],
          ])
        },
        check: () => this.dronesLeft() === 0,
        progress: () => `${3 - this.dronesLeft()} / 3`,
      },
      {
        title: 'RELOAD',
        text: `Press ${K('R')} to reload`,
        line: 't_reload',
        setup: () => {
          ctx.weapons.select(0)
          const st = ctx.weapons.state[0]
          st.mag = Math.min(st.mag, 9)
        },
        check: () => ctx.weapons.reloading > 0 || ctx.weapons.state[0].mag >= 30,
      },
      {
        title: 'SHIFT REALITY',
        text: `Press ${K('Q')} to shift into the Inverted world`,
        line: 't_shift',
        setup: () => (ctx.dims.cooldown = 0),
        check: () => ctx.dims.current === 1,
        after: 't_inverted',
        afterWait: 5.2,
      },
      {
        title: 'THE FRACTURE',
        text: `Press ${K('Q')} again to enter the Fracture`,
        line: 't_shift2',
        setup: () => (ctx.dims.cooldown = 0),
        check: () => ctx.dims.current === 2,
        after: 't_fracture',
        afterWait: 6.5,
      },
      {
        title: 'RETURN',
        text: `Press ${K('Q')} to return to the Material world`,
        line: 't_back',
        setup: () => (ctx.dims.cooldown = 0),
        check: () => ctx.dims.current === 0,
      },
      {
        title: 'BREAK THE SHIELD',
        text: `Switch to the Phase Cannon ${K('3')} · hold ${K('LMB')} to charge, release to fire`,
        line: 't_phase',
        setup: () => this.spawnDrones([[13, 0, 2.6]], { shielded: true }),
        check: () => this.dronesLeft() === 0,
      },
      {
        title: 'VOID DASH',
        text: `Press ${K('E')} to dash`,
        line: 't_dash',
        setup: () => (pl().dashCD = 0),
        check: () => pl().dashT > 0,
      },
      {
        title: 'SINGULARITY',
        text: `Switch to the Singularity Launcher ${K('2')} and destroy the cluster`,
        line: 't_sing',
        setup: () => {
          const st = ctx.weapons.state[1]
          st.mag = 3
          st.reserve = Math.max(st.reserve, 6)
          this.spawnDrones(
            [
              [14, -1.2, 1.8],
              [14, 1.2, 1.8],
              [15.2, 0, 2.6],
              [13, 0, 1.4],
            ],
            { hp: 22 }
          )
        },
        check: () => this.dronesLeft() === 0,
        progress: () => `${4 - this.dronesLeft()} / 4`,
      },
    ]
  }

  near(p, r) {
    const pl = this.ctx.player.pos
    return Math.hypot(pl.x - p.x, pl.z - p.z) < r
  }
  dronesLeft() {
    return this.drones.filter((d) => d.alive).length
  }

  // Place drones ahead of the player: [distance, lateral offset, height].
  // Rotates around the player until every drone has a clear line of sight.
  spawnDrones(list, opts = {}) {
    const ctx = this.ctx
    const pl = ctx.player
    const eye = pl.pos.clone()
    eye.y += 1.6
    for (let a = 0; a < 16; a++) {
      const yaw = pl.yaw + (a % 2 ? 1 : -1) * Math.ceil(a / 2) * 0.4
      const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw))
      const right = new THREE.Vector3(-fwd.z, 0, fwd.x)
      const pts = list.map(([d, l, h]) =>
        pl.pos
          .clone()
          .addScaledVector(fwd, d)
          .addScaledVector(right, l)
          .setY(pl.pos.y + h)
      )
      const ok = pts.every((p) => Math.hypot(p.x, p.z) < 46 && ctx.cw.los(eye.x, eye.y, eye.z, p.x, p.y, p.z))
      if (ok || a === 15) {
        for (const p of pts) {
          const d = new TrainingDrone(ctx, p, opts)
          if (opts.hp) d.hp = d.maxHp = opts.hp
          ctx.enemies.list.push(d)
          this.drones.push(d)
        }
        ctx.audio.play('portal', 0.5, pts[0])
        return
      }
    }
  }

  start() {
    this.active = true
    this.i = -1
    this.wait = 0
    this.next()
  }

  next() {
    const ctx = this.ctx
    this.i++
    this.beacon.visible = false
    ctx.hud.setMarker(null)
    if (this.i >= this.steps.length) return this.complete()
    const s = this.steps[this.i]
    s.done = false
    s.setup?.(s)
    if (s.line) ctx.narrator.say(s.line, { interrupt: true })
    if (s.marker) {
      this.beacon.visible = true
      this.beacon.position.copy(s.marker)
      ctx.hud.setMarker(s.marker, 'MARKER')
    }
    ctx.hud.setTutorial(this.i + 1, this.steps.length, s.title, s.text, s.progress?.())
  }

  complete() {
    const ctx = this.ctx
    this.active = false
    this.clearDrones()
    ctx.hud.clearTutorial()
    ctx.hud.setMarker(null)
    ctx.audio.play('objective')
    ctx.hud.banner('CALIBRATION COMPLETE', 'Rift signatures detected', '#62d8ff', 2.8)
    ctx.narrator.say('t_done', { interrupt: true })
    try {
      localStorage.setItem('dz.tutorialDone', '1')
    } catch {}
    ctx.game.onTutorialComplete()
  }

  skip() {
    if (!this.active) return
    const ctx = this.ctx
    this.active = false
    this.clearDrones()
    this.beacon.visible = false
    ctx.hud.clearTutorial()
    ctx.hud.setMarker(null)
    ctx.narrator.say('t_skip', { interrupt: true })
    ctx.game.onTutorialComplete()
  }

  clearDrones() {
    for (const d of this.drones) if (!d.removed) d.dispose()
    this.ctx.enemies.list = this.ctx.enemies.list.filter((e) => e.type !== 'drone')
    this.drones.length = 0
  }

  update(dt, input) {
    if (!this.active) return
    if (input.hit('Enter') || input.hit('NumpadEnter')) return this.skip()
    const s = this.steps[this.i]
    this.ring.scale.setScalar(1 + Math.sin(this.ctx.time * 4) * 0.12)
    if (!s.done) {
      if (s.check(s, dt)) {
        s.done = true
        this.ctx.audio.play('pickup')
        this.ctx.hud.tutorialDone()
        this.wait = s.after ? s.afterWait : 0.9
        if (s.after) this.ctx.narrator.say(s.after, { interrupt: true })
      } else if (s.progress) this.ctx.hud.setTutorialProgress(s.progress())
    } else {
      this.wait -= dt
      if (this.wait <= 0) this.next()
    }
  }
}
