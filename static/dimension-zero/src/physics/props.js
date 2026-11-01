// Dynamic physics props driven by cannon-es: crates, stone debris and explosive
// energy canisters. They collide with the static world, respond to gravity
// anomalies, singularity wells, explosions and gunfire.
import * as THREE from 'three'
import * as CANNON from 'cannon-es'

const _v = new THREE.Vector3()

export class PropSystem {
  constructor(ctx) {
    this.ctx = ctx
    this.world = new CANNON.World({ gravity: new CANNON.Vec3(0, -20, 0) })
    this.world.broadphase = new CANNON.SAPBroadphase(this.world)
    this.world.allowSleep = true
    this.world.defaultContactMaterial.friction = 0.4
    this.world.defaultContactMaterial.restitution = 0.25
    this.props = []
    this.staticBodies = []
    const ground = new CANNON.Body({ type: CANNON.Body.STATIC, shape: new CANNON.Plane() })
    ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0)
    this.world.addBody(ground)
  }

  // Mirror the collision world's boxes as static bodies (once, after arena build).
  mirrorColliders(cw) {
    for (const c of cw.list) {
      if (c.kind === 'barrier') continue
      const hx = (c.max.x - c.min.x) / 2,
        hy = (c.max.y - c.min.y) / 2,
        hz = (c.max.z - c.min.z) / 2
      if (hx > 60) continue
      const b = new CANNON.Body({ type: CANNON.Body.STATIC, shape: new CANNON.Box(new CANNON.Vec3(hx, hy, hz)) })
      b.position.set(c.min.x + hx, c.min.y + hy, c.min.z + hz)
      b.userData = { collider: c }
      this.world.addBody(b)
      this.staticBodies.push(b)
    }
  }

  // Dimension-exclusive geometry only collides with props while it exists.
  syncDims(cw) {
    for (const b of this.staticBodies) {
      const on = cw.active(b.userData.collider)
      b.collisionResponse = on
      if (on) b.wakeUp?.()
    }
    for (const p of this.props) if (p.alive) p.body.wakeUp()
  }

  /**
   * kind: 'crate' | 'debris' | 'canister'
   */
  add(mesh, kind, x, y, z, opts = {}) {
    const size = opts.size || 0.6
    let shape
    if (kind === 'debris') shape = new CANNON.Sphere(size * 0.55)
    else if (kind === 'canister') shape = new CANNON.Cylinder(size * 0.45, size * 0.45, size * 1.4, 10)
    else shape = new CANNON.Box(new CANNON.Vec3(size / 2, size / 2, size / 2))
    const body = new CANNON.Body({ mass: opts.mass ?? (kind === 'crate' ? 6 : kind === 'canister' ? 4 : 3), shape, linearDamping: 0.08, angularDamping: 0.25 })
    body.position.set(x, y, z)
    body.sleepSpeedLimit = 0.25
    body.allowSleep = true
    this.world.addBody(body)
    mesh.position.set(x, y, z)
    this.ctx.scene.add(mesh)
    const p = {
      mesh,
      body,
      kind,
      size,
      radius: kind === 'canister' ? size * 0.75 : size * 0.7,
      health: kind === 'canister' ? 20 : 9999,
      alive: true,
      floatZone: opts.floatZone || null, // anti-gravity anchor (gravity garden)
      home: new THREE.Vector3(x, y, z),
      seed: Math.random() * 100,
      onDestroy: opts.onDestroy || null,
    }
    body.userData = { prop: p }
    this.props.push(p)
    return p
  }

  impulse(p, ix, iy, iz) {
    p.body.wakeUp()
    p.body.applyImpulse(new CANNON.Vec3(ix, iy, iz))
  }

  damage(p, amount) {
    if (!p.alive) return
    p.health -= amount
    if (p.health <= 0) this.destroy(p)
  }

  destroy(p) {
    if (!p.alive) return
    p.alive = false
    this.world.removeBody(p.body)
    p.mesh.visible = false
    if (p.onDestroy) p.onDestroy(p)
  }

  // Radial impulse (explosions, singularity collapse).
  blast(pos, radius, force) {
    for (const p of this.props) {
      if (!p.alive) continue
      const b = p.body.position
      const dx = b.x - pos.x,
        dy = b.y - pos.y + 0.3,
        dz = b.z - pos.z
      const d = Math.hypot(dx, dy, dz)
      if (d > radius || d < 1e-3) continue
      const k = (1 - d / radius) * force * p.body.mass
      this.impulse(p, (dx / d) * k, (dy / d) * k + k * 0.4, (dz / d) * k)
    }
  }

  // Continuous attraction (singularity wells).
  attract(pos, radius, strength, dt) {
    for (const p of this.props) {
      if (!p.alive) continue
      const b = p.body.position
      const dx = pos.x - b.x,
        dy = pos.y - b.y,
        dz = pos.z - b.z
      const d = Math.hypot(dx, dy, dz)
      if (d > radius || d < 0.3) continue
      const k = strength * (1 - d / radius) * p.body.mass * dt
      p.body.wakeUp()
      p.body.velocity.x += (dx / d) * k / p.body.mass * 1.0
      p.body.velocity.y += (dy / d) * k / p.body.mass * 1.0 + 9 * dt
      p.body.velocity.z += (dz / d) * k / p.body.mass * 1.0
      // swirl
      p.body.velocity.x += (-dz / d) * k * 0.3 / p.body.mass
      p.body.velocity.z += (dx / d) * k * 0.3 / p.body.mass
    }
  }

  // Ray vs prop bounding spheres. Returns {p, t} or null.
  raycast(o, d, maxT) {
    let best = null,
      bt = maxT
    for (const p of this.props) {
      if (!p.alive) continue
      const c = p.body.position
      const ox = o.x - c.x,
        oy = o.y - c.y,
        oz = o.z - c.z
      const b = ox * d.x + oy * d.y + oz * d.z
      const cc = ox * ox + oy * oy + oz * oz - p.radius * p.radius
      const h = b * b - cc
      if (h < 0) continue
      const t = -b - Math.sqrt(h)
      if (t > 0 && t < bt) {
        bt = t
        best = p
      }
    }
    return best ? { p: best, t: bt } : null
  }

  update(dt, zones, gravityScale) {
    const ctx = this.ctx
    this.world.gravity.y = -20 * gravityScale
    const pl = ctx.player
    for (const p of this.props) {
      if (!p.alive) continue
      const b = p.body
      // gravity zones
      for (const z of zones) {
        if (!z.active) continue
        if (b.position.x > z.min.x && b.position.x < z.max.x && b.position.z > z.min.z && b.position.z < z.max.z && b.position.y < z.max.y + 4) {
          b.wakeUp()
          if (z.type === 'lift') b.velocity.y += 34 * dt
          else if (z.type === 'float') {
            // levitate toward a hovering band with a gentle orbit
            const target = z.min.y + 2.5 + Math.sin(ctx.time * 0.6 + p.seed) * 1.5 + (p.seed % 3)
            b.velocity.y += (target - b.position.y) * 3 * dt + 20 * gravityScale * dt
            b.velocity.y *= 1 - 0.8 * dt
            const cx = (z.min.x + z.max.x) / 2,
              cz = (z.min.z + z.max.z) / 2
            b.velocity.x += -(b.position.z - cz) * 0.25 * dt
            b.velocity.z += (b.position.x - cx) * 0.25 * dt
            b.angularVelocity.y += 0.2 * dt
          }
        }
      }
      // player pushes props by walking into them
      if (pl) {
        const dx = b.position.x - pl.pos.x,
          dz = b.position.z - pl.pos.z
        const dy = b.position.y - (pl.pos.y + 0.6)
        const d = Math.hypot(dx, dz)
        const rr = p.radius + 0.45
        if (d < rr && Math.abs(dy) < 1.2 && d > 1e-3) {
          b.wakeUp()
          const push = (rr - d) * 14
          b.velocity.x += (dx / d) * push * dt * 10
          b.velocity.z += (dz / d) * push * dt * 10
        }
      }
      // keep props inside the island
      const rr2 = Math.hypot(b.position.x, b.position.z)
      if (rr2 > 48) {
        b.velocity.x -= (b.position.x / rr2) * 30 * dt
        b.velocity.z -= (b.position.z / rr2) * 30 * dt
      }
      if (b.position.y < -20) {
        b.position.set(p.home.x, p.home.y + 2, p.home.z)
        b.velocity.set(0, 0, 0)
      }
    }
    this.world.step(1 / 60, dt, 3)
    for (const p of this.props) {
      if (!p.alive) continue
      p.mesh.position.copy(p.body.position)
      p.mesh.quaternion.copy(p.body.quaternion)
    }
  }
}
