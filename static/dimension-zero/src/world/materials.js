// Material library + global "dimension" shader uniforms shared by every
// enhanced material. Materials get three extra behaviours via onBeforeCompile:
//  - a luminous wavefront when the player shifts dimension
//  - optional per-dimension dissolve (geometry that exists only in some realities)
//  - optional "fracture" slicing, where geometry splits into drifting layers
import * as THREE from 'three'

export const G = {
  uTime: { value: 0 },
  uDimW: { value: new THREE.Vector3(1, 0, 0) }, // blend weights for Material/Inverted/Fracture
  uWaveOrigin: { value: new THREE.Vector3() },
  uWaveRadius: { value: 1e5 },
  uWaveColor: { value: new THREE.Color(0.55, 0.35, 1.6) },
  uSunDir: { value: new THREE.Vector3(0.45, 0.62, -0.35).normalize() },
  uSunColor: { value: new THREE.Color(1, 0.9, 0.75) },
  uFogHeight: { value: 0.07 }, // height falloff of the ground mist
}

const NOISE_GLSL = /* glsl */ `
float dzHash(vec3 p){ p = fract(p*0.3183099+0.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float dzNoise(vec3 x){ vec3 i=floor(x); vec3 f=fract(x); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(dzHash(i),dzHash(i+vec3(1,0,0)),f.x),mix(dzHash(i+vec3(0,1,0)),dzHash(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(dzHash(i+vec3(0,0,1)),dzHash(i+vec3(1,0,1)),f.x),mix(dzHash(i+vec3(0,1,1)),dzHash(i+vec3(1,1,1)),f.x),f.y),f.z); }
`

/**
 * Inject the dimension features into a built-in material.
 * opts.vis: Vector3 visibility per dimension (enables dissolve)
 * opts.fracture: amount of fracture slicing in the Fracture dimension
 * opts.edge: Color of the dissolve edge
 * opts.macro: large-scale colour/roughness variation that breaks texture tiling
 * opts.wet: rain puddles on upward-facing surfaces (mirror-like, darker)
 * Every enhanced material also gets exponential height fog with sun in-scattering.
 */
export function enhance(mat, opts = {}) {
  const vis = opts.vis || null
  const frac = opts.fracture || 0
  const edge = opts.edge || new THREE.Color(0.3, 0.9, 1.6)
  const uniforms = {
    uVis: { value: vis ? vis.clone() : new THREE.Vector3(1, 1, 1) },
    uFrac: { value: frac },
    uEdge: { value: edge },
  }
  mat.userData.dz = uniforms
  const macro = opts.macro || 0
  const wet = opts.wet || 0
  const key = `dz-${vis ? 'v' : ''}${frac ? 'f' : ''}${macro ? 'm' : ''}${wet ? 'w' : ''}`
  mat.customProgramCacheKey = () => key + (mat.emissiveMap ? 'e' : '') + mat.type
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, G, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime; uniform vec3 uDimW; uniform float uFrac; varying vec3 vDzW;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        ${
          frac
            ? `{
          vec4 fw = vec4(transformed,1.0);
          #ifdef USE_INSTANCING
            fw = instanceMatrix * fw;
          #endif
          fw = modelMatrix * fw;
          // continuous warp (no per-slice jumps, so faces never tear or overlap)
          float sl = fw.y * 0.75 + 0.6*sin(fw.x*0.13+fw.z*0.11);
          float amt = uDimW.z * uFrac * (0.6 + 0.4*sin(sl*1.9));
          transformed += vec3(sin(uTime*0.6 + sl*1.7), 0.0, cos(uTime*0.5 + sl*1.3)) * amt;
        }`
            : ''
        }`
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        { vec4 dw = vec4(transformed,1.0);
          #ifdef USE_INSTANCING
            dw = instanceMatrix * dw;
          #endif
          vDzW = (modelMatrix * dw).xyz; }`
      )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime; uniform vec3 uDimW; uniform vec3 uWaveOrigin; uniform float uWaveRadius; uniform vec3 uWaveColor;
        uniform vec3 uVis; uniform vec3 uEdge; varying vec3 vDzW;
        uniform vec3 uSunDir; uniform vec3 uSunColor; uniform float uFogHeight;
        ${NOISE_GLSL}`
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        float dzMacro = 0.5; float dzPud = 0.0;
        ${
          macro
            ? `dzMacro = dzNoise(vDzW*0.06)*0.55 + dzNoise(vDzW*0.21)*0.3 + dzNoise(vDzW*0.9)*0.15;
          diffuseColor.rgb *= mix(1.0 - ${macro.toFixed(3)}, 1.0 + ${(macro * 0.45).toFixed(3)}, dzMacro);`
            : ''
        }
        ${
          wet
            ? `{ float pn = dzNoise(vec3(vDzW.xz*0.11, 1.7))*0.65 + dzNoise(vec3(vDzW.xz*0.47, 5.1))*0.35;
            dzPud = smoothstep(0.53, 0.6, pn) * step(0.0, vDzW.y + 0.05) * ${wet.toFixed(3)};
            diffuseColor.rgb *= mix(1.0, 0.5, dzPud); }`
            : ''
        }`
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor + (dzMacro - 0.5) * 0.18, 0.04, 1.0);
        roughnessFactor = mix(roughnessFactor, 0.04, dzPud);`
      )
      .replace(
        '#include <normal_fragment_begin>',
        `#include <normal_fragment_begin>
        vec3 dzGeoN = normal;`
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        normal = normalize(mix(normal, dzGeoN, dzPud * 0.92));`
      )
      .replace(
        '#include <fog_fragment>',
        `#ifdef FOG_EXP2
        { vec3 dzV = vDzW - cameraPosition; float dzD = length(dzV);
          // exponential height fog: dense ground mist thinning with altitude
          float hk = exp(-max(vDzW.y, 0.0) * uFogHeight) * 0.75 + 0.25;
          float fd = fogDensity * dzD;
          float fogF = 1.0 - exp(-fd * fd * (0.35 + 1.15 * hk));
          float sunAmt = pow(max(dot(dzV / max(dzD, 1e-3), uSunDir), 0.0), 6.0);
          vec3 fcol = mix(fogColor, uSunColor * 1.1, sunAmt * 0.55);
          gl_FragColor.rgb = mix(gl_FragColor.rgb, fcol, clamp(fogF, 0.0, 1.0)); }
        #endif`
      )
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
        float dzEdge = 0.0;
        ${
          vis
            ? `{
          float v = dot(uDimW, uVis);
          float n = dzNoise(vDzW*1.3)*0.7 + dzNoise(vDzW*4.1)*0.3;
          if (n > v*1.04 - 0.02) discard;
          if (v < 0.995) dzEdge = 1.0 - smoothstep(0.0, 0.09, v*1.04 - 0.02 - n);
        }`
            : ''
        }`
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        { float d = abs(length(vDzW - uWaveOrigin) - uWaveRadius);
          float w = 1.0 - smoothstep(0.0, 1.8, d);
          totalEmissiveRadiance += uWaveColor * w * 1.6 + uEdge * dzEdge * 3.0; }`
      )
  }
  return mat
}

export function createMaterials(T) {
  const M = {}
  const std = (o, e) => enhance(new THREE.MeshStandardMaterial(o), e)

  M.stone = std(
    {
      map: T.stone.map,
      normalMap: T.stone.normalMap,
      roughnessMap: T.stone.roughnessMap,
      aoMap: T.stone.aoMap,
      color: 0xffffff,
      roughness: 1,
      metalness: 0.0,
      normalScale: new THREE.Vector2(1.2, 1.2),
    },
    { fracture: 0.35, macro: 0.22 }
  )
  M.stoneStatic = std(
    {
      map: T.stone.map,
      normalMap: T.stone.normalMap,
      roughnessMap: T.stone.roughnessMap,
      aoMap: T.stone.aoMap,
      color: 0xf2eee8,
      roughness: 1,
      metalness: 0.0,
    },
    { macro: 0.22 }
  )
  M.pavement = std(
    {
      map: T.pave.map,
      normalMap: T.pave.normalMap,
      roughnessMap: T.pave.roughnessMap,
      aoMap: T.pave.aoMap,
      color: 0xd8d4cc,
      roughness: 1,
      metalness: 0.0,
      normalScale: new THREE.Vector2(1.1, 1.1),
    },
    { macro: 0.3, wet: 1 }
  )
  M.metal = std(
    {
      map: T.metal.map,
      normalMap: T.metal.normalMap,
      roughnessMap: T.metal.roughnessMap,
      aoMap: T.metal.aoMap,
      color: 0xffffff,
      roughness: 1,
      metalness: 0.82,
    },
    { macro: 0.12 }
  )
  M.metalFrac = std(
    {
      map: T.metal.map,
      normalMap: T.metal.normalMap,
      roughnessMap: T.metal.roughnessMap,
      color: 0xffffff,
      roughness: 1,
      metalness: 0.82,
    },
    { fracture: 0.3 }
  )
  M.tech = std({
    map: T.tech.map,
    normalMap: T.tech.normalMap,
    roughnessMap: T.tech.roughnessMap,
    emissiveMap: T.tech.emissiveMap,
    emissive: new THREE.Color(0.55, 0.25, 1.0),
    emissiveIntensity: 1.6,
    color: 0xffffff,
    roughness: 1,
    metalness: 0.7,
  })
  M.techCyan = std({
    map: T.tech.map,
    normalMap: T.tech.normalMap,
    roughnessMap: T.tech.roughnessMap,
    emissiveMap: T.tech.emissiveMap,
    emissive: new THREE.Color(0.2, 0.75, 1.0),
    emissiveIntensity: 1.4,
    color: 0xffffff,
    roughness: 1,
    metalness: 0.7,
  })
  M.rock = std(
    {
      map: T.rock.map,
      normalMap: T.rock.normalMap,
      roughnessMap: T.rock.roughnessMap,
      aoMap: T.rock.aoMap,
      color: 0xffffff,
      roughness: 1,
      metalness: 0.05,
      normalScale: new THREE.Vector2(1.4, 1.4),
    },
    { macro: 0.3 }
  )
  M.rockDark = std({
    map: T.rock.map,
    normalMap: T.rock.normalMap,
    roughnessMap: T.rock.roughnessMap,
    color: 0x8a86a0,
    roughness: 1,
    metalness: 0.1,
    emissiveMap: T.veins,
    emissive: new THREE.Color(0.6, 0.2, 1.2),
    emissiveIntensity: 1.2,
  })
  M.island = std(
    {
      map: T.rock.map,
      normalMap: T.rock.normalMap,
      roughnessMap: T.rock.roughnessMap,
      aoMap: T.rock.aoMap,
      color: 0xb4aea6,
      roughness: 1,
      metalness: 0.0,
    },
    { macro: 0.35 }
  )
  M.leaves = std({ map: T.leaves, color: 0xffffff, roughness: 0.85, metalness: 0, flatShading: true })
  M.bark = std({ map: T.rock.map, color: 0x6b5244, roughness: 0.95 })
  M.chrome = std({ color: 0xc8ccd8, roughness: 0.18, metalness: 1.0 })
  M.darkChrome = std({ color: 0x2c2c38, roughness: 0.28, metalness: 1.0 })

  const glow = (r, g, b) => new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, b), toneMapped: true })
  M.glowCyan = glow(0.4, 2.2, 3.2)
  M.glowViolet = glow(1.6, 0.6, 3.4)
  M.glowAmber = glow(3.2, 1.6, 0.3)
  M.glowRed = glow(3.0, 0.25, 0.3)
  M.glowWhite = glow(3, 3, 3.4)

  // Dimension-exclusive variants (dissolve in/out)
  M.bridgeB = std(
    {
      map: T.tech.map,
      normalMap: T.tech.normalMap,
      emissiveMap: T.tech.emissiveMap,
      emissive: new THREE.Color(0.2, 0.8, 1.1),
      emissiveIntensity: 1.8,
      color: 0xd0d8ff,
      roughness: 0.5,
      metalness: 0.75,
    },
    { vis: new THREE.Vector3(0, 1, 0), edge: new THREE.Color(0.3, 1.2, 2.0) }
  )
  M.stairC = std(
    {
      map: T.stone.map,
      normalMap: T.stone.normalMap,
      emissiveMap: T.veins,
      emissive: new THREE.Color(1.2, 0.3, 2.0),
      emissiveIntensity: 1.6,
      color: 0x9a90b8,
      roughness: 0.9,
    },
    { vis: new THREE.Vector3(0, 0, 1), edge: new THREE.Color(1.6, 0.4, 2.4) }
  )
  M.coverAB = std(
    {
      map: T.metal.map,
      normalMap: T.metal.normalMap,
      roughnessMap: T.metal.roughnessMap,
      emissiveMap: T.tech.emissiveMap,
      emissive: new THREE.Color(0.15, 0.6, 1.0),
      emissiveIntensity: 0.9,
      color: 0xcfd6e6,
      roughness: 1,
      metalness: 0.8,
    },
    { vis: new THREE.Vector3(1, 1, 0), edge: new THREE.Color(0.3, 1.2, 2.0) }
  )
  M.vaultDoor = std({
    map: T.metal.map,
    normalMap: T.metal.normalMap,
    roughnessMap: T.metal.roughnessMap,
    color: 0x9a9ab0,
    roughness: 1,
    metalness: 0.85,
    emissiveMap: T.tech.emissiveMap,
    emissive: new THREE.Color(0.7, 0.2, 1.3),
    emissiveIntensity: 1.2,
  })
  return M
}

// Energy barrier / force field material (hex lattice + fresnel), dimension-aware.
export function barrierMaterial(color = new THREE.Color(1.4, 0.4, 2.6), vis = new THREE.Vector3(1, 1, 0)) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: { ...G, uColor: { value: color }, uVis: { value: vis }, uHit: { value: -10 } },
    vertexShader: /* glsl */ `
      varying vec3 vW; varying vec3 vN; varying vec2 vUv;
      void main(){ vUv = uv; vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix)*normal);
        gl_Position = projectionMatrix*viewMatrix*w; }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uDimW; uniform vec3 uColor; uniform vec3 uVis; uniform float uHit;
      varying vec3 vW; varying vec3 vN; varying vec2 vUv;
      float hex(vec2 p){ p.x *= 1.1547; p.y += mod(floor(p.x),2.0)*0.5; p = abs(fract(p)-0.5); return abs(max(p.x*1.5+p.y, p.y*2.0)-1.0); }
      void main(){
        float v = dot(uDimW, uVis);
        if (v < 0.01) discard;
        vec2 p = vec2(vW.x+vW.z, vW.y)*1.4;
        float h = smoothstep(0.08, 0.0, hex(p + vec2(0.0, uTime*0.15)));
        float scan = 0.5+0.5*sin(vW.y*3.0 - uTime*3.0);
        vec3 V = normalize(cameraPosition - vW);
        float fr = pow(clamp(1.0 - abs(dot(V, normalize(vN))), 0.0, 1.0), 2.0);
        float hit = exp(-(uTime-uHit)*5.0);
        float edge = smoothstep(0.06, 0.0, min(vUv.y, 1.0-vUv.y)) + smoothstep(0.03,0.0,min(vUv.x,1.0-vUv.x));
        float a = (0.04 + h*0.22 + fr*0.2 + scan*0.04 + edge*0.6 + hit*0.5) * v;
        gl_FragColor = vec4(uColor * a, a);
      }`,
  })
}
