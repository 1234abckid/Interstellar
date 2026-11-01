// HUD: an integrated combat interface (DOM overlay). Updates are throttled and
// written only when values change to avoid layout thrash.
import * as THREE from 'three'
import { WEAPON_DEFS } from '../weapons/weapons.js'
import { DIMS } from '../world/dimension.js'

const ICONS = {
  cross: '<svg viewBox="0 0 24 24"><path d="M9 2h6v7h7v6h-7v7H9v-7H2V9h7z"/></svg>',
  ammo: '<svg viewBox="0 0 24 24"><path d="M5 9l2-5 2 5v11H5zM11 9l2-5 2 5v11h-4zM17 9l2-5 2 5v11h-4z"/></svg>',
  swirl: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 12c0-2 2-3 3.5-2S17 13 15 15s-6 1-7-2 1-7 5-8 8 2 8 7-4 9-9 9"/></svg>',
  dash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 12h9M5 8h7M5 16h7"/><path d="M13 5l7 7-7 7z" fill="currentColor"/></svg>',
  bolt: '<svg viewBox="0 0 24 24"><path d="M13 2L4 14h6l-1 8 9-12h-6z"/></svg>',
  slam: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3v12M7 10l5 5 5-5"/><path d="M3 20h18"/></svg>',
  diamond: '<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M20 2l18 18-18 18L2 20z"/><path d="M20 9l3 8 8 3-8 3-3 8-3-8-8-3 8-3z" fill="currentColor" stroke="none"/></svg>',
  skull: '<svg viewBox="0 0 24 24"><path d="M12 2C7 2 4 5.5 4 10c0 2.5 1 4.2 2.5 5.3V19h2.5v-2h2v2h2v-2h2v2h2.5v-3.7C19 14.2 20 12.5 20 10c0-4.5-3-8-8-8zm-3.5 8a1.8 1.8 0 110 3.6 1.8 1.8 0 010-3.6zm7 0a1.8 1.8 0 110 3.6 1.8 1.8 0 010-3.6z"/></svg>',
}

export class HUD {
  constructor(ctx, root) {
    this.ctx = ctx
    this.root = root
    root.innerHTML = `
    <div class="hud-vignette" id="vg-dmg"></div>
    <div class="hud-vignette" id="vg-low"></div>
    <div class="hud-vignette" id="vg-frac"></div>
    <div id="dmg-ind"></div>
    <div class="hud-tl panel">
      <div class="hp-row"><span class="ico">${ICONS.cross}</span><span id="hp-num">100</span>
        <div class="hp-bar"><div id="hp-fill"></div><div id="hp-ghost"></div></div></div>
      <div class="sub-row"><span id="oc-tag" class="tag violet hidden">OVERCHARGE <b id="oc-t">15</b></span><span id="boost-tag" class="tag cyan hidden">SPEED BOOST</span></div>
    </div>
    <div class="hud-tc">
      <div class="obj-label"><span class="obj-dia"></span>OBJECTIVE</div>
      <div id="obj-text">Eliminate the alien threat</div>
      <div class="obj-row"><span id="wave-tag">WAVE 1/3</span><span class="obj-sep"></span><span class="ico sm">${ICONS.skull}</span><span id="threat">0 / 0</span></div>
      <div class="core-pips"><i></i><i></i><i></i></div>
    </div>
    <div class="hud-tr panel">
      <div class="ammo-row"><span id="ammo-mag">30</span><span class="ammo-sep"></span><span id="ammo-res">150</span><span class="ico">${ICONS.ammo}</span></div>
      <div id="energy" class="energy hidden"><div id="energy-fill"></div></div>
      <div id="wpn-name">PULSE RIFLE</div>
      <div id="reload-tag" class="tag amber hidden">RELOADING</div>
    </div>
    <div class="hud-dim" id="dim-panel">
      <div class="dim-head"><span class="dim-ico">${ICONS.diamond}</span><div><div class="dim-label">DIMENSION</div><div id="dim-name">MATERIAL</div></div></div>
      <ul id="dim-rules"></ul>
      <div id="stab" class="stab hidden"><div class="stab-label">STABILITY</div><div class="stab-bar"><div id="stab-fill"></div></div></div>
    </div>
    <div class="hud-bl"><canvas id="radar" width="176" height="176"></canvas></div>
    <div class="hud-bc" id="wpn-slots"></div>
    <div class="hud-br" id="abilities">
      <div class="ab" data-k="Q"><div class="ab-ico">${ICONS.swirl}</div><div class="ab-cd"></div><span>Q</span></div>
      <div class="ab" data-k="E"><div class="ab-ico">${ICONS.dash}</div><div class="ab-cd"></div><span>E</span></div>
      <div class="ab" data-k="F"><div class="ab-ico">${ICONS.bolt}</div><div class="ab-cd"></div><span>F</span></div>
      <div class="ab small" data-k="C"><div class="ab-ico">${ICONS.slam}</div><div class="ab-cd"></div><span>C</span></div>
    </div>
    <div id="crosshair"><i class="t"></i><i class="b"></i><i class="l"></i><i class="r"></i><b></b>
      <svg id="charge-ring" viewBox="0 0 60 60"><circle cx="30" cy="30" r="24" /></svg></div>
    <div id="hitmarker"><i></i><i></i><i></i><i></i></div>
    <div id="banner"><div class="b-sub"></div><div class="b-main"></div></div>
    <div id="toasts"></div>
    <div id="prompt" class="hidden"></div>
    <div id="dmg-nums"></div>
    <div id="killfeed"></div>`
    const $ = (id) => root.querySelector('#' + id)
    this.el = {
      hpNum: $('hp-num'),
      hpFill: $('hp-fill'),
      hpGhost: $('hp-ghost'),
      ocTag: $('oc-tag'),
      ocT: $('oc-t'),
      boostTag: $('boost-tag'),
      objText: $('obj-text'),
      wave: $('wave-tag'),
      threat: $('threat'),
      pips: root.querySelectorAll('.core-pips i'),
      mag: $('ammo-mag'),
      res: $('ammo-res'),
      energy: $('energy'),
      energyFill: $('energy-fill'),
      wpn: $('wpn-name'),
      reload: $('reload-tag'),
      dimPanel: $('dim-panel'),
      dimName: $('dim-name'),
      dimRules: $('dim-rules'),
      stab: $('stab'),
      stabFill: $('stab-fill'),
      radar: $('radar'),
      cross: $('crosshair'),
      charge: root.querySelector('#charge-ring circle'),
      hit: $('hitmarker'),
      banner: $('banner'),
      toasts: $('toasts'),
      prompt: $('prompt'),
      vgDmg: $('vg-dmg'),
      vgLow: $('vg-low'),
      vgFrac: $('vg-frac'),
      dmgInd: $('dmg-ind'),
      nums: $('dmg-nums'),
      feed: $('killfeed'),
      slots: $('wpn-slots'),
    }
    this.ab = {}
    root.querySelectorAll('.ab').forEach((a) => (this.ab[a.dataset.k] = { el: a, cd: a.querySelector('.ab-cd') }))
    this.el.slots.innerHTML = WEAPON_DEFS.map((w, i) => `<div class="slot" data-i="${i}"><span>${i + 1}</span>${w.short}</div>`).join('')
    this.slotEls = [...this.el.slots.querySelectorAll('.slot')]
    this.rctx = this.el.radar.getContext('2d')
    this.cache = {}
    this.radarT = 0
    this.dmgFlash = 0
    this.ghostHp = 100
    this.hitT = 0
    this.bannerT = 0
    this.numPool = []
    for (let i = 0; i < 16; i++) {
      const d = document.createElement('div')
      d.className = 'dnum'
      this.el.nums.appendChild(d)
      this.numPool.push({ d, t: 1, pos: new THREE.Vector3(), vy: 0 })
    }
    this.numHead = 0
    this.indPool = []
    for (let i = 0; i < 6; i++) {
      const d = document.createElement('div')
      d.className = 'ind'
      this.el.dmgInd.appendChild(d)
      this.indPool.push({ d, t: 1, from: new THREE.Vector3(), has: false })
    }
    this.indHead = 0
    this.setDimension(0)
    this.onWeaponChange(0)
  }

  set(key, el, val, prop = 'textContent') {
    if (this.cache[key] === val) return
    this.cache[key] = val
    el[prop] = val
  }

  setDimension(i) {
    const d = DIMS[i]
    this.el.dimName.textContent = d.name
    this.el.dimRules.innerHTML = d.rules.map((r) => `<li>${r}</li>`).join('')
    this.root.style.setProperty('--dim', d.css)
    this.el.dimPanel.classList.remove('flash')
    void this.el.dimPanel.offsetWidth
    this.el.dimPanel.classList.add('flash')
  }

  onWeaponChange(i) {
    this.slotEls.forEach((s, k) => s.classList.toggle('on', k === i))
    this.el.wpn.textContent = WEAPON_DEFS[i].name
    this.el.energy.classList.toggle('hidden', !WEAPON_DEFS[i].energy)
    this.el.cross.dataset.w = WEAPON_DEFS[i].id
  }

  banner(main, sub = '', color = null, dur = 2.4) {
    this.el.banner.querySelector('.b-main').textContent = main
    this.el.banner.querySelector('.b-sub').textContent = sub
    this.el.banner.style.setProperty('--bc', color || 'var(--dim)')
    this.el.banner.classList.remove('show')
    void this.el.banner.offsetWidth
    this.el.banner.classList.add('show')
    this.bannerT = dur
  }

  toast(text, color = 'cyan') {
    const d = document.createElement('div')
    d.className = 'toast ' + color
    d.textContent = text
    this.el.toasts.appendChild(d)
    while (this.el.toasts.children.length > 4) this.el.toasts.firstChild.remove()
    setTimeout(() => d.classList.add('out'), 1800)
    setTimeout(() => d.remove(), 2300)
  }

  feed(text) {
    const d = document.createElement('div')
    d.className = 'kf'
    d.innerHTML = text
    this.el.feed.prepend(d)
    while (this.el.feed.children.length > 5) this.el.feed.lastChild.remove()
    setTimeout(() => d.classList.add('out'), 3000)
    setTimeout(() => d.remove(), 3500)
  }

  prompt(text) {
    if (this.cache.prompt === text) return
    this.cache.prompt = text
    this.el.prompt.classList.toggle('hidden', !text)
    if (text) this.el.prompt.innerHTML = text
  }

  pulseAbility(k) {
    const a = this.ab[k]
    if (!a) return
    a.el.classList.remove('pulse')
    void a.el.offsetWidth
    a.el.classList.add('pulse')
  }

  hitMarker(crit, kill, shielded) {
    const h = this.el.hit
    h.className = kill ? 'kill' : crit ? 'crit' : shielded ? 'shield' : 'hit'
    void h.offsetWidth
    h.classList.add('show')
    this.hitT = kill ? 0.35 : 0.15
  }

  damageNumber(pos, amount, crit, shielded) {
    if (amount < 0.5) return
    const n = this.numPool[this.numHead]
    this.numHead = (this.numHead + 1) % this.numPool.length
    n.pos.copy(pos)
    n.pos.x += (Math.random() - 0.5) * 0.4
    n.t = 0
    n.d.textContent = Math.round(amount)
    n.d.className = 'dnum show' + (crit ? ' crit' : '') + (shielded ? ' shield' : '')
  }

  onDamage(amount, fromPos, type) {
    this.dmgFlash = Math.min(1, this.dmgFlash + amount / 30)
    if (!fromPos) return
    const ind = this.indPool[this.indHead]
    this.indHead = (this.indHead + 1) % this.indPool.length
    ind.from.copy(fromPos)
    ind.t = 0
    ind.has = true
  }

  update(dt) {
    const ctx = this.ctx
    const pl = ctx.player
    const w = ctx.weapons
    const el = this.el
    // health
    const hp = Math.ceil(pl.health)
    this.set('hp', el.hpNum, String(hp))
    const frac = pl.health / pl.maxHealth
    this.set('hpw', el.hpFill.style, (frac * 100).toFixed(1) + '%', 'width')
    this.ghostHp += (pl.health - this.ghostHp) * Math.min(1, dt * (this.ghostHp > pl.health ? 2.5 : 20))
    el.hpGhost.style.width = ((this.ghostHp / pl.maxHealth) * 100).toFixed(1) + '%'
    el.hpFill.classList.toggle('low', frac < 0.3)
    el.ocTag.classList.toggle('hidden', pl.overcharge <= 0)
    if (pl.overcharge > 0) this.set('oc', el.ocT, String(Math.ceil(pl.overcharge)))
    el.boostTag.classList.toggle('hidden', pl.boostT <= 0)
    // ammo
    const d = w.def,
      s = w.cur
    if (d.energy) {
      this.set('mag', el.mag, String(Math.floor(s.energy / d.cost)))
      this.set('res', el.res, Math.floor(s.energy) + '%')
      el.energyFill.style.width = s.energy + '%'
      el.energyFill.classList.toggle('low', s.energy < d.cost)
    } else {
      this.set('mag', el.mag, String(s.mag))
      this.set('res', el.res, String(s.reserve))
    }
    el.mag.classList.toggle('low', !d.energy && s.mag <= Math.ceil(d.mag * 0.2))
    el.reload.classList.toggle('hidden', w.reloading <= 0)
    // dimension
    const dims = ctx.dims
    el.stab.classList.toggle('hidden', dims.current !== 2 && dims.stability >= 1)
    el.stabFill.style.width = (dims.stability * 100).toFixed(1) + '%'
    el.stabFill.classList.toggle('low', dims.stability < 0.3)
    // abilities
    const cdSet = (k, frac, ready) => {
      const a = this.ab[k]
      a.cd.style.setProperty('--p', (frac * 100).toFixed(1) + '%')
      a.el.classList.toggle('ready', ready)
    }
    cdSet('Q', dims.cooldown / dims.COOLDOWN, dims.cooldown <= 0)
    cdSet('E', pl.dashCD / pl.DASH_CD, pl.dashCD <= 0)
    cdSet('F', pl.boostCD / pl.BOOST_CD, pl.boostCD <= 0)
    cdSet('C', pl.slamCD / pl.SLAM_CD, pl.slamCD <= 0)
    // crosshair spread
    const spread = 6 + w.bloom * 16 + (Math.hypot(pl.vel.x, pl.vel.z) > 1 ? 5 : 0) + (pl.onGround ? 0 : 8)
    const adsK = ctx.viewmodel.ads
    el.cross.style.setProperty('--s', (spread * (1 - adsK * 0.6)).toFixed(1) + 'px')
    el.cross.style.opacity = pl.sprinting ? 0.25 : 1 - adsK * 0.5
    el.charge.style.strokeDashoffset = String(151 * (1 - w.charge))
    el.cross.classList.toggle('charging', w.charge > 0)
    // hitmarker
    if (this.hitT > 0) {
      this.hitT -= dt
      if (this.hitT <= 0) el.hit.classList.remove('show')
    }
    // vignettes
    this.dmgFlash = Math.max(0, this.dmgFlash - dt * 1.8)
    el.vgDmg.style.opacity = this.dmgFlash.toFixed(3)
    el.vgLow.style.opacity = frac < 0.35 ? (0.4 + Math.sin(ctx.time * 5) * 0.15) * (1 - frac / 0.35) : 0
    el.vgFrac.style.opacity = (dims.w.z * 0.9).toFixed(3)
    // damage direction indicators
    for (const ind of this.indPool) {
      if (!ind.has) continue
      ind.t += dt / 1.4
      if (ind.t >= 1) {
        ind.has = false
        ind.d.style.opacity = 0
        continue
      }
      const ang = Math.atan2(ind.from.x - pl.pos.x, -(ind.from.z - pl.pos.z)) + pl.yaw
      ind.d.style.transform = `rotate(${ang}rad)`
      ind.d.style.opacity = (1 - ind.t).toFixed(2)
    }
    // damage numbers
    const cam = ctx.camera
    const W = window.innerWidth,
      H = window.innerHeight
    for (const n of this.numPool) {
      if (n.t >= 1) continue
      n.t += dt / 0.8
      n.pos.y += dt * 1.2
      const p = n.pos.clone().project(cam)
      if (p.z > 1 || n.t >= 1) {
        n.d.classList.remove('show')
        n.t = 1
        continue
      }
      n.d.style.transform = `translate(${((p.x * 0.5 + 0.5) * W).toFixed(0)}px, ${((-p.y * 0.5 + 0.5) * H).toFixed(0)}px) scale(${1 + (1 - n.t) * 0.2})`
      n.d.style.opacity = (1 - n.t * n.t).toFixed(2)
    }
    if (this.bannerT > 0) {
      this.bannerT -= dt
      if (this.bannerT <= 0) el.banner.classList.remove('show')
    }
    // radar at ~20 Hz
    this.radarT -= dt
    if (this.radarT <= 0) {
      this.radarT = 0.05
      this.drawRadar()
    }
  }

  setObjective(text, wave, waves, alive, total) {
    this.set('obj', this.el.objText, text)
    this.set('wave', this.el.wave, wave > waves ? 'CORE ONLINE' : `WAVE ${wave}/${waves}`)
    this.set('thr', this.el.threat, `${alive} / ${total}`)
  }
  setPips(n) {
    this.el.pips.forEach((p, i) => p.classList.toggle('on', i < n))
  }

  drawRadar() {
    const ctx = this.ctx
    const g = this.rctx
    const S = 176,
      C = S / 2,
      R = 80,
      RANGE = 40
    g.clearRect(0, 0, S, S)
    g.save()
    g.beginPath()
    g.arc(C, C, R, 0, Math.PI * 2)
    g.fillStyle = 'rgba(8,10,22,0.55)'
    g.fill()
    g.clip()
    // grid
    g.strokeStyle = 'rgba(160,190,255,0.12)'
    g.lineWidth = 1
    for (const r of [R * 0.33, R * 0.66]) {
      g.beginPath()
      g.arc(C, C, r, 0, Math.PI * 2)
      g.stroke()
    }
    g.beginPath()
    g.moveTo(C - R, C)
    g.lineTo(C + R, C)
    g.moveTo(C, C - R)
    g.lineTo(C, C + R)
    g.stroke()
    // sweep
    const sweep = (ctx.time * 1.8) % (Math.PI * 2)
    const grd = g.createConicGradient ? g.createConicGradient(sweep, C, C) : null
    if (grd) {
      grd.addColorStop(0, 'rgba(120,200,255,0.18)')
      grd.addColorStop(0.12, 'rgba(120,200,255,0)')
      grd.addColorStop(1, 'rgba(120,200,255,0)')
      g.fillStyle = grd
      g.fillRect(0, 0, S, S)
    }
    const pl = ctx.player
    const cos = Math.cos(pl.yaw),
      sin = Math.sin(pl.yaw)
    const toR = (x, z) => {
      const dx = x - pl.pos.x,
        dz = z - pl.pos.z
      // rotate so player's forward is up
      const rx = dx * cos - dz * sin
      const rz = dx * sin + dz * cos
      return [C + (rx / RANGE) * R, C + (rz / RANGE) * R]
    }
    // island edge
    const [ex, ey] = toR(0, 0)
    g.strokeStyle = 'rgba(98,216,255,0.35)'
    g.beginPath()
    g.arc(ex, ey, (49 / RANGE) * R, 0, Math.PI * 2)
    g.stroke()
    // core
    g.fillStyle = ctx.core.state.ready ? '#62d8ff' : 'rgba(176,123,255,0.9)'
    g.beginPath()
    g.arc(ex, ey, 4, 0, Math.PI * 2)
    g.fill()
    // pickups
    for (const it of ctx.pickups.items) {
      if (!it.active) continue
      const [x, y] = toR(it.pos.x, it.pos.z)
      g.fillStyle = it.type === 'health' ? 'rgba(98,216,255,0.8)' : it.type === 'ammo' ? 'rgba(255,190,80,0.8)' : 'rgba(200,120,255,0.9)'
      g.fillRect(x - 1.5, y - 1.5, 3, 3)
    }
    // enemies
    for (const e of ctx.enemies.list) {
      if (!e.alive) continue
      const [x, y] = toR(e.pos.x, e.pos.z)
      g.fillStyle = '#ff3b4e'
      g.shadowColor = '#ff3b4e'
      g.shadowBlur = 6
      g.beginPath()
      g.arc(x, y, e.type === 'warden' ? 4 : 3, 0, Math.PI * 2)
      g.fill()
    }
    g.shadowBlur = 0
    g.restore()
    g.strokeStyle = 'rgba(190,210,255,0.45)'
    g.lineWidth = 1.5
    g.beginPath()
    g.arc(C, C, R, 0, Math.PI * 2)
    g.stroke()
    // player arrow
    g.fillStyle = '#e8eeff'
    g.beginPath()
    g.moveTo(C, C - 7)
    g.lineTo(C + 5, C + 5)
    g.lineTo(C, C + 2)
    g.lineTo(C - 5, C + 5)
    g.closePath()
    g.fill()
  }
}
