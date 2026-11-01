// Renderer + post chain shared by the loading scene, the game and the
// operator showcase: scene pass -> viewmodel pass -> bloom -> final grade
// (vignette, dimension-shift aberration/ripple, singularity lensing,
// damage tint, fades) -> output (tone mapping + sRGB).
import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'

const FinalShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uVig: { value: 0.32 },
    uDamage: { value: 0 },
    uAberr: { value: 0 },
    uRipple: { value: 0 },
    uDimW: { value: new THREE.Vector3(1, 0, 0) },
    uWells: { value: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()] },
    uFade: { value: 0 },
    uAspect: { value: 1 },
    uGlitch: { value: 0 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uVig; uniform float uDamage; uniform float uAberr;
    uniform float uRipple; uniform vec3 uDimW; uniform vec3 uWells[3]; uniform float uFade; uniform float uAspect; uniform float uGlitch;
    varying vec2 vUv;
    float h(float n){ return fract(sin(n)*43758.5453); }
    void main(){
      vec2 uv = vUv;
      // singularity lensing
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
      // dimension-shift ripple (radial wave from centre)
      vec2 c = uv - 0.5; c.x *= uAspect;
      float rr = length(c);
      if (uRipple > 0.0) {
        float wave = sin(rr*40.0 - uTime*30.0) * exp(-abs(rr - (1.0-uRipple)*1.2)*8.0);
        uv += normalize(c+1e-5) * wave * 0.006 * uRipple;
      }
      // fracture glitch slices
      if (uGlitch > 0.0) {
        float band = floor(uv.y*28.0 + floor(uTime*12.0));
        if (h(band) > 0.92) uv.x += (h(band+1.3)-0.5)*0.03*uGlitch;
      }
      float ab = uAberr*0.006 + uDamage*0.002;
      vec2 off = (uv-0.5) * ab;
      vec3 col;
      col.r = texture2D(tDiffuse, uv + off).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - off).b;
      // subtle per-dimension grade
      vec3 gradeB = vec3(1.04, 0.97, 1.06);
      vec3 gradeC = vec3(1.02, 0.94, 1.1);
      col *= uDimW.x*vec3(1.0) + uDimW.y*gradeB + uDimW.z*gradeC;
      // vignette
      float v = smoothstep(0.85, 0.25, rr);
      col *= mix(1.0 - uVig, 1.0, v);
      // damage tint at edges
      col = mix(col, col*vec3(1.4,0.35,0.35) + vec3(0.12,0.0,0.0), uDamage*(1.0-v)*0.9);
      col *= 1.0 - uFade;
      gl_FragColor = vec4(col, 1.0);
    }`,
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas
    const r = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false }))
    r.outputColorSpace = THREE.SRGBColorSpace
    r.toneMapping = THREE.ACESFilmicToneMapping
    r.toneMappingExposure = 1
    r.shadowMap.enabled = true
    r.shadowMap.type = THREE.PCFSoftShadowMap
    this.quality = 'high'
    this.composer = new EffectComposer(r, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }))
    this.mainPass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera())
    this.vmPass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera())
    this.vmPass.clear = false
    this.vmPass.clearDepth = true
    this.vmPass.enabled = false
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.45, 0.92)
    this.final = new ShaderPass(FinalShader)
    this.output = new OutputPass()
    this.composer.addPass(this.mainPass)
    this.composer.addPass(this.vmPass)
    this.composer.addPass(this.bloom)
    this.composer.addPass(this.final)
    this.composer.addPass(this.output)
    this.U = this.final.uniforms
    this.resize()
  }

  setView(scene, camera, vmScene = null, vmCamera = null) {
    this.mainPass.scene = scene
    this.mainPass.camera = camera
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
