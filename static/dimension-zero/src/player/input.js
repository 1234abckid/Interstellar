// Keyboard / mouse / pointer-lock input. Listeners are registered once and
// removed in dispose().
export class Input {
  constructor(canvas) {
    this.canvas = canvas
    this.keys = new Set()
    this.pressed = new Set() // pressed this frame
    this.mouse = { dx: 0, dy: 0, left: false, right: false, leftPressed: false, leftReleased: false, rightPressed: false, wheel: 0 }
    this.locked = false
    this.enabled = true
    this.sensitivity = 1
    this.onLockChange = null
    this._h = {
      kd: (e) => {
        if (!this.enabled) return
        if (['Space', 'Tab', 'KeyF', 'KeyQ', 'KeyE', 'KeyR', 'KeyC'].includes(e.code) && this.locked) e.preventDefault()
        if (!this.keys.has(e.code)) this.pressed.add(e.code)
        this.keys.add(e.code)
      },
      ku: (e) => this.keys.delete(e.code),
      md: (e) => {
        if (!this.locked) return
        if (e.button === 0) {
          this.mouse.left = true
          this.mouse.leftPressed = true
        }
        if (e.button === 2) {
          this.mouse.right = true
          this.mouse.rightPressed = true
        }
      },
      mu: (e) => {
        if (e.button === 0) {
          if (this.mouse.left) this.mouse.leftReleased = true
          this.mouse.left = false
        }
        if (e.button === 2) this.mouse.right = false
      },
      mm: (e) => {
        if (!this.locked) return
        // ignore absurd spikes some browsers emit on lock
        if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return
        this.mouse.dx += e.movementX
        this.mouse.dy += e.movementY
      },
      wh: (e) => {
        if (this.locked) this.mouse.wheel += Math.sign(e.deltaY)
      },
      ctx: (e) => e.preventDefault(),
      plc: () => {
        this.locked = document.pointerLockElement === this.canvas
        if (!this.locked) {
          this.keys.clear()
          this.mouse.left = this.mouse.right = false
        }
        this.onLockChange?.(this.locked)
      },
      blur: () => {
        this.keys.clear()
        this.mouse.left = this.mouse.right = false
      },
    }
    window.addEventListener('keydown', this._h.kd)
    window.addEventListener('keyup', this._h.ku)
    window.addEventListener('mousedown', this._h.md)
    window.addEventListener('mouseup', this._h.mu)
    window.addEventListener('mousemove', this._h.mm)
    window.addEventListener('wheel', this._h.wh, { passive: true })
    window.addEventListener('contextmenu', this._h.ctx)
    window.addEventListener('blur', this._h.blur)
    document.addEventListener('pointerlockchange', this._h.plc)
  }
  lock() {
    try {
      const p = this.canvas.requestPointerLock({ unadjustedMovement: true })
      if (p && p.catch) p.catch(() => this.canvas.requestPointerLock()?.catch?.(() => {}))
    } catch (e) {
      try {
        this.canvas.requestPointerLock()
      } catch (_) {}
    }
  }
  unlock() {
    if (document.pointerLockElement) document.exitPointerLock()
  }
  down(code) {
    return this.keys.has(code)
  }
  hit(code) {
    return this.pressed.has(code)
  }
  endFrame() {
    this.pressed.clear()
    this.mouse.dx = this.mouse.dy = 0
    this.mouse.leftPressed = this.mouse.leftReleased = this.mouse.rightPressed = false
    this.mouse.wheel = 0
  }
  dispose() {
    window.removeEventListener('keydown', this._h.kd)
    window.removeEventListener('keyup', this._h.ku)
    window.removeEventListener('mousedown', this._h.md)
    window.removeEventListener('mouseup', this._h.mu)
    window.removeEventListener('mousemove', this._h.mm)
    window.removeEventListener('wheel', this._h.wh)
    window.removeEventListener('contextmenu', this._h.ctx)
    window.removeEventListener('blur', this._h.blur)
    document.removeEventListener('pointerlockchange', this._h.plc)
  }
}
