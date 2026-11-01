// Enemy manager: rift-portal spawning, per-frame updates, navigation field
// refresh, hitscan queries and kill bookkeeping.
import * as THREE from 'three'
import { NavGrid } from './nav.js'
import { RiftStalker } from './stalker.js'
import { VoidWarden } from './warden.js'
import { DimensionSphere } from './sphere.js'
import { G } from '../world/materials.js'

const TYPES = { stalker: RiftStalker, warden: VoidWarden, sphere: DimensionSphere }

export class EnemyManager {
  constructor(ctx) {
    this.ctx = ctx
    this.list = []
    this.queue = []
    this.nav = new NavGrid(ctx.cw)
    this.navTimer = 0
    // rift portals (pooled)
    this.portals = []
    const discMat = () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        uniforms: { uTime: G.uTime, uK: { value: 0 } },
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
        fragmentShader: `uniform float uTime; uniform float uK; varying vec2 vUv;
          void main(){ vec2 p = vUv*2.0-1.0; float r = length(p); float a = atan(p.y,p.x);
            float sw = 0.5+0.5*sin(a*4.0 + r*14.0 - uTime*8.0);
            float edge = smoothstep(0.08,0.0,abs(r-0.92));
            float k = (sw*0.5*smoothstep(1.0,0.0,r) + edge*1.2) * uK;
            gl_FragColor = vec4(vec3(2.6,0.35,1.2)*k + vec3(1.0,0.3,2.0)*k*0.4, k); }`,
      })
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(new THREE.CircleGeometry(1.6, 48), discMat())
      m.visible = false
      ctx.scene.add(m)
      this.portals.push({ m, t: 0, life: 0 })
    }
  }

  get aliveCount() {
    let n = this.queue.length
    for (const e of this.list) if (e.alive) n++
    return n
  }

  // Queue a spawn: a rift tears open, then the enemy steps through.
  spawn(type, pos, delay = 0) {
    this.queue.push({ type, pos: pos.clone(), t: -delay, opened: false })
  }

  openPortal(pos, type) {
    const p = this.portals.find((x) => !x.m.visible) || this.portals[0]
    p.m.visible = true
    const y = type === 'sphere' ? 5 : 1.6
    p.m.position.set(pos.x, pos.y + y, pos.z)
    p.m.lookAt(this.ctx.player.pos.x, pos.y + y, this.ctx.player.pos.z)
    p.t = 0
    p.life = 2.2
    this.ctx.fx.burst(p.m.position, 30, {
      color: [2.6, 0.4, 1.4],
      speed: 5,
      size: 0.14,
      life: 0.7,
      gravity: 0,
      drag: 2,
    })
    this.ctx.audio?.play('portal', 1, pos)
  }

  update(dt) {
    const ctx = this.ctx
    // spawn queue
    for (let i = this.queue.length - 1; i >= 0; i--) {
      const q = this.queue[i]
      q.t += dt
      if (q.t >= 0 && !q.opened) {
        q.opened = true
        this.openPortal(q.pos, q.type)
      }
      if (q.t >= 0.8) {
        const e = new TYPES[q.type](ctx, q.pos)
        e.trimShadows()
        this.list.push(e)
        this.queue.splice(i, 1)
      }
    }
    for (const p of this.portals) {
      if (!p.m.visible) continue
      p.t += dt
      const k = p.t < 0.3 ? p.t / 0.3 : p.t > p.life - 0.5 ? Math.max(0, (p.life - p.t) / 0.5) : 1
      p.m.material.uniforms.uK.value = k
      p.m.scale.setScalar(0.2 + k * 0.8)
      if (p.t >= p.life) p.m.visible = false
    }
    // navigation field toward the player
    this.navTimer -= dt
    if (this.navTimer <= 0) {
      this.navTimer = 0.3
      const pl = ctx.player
      this.nav.compute(pl.pos.x, pl.pos.z, ctx.dims.current)
    }
    for (const e of this.list) if (!e.removed) e.update(dt)
    for (let i = this.list.length - 1; i >= 0; i--) if (this.list[i].removed) this.list.splice(i, 1)
  }

  // Hitscan query. Returns hits sorted by distance.
  raycast(o, d, maxT, out = []) {
    out.length = 0
    for (const e of this.list) {
      if (!e.alive || e.state === 'spawn') continue
      // broad phase
      const c = e.center
      const ox = c.x - o.x,
        oy = c.y - o.y,
        oz = c.z - o.z
      const along = ox * d.x + oy * d.y + oz * d.z
      if (along < -2 || along > maxT + 2) continue
      const px = ox - d.x * along,
        py = oy - d.y * along,
        pz = oz - d.z * along
      if (px * px + py * py + pz * pz > (e.height + 1) * (e.height + 1)) continue
      const h = e.raycast(o, d, maxT)
      if (h) out.push({ enemy: e, t: h.t, crit: h.crit, mult: h.mult, core: h.h.core })
    }
    out.sort((a, b) => a.t - b.t)
    return out
  }

  // Area damage with falloff; returns number of enemies hit.
  radial(pos, radius, dmg, info = {}) {
    let n = 0
    for (const e of this.list) {
      if (!e.alive) continue
      const c = e.center
      const d = c.distanceTo(pos)
      if (d > radius + e.radius) continue
      const k = 1 - Math.max(0, d - e.radius) / radius
      const dir = c.clone().sub(pos).setY(0.4).normalize()
      e.damage(dmg * (0.35 + 0.65 * k), { ...info, dir, knock: (info.knock ?? 10) * k, point: c.clone() })
      n++
    }
    return n
  }

  onEnemyKilled(e, info) {
    this.ctx.game?.onKill(e, info)
  }

  clear() {
    for (const e of this.list) if (!e.removed) e.dispose()
    this.list.length = 0
    this.queue.length = 0
    for (const p of this.portals) p.m.visible = false
  }
}
