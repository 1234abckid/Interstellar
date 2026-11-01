// Narrator: queued story dialogue shown as cinematic subtitles (speaker name +
// typewriter text) with a comms chirp, voiced through the browser's speech
// engine. Each line is held until the voice has actually finished, so the
// spoken story never gets cut off; cinematics wait on the narrator too.
//
// Browser-speech pitfalls handled here:
//  - speech must be unlocked from a user gesture (Safari / some Chrome builds)
//  - speak() issued right after cancel() is silently dropped by Chrome
//  - Chrome stops long utterances after ~15 s unless resume() is called
//  - voices load asynchronously and differ per OS/browser
import { SPEAKERS, LINES } from './script.js'

const MALE =
  /(guy|ryan|christopher|eric|davis|andrew|brian|daniel|george|arthur|oliver|thomas|male|david|mark|james|alex|fred|roger|steffan|william|liam|noah)/i
const FEMALE =
  /(aria|jenny|sonia|libby|emma|ava|michelle|samantha|karen|serena|moira|tessa|female|zira|hazel|susan|victoria|ana|natasha|clara|maisie|google us english|google uk english female)/i
const QUALITY = /(natural|neural|online|premium|enhanced|google)/i

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
    this.voices = {}
    this.voiceBroken = false
    this.unlocked = false
    this.synth = typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null
    if (this.synth) {
      this.pickVoices()
      this.synth.addEventListener?.('voiceschanged', () => this.pickVoices())
    }
  }

  // Choose a distinct, natural-sounding English voice for each character.
  pickVoices() {
    const all = this.synth.getVoices().filter((v) => /^en/i.test(v.lang))
    if (!all.length) return
    const score = (v, want) => {
      let s = 0
      if (QUALITY.test(v.name)) s += 4
      if (want === 'm' && MALE.test(v.name)) s += 3
      if (want === 'f' && FEMALE.test(v.name)) s += 3
      if (want === 'm' && FEMALE.test(v.name)) s -= 3
      if (want === 'f' && MALE.test(v.name)) s -= 3
      if (v.localService === false) s += 1 // cloud voices are usually the natural ones
      if (/en[-_]GB/i.test(v.lang) && want === 'm') s += 0.5
      return s
    }
    const best = (want, avoid) =>
      all.filter((v) => v !== avoid).sort((a, b) => score(b, want) - score(a, want))[0] || all[0]
    this.voices.ARC = best('m')
    this.voices.VAEL = best('f')
    this.voices.CHOIR = best('m', this.voices.ARC) || this.voices.ARC
  }

  get voiceOn() {
    return this.ctx.menu?.settings?.voice !== false && !!this.synth
  }
  get busy() {
    return !!this.cur || this.queue.length > 0
  }

  // Must be called from a click/keypress handler: primes the speech engine.
  unlock() {
    if (!this.synth || this.unlocked) return
    this.unlocked = true
    try {
      this.synth.cancel()
      const u = new SpeechSynthesisUtterance(' ')
      u.volume = 0
      this.synth.speak(u)
      this.synth.resume()
    } catch {}
  }

  // Rough spoken length (seconds) for planning cinematic shots.
  estimate(line) {
    const l = typeof line === 'string' ? LINES[line] : line
    if (!l) return 0
    const sp = SPEAKERS[l[0]] || SPEAKERS.ARC
    const words = l[1].split(/\s+/).length
    const subs = l[2] || Math.max(2.4, words * 0.34 + 0.9)
    if (!this.voiceOn || sp.silent || this.voiceBroken) return subs
    return Math.max(subs, l[1].length / (14 * sp.rate) + 0.8)
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
    this.ctx.audio?.duck(false)
    if (this.synth && (this.synth.speaking || this.synth.pending)) this.synth.cancel()
  }

  start(item) {
    const sp = SPEAKERS[item.who] || SPEAKERS.ARC
    const words = item.text.split(/\s+/).length
    item.t = 0
    item.len = item.dur || Math.max(2.4, words * 0.34 + 0.9)
    item.speaking = false
    item.started = false
    this.cur = item
    this.who.textContent = sp.name
    this.who.style.color = sp.color
    this.el.style.setProperty('--sc', sp.color)
    this.el.classList.toggle('choir', !!sp.caps)
    this.text.textContent = ''
    this.el.classList.add('show')
    if (sp.radio) this.ctx.audio?.play('radio')
    else if (sp.caps) this.ctx.audio?.play('choir')
    if (this.voiceOn && !sp.silent && !this.voiceBroken) {
      // give the subtitle at least as long as the voice is likely to need
      item.len = Math.max(item.len, item.text.length / (14 * sp.rate) + 0.8)
      const u = new SpeechSynthesisUtterance(item.text.replace(/…|\.\.\./g, ', ').replace(/—/g, ', '))
      const v = this.voices[item.who] || this.voices.ARC
      if (v) {
        u.voice = v
        u.lang = v.lang
      } else u.lang = 'en-US'
      u.pitch = sp.pitch
      u.rate = sp.rate
      u.volume = Math.min(1, (this.ctx.audio?.settings?.master ?? 0.8) * 1.15)
      u.onstart = () => (item.started = true)
      u.onend = u.onerror = () => (item.speaking = false)
      item.speaking = true
      item.utter = u
      this.ctx.audio?.duck(true)
      const go = () => {
        if (this.cur !== item) return
        try {
          this.synth.speak(u)
          this.synth.resume()
        } catch {
          item.speaking = false
        }
      }
      // Chrome drops speak() calls issued in the same tick as cancel()
      if (this.synth.speaking || this.synth.pending) {
        this.synth.cancel()
        setTimeout(go, 90)
      } else go()
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
    // keep Chrome's speech engine awake during long lines
    if (c.speaking && this.synth && Math.floor(c.t / 3) !== Math.floor((c.t - dt) / 3)) this.synth.resume()
    // a voice that never starts is treated as unavailable: subtitles carry on alone
    if (c.speaking && !c.started && c.t > 2.5) {
      c.speaking = false
      if (!this.voiceBroken) {
        this.voiceBroken = true
        this.ctx.hud?.toast('VOICE UNAVAILABLE IN THIS BROWSER · SUBTITLES ON', 'amber')
      }
    }
    // typewriter reveal over the first ~45% of the line
    const k = Math.min(1, c.t / Math.max(0.6, c.len * 0.45))
    const n = Math.floor(c.text.length * k)
    if (n !== c.shown) {
      c.shown = n
      this.text.textContent = c.text.slice(0, n)
    }
    // the line ends when its time is up AND the voice has finished (safety cap)
    const done = c.t >= c.len && (!c.speaking || c.t > c.len + 8)
    if (done) {
      this.cur = null
      if (!this.queue.length) {
        this.el.classList.remove('show')
        this.ctx.audio?.duck(false)
      }
      c.onEnd?.()
    }
  }
}
