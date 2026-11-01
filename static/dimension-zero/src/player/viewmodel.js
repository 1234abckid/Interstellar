// First-person arms and weapon models, rendered in their own scene on top of
// the world (no clipping into walls). Handles sway, bob, recoil, reload and
// weapon-switch animation, muzzle flashes and per-skin colouring.
import * as THREE from 'three'
import { bevelBox } from '../world/geometry.js'
import { skinMaterials } from '../ui/operators.js'
import { damp, clamp, lerp } from '../core/utils.js'

const cyl = (rt, rb, h, s = 14) => new THREE.CylinderGeometry(rt, rb, h, s)

export class Viewmodel {
  constructor(ctx) {
    this.ctx = ctx
    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(56, 1, 0.01, 10)
    this.scene.add(this.camera)
    this.hemi = new THREE.HemisphereLight(0xbcd6ff, 0x3a3040, 1.0)
    this.sun = new THREE.DirectionalLight(0xffffff, 2.2)
    this.sun.position.set(0.5, 1, 0.3)
    this.fill = new THREE.PointLight(0x9a6bff, 0.6, 3)
    this.fill.position.set(-0.3, 0.1, 0.2)
    this.scene.add(this.hemi, this.sun, this.fill)
    this.muzzleLight = new THREE.PointLight(0x88ccff, 0, 2.5, 2)
    this.camera.add(this.muzzleLight)

    this.rig = new THREE.Group() // sway/bob container
    this.camera.add(this.rig)
    this.weapons = []
    this.current = 0
    this.switchT = 1
    this.switchFrom = 0
    this.swayX = 0
    this.swayY = 0
    this.kick = 0
    this.kickRot = 0
    this.reloadT = 0
    this.reloadDur = 1
    this.charge = 0
    this.ads = 0
    this.flashT = 1
    this.time = 0
    this.metal = new THREE.MeshStandardMaterial({ color: 0x3a3c48, roughness: 0.34, metalness: 0.8 })
    this.metal2 = new THREE.MeshStandardMaterial({ color: 0x34343f, roughness: 0.42, metalness: 0.85 })
    this.rubber = new THREE.MeshStandardMaterial({ color: 0x101014, roughness: 0.85, metalness: 0.0 })
    this.glass = new THREE.MeshPhysicalMaterial({
      color: 0x220a40,
      roughness: 0.05,
      metalness: 0.2,
      transmission: 0,
      transparent: true,
      opacity: 0.55,
    })
    this.accent = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 0.55, 3.2) })
    this.reticle = new THREE.MeshBasicMaterial({
      color: new THREE.Color(2.4, 0.8, 3.6),
      transparent: true,
      depthTest: false,
    })
    this.buildArms()
    this.buildPulseRifle()
    this.buildLauncher()
    this.buildCannon()
    this.flash = this.makeFlash()
    this.applySkin(ctx.selection)
    this.weapons.forEach((w, i) => (w.group.visible = i === 0))
  }

  m(geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
    const o = new THREE.Mesh(geo, mat)
    o.position.set(x, y, z)
    o.rotation.set(rx, ry, rz)
    return o
  }

  buildArms() {
    // Arms are parented per-weapon so the hands sit on each weapon's grips.
    this.armParts = []
  }
  makeArm(parent, hand, elbow, isLeft) {
    // simple two-segment arm from an off-screen shoulder to the hand position
    const g = new THREE.Group()
    const shoulder = new THREE.Vector3(isLeft ? -0.32 : 0.3, -0.42, 0.35)
    const mid = elbow
    const seg = (a, b, r0, r1, matKey) => {
      const len = a.distanceTo(b)
      const mesh = new THREE.Mesh(cyl(r1, r0, len, 12), null)
      mesh.position.copy(a).lerp(b, 0.5)
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize())
      mesh.userData.matKey = matKey
      g.add(mesh)
      return mesh
    }
    seg(shoulder, mid, 0.058, 0.05, 'cloth')
    seg(mid, hand, 0.05, 0.04, 'cloth')
    // cuff
    const cuffPos = mid.clone().lerp(hand, 0.82)
    const cuff = new THREE.Mesh(cyl(0.047, 0.047, 0.04, 12), null)
    cuff.position.copy(cuffPos)
    cuff.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), hand.clone().sub(mid).normalize())
    cuff.userData.matKey = 'cloth2'
    g.add(cuff)
    // glove: palm + fingers wrapped around grip
    const glove = new THREE.Group()
    glove.position.copy(hand)
    const palm = new THREE.Mesh(bevelBox(0.055, 0.075, 0.085, 0.015), null)
    palm.userData.matKey = 'glove'
    glove.add(palm)
    for (let i = 0; i < 4; i++) {
      const f = new THREE.Mesh(bevelBox(0.018, 0.02, 0.06, 0.006), null)
      f.position.set(isLeft ? 0.03 : -0.03, 0.03 - i * 0.02, 0.005)
      f.rotation.y = isLeft ? -0.6 : 0.6
      f.userData.matKey = 'glove'
      glove.add(f)
    }
    const knuckle = new THREE.Mesh(bevelBox(0.05, 0.02, 0.03, 0.005), null)
    knuckle.position.set(isLeft ? -0.02 : 0.02, 0.0, 0.03)
    knuckle.userData.matKey = 'metal'
    glove.add(knuckle)
    glove.rotation.set(0, 0, isLeft ? 0.4 : -0.2)
    g.add(glove)
    parent.add(g)
    this.armParts.push(g)
    return g
  }

  addWeapon(group, def) {
    group.visible = false
    group.scale.setScalar(0.85)
    group.position.copy(def.hip)
    this.rig.add(group)
    this.weapons.push({ group, ...def })
  }

  buildPulseRifle() {
    const g = new THREE.Group()
    const M = this.metal,
      A = this.accent
    // receiver
    g.add(this.m(bevelBox(0.07, 0.1, 0.42, 0.012), M, 0, 0, 0))
    g.add(this.m(bevelBox(0.074, 0.03, 0.32, 0.008), this.metal2, 0, 0.06, -0.03))
    // rail notches
    for (let i = 0; i < 9; i++)
      g.add(this.m(bevelBox(0.05, 0.01, 0.014, 0.003), this.metal2, 0, 0.08, -0.16 + i * 0.03))
    // shroud with glowing vents
    g.add(this.m(bevelBox(0.065, 0.075, 0.3, 0.012), M, 0, -0.005, -0.35))
    for (let i = 0; i < 4; i++) {
      g.add(this.m(bevelBox(0.068, 0.012, 0.04, 0.003), A, 0, 0.0, -0.26 - i * 0.06))
    }
    g.add(this.m(bevelBox(0.072, 0.008, 0.36, 0.002), A, 0, -0.04, -0.08)) // side strip
    // barrel + muzzle
    g.add(this.m(cyl(0.016, 0.016, 0.18, 10), this.metal2, 0, 0.0, -0.58, Math.PI / 2))
    g.add(this.m(cyl(0.026, 0.022, 0.06, 10), this.rubber, 0, 0, -0.66, Math.PI / 2))
    // magazine (energy cell)
    g.add(this.m(bevelBox(0.05, 0.14, 0.07, 0.01), M, 0, -0.11, -0.05, 0.15))
    g.add(this.m(bevelBox(0.052, 0.07, 0.02, 0.005), A, 0, -0.1, -0.01, 0.15))
    // grip + trigger guard
    g.add(this.m(bevelBox(0.045, 0.13, 0.06, 0.012), this.rubber, 0, -0.1, 0.12, -0.25))
    g.add(this.m(bevelBox(0.01, 0.035, 0.07, 0.003), M, 0, -0.065, 0.06))
    // stock
    g.add(this.m(bevelBox(0.055, 0.08, 0.2, 0.012), M, 0, -0.01, 0.31))
    g.add(this.m(bevelBox(0.06, 0.12, 0.03, 0.01), this.rubber, 0, -0.02, 0.42))
    // foregrip
    g.add(this.m(bevelBox(0.035, 0.09, 0.04, 0.01), this.rubber, 0, -0.09, -0.3))
    // red-dot sight
    const sight = new THREE.Group()
    sight.add(this.m(bevelBox(0.05, 0.012, 0.09, 0.004), this.metal2, 0, 0, 0))
    sight.add(this.m(bevelBox(0.052, 0.012, 0.08, 0.004), M, 0, 0.058, 0))
    for (const sx of [-1, 1]) sight.add(this.m(bevelBox(0.008, 0.05, 0.08, 0.003), M, sx * 0.023, 0.035, 0))
    const lens = this.m(new THREE.PlaneGeometry(0.038, 0.04), this.glass, 0, 0.034, -0.03)
    sight.add(lens)
    const ret = this.m(new THREE.RingGeometry(0.003, 0.0042, 20), this.reticle, 0, 0.034, -0.028)
    ret.renderOrder = 10
    sight.add(ret)
    sight.position.set(0, 0.09, -0.04)
    g.add(sight)
    this.makeArm(g, new THREE.Vector3(0.0, -0.13, 0.12), new THREE.Vector3(0.16, -0.25, 0.32), false)
    this.makeArm(g, new THREE.Vector3(0.0, -0.11, -0.3), new THREE.Vector3(-0.2, -0.3, -0.05), true)
    this.addWeapon(g, {
      muzzle: new THREE.Vector3(0, 0, -0.7),
      hip: new THREE.Vector3(0.21, -0.235, -0.56),
      ads: new THREE.Vector3(0, -0.106, -0.42),
    })
  }

  buildLauncher() {
    const g = new THREE.Group()
    const M = this.metal,
      A = this.accent
    g.add(this.m(bevelBox(0.13, 0.13, 0.5, 0.025), M, 0, 0, -0.05))
    g.add(this.m(bevelBox(0.15, 0.04, 0.4, 0.01), this.metal2, 0, 0.085, -0.08))
    // orb chamber
    const chamber = new THREE.Group()
    chamber.add(this.m(new THREE.TorusGeometry(0.085, 0.018, 8, 28), this.metal2, 0, 0, 0, 0, Math.PI / 2))
    chamber.add(this.m(new THREE.TorusGeometry(0.085, 0.018, 8, 28), this.metal2, 0, 0, 0, Math.PI / 2, 0))
    const orb = this.m(new THREE.IcosahedronGeometry(0.05, 2), A)
    chamber.add(orb)
    chamber.position.set(0, 0.02, -0.33)
    g.add(chamber)
    // twin barrels
    for (const s of [-1, 1]) g.add(this.m(cyl(0.028, 0.034, 0.26, 12), M, s * 0.045, 0.0, -0.5, Math.PI / 2))
    g.add(this.m(new THREE.TorusGeometry(0.075, 0.012, 6, 24), A, 0, 0, -0.62))
    g.add(this.m(bevelBox(0.135, 0.01, 0.36, 0.003), A, 0, -0.05, -0.05))
    g.add(this.m(bevelBox(0.05, 0.14, 0.07, 0.012), this.rubber, 0, -0.12, 0.12, -0.2))
    g.add(this.m(bevelBox(0.06, 0.1, 0.16, 0.012), M, 0, -0.02, 0.27))
    g.add(this.m(bevelBox(0.04, 0.1, 0.05, 0.01), this.rubber, 0, -0.11, -0.22))
    this.makeArm(g, new THREE.Vector3(0.0, -0.14, 0.12), new THREE.Vector3(0.17, -0.26, 0.32), false)
    this.makeArm(g, new THREE.Vector3(0.0, -0.12, -0.22), new THREE.Vector3(-0.2, -0.3, 0.0), true)
    this.chamber = chamber
    this.orb = orb
    this.addWeapon(g, {
      muzzle: new THREE.Vector3(0, 0, -0.66),
      hip: new THREE.Vector3(0.22, -0.245, -0.6),
      ads: new THREE.Vector3(0.0, -0.15, -0.5),
    })
  }

  buildCannon() {
    const g = new THREE.Group()
    const M = this.metal,
      A = this.accent
    g.add(this.m(bevelBox(0.09, 0.11, 0.36, 0.02), M, 0, 0, 0.02))
    // split prongs (blade-like)
    for (const s of [-1, 1]) {
      const prong = new THREE.Group()
      prong.add(this.m(bevelBox(0.03, 0.05, 0.46, 0.01), this.metal2, 0, 0, 0))
      prong.add(this.m(bevelBox(0.032, 0.012, 0.4, 0.003), A, 0, s * 0.026, 0.01))
      prong.position.set(s * 0.05, 0.0, -0.36)
      prong.rotation.y = s * -0.06
      g.add(prong)
    }
    // energy core between the prongs
    const core = this.m(cyl(0.022, 0.022, 0.36, 10), A, 0, 0, -0.36, Math.PI / 2)
    g.add(core)
    const coreGlow = this.m(new THREE.SphereGeometry(0.035, 12, 10), A, 0, 0, -0.18)
    g.add(coreGlow)
    // capacitor rings
    for (let i = 0; i < 3; i++)
      g.add(this.m(new THREE.TorusGeometry(0.06, 0.008, 6, 20), this.metal2, 0, 0, -0.08 - i * 0.05))
    g.add(this.m(bevelBox(0.045, 0.13, 0.06, 0.012), this.rubber, 0, -0.1, 0.12, -0.25))
    g.add(this.m(bevelBox(0.05, 0.09, 0.2, 0.012), M, 0, -0.01, 0.3))
    g.add(this.m(bevelBox(0.07, 0.04, 0.12, 0.01), this.metal2, 0, 0.07, -0.02))
    this.makeArm(g, new THREE.Vector3(0.0, -0.13, 0.12), new THREE.Vector3(0.16, -0.25, 0.32), false)
    this.makeArm(g, new THREE.Vector3(0.0, -0.06, -0.12), new THREE.Vector3(-0.2, -0.28, 0.05), true)
    this.cannonCore = core
    this.cannonGlow = coreGlow
    this.addWeapon(g, {
      muzzle: new THREE.Vector3(0, 0, -0.62),
      hip: new THREE.Vector3(0.2, -0.23, -0.58),
      ads: new THREE.Vector3(0, -0.13, -0.47),
    })
  }

  makeFlash() {
    const c = document.createElement('canvas')
    c.width = c.height = 64
    const g = c.getContext('2d')
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32)
    grd.addColorStop(0, 'rgba(255,255,255,1)')
    grd.addColorStop(0.3, 'rgba(200,220,255,0.8)')
    grd.addColorStop(1, 'rgba(120,80,255,0)')
    g.fillStyle = grd
    g.beginPath()
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2
      const r = i % 2 ? 12 : 32
      g.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r)
    }
    g.fill()
    const tex = new THREE.CanvasTexture(c)
    tex.colorSpace = THREE.SRGBColorSpace
    const s = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: tex,
        color: 0xffffff,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
        depthTest: false,
      })
    )
    s.visible = false
    s.renderOrder = 20
    this.rig.add(s)
    return s
  }

  applySkin(sel) {
    const { SKINS } = this.ctx.operatorData
    const skin = SKINS[sel.skin]
    const m = skinMaterials(skin)
    for (const g of this.armParts)
      g.traverse((o) => o.isMesh && o.userData.matKey && (o.material = m[o.userData.matKey]))
    this.accent.color.setRGB(...skin.accent)
    this.reticle.color.setRGB(skin.accent[0] * 1.2, skin.accent[1] * 1.2, skin.accent[2] * 1.2)
    this.fill.color.setRGB(skin.accent[0] / 3, skin.accent[1] / 3, skin.accent[2] / 3)
    this.accentRGB = skin.accent
  }

  select(i) {
    if (i === this.current && this.switchT >= 1) return
    this.switchFrom = this.current
    this.current = i
    this.switchT = 0
  }

  fire(strength = 1) {
    this.kick = Math.min(1.5, this.kick + strength)
    this.kickRot = Math.min(1.5, this.kickRot + strength)
    this.flashT = 0
    const w = this.weapons[this.current]
    this.flash.position
      .copy(w.group.position)
      .add(w.muzzle.clone().multiplyScalar(w.group.scale.x).applyQuaternion(w.group.quaternion))
    this.flash.material.rotation = Math.random() * 6.28
    this.flash.material.color.setRGB(
      this.accentRGB[0] / 2.5 + 0.4,
      this.accentRGB[1] / 2.5 + 0.4,
      this.accentRGB[2] / 2.5 + 0.4
    )
    this.muzzleLight.position.copy(this.flash.position)
    this.muzzleLight.color.setRGB(this.accentRGB[0] / 3, this.accentRGB[1] / 3, this.accentRGB[2] / 3)
  }

  reload(dur) {
    this.reloadT = 0.0001
    this.reloadDur = dur
  }

  // muzzle position expressed in camera space (used for world tracers)
  muzzleCamSpace(out) {
    const w = this.weapons[this.current]
    out.copy(w.muzzle).multiplyScalar(w.group.scale.x).applyQuaternion(w.group.quaternion).add(w.group.position)
    out.applyQuaternion(this.rig.quaternion).add(this.rig.position)
    return out
  }

  update(dt, player, input, ctx) {
    this.time += dt
    const t = this.time
    // match lighting to the world
    this.sun.color.copy(ctx.lights.sun.color)
    this.sun.intensity = ctx.lights.sun.intensity * 0.7
    this.hemi.color.copy(ctx.lights.hemi.color)
    this.hemi.groundColor.copy(ctx.lights.hemi.groundColor)
    this.scene.environment = ctx.scene.environment

    // sway from look input (lagged, clamped so it never hides the crosshair)
    const md = input && input.locked ? input.mouse : { dx: 0, dy: 0 }
    this.swayX = damp(this.swayX, clamp(-md.dx * 0.0009, -0.04, 0.04), 10, dt)
    this.swayY = damp(this.swayY, clamp(md.dy * 0.0009, -0.04, 0.04), 10, dt)
    const bob = player.bob
    const ph = player.bobPhase
    const bx = Math.cos(ph) * 0.012 * bob
    const by = -Math.abs(Math.sin(ph)) * 0.014 * bob
    this.kick = damp(this.kick, 0, 14, dt)
    this.kickRot = damp(this.kickRot, 0, 10, dt)
    const wantAds = input && input.mouse.right && player.alive && this.reloadT <= 0 && !player.sprinting
    this.ads = damp(this.ads, wantAds ? 1 : 0, 14, dt)
    const sprint = player.sprinting && player.onGround ? 1 : 0
    this.sprintK = damp(this.sprintK || 0, sprint, 8, dt)
    const slide = player.slideT > 0 ? 1 : 0
    this.slideK = damp(this.slideK || 0, slide, 10, dt)

    // switch animation (lower old, raise new)
    if (this.switchT < 1) this.switchT = Math.min(1, this.switchT + dt / 0.38)
    const lowering = this.switchT < 0.5
    const showIdx = lowering ? this.switchFrom : this.current
    this.weapons.forEach((w, i) => (w.group.visible = i === showIdx))
    const sw = lowering ? this.switchT * 2 : 1 - (this.switchT - 0.5) * 2
    // reload animation
    let rl = 0
    if (this.reloadT > 0) {
      this.reloadT += dt / this.reloadDur
      if (this.reloadT >= 1) this.reloadT = 0
      else rl = Math.sin(this.reloadT * Math.PI)
    }
    const adsK = this.ads * (1 - sw)
    this.rig.position.set(
      (bx + this.swayX) * (1 - adsK * 0.8),
      by * (1 - adsK * 0.7) + this.swayY - sw * 0.35 - rl * 0.08 - this.sprintK * 0.05 + (player.landDip || 0) * 0.3,
      this.kick * 0.06 * (1 - adsK * 0.5)
    )
    this.rig.rotation.set(
      this.kickRot * 0.09 - rl * 0.5 - this.sprintK * 0.35,
      this.sprintK * 0.5 + this.swayX * 2,
      rl * 0.6 + this.slideK * 0.25 + this.sprintK * 0.15 + this.swayX * 3
    )
    const w = this.weapons[showIdx]
    w.group.position.lerpVectors(w.hip, w.ads, adsK)
    w.group.rotation.set(0.02 * (1 - adsK), 0.06 * (1 - adsK), 0)

    // weapon-specific idle details
    if (this.chamber) {
      this.chamber.rotation.z += dt * (2 + this.kick * 20)
      this.chamber.rotation.x += dt * 1.3
      this.orb.scale.setScalar(1 + Math.sin(t * 6) * 0.1)
    }
    if (this.cannonCore) {
      const c = this.charge
      this.cannonCore.scale.set(1 + c * 0.8 + Math.sin(t * 40) * 0.15 * c, 1, 1 + c * 0.8)
      this.cannonGlow.scale.setScalar(1 + c * 2.2 + Math.sin(t * 30) * 0.2 * c)
    }

    // muzzle flash
    this.flashT += dt / 0.05
    this.flash.visible = this.flashT < 1
    if (this.flash.visible) this.flash.scale.setScalar(0.12 + (1 - this.flashT) * 0.12)
    this.muzzleLight.intensity = this.flashT < 1 ? 3 * (1 - this.flashT) : 0
  }

  resize(w, h, fov) {
    this.camera.aspect = w / h
    // keep the weapon framed on portrait / narrow windows
    this.camera.fov = w / h < 1 ? 70 : 56
    this.camera.updateProjectionMatrix()
  }
}
