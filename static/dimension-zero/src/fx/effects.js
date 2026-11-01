// Pooled visual effects: GPU point particles, tracers, phase beams, impact
// flashes, shockwave rings and short-lived lights. Nothing here allocates per
// frame; every pool is fixed-size and recycles its oldest entry.
import * as THREE from 'three'
import { G } from '../world/materials.js'

const MAX_P = 3000

export class Effects {
  constructor(ctx) {
    this.ctx = ctx
    const scene = ctx.scene
    // ---------------- particles
    const geo = new THREE.BufferGeometry()
    this.pPos = new Float32Array(MAX_P * 3)
    this.pCol = new Float32Array(MAX_P * 3)
    this.pSize = new Float32Array(MAX_P)
    this.pAlpha = new Float32Array(MAX_P)
    this.pVel = new Float32Array(MAX_P * 3)
    this.pLife = new Float32Array(MAX_P)
    this.pMax = new Float32Array(MAX_P)
    this.pGrav = new Float32Array(MAX_P)
    this.pDrag = new Float32Array(MAX_P)
    this.pSize0 = new Float32Array(MAX_P)
    this.pHead = 0
    geo.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3).setUsage(THREE.DynamicDrawUsage))
    geo.setAttribute('color', new THREE.BufferAttribute(this.pCol, 3).setUsage(THREE.DynamicDrawUsage))
    geo.setAttribute('size', new THREE.BufferAttribute(this.pSize, 1).setUsage(THREE.DynamicDrawUsage))
    geo.setAttribute('alpha', new THREE.BufferAttribute(this.pAlpha, 1).setUsage(THREE.DynamicDrawUsage))
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uScale: { value: 600 } },
      vertexShader: /* glsl */ `
        attribute float size; attribute float alpha; attribute vec3 color;
        uniform float uScale; varying vec3 vC; varying float vA;
        void main(){ vC = color; vA = alpha; vec4 mv = modelViewMatrix*vec4(position,1.0);
          gl_PointSize = size * uScale / max(0.1, -mv.z); gl_Position = projectionMatrix*mv; }`,
      fragmentShader: /* glsl */ `
        varying vec3 vC; varying float vA;
        void main(){ vec2 p = gl_PointCoord*2.0-1.0; float d = dot(p,p); if (d>1.0) discard;
          float f = exp(-d*3.5); gl_FragColor = vec4(vC*f*vA, f*vA); }`,
    })
    this.points = new THREE.Points(geo, mat)
    this.points.frustumCulled = false
    this.points.renderOrder = 5
    scene.add(this.points)
    this.pMat = mat

    // ---------------- tracers
    const trGeo = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true)
    trGeo.translate(0, 0.5, 0)
    trGeo.rotateX(Math.PI / 2) // length along +z
    this.tracers = []
    for (let i = 0; i < 28; i++) {
      const m = new THREE.Mesh(
        trGeo,
        new THREE.MeshBasicMaterial({
          color: new THREE.Color(1, 2, 3),
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      )
      m.visible = false
      m.frustumCulled = false
      scene.add(m)
      this.tracers.push({ m, t: 0, life: 0.07, w: 0.02 })
    }
    this.trHead = 0

    // ---------------- phase beams
    const bmGeo = new THREE.CylinderGeometry(1, 1, 1, 16, 1, true)
    bmGeo.translate(0, 0.5, 0)
    bmGeo.rotateX(Math.PI / 2)
    this.beams = []
    for (let i = 0; i < 4; i++) {
      const mat2 = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        uniforms: {
          uT: { value: 0 },
          uLen: { value: 1 },
          uTime: G.uTime,
          uColor: { value: new THREE.Color(1.4, 0.5, 3.0) },
        },
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
        fragmentShader: `uniform float uT; uniform float uLen; uniform float uTime; uniform vec3 uColor; varying vec2 vUv;
          void main(){ float sp = 0.5+0.5*sin(vUv.x*6.2831*3.0 + vUv.y*uLen*2.0 - uTime*40.0);
            float near = smoothstep(0.0, 2.5, vUv.y*uLen);
            float a = (1.0-uT) * (0.25 + sp*0.5) * near;
            gl_FragColor = vec4(mix(uColor, vec3(3.0), sp*(1.0-uT)*0.5)*a, a); }`,
      })
      const m = new THREE.Mesh(bmGeo, mat2)
      m.visible = false
      m.frustumCulled = false
      scene.add(m)
      const core = new THREE.Mesh(
        trGeo,
        new THREE.MeshBasicMaterial({
          color: new THREE.Color(1.6, 1.3, 2.0),
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      )
      core.visible = false
      core.frustumCulled = false
      scene.add(core)
      this.beams.push({ m, core, t: 1, life: 0.4 })
    }
    this.bmHead = 0

    // ---------------- flashes (billboard sprites)
    const sprMap = makeFlashTex()
    this.flashes = []
    for (let i = 0; i < 24; i++) {
      const s = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: sprMap,
          color: 0xffffff,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      )
      s.visible = false
      scene.add(s)
      this.flashes.push({ s, t: 1, life: 0.1, size: 1 })
    }
    this.flHead = 0

    // ---------------- shockwave rings
    this.rings = []
    const ringGeo = new THREE.RingGeometry(0.85, 1, 64)
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(
        ringGeo,
        new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
        })
      )
      m.visible = false
      scene.add(m)
      this.rings.push({ m, t: 1, life: 0.5, r0: 0.5, r1: 6 })
    }
    this.rgHead = 0

    // ---------------- dynamic lights
    this.lights = []
    for (let i = 0; i < 3; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 14, 2)
      scene.add(l)
      this.lights.push({ l, t: 1, life: 0.2, i0: 0 })
    }
    this.lHead = 0
    this._tmpC = new THREE.Color()
  }

  // ------------------------------------------------------------ particles
  emit(x, y, z, vx, vy, vz, r, g, b, size, life, grav = 0, drag = 0) {
    const i = this.pHead
    this.pHead = (this.pHead + 1) % MAX_P
    const j = i * 3
    this.pPos[j] = x
    this.pPos[j + 1] = y
    this.pPos[j + 2] = z
    this.pVel[j] = vx
    this.pVel[j + 1] = vy
    this.pVel[j + 2] = vz
    this.pCol[j] = r
    this.pCol[j + 1] = g
    this.pCol[j + 2] = b
    this.pSize[i] = this.pSize0[i] = size
    this.pLife[i] = life
    this.pMax[i] = life
    this.pGrav[i] = grav
    this.pDrag[i] = drag
    this.pAlpha[i] = 1
  }

  burst(pos, n, o = {}) {
    const c = o.color || [1, 1, 1]
    const sp = o.speed ?? 6
    const dir = o.dir
    const spread = o.spread ?? 1
    for (let k = 0; k < n; k++) {
      let vx = Math.random() * 2 - 1,
        vy = Math.random() * 2 - 1,
        vz = Math.random() * 2 - 1
      const l = Math.hypot(vx, vy, vz) || 1
      vx /= l
      vy /= l
      vz /= l
      if (dir) {
        vx = dir.x + vx * spread
        vy = dir.y + vy * spread
        vz = dir.z + vz * spread
      }
      const s = sp * (0.35 + Math.random() * 0.65)
      const cv = o.colorVar ?? 0.15
      this.emit(
        pos.x + (o.jitter ? (Math.random() - 0.5) * o.jitter : 0),
        pos.y + (o.jitter ? (Math.random() - 0.5) * o.jitter : 0),
        pos.z + (o.jitter ? (Math.random() - 0.5) * o.jitter : 0),
        vx * s,
        vy * s + (o.up || 0),
        vz * s,
        c[0] * (1 - cv + Math.random() * cv * 2),
        c[1] * (1 - cv + Math.random() * cv * 2),
        c[2] * (1 - cv + Math.random() * cv * 2),
        (o.size ?? 0.15) * (0.6 + Math.random() * 0.8),
        (o.life ?? 0.5) * (0.6 + Math.random() * 0.6),
        o.gravity ?? 9,
        o.drag ?? 2
      )
    }
  }

  // ------------------------------------------------------------ primitives
  tracer(from, to, color = [1.2, 2.2, 3.2], width = 0.025, life = 0.07) {
    const tr = this.tracers[this.trHead]
    this.trHead = (this.trHead + 1) % this.tracers.length
    const len = from.distanceTo(to)
    tr.m.position.copy(from)
    tr.m.lookAt(to)
    tr.m.scale.set(width, width, len)
    tr.m.material.color.setRGB(color[0], color[1], color[2])
    tr.m.visible = true
    tr.t = 0
    tr.life = life
    tr.w = width
  }

  beam(from, to, color) {
    const b = this.beams[this.bmHead]
    this.bmHead = (this.bmHead + 1) % this.beams.length
    const len = from.distanceTo(to)
    for (const m of [b.m, b.core]) {
      m.position.copy(from)
      m.lookAt(to)
      m.visible = true
    }
    b.m.scale.set(0.13, 0.13, len)
    b.core.scale.set(0.025, 0.025, len)
    b.m.material.uniforms.uLen.value = len
    if (color) b.m.material.uniforms.uColor.value.setRGB(color[0], color[1], color[2])
    b.t = 0
  }

  flash(pos, size = 1, color = 0xffffff, life = 0.1) {
    const f = this.flashes[this.flHead]
    this.flHead = (this.flHead + 1) % this.flashes.length
    f.s.position.copy(pos)
    f.s.material.color.set(color)
    f.s.material.rotation = Math.random() * 6.28
    f.s.visible = true
    f.size = size
    f.t = 0
    f.life = life
  }

  ring(pos, r1 = 6, color = 0xffffff, life = 0.5, normal = null) {
    const g = this.rings[this.rgHead]
    this.rgHead = (this.rgHead + 1) % this.rings.length
    g.m.position.copy(pos)
    if (normal) g.m.lookAt(pos.x + normal.x, pos.y + normal.y, pos.z + normal.z)
    else g.m.rotation.set(-Math.PI / 2, 0, 0)
    g.m.material.color.set(color)
    g.m.visible = true
    g.t = 0
    g.life = life
    g.r1 = r1
  }

  light(pos, color = 0xffffff, intensity = 30, life = 0.15, dist = 14) {
    const L = this.lights[this.lHead]
    this.lHead = (this.lHead + 1) % this.lights.length
    L.l.position.copy(pos)
    L.l.color.set(color)
    L.l.distance = dist
    L.i0 = intensity
    L.l.intensity = intensity
    L.t = 0
    L.life = life
  }

  // ------------------------------------------------------------ composites
  impact(pos, normal, color = [1.0, 2.0, 3.0], big = false) {
    this.burst(pos, big ? 18 : 8, {
      color,
      speed: big ? 9 : 6,
      dir: normal,
      spread: 0.9,
      size: 0.08,
      life: 0.35,
      gravity: 14,
      drag: 1.5,
    })
    this.flash(pos, big ? 1.4 : 0.6, new THREE.Color(color[0] / 3, color[1] / 3, color[2] / 3), 0.08)
  }

  explosion(pos, radius = 6, color = [3, 1.4, 0.4]) {
    this.burst(pos, 80, { color, speed: radius * 3, size: 0.28, life: 0.7, gravity: 6, drag: 2.5 })
    this.burst(pos, 40, {
      color: [1.2, 1.0, 0.9],
      speed: radius * 1.2,
      size: 0.5,
      life: 1.1,
      gravity: -1,
      drag: 3,
      colorVar: 0.3,
    })
    this.flash(pos, radius * 1.4, new THREE.Color(color[0] / 3, color[1] / 3, color[2] / 3), 0.25)
    this.ring(
      pos.clone().setY(Math.max(0.1, pos.y - 0.5)),
      radius * 1.3,
      new THREE.Color(color[0] / 3, color[1] / 3, color[2] / 3),
      0.5
    )
    this.light(pos, new THREE.Color(color[0] / 3, color[1] / 3, color[2] / 3), 120, 0.35, radius * 4)
  }

  update(dt) {
    // particles
    for (let i = 0; i < MAX_P; i++) {
      if (this.pLife[i] <= 0) {
        if (this.pAlpha[i] !== 0) this.pAlpha[i] = 0
        continue
      }
      this.pLife[i] -= dt
      const j = i * 3
      const dr = Math.exp(-this.pDrag[i] * dt)
      this.pVel[j] *= dr
      this.pVel[j + 1] = this.pVel[j + 1] * dr - this.pGrav[i] * dt
      this.pVel[j + 2] *= dr
      this.pPos[j] += this.pVel[j] * dt
      this.pPos[j + 1] += this.pVel[j + 1] * dt
      this.pPos[j + 2] += this.pVel[j + 2] * dt
      if (this.pPos[j + 1] < 0.02 && this.pGrav[i] > 0) {
        this.pPos[j + 1] = 0.02
        this.pVel[j + 1] *= -0.3
      }
      const k = Math.max(0, this.pLife[i] / this.pMax[i])
      this.pAlpha[i] = k < 0.7 ? k / 0.7 : 1
      this.pSize[i] = this.pSize0[i] * (0.5 + k * 0.5)
    }
    const ga = this.points.geometry.attributes
    ga.position.needsUpdate = true
    ga.color.needsUpdate = true
    ga.size.needsUpdate = true
    ga.alpha.needsUpdate = true
    this.pMat.uniforms.uScale.value = this.ctx.renderer.domElement.height * 0.9

    for (const tr of this.tracers) {
      if (!tr.m.visible) continue
      tr.t += dt
      const k = 1 - tr.t / tr.life
      if (k <= 0) tr.m.visible = false
      else {
        tr.m.material.opacity = k
        tr.m.scale.x = tr.m.scale.y = tr.w * (0.5 + k * 0.5)
      }
    }
    for (const b of this.beams) {
      if (!b.m.visible) continue
      b.t += dt / b.life
      if (b.t >= 1) {
        b.m.visible = b.core.visible = false
      } else {
        b.m.material.uniforms.uT.value = b.t
        b.core.material.opacity = 1 - b.t
        const s = 0.13 * (1 + b.t * 1.2)
        b.m.scale.x = b.m.scale.y = s
      }
    }
    for (const f of this.flashes) {
      if (!f.s.visible) continue
      f.t += dt / f.life
      if (f.t >= 1) f.s.visible = false
      else {
        f.s.material.opacity = 1 - f.t
        f.s.scale.setScalar(f.size * (0.7 + f.t * 0.6))
      }
    }
    for (const g of this.rings) {
      if (!g.m.visible) continue
      g.t += dt / g.life
      if (g.t >= 1) g.m.visible = false
      else {
        const e = 1 - Math.pow(1 - g.t, 3)
        g.m.scale.setScalar(0.5 + e * g.r1)
        g.m.material.opacity = (1 - g.t) * 0.9
      }
    }
    for (const L of this.lights) {
      if (L.t >= 1) {
        L.l.intensity = 0
        continue
      }
      L.t += dt / L.life
      L.l.intensity = L.i0 * Math.max(0, 1 - L.t)
    }
  }

  clear() {
    this.pLife.fill(0)
    for (const t of this.tracers) t.m.visible = false
    for (const b of this.beams) b.m.visible = b.core.visible = false
    for (const f of this.flashes) f.s.visible = false
    for (const g of this.rings) g.m.visible = false
  }
}

function makeFlashTex() {
  const s = 128
  const c = document.createElement('canvas')
  c.width = c.height = s
  const g = c.getContext('2d')
  const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
  grd.addColorStop(0, 'rgba(255,255,255,1)')
  grd.addColorStop(0.15, 'rgba(255,255,255,0.9)')
  grd.addColorStop(0.4, 'rgba(255,255,255,0.25)')
  grd.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grd
  g.fillRect(0, 0, s, s)
  // star streaks
  g.globalCompositeOperation = 'lighter'
  g.strokeStyle = 'rgba(255,255,255,0.5)'
  g.lineWidth = 3
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI
    g.beginPath()
    g.moveTo(s / 2 - Math.cos(a) * s * 0.48, s / 2 - Math.sin(a) * s * 0.48)
    g.lineTo(s / 2 + Math.cos(a) * s * 0.48, s / 2 + Math.sin(a) * s * 0.48)
    g.stroke()
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}
