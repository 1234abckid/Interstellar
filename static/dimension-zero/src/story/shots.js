// Shot lists for the opening cinematic, the title-screen demo loop, the quick
// drop-in (skip to combat) and the ending. Camera paths are hand-placed in the
// open spaces of the arena so nothing clips.
import * as THREE from 'three'

const V = (x, y, z) => new THREE.Vector3(x, y, z)
const CORE = V(0, 6.2, 0)

const shiftTo = (d) => (ctx) => {
  if (ctx.dims.current !== d) ctx.dims.shift(d, true)
}

export function introShots(ctx) {
  return [
    {
      dur: 8.5,
      path: [V(150, 74, 178), V(86, 40, 106), V(40, 18, 54)],
      look: [V(0, 4, 0), V(0, 7, 0)],
      fov: [38, 44],
      dof: false,
      ease: 'soft',
      loc: ['ORBITAL RELAY VESTIGE', 'Seam of three realities · 71 hours after the collapse'],
      lines: ['intro1'],
      lineDelay: 0.6,
      start: (c) => {
        shiftTo(0)(c)
        c.R.U.uFade.value = 1
        c.R.U.uFadeColor.value.setRGB(0, 0, 0)
        c.fadeTo = 0
        c.audio.play('sting')
      },
    },
    {
      dur: 7.5,
      path: [V(-37, 1.8, 30), V(-25, 2.2, 21), V(-14.5, 2.9, 13)],
      look: [V(0, 4.5, 0), CORE],
      fov: [46, 42],
      dof: true,
      ease: 'inout',
      lines: ['intro2'],
    },
    {
      dur: 7.5,
      path: [V(9.5, 4.5, 5), V(6, 6.8, 9.5), V(-3, 6.2, 10.2), V(-9, 5.2, 5.5)],
      look: [CORE],
      fov: [40, 36],
      dof: true,
      aperture: 0.0016,
      lines: ['intro3'],
      events: [
        { t: 2.4, fn: shiftTo(2) },
        { t: 5.4, fn: shiftTo(0) },
      ],
      end: shiftTo(0),
    },
    {
      dur: 8.5,
      path: [V(8.6, 2.6, -7.6), V(11.4, 2.2, -10.4)],
      look: [V(28, 2.0, -22), V(25, 1.6, -18.5)],
      fov: [44, 40],
      dof: true,
      lines: ['intro4', 'intro5'],
      start: (c) => {
        for (let i = 0; i < 3; i++) c.enemies.spawn('stalker', V(28 + (i - 1) * 2.2, 0, -22 + i), 0.4 + i * 0.5)
      },
      events: [{ t: 5.2, fn: (c) => c.audio.play('stalkerScreech', 1, V(26, 1, -18)) }],
      end: (c) => c.enemies.clear(),
      onSkip: (c) => c.enemies.clear(),
    },
    {
      dur: 8,
      path: [V(19, 6.6, -29.5), V(27, 7.6, -30.5), V(32.5, 9.4, -20)],
      look: [V(30, 5.5, -33.5), V(34.2, 6, -12), V(36, 7, -2)],
      fov: [50, 46],
      dof: false,
      lines: ['intro6'],
      start: shiftTo(1),
      end: shiftTo(0),
      onSkip: shiftTo(0),
    },
    {
      dur: 7,
      path: [V(0, 8, 26), V(0, 15, 31), V(0, 24, 36)],
      look: [V(0, 9, 0), V(0, 17, -2), V(0, 21, -4)],
      fov: [48, 40],
      dof: true,
      aperture: 0.0006,
      title: 'THE FRACTURE',
      lines: ['intro7'],
      start: (c) => c.audio.play('boom'),
    },
    {
      dur: 5.2,
      path: [V(0, 92, 30), V(0, 34, 21), V(0, 1.62, 18)],
      look: [V(0, 0, 6), V(0, 1.2, 8), V(0, 1.62, 10)],
      fov: [62, 78],
      dof: false,
      ease: 'in',
      shake: 0.004,
      lines: ['intro8'],
      start: (c) => c.audio.play('drop'),
      events: [
        {
          t: 4.7,
          fn: (c) => {
            c.R.U.uFadeColor.value.setRGB(1, 1, 1)
            c.R.U.uFade.value = 0.9
          },
        },
      ],
    },
  ]
}

// Short drop for "Skip to combat" / redeploys.
export function dropShots() {
  return [
    {
      dur: 3.4,
      path: [V(0, 60, 28), V(0, 22, 20), V(0, 1.62, 18)],
      look: [V(0, 0, 6), V(0, 1.4, 9), V(0, 1.62, 10)],
      fov: [60, 78],
      ease: 'in',
      shake: 0.003,
      start: (c) => {
        c.audio.play('drop')
        c.R.U.uFadeColor.value.setRGB(0, 0, 0)
        c.R.U.uFade.value = 1
        c.fadeTo = 0
      },
      events: [
        {
          t: 3.0,
          fn: (c) => {
            c.R.U.uFadeColor.value.setRGB(1, 1, 1)
            c.R.U.uFade.value = 0.85
          },
        },
      ],
    },
  ]
}

// Title-screen demo reel: slow moves through each reality, looping forever.
export function attractShots() {
  return [
    {
      dur: 9,
      path: [V(-23, 2.6, -4), V(-18, 3.0, -11), V(-13, 3.4, -15)],
      look: [CORE, V(0, 7, 0)],
      fov: [46, 44],
      dof: true,
      start: shiftTo(0),
    },
    {
      dur: 9,
      path: [V(50, 21, 16), V(52, 19, -2), V(48, 17, -18)],
      look: [V(34, 6, -14), V(34, 6.5, -18)],
      fov: [44, 42],
      dof: false,
      start: shiftTo(1),
    },
    {
      dur: 9,
      path: [V(13, 1.25, 15), V(7, 1.5, 17), V(1, 1.7, 17.5)],
      look: [V(2, 6, 0), CORE],
      fov: [44, 40],
      dof: true,
      start: shiftTo(2),
    },
    {
      dur: 9,
      path: [V(-23, 4, 12), V(-27, 5, 4), V(-26, 5.5, -4)],
      look: [V(-38, 3, 2), V(-38, 3.5, -1)],
      fov: [48, 46],
      dof: true,
      start: shiftTo(0),
    },
    {
      dur: 9,
      path: [V(10, 3.5, 13), V(0, 4.2, 15), V(-10, 4.8, 12)],
      look: [V(0, 19, -4), V(0, 21, -4)],
      fov: [54, 50],
      dof: false,
      start: shiftTo(1),
    },
  ]
}

export function outroShots() {
  return [
    {
      dur: 7,
      path: [V(11, 11, 9), V(3, 12.5, 12.5), V(-8, 11.5, 9), V(-12, 10.5, 1)],
      look: [CORE],
      fov: [44, 38],
      dof: true,
      aperture: 0.0016,
      lines: ['out1'],
      start: shiftTo(0),
    },
    {
      dur: 6,
      path: [V(-8, 8, 16), V(-20, 26, 40), V(-34, 46, 70)],
      look: [CORE, V(0, 4, 0)],
      fov: [44, 50],
      dof: false,
      lines: ['out2'],
    },
    {
      dur: 8,
      path: [V(-10, 18, 40), V(10, 34, 20), V(30, 60, -10)],
      look: [V(120, 120, -200), V(230, 170, -330)],
      fov: [50, 34],
      dof: false,
      lines: ['out3'],
      title: 'TO BE CONTINUED',
      events: [{ t: 3.5, fn: (c) => c.audio.play('sting') }],
    },
  ]
}
