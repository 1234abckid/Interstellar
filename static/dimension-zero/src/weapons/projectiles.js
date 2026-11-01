// Simulated projectiles: Singularity orbs (player) that become gravity wells,
// and enemy plasma bolts. Pooled, collide with the box world, energy barriers,
// physics props, enemies and the player.
import * as THREE from 'three'
import { G } from '../world/materials.js'

const _hit = {}
const _d = new THREE.Vector3()

export class Projectiles {
  constructor(ctx) {
    this.ctx = ctx
    this.list = []
    this.wells = []
    // pooled meshes
    this.orbGeo = new THREE.IcosahedronGeometry(1, 2)
    this.pool = []
    for (let i = 0; i < 40; i++) {
      const m = new THREE.Mesh(this.orbGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }))
      m.visible = false
      ctx.scene.add(m)
      this.pool.push(m)
    }
    // singularity well visuals (pooled, max 3)
    this.wellPool = []
    for (let i = 0; i < 3; i++) {
      const grp = new THREE.Group()
      const core = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), new THREE.MeshBasicMaterial({ color: 0x000000 }))
      const rim = new THREE.Mesh(
        new THREE.SphereGeometry(1.25, 32, 20),
        new THREE.ShaderMaterial({
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          uniforms: { uTime: G.uTime, uK: { value: 1 } },
          vertexShader: `varying vec3 vN; varying vec3 vW; void main(){ vN = normalize(normalMatrix*normal); vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
          fragmentShader: `uniform float uTime; uniform float uK; varying vec3 vN; varying vec3 vW;
            void main(){ vec3 V = normalize(cameraPosition - vW); float fr = pow(clamp(1.0 - abs(dot(V, vN)), 0.0, 1.0), 3.0);
              float sw = 0.5+0.5*sin(atan(vN.y,vN.x)*6.0 + uTime*10.0);
              float a = fr*(0.8+sw*0.6)*uK; gl_FragColor = vec4(vec3(1.4,0.5,3.0)*a, a); }`,
        })
      )
      const disc = new THREE.Mesh(
        new THREE.RingGeometry(1.3, 3.2, 64),
        new THREE.ShaderMaterial({
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
          uniforms: { uTime: G.uTime, uK: { value: 1 } },
          vertexShader: `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
          fragmentShader: `uniform float uTime; uniform float uK; varying vec2 vP;
            void main(){ float r = length(vP); float a = atan(vP.y, vP.x);
              float s = 0.5+0.5*sin(a*3.0 - r*5.0 + uTime*9.0);
              float f = smoothstep(3.2,1.3,r) * smoothstep(1.25,1.6,r);
              float al = f*(0.25+s*0.6)*uK; gl_FragColor = vec4(mix(vec3(1.2,0.4,2.8), vec3(2.6,1.6,3.0), s)*al, al); }`,
        })
      )
      disc.rotation.x = -Math.PI / 2 + 0.35
      grp.add(core, rim, disc)
      grp.visible = false
      ctx.scene.add(grp)
      this.wellPool.push({ grp, core, rim, disc })
    }
  }

  getMesh(size, color) {
    const m = this.pool.find((x) => !x.visible) || this.pool[0]
    m.visible = true
    m.scale.setScalar(size)
    m.material.color.setRGB(color[0], color[1], color[2])
    return m
  }

  // ---------------------------------------------------------------- spawn
  playerOrb(from, vel) {
    this.list.push({
      kind: 'orb',
      pos: from.clone(),
      vel: vel.clone(),
      life: 3,
      mesh: this.getMesh(0.18, [1.6, 0.6, 3.2]),
      grav: 7,
      owner: 'player',
    })
  }

  enemyShot(from, vel, o) {
    this.list.push({
      kind: 'enemy',
      pos: from.clone(),
      vel: vel.clone(),
      life: 4,
      mesh: this.getMesh(o.size, o.color),
      grav: 0,
      dmg: o.dmg,
      splash: o.splash || 0,
      color: o.color,
      size: o.size,
      heavy: o.heavy,
      owner: 'enemy',
    })
  }

  // ---------------------------------------------------------------- update
  update(dt) {
    const ctx = this.ctx
    const cw = ctx.cw
    const pl = ctx.player
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i]
      p.life -= dt
      p.vel.y -= p.grav * dt
      const step = p.vel.length() * dt
      _d.copy(p.vel).normalize()
      let hitPoint = null,
        normal = null,
        hitEnemy = null
      // world
      const wh = cw.raycast(p.pos.x, p.pos.y, p.pos.z, _d.x, _d.y, _d.z, step, null, _hit)
      let maxT = wh ? wh.t : step
      if (wh) {
        hitPoint = p.pos.clone().addScaledVector(_d, wh.t)
        normal = new THREE.Vector3(wh.nx, wh.ny, wh.nz)
        if (wh.c.kind === 'barrier') ctx.game?.onBarrierHit(wh.c, hitPoint)
      }
      // ground plane
      if (p.pos.y + _d.y * maxT < 0) {
        const t = -p.pos.y / (_d.y || -1e-6)
        if (t >= 0 && t < maxT) {
          maxT = t
          hitPoint = p.pos.clone().addScaledVector(_d, t)
          normal = new THREE.Vector3(0, 1, 0)
        }
      }
      if (p.owner === 'player') {
        const eh = ctx.enemies.raycast(p.pos, _d, maxT + 0.3)
        if (eh.length) {
          hitEnemy = eh[0].enemy
          maxT = eh[0].t
          hitPoint = p.pos.clone().addScaledVector(_d, eh[0].t)
          normal = _d.clone().negate()
        }
        const ph = ctx.props.raycast(p.pos, _d, maxT)
        if (ph) {
          hitPoint = p.pos.clone().addScaledVector(_d, ph.t)
          normal = _d.clone().negate()
        }
      } else if (pl.alive) {
        // swept test vs player capsule (approximated by two spheres)
        for (const yo of [0.5, 1.3]) {
          const cx = pl.pos.x - p.pos.x,
            cy = pl.pos.y + yo - p.pos.y,
            cz = pl.pos.z - p.pos.z
          const along = Math.max(0, Math.min(maxT, cx * _d.x + cy * _d.y + cz * _d.z))
          const px = cx - _d.x * along,
            py = cy - _d.y * along,
            pz = cz - _d.z * along
          const rr = 0.45 + p.size * 0.6
          if (px * px + py * py + pz * pz < rr * rr) {
            pl.takeDamage(p.dmg, p.pos.clone(), 'ranged')
            hitPoint = p.pos.clone().addScaledVector(_d, along)
            normal = _d.clone().negate()
            p.hitPlayer = true
            break
          }
        }
      }
      if (hitPoint || p.life <= 0) {
        const at = hitPoint || p.pos
        this.detonate(p, at, normal || new THREE.Vector3(0, 1, 0), hitEnemy)
        p.mesh.visible = false
        this.list.splice(i, 1)
        continue
      }
      p.pos.addScaledVector(p.vel, dt)
      p.mesh.position.copy(p.pos)
      // trail
      const c = p.owner === 'player' ? [1.4, 0.6, 3.0] : p.color
      ctx.fx.emit(
        p.pos.x,
        p.pos.y,
        p.pos.z,
        (Math.random() - 0.5) * 0.5,
        (Math.random() - 0.5) * 0.5,
        (Math.random() - 0.5) * 0.5,
        c[0],
        c[1],
        c[2],
        (p.size || 0.18) * 1.4,
        0.25,
        0,
        1
      )
    }
    this.updateWells(dt)
  }

  detonate(p, at, normal, enemy) {
    const ctx = this.ctx
    if (p.kind === 'orb') {
      const pos = at.clone().addScaledVector(normal, 0.8)
      pos.y = Math.max(pos.y, 1.0)
      if (enemy)
        enemy.damage(25 * ctx.game.damageMul, {
          weapon: 'singularity',
          point: at,
          dir: p.vel.clone().normalize(),
          knock: 3,
        })
      this.createWell(pos)
    } else {
      ctx.fx.impact(at, normal, p.color, p.heavy)
      if (p.splash) {
        ctx.fx.explosion(at, p.splash, p.color)
        const d = ctx.player.pos
          .clone()
          .setY(ctx.player.pos.y + 1)
          .distanceTo(at)
        if (!p.hitPlayer && d < p.splash) ctx.player.takeDamage(p.dmg * 0.6 * (1 - d / p.splash), at, 'ranged')
        ctx.props.blast(at, p.splash * 1.5, 5)
        ctx.audio?.play('explosion', 0.7, at)
      }
    }
  }

  createWell(pos) {
    const ctx = this.ctx
    if (this.wells.length >= 3) this.collapse(this.wells[0])
    const vis = this.wellPool.find((w) => !w.grp.visible) || this.wellPool[0]
    vis.grp.visible = true
    vis.grp.position.copy(pos)
    const w = { pos: pos.clone(), t: 0, life: 2.3, vis }
    this.wells.push(w)
    ctx.audio?.play('well', 1, pos)
    ctx.fx.ring(pos, 9, 0x9a5bff, 0.6)
  }

  updateWells(dt) {
    const ctx = this.ctx
    for (let i = this.wells.length - 1; i >= 0; i--) {
      const w = this.wells[i]
      w.t += dt
      const k = Math.min(1, w.t / 0.25)
      const end = w.t > w.life - 0.3 ? Math.max(0, (w.life - w.t) / 0.3) : 1
      const s = k * (0.6 + 0.4 * end)
      w.vis.core.scale.setScalar(0.55 * s)
      w.vis.rim.scale.setScalar(0.55 * s * (1 + Math.sin(w.t * 30) * 0.05))
      w.vis.disc.scale.setScalar(s * 1.1)
      w.vis.disc.rotation.z += dt * 4
      // pull enemies
      for (const e of ctx.enemies.list) {
        if (!e.alive) continue
        const c = e.center
        const dx = w.pos.x - c.x,
          dy = w.pos.y - c.y,
          dz = w.pos.z - c.z
        const d = Math.hypot(dx, dy, dz)
        if (d > 10 || d < 0.2) continue
        const f = (1 - d / 10) * 34 * dt * (e.type === 'warden' ? 0.35 : 1)
        e.ext.x += (dx / d) * f
        e.ext.z += (dz / d) * f
        if (!e.flying && e.type !== 'warden') e.ext.y += Math.max(0, dy / d) * f * 0.5 + 6 * dt
        else if (e.flying) e.ext.y += (dy / d) * f
        if (d < 3.5) e.damage(16 * dt * ctx.game.damageMul, { weapon: 'singularity' })
      }
      ctx.props.attract(w.pos, 11, 60, dt)
      // the player feels it too (gently)
      const pl = ctx.player
      const pdx = w.pos.x - pl.pos.x,
        pdz = w.pos.z - pl.pos.z
      const pd = Math.hypot(pdx, pdz)
      if (pd < 7 && pd > 0.5) {
        pl.vel.x += (pdx / pd) * (1 - pd / 7) * 10 * dt
        pl.vel.z += (pdz / pd) * (1 - pd / 7) * 10 * dt
      }
      // inflowing particles
      for (let n = 0; n < 3; n++) {
        const a = Math.random() * Math.PI * 2,
          r = 3 + Math.random() * 4
        const sx = w.pos.x + Math.cos(a) * r,
          sz = w.pos.z + Math.sin(a) * r,
          sy = w.pos.y + (Math.random() - 0.5) * 3
        ctx.fx.emit(
          sx,
          sy,
          sz,
          (w.pos.x - sx) * 2.2 - Math.sin(a) * 4,
          (w.pos.y - sy) * 2.2,
          (w.pos.z - sz) * 2.2 + Math.cos(a) * 4,
          1.4,
          0.6,
          3.0,
          0.12,
          0.45,
          0,
          0
        )
      }
      ctx.distortion?.(w.pos, s)
      if (w.t >= w.life) this.collapse(w)
    }
  }

  collapse(w) {
    const ctx = this.ctx
    const i = this.wells.indexOf(w)
    if (i < 0) return
    this.wells.splice(i, 1)
    w.vis.grp.visible = false
    ctx.fx.explosion(w.pos, 6, [1.6, 0.6, 3.2])
    ctx.fx.ring(w.pos, 10, 0xb080ff, 0.6, new THREE.Vector3(0, 1, 0.3).normalize())
    ctx.enemies.radial(w.pos, 7, 80 * ctx.game.damageMul, { weapon: 'singularity', knock: 18 })
    ctx.props.blast(w.pos, 10, 11)
    for (const p of ctx.props.props)
      if (p.alive && p.kind === 'canister' && p.body.position.distanceTo(w.pos) < 4) ctx.props.damage(p, 50)
    const d = ctx.player.pos
      .clone()
      .setY(ctx.player.pos.y + 1)
      .distanceTo(w.pos)
    if (d < 4.5) ctx.player.takeDamage(18 * (1 - d / 4.5), w.pos, 'self')
    if (d < 14) ctx.player.trauma = Math.min(1, ctx.player.trauma + 0.4 * (1 - d / 14))
    ctx.audio?.play('collapse', 1, w.pos)
  }

  clear() {
    for (const p of this.list) p.mesh.visible = false
    this.list.length = 0
    for (const w of this.wells) w.vis.grp.visible = false
    this.wells.length = 0
  }
}
