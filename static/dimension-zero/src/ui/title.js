// Title screen: the main menu over a live "demo reel" — the cinematic camera
// tours the arena through all three realities while a squad of real enemies
// hunts an invisible decoy, so the backdrop is actual gameplay, not video.
import * as THREE from 'three'
import { attractShots } from '../story/shots.js'

export class TitleScreen {
  constructor(ctx) {
    this.ctx = ctx
    this.active = false
    const el = document.createElement('div')
    el.id = 'title'
    el.className = 'hidden'
    const done = (() => {
      try {
        return localStorage.getItem('dz.tutorialDone') === '1'
      } catch {
        return false
      }
    })()
    el.innerHTML = `
      <div class="ti-left">
        <img class="ti-logo" src="assets/logo.webp" alt="DIMENSION ZERO" />
        <div class="ti-tag">FIGHT · EXPLORE · SHIFT</div>
        <nav class="ti-menu">
          <button data-a="campaign" class="primary"><span>BEGIN CAMPAIGN</span><small>Intro · Calibration · Story</small></button>
          <button data-a="combat"><span>SKIP TO COMBAT</span><small>Straight into the waves${done ? '' : ' · no tutorial'}</small></button>
          <button data-a="intro"><span>WATCH INTRO</span><small>Replay the opening cinematic</small></button>
          <button data-a="operators"><span>OPERATORS</span><small>Choose your operator &amp; skin</small></button>
          <button data-a="settings"><span>SETTINGS</span><small>Graphics · audio · controls</small></button>
        </nav>
      </div>
      <div class="ti-foot"><span class="ti-dot"></span> LIVE DEMO · <b id="ti-dim">MATERIAL</b> REALITY</div>`
    document.body.appendChild(el)
    this.el = el
    this.dimEl = el.querySelector('#ti-dim')
    el.querySelectorAll('button').forEach((b) =>
      b.addEventListener('click', () => {
        ctx.audio.init()
        ctx.audio.play('ui')
        this.action(b.dataset.a)
      })
    )
    el.querySelectorAll('button').forEach((b) => b.addEventListener('mouseenter', () => ctx.audio.play('hover')))
    this.lureA = 0
  }

  show() {
    const ctx = this.ctx
    this.active = true
    this.el.classList.remove('hidden')
    document.body.classList.add('title-open')
    ctx.game.enterTitle()
    ctx.cinematic.play(attractShots(), { loop: true, bars: 0, skippable: false })
    // demo squad
    for (const [type, x, z, d] of [
      ['stalker', -30, -30, 0.2],
      ['stalker', 28, -22, 0.6],
      ['stalker', -24, 30, 1.0],
      ['warden', 30, 22, 1.4],
    ])
      ctx.enemies.spawn(type, new THREE.Vector3(x, 0, z), d)
  }

  hide() {
    this.active = false
    this.el.classList.add('hidden')
    document.body.classList.remove('title-open')
  }

  action(a) {
    const ctx = this.ctx
    if (a === 'operators' || a === 'settings') {
      ctx.menu.openFromTitle(a)
      return
    }
    this.hide()
    ctx.cinematic.stop()
    if (a === 'campaign') ctx.game.startCampaign()
    else if (a === 'combat') ctx.game.startCombat()
    else if (a === 'intro') ctx.game.startCampaign({ introOnly: true })
  }

  // keep the demo alive: the decoy circles the plaza so enemies chase and shoot
  update(dt) {
    if (!this.active) return
    const ctx = this.ctx
    this.lureA += dt * 0.18
    const pl = ctx.player
    pl.pos.set(Math.cos(this.lureA) * 13, 0, Math.sin(this.lureA) * 13)
    pl.vel.set(0, 0, 0)
    if (ctx.enemies.aliveCount < 3) ctx.enemies.spawn('stalker', ctx.arena.spawnPoints[(Math.random() * 8) | 0].clone())
    this.dimEl.textContent = ['MATERIAL', 'INVERTED', 'FRACTURE'][ctx.dims.current]
  }
}
