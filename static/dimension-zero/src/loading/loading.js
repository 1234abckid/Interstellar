// Cinematic loading scene: a fractured triangular gateway suspended in a violet
// void, wrapped by an orbital ring and surrounded by three layers of weightless
// stone that drift, orbit and tumble independently. Dimensional anomalies
// (a folding structure, a fracture in space, ripples through debris, shards on
// impossible curved paths, a breathing portal) keep the scene alive.
// Progress reflects the real build tasks of the game.
import * as THREE from 'three'
import { rockGeo, islandGeo, boxGeo } from '../world/geometry.js'
import { genRock, genVeins } from '../core/textures.js'
import { rng, wobble, TAU, smooth, clamp } from '../core/utils.js'

const _m = new THREE.Matrix4(),
  _q = new THREE.Quaternion(),
  _q2 = new THREE.Quaternion(),
  _p = new THREE.Vector3(),
  _s = new THREE.Vector3(),
  _ax = new THREE.Vector3()

export class LoadingScene {
  constructor(R, uiRoot) {
    this.R = R
    this.ui = uiRoot
    this.time = 0
    this.progress = 0
    this.shown = 0
    this.disposables = []
    this.done = false
    this.exitT = -1
    const scene = (this.scene = new THREE.Scene())
    scene.fog = new THREE.FogExp2(0x0a0516, 0.012)
    this.camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 400)
    this.buildUI()
    this.build()
    this.resize()
    this._onResize = () => this.resize()
    window.addEventListener('resize', this._onResize)
  }

  track(o) {
    this.disposables.push(o)
    return o
  }

  // ------------------------------------------------------------------ UI
  buildUI() {
    this.ui.innerHTML = `
      <div class="ld-logo"><img src="assets/logo.webp" alt="DIMENSION ZERO" draggable="false"/></div>
      <div class="ld-bottom">
        <div class="ld-status"><span id="ld-text">Initialising</span><span id="ld-pct">0%</span></div>
        <div class="ld-bar"><div id="ld-fill"></div><div class="ld-glint"></div></div>
        <button id="ld-enter" class="ld-enter" disabled><span class="ld-enter-k">CLICK</span> TO ENTER THE FRACTURE</button>
        <div class="ld-tip" id="ld-tip">Q shifts reality · each dimension changes the rules of combat</div>
      </div>`
    this.el = {
      text: this.ui.querySelector('#ld-text'),
      pct: this.ui.querySelector('#ld-pct'),
      fill: this.ui.querySelector('#ld-fill'),
      enter: this.ui.querySelector('#ld-enter'),
      tip: this.ui.querySelector('#ld-tip'),
    }
    this.tips = [
      'Q shifts reality · each dimension changes the rules of combat',
      'Void Wardens are shielded in the Material world — break them in the Fracture',
      'The Phase Cannon fires through violet barriers and strips shields',
      'In the Inverted world, a bridge assembles to the eastern perch',
      'Shoot amber canisters · the Singularity drags debris into its well',
      'Fracture stability drains — shift out before it collapses',
    ]
    this.tipI = 0
  }

  setProgress(p, label) {
    this.progress = clamp(p, 0, 1)
    if (label) this.el.text.textContent = label
  }

  ready(onEnter) {
    this.progress = this.shown = 1
    this.el.text.textContent = 'Reality anchored'
    this.el.enter.disabled = false
    this.ui.classList.add('ready')
    const go = () => {
      if (this.exitT >= 0) return
      this.exitT = 0
      this.ui.classList.add('exit')
      onEnter()
    }
    this._click = () => go()
    this.ui.addEventListener('click', this._click)
    this._key = (e) => {
      if (e.code === 'Enter' || e.code === 'Space') go()
    }
    window.addEventListener('keydown', this._key)
  }

  // ------------------------------------------------------------------ build
  build() {
    const scene = this.scene
    const R = rng(77)
    // materials
    const rockT = genRock(256, 141, [0.46, 0.44, 0.52])
    const veins = genVeins(128, 151)
    for (const t of [rockT.map, rockT.normalMap, rockT.roughnessMap, veins]) this.track(t)
    this.stone = this.track(
      new THREE.MeshStandardMaterial({
        map: rockT.map,
        normalMap: rockT.normalMap,
        roughnessMap: rockT.roughnessMap,
        color: 0xb4b0c4,
        roughness: 1,
        metalness: 0.08,
        flatShading: true,
      })
    )
    this.stoneVein = this.track(
      new THREE.MeshStandardMaterial({
        map: rockT.map,
        normalMap: rockT.normalMap,
        roughnessMap: rockT.roughnessMap,
        color: 0x7a7090,
        roughness: 1,
        metalness: 0.1,
        emissiveMap: veins,
        emissive: new THREE.Color(0.9, 0.3, 2.2),
        emissiveIntensity: 1.3,
        flatShading: true,
      })
    )
    const chrome = this.track(new THREE.MeshStandardMaterial({ color: 0x8a8ea0, metalness: 1, roughness: 0.22 }))
    const darkFrame = this.track(
      new THREE.MeshStandardMaterial({
        color: 0x1a1824,
        metalness: 0.85,
        roughness: 0.35,
        map: rockT.map,
        normalMap: rockT.normalMap,
      })
    )
    const glowV = this.track(new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.55, 3.4) }))
    const glowB = this.track(new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 1.2, 3.4) }))

    // env map for chrome reflections (tiny gradient scene)
    {
      const pm = new THREE.PMREMGenerator(this.R.renderer)
      const es = new THREE.Scene()
      es.background = new THREE.Color(0x150a2a)
      const l1 = new THREE.Mesh(
        new THREE.SphereGeometry(1, 8, 8),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 2, 7) })
      )
      l1.position.set(0, 3, -6)
      l1.scale.set(6, 2, 1)
      es.add(l1)
      const l2 = new THREE.Mesh(
        new THREE.SphereGeometry(1, 8, 8),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 2.5, 5) })
      )
      l2.position.set(-6, 2, 4)
      es.add(l2)
      const rt = pm.fromScene(es, 0.04)
      scene.environment = rt.texture
      this.track(rt)
      pm.dispose()
    }

    // lighting
    const key = new THREE.DirectionalLight(0xdcd6ff, 2.4)
    key.position.set(-6, 8, 7)
    scene.add(key)
    const rim = new THREE.PointLight(0x9a50ff, 90, 40, 1.5)
    rim.position.set(0, 1, -5)
    scene.add(rim)
    this.rim = rim
    const fill = new THREE.PointLight(0x4a8cff, 30, 40, 1.6)
    fill.position.set(6, -3, 6)
    scene.add(fill)
    scene.add(new THREE.HemisphereLight(0x3a2a70, 0x05030a, 0.6))

    // void backdrop
    const sky = new THREE.Mesh(
      this.track(new THREE.SphereGeometry(300, 32, 16)),
      this.track(
        new THREE.ShaderMaterial({
          side: THREE.BackSide,
          depthWrite: false,
          fog: false,
          uniforms: { uTime: { value: 0 } },
          vertexShader: `varying vec3 vD; void main(){ vD = normalize(position); vec4 p = projectionMatrix*modelViewMatrix*vec4(position,1.0); gl_Position = p.xyww; }`,
          fragmentShader: `uniform float uTime; varying vec3 vD;
            float h(vec3 p){ p = fract(p*0.3183+0.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
            float n(vec3 x){ vec3 i=floor(x), f=fract(x); f=f*f*(3.0-2.0*f);
              return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z); }
            float fbm(vec3 p){ float s=0.0,a=0.5; for(int i=0;i<5;i++){ s+=a*n(p); p*=2.02; a*=0.5; } return s; }
            void main(){ vec3 d = normalize(vD);
              float neb = fbm(d*2.4 + vec3(uTime*0.004,0.0,0.0));
              float neb2 = fbm(d*5.0 - vec3(0.0,uTime*0.003,0.0));
              vec3 col = vec3(0.002,0.001,0.006);
              col += vec3(0.28,0.07,0.55) * pow(neb, 3.2) * 0.32;
              col += vec3(0.05,0.1,0.38) * pow(neb2, 3.5) * 0.3;
              // glow behind the gateway
              float c = pow(max(dot(d, vec3(0.0,0.05,-1.0)),0.0), 18.0);
              col += vec3(0.5,0.18,1.0) * c * 0.22;
              vec3 sp = floor(d*220.0);
              float st = step(0.9965, h(sp)) * (0.6+0.4*sin(uTime*1.5+h(sp+3.0)*30.0));
              col += vec3(0.8,0.85,1.0) * st * 0.6;
              gl_FragColor = vec4(col,1.0); }`,
        })
      )
    )
    sky.renderOrder = -10
    scene.add(sky)
    this.sky = sky

    // ---------------------------------------------------- triangular gateway
    const gate = new THREE.Group()
    gate.position.set(0, 0.5, -3)
    scene.add(gate)
    this.gate = gate
    const triPts = (r) =>
      [0, 1, 2].map(
        (i) => new THREE.Vector2(Math.cos(Math.PI / 2 + (i * TAU) / 3) * r, Math.sin(Math.PI / 2 + (i * TAU) / 3) * r)
      )
    {
      const outer = triPts(6.2),
        inner = triPts(5.0)
      const shape = new THREE.Shape(outer)
      shape.holes.push(new THREE.Path(inner.slice().reverse()))
      const fg = this.track(
        new THREE.ExtrudeGeometry(shape, {
          depth: 0.9,
          bevelEnabled: true,
          bevelThickness: 0.18,
          bevelSize: 0.16,
          bevelSegments: 2,
        })
      )
      fg.translate(0, 0, -0.45)
      const frame = new THREE.Mesh(fg, darkFrame)
      gate.add(frame)
      // chrome inner lip + glowing seam
      const lip = (r, mat, tube) => {
        const pts = triPts(r).map((v) => new THREE.Vector3(v.x, v.y, 0.62))
        const curve = new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.02)
        const m = new THREE.Mesh(this.track(new THREE.TubeGeometry(curve, 120, tube, 6, true)), mat)
        gate.add(m)
        return m
      }
      lip(5.05, chrome, 0.07)
      lip(5.18, glowV, 0.025)
      lip(6.12, glowB, 0.018)
      // portal surface
      const portalShape = new THREE.Shape(triPts(5.0))
      const pg = this.track(new THREE.ShapeGeometry(portalShape))
      this.portalMat = this.track(
        new THREE.ShaderMaterial({
          uniforms: { uTime: { value: 0 }, uFlash: { value: 0 } },
          vertexShader: `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
          fragmentShader: `uniform float uTime; uniform float uFlash; varying vec2 vP;
            float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
            float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
            float fbm(vec2 p){ float s=0.0,a=0.5; for(int i=0;i<6;i++){ s+=a*n(p); p=p*2.03+vec2(1.7,9.2); a*=0.5; } return s; }
            void main(){
              vec2 p = vP / 5.0;
              float r = length(p);
              // breathing, slowly reshaping vortex warp
              float ang = atan(p.y, p.x);
              float breathe = 0.5+0.5*sin(uTime*0.35);
              vec2 q = p + 0.18*vec2(sin(ang*3.0 + uTime*0.2), cos(ang*2.0 - uTime*0.17)) * r * (0.5+breathe);
              q = mat2(cos(r*2.0 - uTime*0.12), -sin(r*2.0 - uTime*0.12), sin(r*2.0 - uTime*0.12), cos(r*2.0 - uTime*0.12)) * q;
              // sky with clouds
              float cl = fbm(q*2.2 + vec2(uTime*0.03, 0.0));
              vec3 sky = mix(vec3(0.08,0.2,0.6), vec3(0.45,0.65,1.0), smoothstep(-0.6,0.8,q.y));
              sky = mix(sky, vec3(0.95,0.95,1.0), smoothstep(0.5,0.85,cl)*0.85);
              // violet energy veins
              float v = abs(fbm(q*3.0 - uTime*0.05)*2.0 - 1.0);
              float vein = smoothstep(0.06, 0.0, v);
              vec3 col = sky*0.9 + vec3(1.4,0.4,2.6)*vein*1.2;
              col = mix(col, vec3(0.7,0.25,1.4), smoothstep(0.35, 0.95, r)*0.65);
              // floating cube silhouettes inside the portal
              vec2 g = q*5.0 + vec2(0.0, uTime*0.08);
              vec2 gi = floor(g); vec2 gf = fract(g) - 0.5;
              float hc = h(gi);
              vec2 o = vec2(sin(uTime*0.4+hc*6.0), cos(uTime*0.3+hc*4.0))*0.15;
              float box = step(max(abs(gf.x+o.x), abs(gf.y+o.y)), 0.06 + hc*0.08) * step(0.82, hc);
              col = mix(col, vec3(0.03,0.02,0.06), box*0.85);
              col += vec3(2.0,1.6,3.0)*uFlash;
              gl_FragColor = vec4(col*0.62, 1.0);
            }`,
        })
      )
      const portal = new THREE.Mesh(pg, this.portalMat)
      portal.position.z = -0.1
      gate.add(portal)
      // broken frame fragments hovering off the corners
      this.frameFrags = []
      const corners = triPts(5.9)
      corners.forEach((c, i) => {
        for (let k = 0; k < 3; k++) {
          const m = new THREE.Mesh(
            this.track(rockGeo(9100 + i * 10 + k, 0.35 + R() * 0.35, { round: 0.02, cuts: 3 })),
            darkFrame
          )
          const base = new THREE.Vector3(
            c.x * (1.08 + k * 0.08) + R.range(-0.4, 0.4),
            c.y * (1.08 + k * 0.07) + R.range(-0.4, 0.4),
            R.range(-0.5, 0.8)
          )
          gate.add(m)
          this.frameFrags.push({
            m,
            base,
            seed: R() * 10,
            ax: new THREE.Vector3(R() - 0.5, R() - 0.5, R() - 0.5).normalize(),
          })
        }
      })
    }

    // ---------------------------------------------------- orbital ring
    {
      const ring = new THREE.Group()
      const core = new THREE.Mesh(this.track(new THREE.TorusGeometry(8.6, 0.09, 8, 220)), chrome)
      const glow = new THREE.Mesh(this.track(new THREE.TorusGeometry(8.6, 0.035, 6, 240)), glowV)
      glow.position.y = 0.06
      ring.add(core, glow)
      ring.scale.set(1, 0.3, 1)
      ring.rotation.set(1.35, 0.0, -0.2)
      ring.position.set(0.4, 0.2, -1.5)
      scene.add(ring)
      this.ring = ring
      // a bright comet streak travelling along the ring
      this.comet = new THREE.Mesh(this.track(new THREE.SphereGeometry(0.12, 12, 8)), glowB)
      ring.add(this.comet)
    }

    // ---------------------------------------------------- floating stones
    // layer 1: large foreground fragments framing the edges (strong parallax)
    this.big = []
    const bigDefs = [
      [-9.5, -3.6, 4.5, 1.6],
      [10.2, 3.8, 3.0, 1.3],
      [-11.5, 4.6, 1.0, 1.1],
      [9.8, -4.4, 5.0, 1.9],
      [-6.5, -6.2, 7.5, 1.0],
      [13.5, -0.8, -1.0, 1.2],
      [-14, 0.6, -2, 1.4],
    ]
    bigDefs.forEach(([x, y, z, s], i) => {
      const m = new THREE.Mesh(
        this.track(
          rockGeo(5000 + i, s, {
            round: 0.04,
            cuts: R.int(3, 5),
            sx: R.range(0.9, 1.2),
            sy: R.range(0.8, 1.1),
            sz: R.range(0.9, 1.2),
          })
        ),
        i % 3 === 0 ? this.stoneVein : this.stone
      )
      scene.add(m)
      this.big.push({
        m,
        c: new THREE.Vector3(x, y, z),
        r: R.range(0.3, 0.7),
        sp: R.range(0.04, 0.08) * R.sign(),
        seed: R() * 100,
        ax: new THREE.Vector3(R() - 0.5, R() - 0.5, R() - 0.5).normalize(),
        rs: R.range(0.04, 0.09) * R.sign(),
        q: new THREE.Quaternion().random(),
        mass: s,
      })
    })
    // layer 2: medium rocks in the middle distance, some orbiting invisible centres
    this.mid = []
    for (let i = 0; i < 30; i++) {
      let x, y, z
      do {
        x = R.range(-18, 18)
        y = R.range(-8, 9)
        z = R.range(-14, 2)
      } while (Math.abs(x) < 6.5 && Math.abs(y) < 4.5 && z > -9) // keep the logo/gate clear
      const s = R.range(0.3, 0.85)
      const m = new THREE.Mesh(
        this.track(rockGeo(6000 + i, s, { round: R.range(0.0, 0.12), cuts: R.int(2, 4) })),
        R() < 0.25 ? this.stoneVein : this.stone
      )
      scene.add(m)
      const orbit = R() < 0.35
      this.mid.push({
        m,
        c: new THREE.Vector3(x, y, z),
        orbit,
        r: orbit ? R.range(1.0, 2.5) : R.range(0.2, 0.5),
        sp: R.range(0.05, 0.16) * R.sign(),
        seed: R() * 100,
        ax: new THREE.Vector3(R() - 0.5, R() - 0.5, R() - 0.5).normalize(),
        rs: R.range(0.1, 0.35) * R.sign(),
        q: new THREE.Quaternion().random(),
        tumble: 0,
        off: new THREE.Vector3(),
      })
    }
    // layer 3: small instanced debris throughout (3 shape variants)
    this.small = []
    const smallGeos = [0, 1, 2].map((k) => this.track(rockGeo(7000 + k, 1, { round: 0.05, cuts: 3, seg: 2 })))
    this.smallMeshes = smallGeos.map((g, k) => {
      const im = new THREE.InstancedMesh(g, k === 1 ? this.stoneVein : this.stone, 110)
      im.frustumCulled = false
      scene.add(im)
      return im
    })
    for (let k = 0; k < 3; k++)
      for (let i = 0; i < 110; i++) {
        const z = R.range(-40, 6)
        const spreadX = 14 + (6 - z) * 0.45
        this.small.push({
          k,
          i,
          c: new THREE.Vector3(R.range(-spreadX, spreadX), R.range(-10, 10), z),
          s: R.range(0.05, 0.22) * (1 + Math.max(0, -z) * 0.02),
          sp: R.range(0.05, 0.25),
          seed: R() * 100,
          ax: new THREE.Vector3(R() - 0.5, R() - 0.5, R() - 0.5).normalize(),
          rs: R.range(0.2, 0.9) * R.sign(),
          off: new THREE.Vector3(),
        })
      }
    // shards on impossible curved trajectories (lemniscates / helices)
    this.shards = []
    for (let i = 0; i < 12; i++) {
      const m = new THREE.Mesh(
        this.track(rockGeo(7500 + i, R.range(0.08, 0.16), { round: 0, cuts: 4, seg: 1 })),
        this.stoneVein
      )
      scene.add(m)
      this.shards.push({
        m,
        c: new THREE.Vector3(R.range(-10, 10), R.range(-5, 5), R.range(-10, -2)),
        a: R.range(1.5, 3.5),
        b: R.range(0.8, 2),
        sp: R.range(0.15, 0.3),
        seed: R() * 10,
        type: i % 2,
      })
    }
    // dust
    {
      const N = 900
      const pos = new Float32Array(N * 3)
      const seeds = new Float32Array(N)
      for (let i = 0; i < N; i++) {
        pos[i * 3] = R.range(-25, 25)
        pos[i * 3 + 1] = R.range(-12, 12)
        pos[i * 3 + 2] = R.range(-30, 8)
        seeds[i] = R() * 100
      }
      const g = this.track(new THREE.BufferGeometry())
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
      g.setAttribute('seed', new THREE.BufferAttribute(seeds, 1))
      this.dustMat = this.track(
        new THREE.ShaderMaterial({
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          uniforms: { uTime: { value: 0 }, uScale: { value: 300 } },
          vertexShader: `attribute float seed; uniform float uTime; uniform float uScale; varying float vA;
            void main(){ vec3 p = position; p.x += sin(uTime*0.07+seed)*0.8; p.y += sin(uTime*0.05+seed*1.7)*0.6 + mod(uTime*0.05*fract(seed)+seed, 1.0)*0.4;
              vec4 mv = modelViewMatrix*vec4(p,1.0); gl_PointSize = (0.6+fract(seed*3.1)*1.4) * uScale / -mv.z;
              vA = (0.25+0.75*fract(seed*7.3)) * smoothstep(60.0, 5.0, -mv.z) * smoothstep(0.5, 3.0, -mv.z); gl_Position = projectionMatrix*mv; }`,
          fragmentShader: `varying float vA; void main(){ vec2 c = gl_PointCoord-0.5; float d = dot(c,c); if(d>0.25) discard; gl_FragColor = vec4(vec3(0.75,0.6,1.0)*vA*(1.0-d*4.0)*0.5, 1.0); }`,
        })
      )
      const pts = new THREE.Points(g, this.dustMat)
      pts.frustumCulled = false
      scene.add(pts)
    }

    // ---------------------------------------------------- distant world
    {
      const far = new THREE.Group()
      const silMat = this.track(
        new THREE.MeshStandardMaterial({
          color: 0x2a2242,
          roughness: 0.9,
          metalness: 0.1,
          fog: false,
          transparent: true,
          opacity: 0.6,
          emissive: new THREE.Color(0.02, 0.01, 0.05),
        })
      )
      ;[
        [-70, -14, -150, 7],
        [78, 16, -170, 9],
        [-30, 30, -200, 10],
      ].forEach(([x, y, z, r], i) => {
        const g = new THREE.Group()
        g.add(new THREE.Mesh(this.track(islandGeo(300 + i, r, r * 1.5, 0)), silMat))
        const rr = rng(400 + i)
        for (let t = 0; t < 3; t++) {
          const h = rr.range(6, 22),
            w = rr.range(2, 4)
          const tw = new THREE.Mesh(this.track(boxGeo(w, h, w)), silMat)
          tw.position.set(rr.range(-r * 0.4, r * 0.4), h / 2, rr.range(-r * 0.4, r * 0.4))
          g.add(tw)
          if (rr() < 0.6) {
            const cap = new THREE.Mesh(this.track(boxGeo(w * 1.1, 0.4, w * 1.1)), glowV)
            cap.position.set(tw.position.x, h + 0.2, tw.position.z)
            g.add(cap)
          }
        }
        g.position.set(x, y, z)
        g.rotation.y = rr() * TAU
        far.add(g)
      })
      scene.add(far)
      this.far = far
      // folding structure (anomaly): 27 blocks that unfold into a ring and back
      const fold = new THREE.InstancedMesh(this.track(boxGeo(1.6, 1.6, 1.6)), darkFrame, 27)
      fold.position.set(34, 12, -70)
      fold.frustumCulled = false
      scene.add(fold)
      this.fold = fold
      this.foldA = []
      this.foldB = []
      for (let i = 0; i < 27; i++) {
        const x = (i % 3) - 1,
          y = (Math.floor(i / 3) % 3) - 1,
          z = Math.floor(i / 9) - 1
        this.foldA.push(new THREE.Vector3(x * 1.7, y * 1.7, z * 1.7))
        const a = (i / 27) * TAU
        this.foldB.push(new THREE.Vector3(Math.cos(a) * 9, Math.sin(a * 2) * 2, Math.sin(a) * 9))
      }
    }
    // fracture in space (anomaly): a jagged glowing crack with flicker
    {
      const pts = []
      let x = -24,
        y = 10
      const rr = rng(808)
      for (let i = 0; i < 18; i++) {
        pts.push(new THREE.Vector3(x, y, -45))
        x += rr.range(1.2, 2.6)
        y += rr.range(-1.6, 1.0)
      }
      const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.0)
      this.crackMat = this.track(
        new THREE.MeshBasicMaterial({
          color: new THREE.Color(2.2, 0.9, 3.4),
          transparent: true,
          opacity: 0.8,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          fog: false,
        })
      )
      const crack = new THREE.Mesh(this.track(new THREE.TubeGeometry(curve, 160, 0.06, 4, false)), this.crackMat)
      scene.add(crack)
      const crackGlow = new THREE.Mesh(
        this.track(new THREE.TubeGeometry(curve, 80, 0.35, 6, false)),
        this.track(
          new THREE.MeshBasicMaterial({
            color: new THREE.Color(0.35, 0.12, 0.7),
            transparent: true,
            opacity: 0.35,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            fog: false,
          })
        )
      )
      scene.add(crackGlow)
      this.crack = crack
      this.crackPts = pts
    }
    // ripple bookkeeping
    this.ripple = { t: -10, origin: new THREE.Vector3(), next: 4 + R() * 3 }
    this.R2 = R
  }

  // ------------------------------------------------------------------ frame
  update(dt) {
    this.time += dt
    const t = this.time
    // camera: slow dolly in with gentle drift; exit = rush into the gateway
    const exitK = this.exitT >= 0 ? smooth(Math.min(1, this.exitT / 1.1)) : 0
    if (this.exitT >= 0) this.exitT += dt
    const dolly = 18 - Math.min(t, 40) * 0.06
    this.camera.position.set(
      Math.sin(t * 0.07) * 0.9,
      0.6 + Math.sin(t * 0.09 + 1) * 0.45,
      dolly - exitK * (dolly + 1.5)
    )
    this.camera.lookAt(Math.sin(t * 0.05) * 0.3, 0.55, -3)
    this.camera.rotation.z += Math.sin(t * 0.06) * 0.012
    if (this.exitK !== exitK) {
      this.camera.fov = this.baseFov + exitK * 35
      this.camera.updateProjectionMatrix()
      this.exitK = exitK
    }
    this.portalMat.uniforms.uTime.value = t
    this.portalMat.uniforms.uFlash.value = exitK * exitK
    this.sky.material.uniforms.uTime.value = t
    this.dustMat.uniforms.uTime.value = t
    this.dustMat.uniforms.uScale.value = this.R.renderer.domElement.height * 0.012
    this.rim.intensity = 80 + Math.sin(t * 1.3) * 12 + wobble(t * 2, 3) * 8 + exitK * 300

    // gateway drift + fragments
    this.gate.rotation.set(Math.sin(t * 0.11) * 0.04, Math.sin(t * 0.08) * 0.07, Math.sin(t * 0.05) * 0.02)
    this.gate.position.y = 0.5 + Math.sin(t * 0.3) * 0.12
    for (const f of this.frameFrags) {
      f.m.position.set(
        f.base.x + Math.sin(t * 0.4 + f.seed) * 0.15,
        f.base.y + Math.sin(t * 0.33 + f.seed * 2) * 0.18,
        f.base.z + Math.sin(t * 0.27 + f.seed) * 0.12
      )
      f.m.quaternion.setFromAxisAngle(f.ax, t * 0.2 + f.seed)
    }
    // ring + comet
    this.ring.rotation.z = -0.2 + Math.sin(t * 0.05) * 0.04
    const ca = t * 0.35
    this.comet.position.set(Math.cos(ca) * 8.6, Math.sin(ca) * 8.6, 0)

    // ripple through the debris (every few seconds, from a random point)
    const rp = this.ripple
    if (t > rp.next) {
      rp.t = t
      rp.next = t + 6 + this.R2() * 4
      rp.origin.set(this.R2.range(-12, 12), this.R2.range(-5, 5), this.R2.range(-15, -3))
    }
    const rr = (t - rp.t) * 9 // wavefront radius
    const rippleOn = t - rp.t < 4
    const rippleOff = (pos, out, amp) => {
      out.set(0, 0, 0)
      if (!rippleOn) return out
      const dx = pos.x - rp.origin.x,
        dy = pos.y - rp.origin.y,
        dz = pos.z - rp.origin.z
      const d = Math.hypot(dx, dy, dz) || 1
      const k = Math.exp(-Math.pow(d - rr, 2) * 0.35) * amp * Math.max(0, 1 - (t - rp.t) / 4)
      return out.set((dx / d) * k, (dy / d) * k, (dz / d) * k)
    }

    // layer 1 — heavy, slow
    for (const b of this.big) {
      const a = t * b.sp + b.seed
      b.m.position.set(
        b.c.x + Math.cos(a) * b.r + wobble(t * 0.2, b.seed) * 0.15,
        b.c.y + Math.sin(t * 0.21 + b.seed) * 0.35 + wobble(t * 0.15, b.seed + 2) * 0.2,
        b.c.z + Math.sin(a) * b.r * 0.6
      )
      _ax.copy(b.ax)
      _q2.setFromAxisAngle(_ax, b.rs * dt * (1 + 0.5 * wobble(t * 0.1, b.seed)))
      b.q.premultiply(_q2)
      b.m.quaternion.copy(b.q)
    }
    // layer 2 — medium; orbiters circle invisible centres; occasional tumbles
    for (const m of this.mid) {
      const a = t * m.sp + m.seed
      let x, y, z
      if (m.orbit) {
        x = m.c.x + Math.cos(a) * m.r
        y = m.c.y + Math.sin(a * 0.7) * m.r * 0.35
        z = m.c.z + Math.sin(a) * m.r
      } else {
        x = m.c.x + wobble(t * 0.25, m.seed) * m.r * 2
        y = m.c.y + Math.sin(t * 0.3 + m.seed) * 0.4
        z = m.c.z + wobble(t * 0.2, m.seed + 5) * m.r
      }
      _p.set(x, y, z)
      rippleOff(_p, m.off, 0.9)
      m.m.position.copy(_p).add(m.off)
      // tumble bursts: angular speed spikes briefly at random moments
      const tum = Math.max(0, Math.sin(t * 0.13 + m.seed * 3) - 0.92) * 25
      _q2.setFromAxisAngle(m.ax, m.rs * dt * (1 + tum) + m.off.length() * dt * 2)
      m.q.premultiply(_q2)
      m.m.quaternion.copy(m.q)
    }
    // layer 3 — small debris, freer motion
    for (const s of this.small) {
      _p.set(
        s.c.x + wobble(t * s.sp, s.seed) * 0.8,
        s.c.y + Math.sin(t * s.sp * 1.3 + s.seed) * 0.6 + wobble(t * 0.1, s.seed + 9) * 0.3,
        s.c.z + wobble(t * s.sp * 0.7, s.seed + 4) * 0.5
      )
      rippleOff(_p, s.off, 1.2)
      _p.add(s.off)
      _q.setFromAxisAngle(s.ax, t * s.rs + s.seed)
      _m.compose(_p, _q, _s.setScalar(s.s))
      this.smallMeshes[s.k].setMatrixAt(s.i, _m)
    }
    for (const im of this.smallMeshes) im.instanceMatrix.needsUpdate = true
    // impossible trajectories
    for (const s of this.shards) {
      const u = t * s.sp + s.seed
      if (s.type === 0) {
        // lemniscate
        const d = 1 + Math.sin(u) * Math.sin(u)
        s.m.position.set(
          s.c.x + (s.a * Math.cos(u)) / d,
          s.c.y + (s.a * Math.sin(u) * Math.cos(u)) / d,
          s.c.z + Math.sin(u * 2) * s.b
        )
      } else {
        // helix that loops back on itself
        s.m.position.set(s.c.x + Math.cos(u * 2) * s.b, s.c.y + Math.sin(u) * s.a, s.c.z + Math.sin(u * 2) * s.b)
      }
      s.m.rotation.set(u * 2, u * 3, u)
    }
    // folding structure: hold, unfold, hold, refold (slow)
    const cyc = (t * 0.08) % 1
    const k =
      cyc < 0.35 ? 0 : cyc < 0.5 ? smooth((cyc - 0.35) / 0.15) : cyc < 0.85 ? 1 : 1 - smooth((cyc - 0.85) / 0.15)
    for (let i = 0; i < 27; i++) {
      const d = clamp(k * 1.6 - (i / 27) * 0.6, 0, 1)
      _p.lerpVectors(this.foldA[i], this.foldB[i], smooth(d))
      _q.setFromAxisAngle(_ax.set(0, 1, 0), d * Math.PI * 0.5 + t * 0.05)
      _m.compose(_p, _q, _s.setScalar(1))
      this.fold.setMatrixAt(i, _m)
    }
    this.fold.instanceMatrix.needsUpdate = true
    this.fold.rotation.y = t * 0.03
    // fracture crack flicker
    this.crackMat.opacity = 0.55 + Math.sin(t * 7) * 0.1 + (Math.sin(t * 0.9) > 0.96 ? 0.4 : 0)
    this.crack.position.x = Math.sin(t * 23) * (Math.sin(t * 0.9) > 0.96 ? 0.15 : 0)

    // UI progress (eased so it never jumps backwards)
    this.shown += (this.progress - this.shown) * Math.min(1, dt * 6)
    const pct = Math.floor(this.shown * 100 + 0.001)
    if (pct !== this._pct) {
      this._pct = pct
      this.el.pct.textContent = pct + '%'
      this.el.fill.style.width = (this.shown * 100).toFixed(1) + '%'
    }
    if (Math.floor(t / 5) !== this._tipT) {
      this._tipT = Math.floor(t / 5)
      this.el.tip.textContent = this.tips[this._tipT % this.tips.length]
    }
  }

  resize() {
    const w = window.innerWidth,
      h = window.innerHeight
    this.camera.aspect = w / h
    // keep the gateway framed in portrait windows
    this.baseFov = w / h < 1 ? 62 : w / h < 1.4 ? 50 : 42
    this.camera.fov = this.baseFov
    this.camera.updateProjectionMatrix()
  }

  dispose() {
    window.removeEventListener('resize', this._onResize)
    if (this._key) window.removeEventListener('keydown', this._key)
    if (this._click) this.ui.removeEventListener('click', this._click)
    this.scene.traverse((o) => {
      if (o.isMesh || o.isPoints || o.isInstancedMesh) {
        o.geometry?.dispose()
      }
    })
    for (const d of this.disposables) d.dispose?.()
    this.scene.environment = null
    this.scene.clear()
    this.ui.remove()
    this.done = true
  }
}
