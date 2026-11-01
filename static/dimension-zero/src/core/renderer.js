// Renderer + post chain shared by the loading scene, the title/cinematics, the
// game and the operator showcase:
//   scene -> GTAO contact shadows (half-res) -> god rays -> viewmodel ->
//   depth of field (cinematics only) -> bloom -> final grade (vignette,
//   film grain, letterbox, dimension-shift aberration/ripple, singularity
//   lensing, damage tint, fades) -> output (Khronos PBR Neutral tone mapping + sRGB).
import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js'
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js'

// Ambient occlusion that ignores transparent effects, sprites and shader-driven
// backdrops (sky, portals, beams) so only solid geometry darkens corners.
class GameAOPass extends GTAOPass {
  setSize(w, h) {
    super.setSize(Math.max(1, Math.ceil(w * 0.5)), Math.max(1, Math.ceil(h * 0.5)))
  }
  _overrideVisibility() {
    const cache = this._visibilityCache
    this.scene.traverse((o) => {
      if (!o.visible) return
      const m = o.material
      if (o.isPoints || o.isLine || o.isSprite || (m && (m.transparent || m.isShaderMaterial || m.userData.noAO))) {
        o.visible = false
        cache.push(o)
      }
    })
  }
}

const GodRayShader = {
  uniforms: {
    tDiffuse: { value: null },
    uSun: { value: new THREE.Vector2(0.5, 0.8) },
    uInt: { value: 0 },
    uTint: { value: new THREE.Color(1, 0.92, 0.8) },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform vec2 uSun; uniform float uInt; uniform vec3 uTint; varying vec2 vUv;
    void main(){
      vec3 base = texture2D(tDiffuse, vUv).rgb;
      if (uInt < 0.002) { gl_FragColor = vec4(base, 1.0); return; }
      // radial blur of the brightest pixels toward the sun: crepuscular rays
      vec2 d = (vUv - uSun) * (0.85 / 32.0);
      vec2 uv = vUv; float decay = 1.0; vec3 acc = vec3(0.0);
      float jitter = fract(sin(dot(vUv, vec2(12.9898,78.233)))*43758.5453);
      uv -= d * jitter;
      for (int i = 0; i < 32; i++) {
        uv -= d;
        vec3 s = texture2D(tDiffuse, clamp(uv, 0.001, 0.999)).rgb;
        float l = max(dot(s, vec3(0.3, 0.55, 0.15)) - 0.9, 0.0);
        acc += min(s * l, vec3(4.0)) * decay;
        decay *= 0.93;
      }
      gl_FragColor = vec4(base + acc * uTint * uInt * 0.045, 1.0);
    }`,
}

const FinalShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uVig: { value: 0.3 },
    uDamage: { value: 0 },
    uAberr: { value: 0 },
    uRipple: { value: 0 },
    uDimW: { value: new THREE.Vector3(1, 0, 0) },
    uWells: { value: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()] },
    uFade: { value: 0 },
    uFadeColor: { value: new THREE.Color(0, 0, 0) },
    uAspect: { value: 1 },
    uGlitch: { value: 0 },
    uGrain: { value: 0.035 },
    uBars: { value: 0 },
    uContrast: { value: 1.13 },
    uSat: { value: 1.16 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uVig; uniform float uDamage; uniform float uAberr;
    uniform float uRipple; uniform vec3 uDimW; uniform vec3 uWells[3]; uniform float uFade; uniform vec3 uFadeColor; uniform float uAspect; uniform float uGlitch;
    uniform float uGrain; uniform float uBars; uniform float uContrast; uniform float uSat;
    varying vec2 vUv;
    float h(float n){ return fract(sin(n)*43758.5453); }
    float h2(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)))*43758.5453); }
    void main(){
      vec2 uv = vUv;
      for (int i=0;i<3;i++){
        vec3 w = uWells[i];
        if (w.z > 0.0) {
          vec2 d = uv - w.xy; d.x *= uAspect;
          float r = length(d);
          float k = w.z * 0.035 / (r*r*40.0 + 0.4);
          vec2 dir = d / max(r, 1e-4); dir.x /= uAspect;
          uv -= dir * k * smoothstep(0.35, 0.0, r);
        }
      }
      vec2 c = uv - 0.5; c.x *= uAspect;
      float rr = length(c);
      if (uRipple > 0.0) {
        float wave = sin(rr*40.0 - uTime*30.0) * exp(-abs(rr - (1.0-uRipple)*1.2)*8.0);
        uv += normalize(c+1e-5) * wave * 0.006 * uRipple;
      }
      if (uGlitch > 0.0) {
        float band = floor(uv.y*28.0 + floor(uTime*12.0));
        if (h(band) > 0.92) uv.x += (h(band+1.3)-0.5)*0.03*uGlitch;
      }
      // subtle lens chromatic aberration toward the edges, stronger on shifts
      float ab = uAberr*0.006 + uDamage*0.002 + rr*rr*0.0025;
      vec2 off = (uv-0.5) * ab;
      vec3 col;
      col.r = texture2D(tDiffuse, uv + off).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - off).b;
      col *= uDimW.x*vec3(1.0) + uDimW.y*vec3(1.04, 0.97, 1.06) + uDimW.z*vec3(1.02, 0.94, 1.1);
      // filmic grade in linear light: gentle contrast around mid-grey + saturation
      float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(lum), col, uSat);
      col = 0.18 * pow(max(col / 0.18, vec3(0.0)), vec3(uContrast));
      float v = smoothstep(0.9, 0.25, rr);
      col *= mix(1.0 - uVig, 1.0, v);
      col = mix(col, col*vec3(1.4,0.35,0.35) + vec3(0.12,0.0,0.0), uDamage*(1.0-v)*0.9);
      // film grain (luminance-weighted so shadows stay clean)
      float g = h2(vUv * vec2(1920.0, 1080.0) + fract(uTime * 61.0) * 100.0) - 0.5;
      col += col * g * uGrain * 2.0 + g * uGrain * 0.01;
      col = mix(col, uFadeColor, uFade);
      // cinematic letterbox
      float bar = uBars * 0.115;
      if (vUv.y < bar || vUv.y > 1.0 - bar) col = vec3(0.0);
      gl_FragColor = vec4(col, 1.0);
    }`,
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas
    const r = (this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'high-performance',
      stencil: false,
    }))
    r.outputColorSpace = THREE.SRGBColorSpace
    r.toneMapping = THREE.NeutralToneMapping
    r.toneMappingExposure = 1
    r.shadowMap.enabled = true
    r.shadowMap.type = THREE.PCFSoftShadowMap
    this.quality = 'high'
    this.composer = new EffectComposer(r, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }))
    const dummyScene = new THREE.Scene(),
      dummyCam = new THREE.PerspectiveCamera()
    this.mainPass = new RenderPass(dummyScene, dummyCam)
    this.ao = new GameAOPass(dummyScene, dummyCam, 512, 512)
    this.ao.updateGtaoMaterial({
      radius: 0.9,
      distanceExponent: 1.5,
      thickness: 1.6,
      scale: 1.15,
      samples: 12,
      distanceFallOff: 1,
    })
    this.ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 })
    this.ao.blendIntensity = 1.0
    this.ao.enabled = false
    this.rays = new ShaderPass(GodRayShader)
    this.vmPass = new RenderPass(dummyScene, dummyCam)
    this.vmPass.clear = false
    this.vmPass.clearDepth = true
    this.vmPass.enabled = false
    this.dof = new BokehPass(dummyScene, dummyCam, { focus: 20, aperture: 0.0012, maxblur: 0.006 })
    this.dof.enabled = false
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.5, 0.5, 0.95)
    this.final = new ShaderPass(FinalShader)
    this.output = new OutputPass()
    for (const p of [this.mainPass, this.ao, this.rays, this.vmPass, this.dof, this.bloom, this.final, this.output])
      this.composer.addPass(p)
    this.U = this.final.uniforms
    this.R = this.rays.uniforms
    this.wantAO = true
    this.resize()
  }

  // opts.ao: enable contact shadows for this view; opts.dof: depth of field
  setView(scene, camera, vmScene = null, vmCamera = null, opts = {}) {
    this.mainPass.scene = scene
    this.mainPass.camera = camera
    this.ao.scene = scene
    this.ao.camera = camera
    this.ao.enabled = !!opts.ao && this.wantAO && this.quality === 'high'
    this.dof.scene = scene
    this.dof.camera = camera
    this.dof.enabled = !!opts.dof && this.quality !== 'low'
    this.rays.enabled = !!opts.rays && this.quality !== 'low'
    if (vmScene) {
      this.vmPass.scene = vmScene
      this.vmPass.camera = vmCamera
      this.vmPass.enabled = true
    } else this.vmPass.enabled = false
  }

  setQuality(q) {
    this.quality = q
    this.resize()
  }

  resize() {
    const w = window.innerWidth,
      h = window.innerHeight
    const dpr = window.devicePixelRatio || 1
    const cap = { low: 0.75, medium: 1.0, high: 1.5 }[this.quality] ?? 1
    const pr = Math.min(dpr, cap)
    this.renderer.setPixelRatio(pr)
    this.renderer.setSize(w, h, false)
    this.composer.setPixelRatio(pr)
    this.composer.setSize(w, h)
    this.bloom.enabled = this.quality !== 'low'
    this.U.uAspect.value = w / h
    this.width = w
    this.height = h
  }

  render() {
    this.composer.render()
  }
}
