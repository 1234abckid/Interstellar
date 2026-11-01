// Procedural sky dome that blends between the three realities:
// Material (bright blue sky, cumulus, distant moon), Inverted (violet dusk with
// mirrored cloud sea above) and Fracture (black-violet void cracked by light).
import * as THREE from 'three'
import { G } from './materials.js'

export function createSky() {
  const uniforms = {
    ...G,
    uSunDir: { value: new THREE.Vector3(0.45, 0.62, -0.35).normalize() },
    uPortalDir: { value: new THREE.Vector3(0.55, 0.42, -0.72).normalize() },
    uFlash: { value: 0 },
  }
  const mat = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main(){ vDir = normalize(position); vec4 p = projectionMatrix*modelViewMatrix*vec4(position,1.0); gl_Position = p.xyww; }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uDimW; uniform vec3 uSunDir; uniform vec3 uPortalDir; uniform float uFlash;
      varying vec3 vDir;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float n2(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
      float fbm(vec2 p){ float s=0.0, a=0.5; for(int i=0;i<4;i++){ s+=a*n2(p); p*=2.03; a*=0.5; } return s; }
      vec2 voro(vec2 p){ vec2 i=floor(p), f=fract(p); float d1=8.0, d2=8.0;
        for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++){ vec2 g=vec2(x,y); vec2 o=vec2(h(i+g), h(i+g+17.0));
          float d=length(g+o-f); if(d<d1){d2=d1;d1=d;} else if(d<d2) d2=d; } return vec2(d1,d2); }
      void main(){
        vec3 d = normalize(vDir);
        float y = d.y;
        // --- Material sky
        vec3 zenA = vec3(0.05,0.17,0.62), horA = vec3(0.55,0.68,0.88), lowA = vec3(0.42,0.48,0.66);
        vec3 colA = mix(horA, zenA, pow(max(y,0.0),0.55));
        colA = mix(colA, lowA, smoothstep(0.0,-0.3,y));
        // --- Inverted sky
        vec3 zenB = vec3(0.10,0.05,0.28), horB = vec3(0.85,0.38,0.62), lowB = vec3(0.2,0.45,0.6);
        vec3 colB = mix(horB, zenB, pow(abs(y),0.5));
        colB = mix(colB, lowB, smoothstep(0.0,-0.4,y)*0.6);
        // --- Fracture void
        vec3 colC = mix(vec3(0.16,0.04,0.30), vec3(0.015,0.005,0.04), pow(abs(y),0.6));

        vec2 cp = d.xz / (abs(y)+0.18);
        float t = uTime*0.006;
        // only evaluate the noise of realities that are actually visible
        // (uniform branches: every pixel takes the same path, so this is cheap)
        if (uDimW.x > 0.002) {
          // clouds A: one noise lookup drives both coverage and self-shadowing
          float nA = fbm(cp*1.3 + vec2(t,0.0));
          float cA = smoothstep(0.48, 0.78, nA);
          vec3 cloudCol = mix(vec3(1.0,0.98,0.95), vec3(0.55,0.6,0.78), smoothstep(0.55,0.85,nA));
          colA = mix(colA, cloudCol, cA * smoothstep(0.0,0.15,y) * 0.95);
          if (y < 0.03) {
            float sea = smoothstep(0.35,0.7,fbm(cp*0.8 - vec2(t*0.5,0.0)));
            colA = mix(colA, vec3(0.92,0.94,1.0), sea*smoothstep(0.02,-0.25,y));
          }
        }
        if (uDimW.y > 0.002) {
          float cB = smoothstep(0.45, 0.8, fbm(cp*0.9 - vec2(0.0,t*1.5)));
          colB = mix(colB, vec3(1.0,0.7,0.85)*0.9, cB*smoothstep(0.25,0.6,y)*0.8);
          colB = mix(colB, vec3(0.5,0.8,0.95)*0.9, cB*smoothstep(0.0,-0.3,y)*0.8);
        }
        if (uDimW.z > 0.002) {
          vec2 vc = voro(cp*1.4 + vec2(t*2.0, 0.0));
          float crack = smoothstep(0.06, 0.0, vc.y - vc.x);
          colC += vec3(0.9,0.35,1.8) * crack * (0.55 + 0.45*n2(cp*3.0+uTime*0.05)) * smoothstep(-0.2,0.3,y);
        }
        // stars (B, C)
        vec2 sp = vec2(atan(d.z,d.x)*80.0, asin(clamp(y,-1.0,1.0))*80.0);
        float st = step(0.996, h(floor(sp))) * (0.5+0.5*sin(uTime*2.0+h(floor(sp))*40.0));
        colB += st*0.8*smoothstep(0.2,0.6,y);
        colC += st*1.2;

        vec3 col = colA*uDimW.x + colB*uDimW.y + colC*uDimW.z;

        // sun
        float sd = max(dot(d, uSunDir),0.0);
        col += vec3(1.0,0.9,0.75) * (pow(sd, 900.0)*30.0 + pow(sd, 12.0)*0.25) * (uDimW.x + uDimW.y*0.4);
        // moon / planet (A,B)
        vec3 md = normalize(vec3(-0.6,0.38,-0.7));
        float mdd = dot(d, md);
        if (mdd > 0.9975) {
          vec3 pn = normalize(d - md*mdd);
          float lit = clamp(dot(pn, normalize(vec3(0.6,0.2,0.4)))*0.8+0.4, 0.0, 1.0);
          float tex = fbm(d.xy*180.0);
          vec3 mc = vec3(0.75,0.78,0.86)*(0.6+tex*0.5)*lit;
          col = mix(col, mc, smoothstep(0.9975,0.9979,mdd)*(uDimW.x*0.9 + uDimW.y*0.7));
        }
        // dimensional vortex portal
        float pd = dot(d, uPortalDir);
        if (pd > 0.6) {
          vec3 ax1 = normalize(cross(uPortalDir, vec3(0,1,0)));
          vec3 ax2 = cross(ax1, uPortalDir);
          vec2 pp = vec2(dot(d,ax1), dot(d,ax2)) / (pd);
          float r = length(pp);
          float a = atan(pp.y, pp.x);
          float sw = fbm(vec2(a*2.0 + r*14.0 - uTime*0.25, r*6.0));
          float ring = smoothstep(0.5, 0.0, abs(r-0.24)) ;
          float core = smoothstep(0.17, 0.0, r);
          float k = ring * (0.35 + sw*0.9);
          float inten = 0.55*uDimW.x + 0.8*uDimW.y + 1.4*uDimW.z;
          col += vec3(0.75,0.35,1.6) * k * inten * smoothstep(0.42,0.18,r);
          col = mix(col, vec3(0.04,0.0,0.1), core*0.85*inten/1.4);
          col += vec3(0.5,0.6,2.0) * smoothstep(0.03,0.0,abs(r-0.17)) * inten;
        }
        col += vec3(0.7,0.4,1.4)*uFlash;
        gl_FragColor = vec4(col, 1.0);
      }`,
  })
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(900, 48, 24), mat)
  mesh.frustumCulled = false
  mesh.renderOrder = -10
  return { mesh, uniforms }
}
