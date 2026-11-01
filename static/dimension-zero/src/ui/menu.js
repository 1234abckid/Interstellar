// Pause menu (Resume / Operators / Settings / Controls), death and victory
// screens. The Operators tab renders the 3D operator lineup behind the UI.
import { OPERATORS, SKINS } from './operators.js'

const SETTINGS_KEY = 'dz.settings'
export function loadSettings() {
  const d = {
    v: 2,
    sens: 1,
    fov: 78,
    master: 0.8,
    music: 0.55,
    sfx: 0.9,
    quality: 'auto',
    difficulty: 'normal',
    voice: true,
  }
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')
    // v1 saved "high" as the default; move everyone to adaptive quality once
    if (!saved.v) delete saved.quality
    return { ...d, ...saved, v: 2 }
  } catch {
    return d
  }
}
function saveSettings(s) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s))
  } catch {}
}

export class Menu {
  constructor(ctx, root) {
    this.ctx = ctx
    this.root = root
    this.settings = loadSettings()
    this.tab = 'play'
    this.open = false
    this.preview = { op: ctx.selection.op, skin: ctx.selection.skin }
    this.drag = 0
    root.innerHTML = `
      <div id="pause" class="overlay hidden">
        <div class="pm-top">
          <img class="pm-logo" src="assets/logo.webp" alt="Dimension Zero" />
          <nav class="pm-tabs">
            <button data-tab="back" class="back-btn">← BACK</button>
            <button data-tab="play" class="on">PLAY</button>
            <button data-tab="operators">OPERATORS</button>
            <button data-tab="settings">SETTINGS</button>
            <button data-tab="controls">CONTROLS</button>
          </nav>
        </div>
        <section data-pane="play" class="pane on">
          <div class="pm-play">
            <div class="pm-status" id="pm-status"></div>
            <button class="big-btn" id="btn-resume">RESUME <span>→</span></button>
            <button class="ghost-btn" id="btn-restart">RESTART FROM CHECKPOINT</button>
            <button class="ghost-btn" id="btn-quit">QUIT TO MAIN MENU</button>
            <p class="hint">Press <kbd>Esc</kbd> to release the mouse · click Resume to re-enter</p>
          </div>
        </section>
        <section data-pane="operators" class="pane">
          <div class="op-info">
            <h2 id="op-name"></h2><p id="op-tag"></p>
            <div class="op-abil">
              <div><i class="ai bolt"></i>SPEED BOOST</div><div><i class="ai dash"></i>VOID DASH</div><div><i class="ai slam"></i>DIMENSION SLAM</div>
            </div>
            <div class="op-trait"><span>TRAIT</span><b id="op-trait"></b></div>
          </div>
          <div class="skins"><h3>SKINS</h3><div class="skin-grid" id="skin-grid"></div></div>
          <div class="op-strip" id="op-strip"></div>
          <button class="big-btn sel" id="btn-select">SELECT OPERATOR <span>→</span></button>
        </section>
        <section data-pane="settings" class="pane">
          <div class="settings">
            <label>Mouse sensitivity <input type="range" id="s-sens" min="0.2" max="3" step="0.05"><output></output></label>
            <label>Field of view <input type="range" id="s-fov" min="65" max="100" step="1"><output></output></label>
            <label>Master volume <input type="range" id="s-master" min="0" max="1" step="0.05"><output></output></label>
            <label>Music volume <input type="range" id="s-music" min="0" max="1" step="0.05"><output></output></label>
            <label>Effects volume <input type="range" id="s-sfx" min="0" max="1" step="0.05"><output></output></label>
            <label>Graphics quality <select id="s-quality"><option value="auto">Auto (recommended · keeps it smooth)</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High (powerful GPUs)</option></select></label>
            <label>Voice narration <select id="s-voice"><option value="on">On</option><option value="off">Off (subtitles only)</option></select></label>
            <label>Difficulty <select id="s-difficulty"><option value="easy">Recruit</option><option value="normal">Operator</option><option value="hard">Executioner</option></select></label>
          </div>
        </section>
        <section data-pane="controls" class="pane">
          <div class="controls">
            <div><kbd>W A S D</kbd> Move</div><div><kbd>Mouse</kbd> Look</div><div><kbd>Shift</kbd> Sprint</div><div><kbd>Space</kbd> Jump</div>
            <div><kbd>LMB</kbd> Fire · hold to charge Phase Cannon</div><div><kbd>RMB</kbd> Aim down sights</div><div><kbd>1 2 3</kbd> / <kbd>Wheel</kbd> Switch weapon</div><div><kbd>R</kbd> Reload</div>
            <div><kbd>Q</kbd> Shift dimension</div><div><kbd>E</kbd> Void Dash</div><div><kbd>F</kbd> Speed Boost</div><div><kbd>C</kbd> Slide (while sprinting) · in air: Dimension Slam</div>
            <div><kbd>Esc</kbd> Pause / release mouse</div>
          </div>
          <div class="tips">
            <h3>FIELD NOTES</h3>
            <p><b class="c-cyan">MATERIAL</b> — stable ground. Void Wardens are shielded (cyan bubble). Cyan cover blocks are solid.</p>
            <p><b class="c-violet">INVERTED</b> — gravity weakens. The east sky-bridge assembles from the foundry walkway to the perch. Rift Stalkers lose footing and cannot lunge.</p>
            <p><b class="c-pink">FRACTURE</b> — Warden shields shatter, the vault door folds open, a staircase and portals appear. Cyan cover becomes intangible, amber rifts burn and stability drains.</p>
            <p>The <b>Phase Cannon</b> pierces violet energy barriers and enemies, and strips Warden shields in any reality. Shoot amber canisters to detonate them; the <b>Singularity</b> drags enemies and debris into a collapsing well.</p>
          </div>
        </section>
      </div>
      <div id="death" class="overlay hidden">
        <div class="end-card red">
          <div class="end-sub">SIGNAL LOST</div><h1>YOU WERE ERASED</h1>
          <div class="end-stats" id="death-stats"></div>
          <button class="big-btn" id="btn-redeploy">REDEPLOY <span>→</span></button>
          <p class="hint">or press <kbd>R</kbd></p>
        </div>
      </div>
      <div id="victory" class="overlay hidden">
        <div class="end-card cyan">
          <div class="end-sub">DIMENSIONAL CORE ACTIVATED</div><h1>REALITY STABILISED</h1>
          <div class="end-stats" id="vic-stats"></div>
          <button class="big-btn" id="btn-again">PLAY AGAIN <span>→</span></button>
          <button class="ghost-btn" id="btn-menu">MAIN MENU</button>
        </div>
      </div>`
    const $ = (s) => root.querySelector(s)
    this.el = { pause: $('#pause'), death: $('#death'), victory: $('#victory') }
    root
      .querySelectorAll('.pm-tabs button')
      .forEach((b) =>
        b.addEventListener('click', () => (b.dataset.tab === 'back' ? this.closeAll() : this.setTab(b.dataset.tab)))
      )
    $('#btn-resume').addEventListener('click', () => this.resume())
    $('#btn-restart').addEventListener('click', () => {
      this.closeAll()
      this.ctx.game.redeploy()
    })
    $('#btn-quit').addEventListener('click', () => {
      this.closeAll()
      this.ctx.game.toTitle()
    })
    $('#btn-redeploy').addEventListener('click', () => this.redeploy())
    $('#btn-again').addEventListener('click', () => {
      this.closeAll()
      this.ctx.game.startCombat()
    })
    $('#btn-menu').addEventListener('click', () => {
      this.closeAll()
      this.ctx.game.toTitle()
    })
    $('#btn-select').addEventListener('click', () => {
      ctx.game.setSelection(this.preview)
      ctx.audio.play('power')
      this.renderOperators()
      if (this.fromTitle) this.closeAll()
      else this.setTab('play')
    })
    // operators UI
    const grid = $('#skin-grid')
    grid.innerHTML = SKINS.map(
      (s, i) => `<button class="skin" data-i="${i}"><img src="${s.thumb}" alt=""><span>${s.name}</span></button>`
    ).join('')
    grid.querySelectorAll('.skin').forEach((b) =>
      b.addEventListener('click', () => {
        this.preview.skin = +b.dataset.i
        ctx.audio.play('ui')
        this.renderOperators()
      })
    )
    const strip = $('#op-strip')
    strip.innerHTML = OPERATORS.map(
      (o, i) => `<button class="op" data-i="${i}"><img src="${o.portrait}" alt=""></button>`
    ).join('')
    strip.querySelectorAll('.op').forEach((b) =>
      b.addEventListener('click', () => {
        this.preview.op = +b.dataset.i
        ctx.audio.play('ui')
        this.renderOperators()
      })
    )
    // drag to rotate preview
    let dragging = false,
      lx = 0
    root.addEventListener('pointerdown', (e) => {
      if (this.tab === 'operators' && e.target === this.el.pause) {
        dragging = true
        lx = e.clientX
      }
    })
    window.addEventListener('pointerup', () => (dragging = false))
    window.addEventListener('pointermove', (e) => {
      if (dragging) {
        this.drag += (e.clientX - lx) * 0.01
        lx = e.clientX
      }
    })
    // settings
    const bind = (id, key, fmt = (v) => v) => {
      const inp = $('#' + id)
      inp.value = this.settings[key]
      const out = inp.parentElement.querySelector('output')
      if (out) out.textContent = fmt(this.settings[key])
      inp.addEventListener('input', () => {
        this.settings[key] = inp.type === 'range' ? +inp.value : inp.value
        if (out) out.textContent = fmt(this.settings[key])
        this.applySettings()
        saveSettings(this.settings)
      })
    }
    bind('s-sens', 'sens', (v) => (+v).toFixed(2))
    bind('s-fov', 'fov', (v) => v + '°')
    bind('s-master', 'master', (v) => Math.round(v * 100) + '%')
    bind('s-music', 'music', (v) => Math.round(v * 100) + '%')
    bind('s-sfx', 'sfx', (v) => Math.round(v * 100) + '%')
    bind('s-quality', 'quality')
    bind('s-difficulty', 'difficulty')
    {
      const v = $('#s-voice')
      v.value = this.settings.voice === false ? 'off' : 'on'
      v.addEventListener('change', () => {
        this.settings.voice = v.value === 'on'
        if (!this.settings.voice) window.speechSynthesis?.cancel()
        saveSettings(this.settings)
      })
    }
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyR' && !this.el.death.classList.contains('hidden')) this.redeploy()
      if (e.code === 'Escape' && this.fromTitle) this.closeAll()
    })
  }

  applySettings() {
    const ctx = this.ctx
    const s = this.settings
    ctx.input.sensitivity = s.sens
    ctx.baseFov = s.fov
    ctx.audio.settings.master = s.master
    ctx.audio.settings.music = s.music
    ctx.audio.settings.sfx = s.sfx
    ctx.audio.applySettings()
    if (ctx.R.quality !== s.quality) {
      ctx.R.setQuality(s.quality)
      ctx.applyQuality?.(s.quality)
    }
    ctx.game.enemyDamageMul = { easy: 0.6, normal: 1, hard: 1.45 }[s.difficulty] ?? 1
  }

  setTab(t) {
    this.tab = t
    this.root.querySelectorAll('.pm-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === t))
    this.root.querySelectorAll('.pane').forEach((p) => p.classList.toggle('on', p.dataset.pane === t))
    this.el.pause.classList.toggle('showcase', t === 'operators')
    if (t === 'operators') {
      this.preview = { op: this.ctx.selection.op, skin: this.ctx.selection.skin }
      this.renderOperators()
    }
    this.ctx.audio.play('ui')
  }

  renderOperators() {
    const op = OPERATORS[this.preview.op]
    const r = this.root
    r.querySelector('#op-name').textContent = op.name
    r.querySelector('#op-tag').textContent = op.tagline
    r.querySelector('#op-trait').textContent = op.trait
    r.querySelectorAll('.skin').forEach((b, i) => {
      b.classList.toggle('on', i === this.preview.skin)
      b.classList.toggle('equipped', i === this.ctx.selection.skin)
    })
    r.querySelectorAll('.op').forEach((b, i) => b.classList.toggle('on', i === this.preview.op))
    const same = this.preview.op === this.ctx.selection.op && this.preview.skin === this.ctx.selection.skin
    r.querySelector('#btn-select').classList.toggle('equipped', same)
    r.querySelector('#btn-select').firstChild.textContent = same ? 'EQUIPPED ' : 'SELECT OPERATOR '
    this.ctx.showcase.rebuild(this.preview)
  }

  get showcaseActive() {
    return this.open && this.tab === 'operators'
  }

  pause() {
    if (this.ctx.game.state !== 'playing') return
    this.ctx.game.state = 'paused'
    this.open = true
    document.body.classList.add('menu-open')
    this.el.pause.classList.remove('hidden')
    const g = this.ctx.game
    this.root.querySelector('#pm-status').innerHTML =
      `<span>WAVE <b>${Math.min(g.wave, 3) || 1}/3</b></span><span>ELIMINATIONS <b>${g.kills}</b></span><span>TIME <b>${fmtTime(g.elapsed)}</b></span>`
    this.setTab('play')
    this.ctx.audio.stop('charge')
  }

  // Operators / Settings opened from the title screen
  openFromTitle(tab) {
    this.fromTitle = true
    this.open = true
    document.body.classList.add('menu-open')
    this.el.pause.classList.remove('hidden')
    this.el.pause.classList.add('from-title')
    this.root.querySelector('#pm-status').innerHTML = ''
    this.setTab(tab)
  }

  closeAll() {
    this.el.pause.classList.add('hidden')
    this.el.pause.classList.remove('from-title')
    this.el.death.classList.add('hidden')
    this.el.victory.classList.add('hidden')
    document.body.classList.remove('menu-open')
    this.open = false
    this.fromTitle = false
  }

  resume() {
    if (this.fromTitle) {
      this.closeAll()
      return
    }
    this.ctx.audio.init()
    this.el.pause.classList.add('hidden')
    document.body.classList.remove('menu-open')
    this.open = false
    if (this.ctx.game.state === 'paused') this.ctx.game.state = 'playing'
    this.ctx.input.lock()
    // browsers refuse a re-lock shortly after Esc; fall back to the pause menu instead of playing without mouse-look
    if (!this.ctx.input.testMode)
      setTimeout(() => {
        if (!this.ctx.input.locked && this.ctx.game.state === 'playing') {
          this.pause()
          this.root
            .querySelector('#pm-status')
            .insertAdjacentHTML(
              'beforeend',
              '<span class="warn">Mouse capture was blocked by the browser · click Resume again</span>'
            )
        }
      }, 700)
  }

  showDeath(st) {
    document.body.classList.add('menu-open')
    this.root.querySelector('#death-stats').innerHTML = statsHTML(st)
    setTimeout(() => {
      this.el.death.classList.remove('hidden')
      this.ctx.input.unlock()
    }, 1100)
  }

  showVictory(st) {
    document.body.classList.add('menu-open')
    this.root.querySelector('#vic-stats').innerHTML = statsHTML(st)
    this.el.victory.classList.remove('hidden')
    this.ctx.input.unlock()
  }

  redeploy() {
    this.closeAll()
    this.ctx.game.redeploy()
  }
}

function fmtTime(t) {
  const m = Math.floor(t / 60),
    s = Math.floor(t % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}
function statsHTML(s) {
  return `<div><span>TIME</span><b>${fmtTime(s.time)}</b></div><div><span>ELIMINATIONS</span><b>${s.kills}</b></div><div><span>ACCURACY</span><b>${s.acc}%</b></div><div><span>WAVE</span><b>${s.wave}/3</b></div><div><span>DAMAGE TAKEN</span><b>${s.dmg}</b></div>`
}
