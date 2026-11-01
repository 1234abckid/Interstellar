// VOID WARDEN — heavy ranged sentinel. Layered armour, an exposed energy core
// and an arm cannon. Keeps its distance, strafes, telegraphs every volley with
// a glowing core and a targeting laser, and charges a heavier rift bolt.
// Its prismatic shield absorbs 80% of damage in Material and Inverted reality;
// the shield shatters in the Fracture, and the Phase Cannon destabilises it.
import * as THREE from 'three'
import { Enemy, alienMaterial } from './enemy.js'
import { bevelBox } from '../world/geometry.js'
import { G } from '../world/materials.js'
import { clamp, damp } from '../core/utils.js'

const DEF = { type: 'warden', hp: 240, radius: 0.85, height: 2.7, knockScale: 0.35 }
let GEO = null
function geos() {
  if (GEO) return GEO
  GEO = {
    chest: bevelBox(1.1, 0.9, 0.75, 0.08),
    plate: bevelBox(0.7, 0.35, 0.18, 0.05),
    pauldron: new THREE.SphereGeometry(0.42, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2),
    core: new THREE.IcosahedronGeometry(0.2, 2),
    leg: bevelBox(0.32, 0.7, 0.36, 0.06),
    shin: bevelBox(0.28, 0.65, 0.3, 0.05),
    foot: bevelBox(0.36, 0.16, 0.55, 0.04),
    head: bevelBox(0.38, 0.3, 0.4, 0.07),
    visor: new THREE.BoxGeometry(0.3, 0.04, 0.02),
    barrel: new THREE.CylinderGeometry(0.16, 0.2, 0.9, 14),
    ring: new THREE.TorusGeometry(0.2, 0.03, 6, 20),
    arm: bevelBox(0.26, 0.6, 0.26, 0.05),
    claw: new THREE.ConeGeometry(0.06, 0.35, 5),
    shield: new THREE.IcosahedronGeometry(1.75, 3),
    laser: new THREE.CylinderGeometry(0.012, 0.012, 1, 4, 1, true),
  }
  GEO.leg.translate(0, -0.35, 0)
  GEO.shin.translate(0, -0.32, 0)
  GEO.arm.translate(0, -0.3, 0)
  GEO.laser.translate(0, 0.5, 0)
  GEO.laser.rotateX(Math.PI / 2)
  return GEO
}

function shieldMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: G.uTime, uHit: { value: 0 }, uOn: { value: 1 } },
    vertexShader: `varying vec3 vN; varying vec3 vW; varying vec3 vL; void main(){ vL = position; vN = normalize(normalMatrix*normal); vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `uniform float uTime; uniform float uHit; uniform float uOn; varying vec3 vN; varying vec3 vW; varying vec3 vL;
      void main(){ vec3 V = normalize(cameraPosition - vW); float fr = pow(1.0 - abs(dot(V, vN)), 2.5);
        float hex = smoothstep(0.92, 1.0, abs(sin(vL.x*9.0+uTime))*abs(sin(vL.y*9.0))*abs(sin(vL.z*9.0-uTime*0.5)) * 3.0);
        float a = (fr*0.55 + hex*0.15 + uHit*0.6) * uOn;
        gl_FragColor = vec4(vec3(0.35,1.4,2.4)*a, a); }`,
  })
}

export class VoidWarden extends Enemy {
  constructor(ctx, pos) {
    super(ctx, pos, DEF)
    const g = geos()
    const armorM = alienMaterial(0x2a2638, [0.4, 0.2, 0.9], { roughness: 0.28, metalness: 0.75 })
    const fleshM = alienMaterial(0x1a1024, [1.2, 0.2, 1.4], { pulse: 0.5 })
    this.mats.push(armorM, fleshM)
    const coreM = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.0, 0.3, 0.9) })
    this.coreMat = coreM
    const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.8, 0.3, 0.8) })
    const M = (geo, m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
      const o = new THREE.Mesh(geo, m)
      o.position.set(x, y, z)
      o.rotation.set(rx, ry, rz)
      o.castShadow = true
      return o
    }
    const root = this.root
    const hips = new THREE.Group()
    hips.position.y = 1.25
    root.add(hips)
    hips.add(M(bevelBox(0.8, 0.3, 0.55, 0.06), armorM))
    const mkLeg = (s) => {
      const th = new THREE.Group()
      th.position.set(s * 0.32, -0.05, 0)
      hips.add(th)
      th.add(M(g.leg, armorM))
      const kn = new THREE.Group()
      kn.position.y = -0.68
      th.add(kn)
      kn.add(M(g.shin, fleshM))
      kn.add(M(g.plate, armorM, 0, -0.2, 0.14, 0.1, 0, 0))
      kn.add(M(g.foot, armorM, 0, -0.66, 0.1))
      return { th, kn }
    }
    this.legL = mkLeg(-1)
    this.legR = mkLeg(1)
    const torso = new THREE.Group()
    torso.position.y = 0.2
    hips.add(torso)
    torso.add(M(g.chest, armorM, 0, 0.55, 0))
    // layered plates around an open chest cavity
    for (const s of [-1, 1]) {
      torso.add(M(g.plate, armorM, s * 0.38, 0.7, 0.4, 0, s * 0.35, s * 0.2))
      torso.add(M(g.plate, armorM, s * 0.34, 0.35, 0.42, 0.2, s * 0.25, 0))
      const pd = M(g.pauldron, armorM, s * 0.7, 0.86, 0)
      pd.rotation.z = -s * 0.5
      pd.scale.set(1.15, 0.6, 1.1)
      torso.add(pd)
      torso.add(M(new THREE.BoxGeometry(0.06, 0.06, 0.5), glow, s * 0.72, 1.12, 0, 0, 0, -s * 0.4))
    }
    const core = M(g.core, coreM, 0, 0.6, 0.38)
    torso.add(core)
    this.core = core
    // head sunk between shoulders
    const head = new THREE.Group()
    head.position.set(0, 1.1, 0.08)
    torso.add(head)
    head.add(M(g.head, armorM))
    head.add(M(g.visor, glow, 0, 0.02, 0.2))
    // cannon arm (left)
    const armL = new THREE.Group()
    armL.position.set(-0.78, 0.85, 0)
    torso.add(armL)
    armL.add(M(g.arm, armorM))
    const gun = new THREE.Group()
    gun.position.set(0, -0.6, 0.15)
    armL.add(gun)
    gun.add(M(g.barrel, armorM, 0, 0, 0.3, Math.PI / 2, 0, 0))
    for (let i = 0; i < 3; i++) gun.add(M(g.ring, glow, 0, 0, 0.1 + i * 0.22))
    this.muzzle = new THREE.Object3D()
    this.muzzle.position.set(0, 0, 0.8)
    gun.add(this.muzzle)
    // claw arm (right)
    const armR = new THREE.Group()
    armR.position.set(0.78, 0.85, 0)
    torso.add(armR)
    armR.add(M(g.arm, fleshM))
    for (let k = -1; k <= 1; k++) armR.add(M(g.claw, armorM, k * 0.08, -0.72, 0.05, Math.PI, 0, k * 0.2))
    this.armL = armL
    this.armR = armR
    this.torso = torso
    this.hips = hips
    // shield bubble
    this.shieldMat = shieldMaterial()
    this.shield = new THREE.Mesh(g.shield, this.shieldMat)
    this.shield.position.y = 1.5
    this.shield.scale.set(1, 1.15, 1)
    root.add(this.shield)
    // targeting laser
    this.laser = new THREE.Mesh(g.laser, new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.2, 0.3), transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false }))
    this.laser.frustumCulled = false
    ctx.scene.add(this.laser)

    this.hitSpheres.push({ obj: core, r: 0.32, mult: 2.0, crit: true, core: true }, { obj: torso, offset: new THREE.Vector3(0, 0.55, 0), r: 0.7, mult: 1 }, { obj: hips, r: 0.5, mult: 0.9 }, { obj: head, r: 0.3, mult: 1.4 }, { obj: this.legL.kn, offset: new THREE.Vector3(0, -0.3, 0), r: 0.3, mult: 0.8 }, { obj: this.legR.kn, offset: new THREE.Vector3(0, -0.3, 0), r: 0.3, mult: 0.8 })
    this.root.scale.setScalar(0.01)
    this.shotCD = 1.5 + Math.random()
    this.volley = 0
    this.attacks = 0
    this.strafe = Math.random() < 0.5 ? 1 : -1
    this.strafeT = 0
    this.gait = 0
    this.heavy = false
    this.shieldHit = 0
    this.wasShielded = true
  }

  get shielded() {
    return this.ctx.dims.current !== 2 && this.destab <= 0
  }

  armor(info) {
    let m = super.armor(info)
    // the Phase Cannon tears through the prismatic shield
    if (this.shielded && info.weapon !== 'phase') m *= 0.2
    return m
  }

  onHurt(dealt, info, mult) {
    if (this.shielded) {
      this.shieldHit = 1
      if (info.point) this.ctx.fx.burst(info.point, 6, { color: [0.4, 1.6, 2.6], speed: 4, size: 0.08, life: 0.25 })
      this.ctx.audio?.play('shieldHit', 0.7, this.pos)
    } else this.ctx.audio?.play('wardenHit', 1, this.pos)
    if (info.weapon === 'phase') {
      this.destab = 5
      this.ctx.hud?.toast('WARDEN SHIELD DESTABILISED', 'violet')
    }
  }

  onDeath(info) {
    this.laser.visible = false
    this.ctx.audio?.play('wardenDie', 1, this.pos)
    const c = this.pos.clone().setY(this.pos.y + 1.8)
    this.ctx.fx.explosion(c, 4, [3, 0.4, 1.0])
    this.ctx.props?.blast(c, 6, 6)
  }

  dispose() {
    this.ctx.scene.remove(this.laser)
    super.dispose()
  }

  update(dt) {
    this.baseUpdate(dt)
    const ctx = this.ctx
    const pl = ctx.player
    this.shotCD -= dt
    this.shieldHit = Math.max(0, this.shieldHit - dt * 4)
    const sh = this.shielded
    // shield shatters visually when entering Fracture / destabilised
    if (this.wasShielded && !sh && this.alive) ctx.fx.burst(this.shield.getWorldPosition(new THREE.Vector3()), 30, { color: [0.4, 1.6, 2.6], speed: 6, size: 0.12, life: 0.6, gravity: 4 })
    this.wasShielded = sh
    this.shieldMat.uniforms.uOn.value = damp(this.shieldMat.uniforms.uOn.value, sh && this.alive ? 1 : 0, 10, dt)
    this.shieldMat.uniforms.uHit.value = this.shieldHit
    this.shield.visible = this.shieldMat.uniforms.uOn.value > 0.02
    // exposed core pulses brighter when vulnerable
    const vuln = !sh
    const pulse = vuln ? 1.4 + Math.sin(this.animT * 8) * 0.5 : 0.8
    this.core.scale.setScalar(pulse * 0.9 + (this.state === 'charge' ? this.st * 1.2 : 0))

    if (this.state === 'dead') {
      this.deathT += dt
      const k = Math.min(1, this.deathT / 0.8)
      this.root.rotation.x = k * 0.3
      this.torso.rotation.x = k * 0.8
      this.hips.position.y = 1.25 - k * 0.9
      if (this.deathT > 1.0) this.root.scale.setScalar(Math.max(0.001, 1 - (this.deathT - 1.0) * 2))
      if (this.deathT > 1.5) this.dispose()
      return
    }
    if (this.state === 'spawn') {
      const k = Math.min(1, this.st / 1.0)
      this.root.scale.setScalar(Math.max(0.01, k))
      if (k >= 1) {
        this.state = 'move'
        this.st = 0
      }
      this.physics(dt)
      return
    }
    const toP = pl.pos.clone().sub(this.pos)
    const d = Math.hypot(toP.x, toP.z)
    const eye = this.muzzle.getWorldPosition(new THREE.Vector3())
    const target = pl.pos.clone().setY(pl.pos.y + 1.3)
    const los = ctx.cw.los(eye.x, eye.y, eye.z, target.x, target.y, target.z)
    if (los) this.lastSeen = 0
    else this.lastSeen += dt
    this.laser.visible = false

    switch (this.state) {
      case 'move': {
        this.strafeT -= dt
        if (this.strafeT <= 0) {
          this.strafe *= -1
          this.strafeT = 1.5 + Math.random() * 2
        }
        if (d > 24 || !los) {
          this.pathTo(pl.pos, dt)
        } else if (d < 11) {
          this.dir.set(-toP.x / d, 0, -toP.z / d)
        } else {
          this.dir.set((-toP.z / d) * this.strafe, 0, (toP.x / d) * this.strafe)
        }
        this.steer(dt, 3.2, 6)
        this.faceToward(pl.pos.x, pl.pos.z, dt, 5)
        this.walkAnim(dt, Math.hypot(this.vel.x, this.vel.z))
        if (this.shotCD <= 0 && los && d < 42 && pl.alive) {
          this.attacks++
          this.heavy = this.attacks % 3 === 0
          this.state = 'charge'
          this.st = 0
          ctx.audio?.play(this.heavy ? 'wardenChargeHeavy' : 'wardenCharge', 1, this.pos)
        }
        break
      }
      case 'charge': {
        this.dir.set(0, 0, 0)
        this.steer(dt, 0, 8)
        this.faceToward(pl.pos.x, pl.pos.z, dt, 6)
        const dur = this.heavy ? 1.35 : 0.85
        // telegraph: targeting laser + arm raise
        this.armL.rotation.x = damp(this.armL.rotation.x, -1.45, 10, dt)
        this.laser.visible = true
        this.laser.position.copy(eye)
        this.laser.lookAt(target)
        this.laser.scale.set(this.heavy ? 3 : 1.5, this.heavy ? 3 : 1.5, eye.distanceTo(target))
        this.laser.material.opacity = 0.25 + (this.st / dur) * 0.6 + Math.sin(this.st * 40) * 0.1
        ctx.fx.emit(eye.x, eye.y, eye.z, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, 3, 0.4, 1, 0.12 + this.st * 0.2, 0.25, 0, 3)
        if (this.st >= dur) {
          this.state = 'fire'
          this.st = 0
          this.volley = 0
        }
        break
      }
      case 'fire': {
        this.faceToward(pl.pos.x, pl.pos.z, dt, 6)
        const interval = 0.16
        const shots = this.heavy ? 1 : 3
        if (this.volley < shots && this.st >= this.volley * interval) {
          this.volley++
          // lead the target slightly
          const lead = pl.vel.clone().multiplyScalar(0.25)
          lead.y = 0
          const aim = target.clone().add(lead)
          aim.x += (Math.random() - 0.5) * 1.0
          aim.z += (Math.random() - 0.5) * 1.0
          const dir = aim.sub(eye).normalize()
          const mul = ctx.game.enemyDamageMul
          if (this.heavy) ctx.projectiles.enemyShot(eye, dir.multiplyScalar(22), { dmg: 28 * mul, splash: 3.5, size: 0.45, color: [3, 0.4, 1.0], heavy: true })
          else ctx.projectiles.enemyShot(eye, dir.multiplyScalar(20), { dmg: 10 * mul, size: 0.22, color: [3, 0.35, 0.8] })
          ctx.fx.flash(eye, this.heavy ? 1.6 : 0.8, 0xff3366, 0.1)
          ctx.audio?.play(this.heavy ? 'wardenHeavy' : 'wardenShot', 1, this.pos)
          this.armL.rotation.x -= 0.25
        }
        if (this.st > shots * interval + 0.3) {
          this.state = 'move'
          this.st = 0
          this.shotCD = 1.7 + Math.random() * 1.2
        }
        break
      }
    }
    if (this.state !== 'charge' && this.state !== 'fire') this.armL.rotation.x = damp(this.armL.rotation.x, -0.3, 5, dt)
    this.physics(dt)
  }

  walkAnim(dt, speed) {
    this.gait += dt * (1.5 + speed * 1.2)
    const k = clamp(speed / 3, 0, 1)
    const s = Math.sin(this.gait)
    this.legL.th.rotation.x = s * 0.5 * k
    this.legR.th.rotation.x = -s * 0.5 * k
    this.legL.kn.rotation.x = Math.max(0, -s) * 0.6 * k
    this.legR.kn.rotation.x = Math.max(0, s) * 0.6 * k
    this.hips.position.y = 1.25 + Math.abs(Math.cos(this.gait)) * 0.06 * k
    this.torso.rotation.z = s * 0.04 * k
    this.armR.rotation.x = -s * 0.3 * k
  }
}
