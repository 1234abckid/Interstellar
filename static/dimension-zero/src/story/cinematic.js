// Cinematic director: plays sequences of camera "shots" (Catmull-Rom spline
// paths with eased timing, look-at splines, FOV ramps, depth of field,
// handheld drift), timed events, narration cues, title cards and a letterbox.
// Sequences can loop (title-screen demo) and be skipped by holding SPACE.
import * as THREE from 'three'
import { smooth, clamp, lerp, wobble } from '../core/utils.js'

const EASE = {
  linear: (t) => t,
  inout: (t) => smooth(t),
  in: (t) => t * t * t,
  out: (t) => 1 - Math.pow(1 - t, 3),
  soft: (t) => smooth(smooth(t) * 0.7 + t * 0.3),
}

const _p = new THREE.Vector3(),
  _l = new THREE.Vector3()

export class Cinematic {
  constructor(ctx) {
    this.ctx = ctx
    this.active = false
    this.shots = []
    this.i = 0
    this.t = 0
    this.bars = 0
    this.barsTarget = 0
    this.skipHold = 0
    this.opts = {}
    // DOM: title card, location card, skip hint
    const card = document.createElement('div')
    card.id = 'ctitle'
    card.innerHTML = '<img src="assets/logo.webp" alt="DIMENSION ZERO"/><div class="ct-sub"></div>'
    document.body.appendChild(card)
    const loc = document.createElement('div')
    loc.id = 'cloc'
    loc.innerHTML = '<div class="cl-a"></div><div class="cl-b"></div>'
    document.body.appendChild(loc)
    const skip = document.createElement('div')
    skip.id = 'cskip'
    skip.innerHTML =
      '<svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="15"/></svg><span>HOLD <kbd>SPACE</kbd> TO SKIP</span>'
    document.body.appendChild(skip)
    this.el = { card, cardSub: card.querySelector('.ct-sub'), loc, skip, ring: skip.querySelector('circle') }
  }

  play(shots, opts = {}) {
    this.stop(false)
    this.shots = shots
    this.opts = opts
    this.i = -1
    this.active = true
    this.skipHold = 0
    this.barsTarget = opts.bars ?? 1
    this.el.skip.classList.toggle('show', opts.skippable !== false)
    this.next()
  }

  next() {
    const prev = this.shots[this.i]
    if (prev && prev.end) prev.end(this.ctx)
    this.i++
    if (this.i >= this.shots.length) {
      if (this.opts.loop) this.i = 0
      else return this.finish()
    }
    const s = this.shots[this.i]
    this.t = 0
    s._fired = new Set()
    s._path = new THREE.CatmullRomCurve3(s.path, false, 'catmullrom', 0.4)
    s._look = new THREE.CatmullRomCurve3(s.look.length > 1 ? s.look : [s.look[0], s.look[0]], false, 'catmullrom', 0.4)
    // each shot's first line cuts any leftover narration so voice and picture stay in sync
    if (s.lines)
      for (const [k, id] of s.lines.entries())
        this.ctx.narrator.say(id, { delay: k === 0 ? s.lineDelay || 0 : 0.3, interrupt: k === 0 })
    if (s.title) this.showCard(s.title)
    else this.hideCard()
    if (s.loc) this.showLoc(s.loc)
    else this.el.loc.classList.remove('show')
    s.start?.(this.ctx)
  }

  showCard(sub) {
    this.el.cardSub.textContent = sub
    this.el.card.classList.remove('show')
    void this.el.card.offsetWidth
    this.el.card.classList.add('show')
  }
  hideCard() {
    this.el.card.classList.remove('show')
  }
  showLoc([a, b]) {
    this.el.loc.querySelector('.cl-a').textContent = a
    this.el.loc.querySelector('.cl-b').textContent = b
    this.el.loc.classList.add('show')
  }

  finish() {
    const cb = this.opts.onEnd
    this.stop(true)
    cb?.()
  }

  // skip: run remaining shot cleanups, then finish
  skip() {
    if (!this.active) return
    const s = this.shots[this.i]
    if (s && s.end) s.end(this.ctx)
    for (let k = this.i + 1; k < this.shots.length; k++) this.shots[k].onSkip?.(this.ctx)
    this.shots[this.i] = { ...s, end: null }
    this.ctx.narrator.clear()
    this.opts.onSkip?.()
    this.finish()
  }

  stop(clearBars = true) {
    this.active = false
    this.hideCard()
    this.el.loc.classList.remove('show')
    this.el.skip.classList.remove('show')
    if (clearBars) this.barsTarget = 0
    this.ctx.R.dof.enabled = false
  }

  get running() {
    return this.active
  }

  update(dt, input) {
    const R = this.ctx.R
    // letterbox easing (also while inactive so bars slide away)
    this.bars += (this.barsTarget - this.bars) * Math.min(1, dt * 3)
    R.U.uBars.value = this.bars
    if (!this.active) return false
    const s = this.shots[this.i]
    this.t += dt
    const k = clamp(this.t / s.dur, 0, 1)
    const e = (EASE[s.ease] || EASE.inout)(k)
    const cam = this.ctx.camera
    s._path.getPoint(e, _p)
    s._look.getPoint(e, _l)
    const shake = s.shake ?? 0.012
    const tt = this.ctx.G.uTime.value
    cam.position.copy(_p)
    cam.lookAt(_l)
    cam.rotateZ(wobble(tt * 0.6, 3) * shake * 0.6 + (s.roll || 0))
    cam.rotateX(wobble(tt * 0.5, 7) * shake)
    cam.rotateY(wobble(tt * 0.45, 11) * shake)
    const fov = s.fov ? lerp(s.fov[0], s.fov[1], e) : 50
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov = fov
      cam.updateProjectionMatrix()
    }
    // depth of field focused on the look target (or a fixed distance)
    if (s.dof !== undefined && s.dof !== false) {
      R.dof.enabled = this.ctx.R.quality !== 'low'
      const focus = typeof s.dof === 'number' ? s.dof : cam.position.distanceTo(_l)
      R.dof.uniforms.focus.value = focus
      R.dof.uniforms.aperture.value = s.aperture ?? 0.0009
      R.dof.uniforms.maxblur.value = 0.006
    } else R.dof.enabled = false
    // timed events
    if (s.events)
      for (const [j, ev] of s.events.entries()) {
        if (!s._fired.has(j) && this.t >= ev.t) {
          s._fired.add(j)
          ev.fn(this.ctx)
        }
      }
    s.tick?.(this.ctx, k, dt)
    // hold SPACE / ENTER to skip
    if (this.opts.skippable !== false && input) {
      const held = input.down('Space') || input.down('Enter') || input.down('NumpadEnter')
      this.skipHold = held ? this.skipHold + dt : Math.max(0, this.skipHold - dt * 2)
      this.el.ring.style.strokeDashoffset = String(94.2 * (1 - clamp(this.skipHold / 0.9, 0, 1)))
      if (this.skipHold >= 0.9) {
        this.skip()
        return true
      }
    }
    if (this.t >= s.dur) this.next()
    return true
  }
}
