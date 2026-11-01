// Narrator: queued story dialogue shown as cinematic subtitles (speaker name +
// typewriter text) with a comms chirp, optionally voiced through the browser's
// built-in speech synthesis (toggle in Settings). Lines advance on timers so
// the story never blocks gameplay.
import { SPEAKERS, LINES } from './script.js'

export class Narrator {
  constructor(ctx) {
    this.ctx = ctx
    this.queue = []
    this.cur = null
    this.el = document.createElement('div')
    this.el.id = 'subs'
    this.el.innerHTML = '<div class="sub-who"></div><div class="sub-text"></div>'
    document.body.appendChild(this.el)
    this.who = this.el.querySelector('.sub-who')
    this.text = this.el.querySelector('.sub-text')
    this.voice = null
    this.synth = typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null
    if (this.synth) {
      const pick = () => {
        const vs = this.synth.getVoices()
        this.voice =
          vs.find((v) => /en[-_](US|GB)/i.test(v.lang) && /natural|neural|google|samantha|daniel/i.test(v.name)) ||
          vs.find((v) => /^en/i.test(v.lang)) ||
          null
      }
      pick()
      this.synth.onvoiceschanged = pick
    }
  }

  get voiceOn() {
    return this.ctx.menu?.settings?.voice !== false
  }
  get busy() {
    return !!this.cur || this.queue.length > 0
  }

  // say('w1') or say(['ARC', 'text']); opts.interrupt clears pending lines
  say(line, opts = {}) {
    const l = typeof line === 'string' ? LINES[line] : line
    if (!l) return
    if (opts.interrupt) this.clear()
    this.queue.push({ who: l[0], text: l[1], dur: l[2], delay: opts.delay || 0, onEnd: opts.onEnd })
  }
  sayMany(ids, gap = 0.35) {
    ids.forEach((id, i) => this.say(id, { delay: i ? gap : 0 }))
  }

  clear() {
    this.queue.length = 0
    this.cur = null
    this.el.classList.remove('show')
    if (this.synth) this.synth.cancel()
  }

  start(item) {
    const sp = SPEAKERS[item.who] || SPEAKERS.ARC
    const words = item.text.split(/\s+/).length
    item.t = 0
    item.len = item.dur || Math.max(2.4, words * 0.34 + 0.9)
    item.spoken = false
    item.speaking = false
    this.cur = item
    this.who.textContent = sp.name
    this.who.style.color = sp.color
    this.el.style.setProperty('--sc', sp.color)
    this.el.classList.toggle('choir', !!sp.caps)
    this.text.textContent = ''
    this.el.classList.add('show')
    if (sp.radio) this.ctx.audio?.play('radio')
    else if (sp.caps) this.ctx.audio?.play('choir')
    if (this.voiceOn && this.synth && !sp.silent) {
      try {
        this.synth.cancel()
        const u = new SpeechSynthesisUtterance(item.text.replace(/…|\.\.\./g, ', '))
        if (this.voice) u.voice = this.voice
        u.pitch = sp.pitch
        u.rate = sp.rate
        u.volume = Math.min(1, (this.ctx.audio?.settings?.master ?? 0.8) * 1.1)
        item.speaking = true
        u.onend = u.onerror = () => (item.speaking = false)
        this.synth.speak(u)
      } catch (e) {
        item.speaking = false
      }
    }
  }

  update(dt) {
    if (!this.cur) {
      if (!this.queue.length) return
      const n = this.queue[0]
      n.delay -= dt
      if (n.delay > 0) return
      this.queue.shift()
      this.start(n)
    }
    const c = this.cur
    c.t += dt
    // typewriter reveal over the first ~40% of the line
    const k = Math.min(1, c.t / Math.max(0.6, c.len * 0.4))
    const n = Math.floor(c.text.length * k)
    if (n !== c.shown) {
      c.shown = n
      this.text.textContent = c.text.slice(0, n)
    }
    const done = c.t >= c.len && (!c.speaking || c.t > c.len * 1.3)
    if (done) {
      this.cur = null
      if (!this.queue.length) this.el.classList.remove('show')
      c.onEnd?.()
    }
  }
}
