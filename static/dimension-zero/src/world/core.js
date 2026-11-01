// The Dimensional Core: the mission objective. A morphing energy heart wrapped
// in three gyroscopic rings. Each cleared wave locks one ring; once all three
// are locked the player channels the core to stabilise reality.
import * as THREE from 'three'
import { G } from './materials.js'
import { damp, clamp } from '../core/utils.js'

export function createCore(ctx) {
  const { scene, M } = ctx
  const pos = new THREE.Vector3(0, 6.2, 0)
  const grp = new THREE.Group()
  grp.position.copy(pos)
  scene.add(grp)

  const uniforms = {
    uTime: G.uTime,
    uStable: { value: 0 }, // 0 chaotic .. 1 stabilised
    uCharge: { value: 0 },
    uDimW: G.uDimW,
  }
  const heartMat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      uniform float uTime; uniform float uStable; uniform float uCharge; uniform vec3 uDimW;
      varying vec3 vN; varying vec3 vW; varying float vD;
      float hh(vec3 p){ p=fract(p*0.3183+0.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
      float nz(vec3 x){ vec3 i=floor(x); vec3 f=fract(x); f=f*f*(3.0-2.0*f);
        return mix(mix(mix(hh(i),hh(i+vec3(1,0,0)),f.x),mix(hh(i+vec3(0,1,0)),hh(i+vec3(1,1,0)),f.x),f.y),
                   mix(mix(hh(i+vec3(0,0,1)),hh(i+vec3(1,0,1)),f.x),mix(hh(i+vec3(0,1,1)),hh(i+vec3(1,1,1)),f.x),f.y),f.z); }
      void main(){
        vec3 p = position;
        float chaos = 1.0 - uStable;
        float n = nz(p*1.6 + vec3(0.0, uTime*0.8, uTime*0.3));
        // sphere -> spiked star in Fracture, stretched ring-like in Inverted
        float spikes = pow(max(0.0, nz(p*3.0 + uTime*0.5)-0.45), 2.0) * 6.0 * (0.4 + uDimW.z);
        float d = (n-0.5)*0.9*chaos + spikes*chaos*0.5 + uCharge*0.4*sin(uTime*20.0 + p.y*6.0);
        p += normal * d;
        p.y *= 1.0 - uDimW.y*0.35*chaos;
        p.xz *= 1.0 + uDimW.y*0.25*chaos;
        vD = d;
        vN = normalize(normalMatrix*normal);
        vec4 w = modelMatrix*vec4(p,1.0); vW = w.xyz;
        gl_Position = projectionMatrix*viewMatrix*w;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform float uStable; uniform float uCharge;
      varying vec3 vN; varying vec3 vW; varying float vD;
      void main(){
        vec3 V = normalize(cameraPosition - vW);
        float fr = pow(1.0 - abs(dot(V, normalize(vN))), 2.2);
        vec3 chaosC = vec3(1.2,0.3,2.4);
        vec3 stableC = vec3(0.3,1.6,2.6);
        vec3 c = mix(chaosC, stableC, uStable);
        float bands = 0.5+0.5*sin(vW.y*8.0 - uTime*3.0 + vD*10.0);
        vec3 col = c*(0.25 + fr*2.2 + bands*0.25) + vec3(1.0)*uCharge*1.5*fr;
        col *= 0.8 + uCharge*1.4;
        gl_FragColor = vec4(col, 1.0);
      }`,
  })
  const heart = new THREE.Mesh(new THREE.IcosahedronGeometry(1.7, 5), heartMat)
  grp.add(heart)
  // dark containment cage
  const cage = new THREE.Mesh(
    new THREE.IcosahedronGeometry(2.3, 1),
    new THREE.MeshStandardMaterial({ color: 0x1a1a24, metalness: 1, roughness: 0.3, wireframe: true })
  )
  grp.add(cage)

  const rings = []
  const ringMatOff = M.glowViolet
  const ringMatOn = M.glowCyan
  ;[3.3, 4.1, 4.9].forEach((r, i) => {
    const holder = new THREE.Group()
    const body = new THREE.Mesh(new THREE.TorusGeometry(r, 0.22, 12, 96), M.darkChrome)
    body.castShadow = true
    const glow = new THREE.Mesh(new THREE.TorusGeometry(r, 0.07, 6, 128), ringMatOff)
    glow.position.z = 0.0
    glow.scale.setScalar(1.0)
    // nodes on the ring
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2
      const node = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.7), M.metal)
      node.position.set(Math.cos(a) * r, Math.sin(a) * r, 0)
      node.rotation.z = a
      body.add(node)
    }
    holder.add(body, glow)
    grp.add(holder)
    rings.push({
      holder,
      glow,
      locked: false,
      lockT: 0,
      speed: [0.6, -0.45, 0.35][i],
      axis: new THREE.Vector3(i === 0 ? 1 : 0.3, i === 1 ? 1 : 0.2, i === 2 ? 1 : 0.4).normalize(),
      angle: i,
    })
  })
  const light = new THREE.PointLight(0x9a6bff, 40, 30, 1.6)
  grp.add(light)

  // pylon beams
  const beams = []
  for (const [sx, sz] of [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ]) {
    const from = new THREE.Vector3(sx * 5.6, 5.5, sz * 5.6)
    const to = pos.clone()
    const len = from.distanceTo(to)
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, len, 6, 1, true), M.glowCyan)
    b.position.copy(from).lerp(to, 0.5)
    b.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize())
    b.visible = false
    scene.add(b)
    beams.push(b)
  }
  // activation ring on the top tier
  const progMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uP: { value: 0 }, uOn: { value: 0 }, uTime: G.uTime },
    vertexShader: `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `uniform float uP; uniform float uOn; uniform float uTime; varying vec2 vP;
      void main(){ float r = length(vP); float a = atan(vP.x, -vP.y)/6.28318+0.5;
        float band = smoothstep(0.04,0.0,abs(r-3.4)-0.12);
        float fill = step(a, uP);
        float pulse = 0.5+0.5*sin(uTime*4.0);
        vec3 c = mix(vec3(0.5,0.3,1.4)*(0.3+pulse*0.3), vec3(0.4,1.6,2.4), fill);
        float al = band*uOn;
        gl_FragColor = vec4(c*al, al); }`,
  })
  const prog = new THREE.Mesh(new THREE.RingGeometry(3.1, 3.7, 96), progMat)
  prog.rotation.x = -Math.PI / 2
  prog.position.y = 1.53
  scene.add(prog)

  const state = { stage: 0, charge: 0, ready: false, done: false, burst: 0 }

  function lockRing(i) {
    const r = rings[i]
    if (!r || r.locked) return
    r.locked = true
    r.glow.material = ringMatOn
  }

  function update(dt, c) {
    const t = c.time
    const stable = state.stage / 3
    uniforms.uStable.value = damp(uniforms.uStable.value, state.done ? 1 : stable * 0.8, 2, dt)
    uniforms.uCharge.value = damp(uniforms.uCharge.value, state.charge, 6, dt)
    heart.rotation.y += dt * 0.3
    cage.rotation.y -= dt * 0.15
    cage.rotation.x += dt * 0.07
    for (const r of rings) {
      if (r.locked) {
        // ease into a common, aligned plane — order emerging from chaos
        r.lockT = Math.min(1, r.lockT + dt * 0.8)
        r.holder.quaternion.slerp(
          new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)),
          1 - Math.exp(-3 * dt)
        )
        r.holder.children[0].rotation.z += dt * (0.4 + state.charge * 4)
      } else {
        r.angle += dt * r.speed * (1 + c.dims.w.z * 1.5)
        r.holder.quaternion.setFromAxisAngle(r.axis, r.angle)
      }
    }
    light.intensity = 30 + Math.sin(t * 3) * 6 + state.charge * 120 + state.burst * 400
    light.color.setRGB(0.6 - stable * 0.3, 0.42 + stable * 0.5, 1.0)
    const show = state.ready && !state.done
    for (const b of beams) {
      b.visible = show
      b.scale.x = b.scale.z = 1 + state.charge * 2 + Math.sin(t * 30) * 0.2 * state.charge
    }
    progMat.uniforms.uOn.value = damp(progMat.uniforms.uOn.value, show ? 1 : 0, 5, dt)
    progMat.uniforms.uP.value = state.charge
    state.burst = Math.max(0, state.burst - dt * 0.5)
    grp.position.y = pos.y + Math.sin(t * 0.8) * 0.25
  }

  function reset() {
    state.stage = 0
    state.charge = 0
    state.ready = false
    state.done = false
    state.burst = 0
    for (const r of rings) {
      r.locked = false
      r.lockT = 0
      r.glow.material = ringMatOff
    }
  }

  return {
    update,
    lockRing,
    state,
    reset,
    pos,
    zoneCheck: (p) => Math.abs(p.x) < 4.3 && Math.abs(p.z) < 4.3 && p.y > 1.2 && p.y < 4,
  }
}
