// DIMENSION ZERO — story script.
//
// 2189. The Zero Point Array on orbital relay VESTIGE tried to draw power from
// the space between realities and tore the relay into the seam where three
// dimensions overlap. Alien entities, the Choir, poured through. The Zero
// Division drops a lone operator into the fracture with one job: reach the
// Dimensional Core and re-anchor reality before the seam reaches Earth.
//
// Voices:
//   ARC        Zero Division handler AI: calm, dry, precise.
//   VAEL       Dr. Mira Vael, architect of the Array. Her mind is smeared across
//              realities; she speaks in broken transmissions. The twist: the
//              Core is what's left of her.
//   THE CHOIR  The alien collective. Not invaders but refugees from a reality
//              that already collapsed. They speak in capitals.

export const SPEAKERS = {
  ARC: { name: 'ARC', color: '#62d8ff', pitch: 0.85, rate: 1.0, radio: true },
  VAEL: { name: 'DR. MIRA VAEL', color: '#ffb347', pitch: 1.2, rate: 0.92, radio: true, distort: true },
  CHOIR: { name: 'THE CHOIR', color: '#ff4f6d', pitch: 0.3, rate: 0.78, radio: false, caps: true },
  SYS: { name: 'SYSTEM', color: '#b07bff', pitch: 1.0, rate: 1.1, radio: false, silent: true },
}

// Lines are [speaker, text, optionalDurationSeconds]
export const LINES = {
  intro1: ['ARC', 'Zero Division, this is ARC. Seventy-one hours ago, the Zero Point Array tore a hole in reality.'],
  intro2: ['ARC', "Relay Vestige didn't explode. It folded — into the seam where three realities overlap."],
  intro3: ['VAEL', "...it isn't a hole. It's a door. I only wanted to see what was on the other side..."],
  intro4: ['ARC', 'Something came through that door. We call them the Choir.'],
  intro5: ['CHOIR', 'WE HEAR YOU, SINGLE NOTE.', 2.6],
  intro6: ['ARC', 'Every reality in there has different rules. Gravity. Matter. Who can be hurt — and who cannot.'],
  intro7: ['ARC', 'Your objective: reach the Dimensional Core at the heart of the fracture, and re-anchor reality.'],
  intro8: ['ARC', 'Drop confirmed. Calibrating your rig on landing. Good luck, Operator.'],

  // tutorial — "Calibration"
  t_look: ['ARC', 'Neural link stable. Look around — get your bearings.'],
  t_move: ['ARC', 'Good. Walk to the marker. The ground here is real. For now.'],
  t_sprint: ['ARC', 'Sprint to the next marker. Speed keeps you alive in here.'],
  t_jump: ['ARC', 'Jump. Your suit compensates for local gravity.'],
  t_shoot: ['ARC', 'Pulse Rifle online. I am projecting three training drones. Destroy them.'],
  t_reload: ['ARC', 'Reload. Energy cells drain faster than you think.'],
  t_shift: ['ARC', 'Now the part that matters. Shift reality.'],
  t_inverted: [
    'ARC',
    "Inverted. Gravity is weaker here — and the sky-bridge to the east just assembled itself. Don't ask me how.",
  ],
  t_shift2: ['ARC', 'Shift again. Into the Fracture.'],
  t_fracture: [
    'ARC',
    'The Fracture breaks shields and opens hidden paths. It is also unstable. Watch your stability — stay too long and it throws you out.',
  ],
  t_back: ['ARC', 'Shift back to the Material world.'],
  t_phase: [
    'ARC',
    'That drone is shielded. Switch to the Phase Cannon — hold to charge, release to fire. It tears straight through shields.',
  ],
  t_dash: ['ARC', 'Void Dash. Use it to break line of sight — or to cross a gap.'],
  t_sing: ['ARC', 'Last one. The Singularity Launcher drags everything into a collapsing well. Group them up.'],
  t_done: ['ARC', 'Calibration complete. And... I am reading rift signatures. Real ones. Here they come.'],
  t_skip: ['ARC', 'Skipping calibration. Hope you remember your training.'],

  // waves
  w1: ['ARC', 'Contact. Rift Stalkers — fast, and they lunge. Keep moving.'],
  w1mid: ['VAEL', "...they aren't attacking you... they're running... from something behind them..."],
  w1end: ['ARC', 'First ring locked. The Core is responding to you.'],
  w2: ['ARC', 'Void Wardens. Shielded in this reality. Shift to the Fracture, or hit them with the Phase Cannon.'],
  w2choir: ['CHOIR', 'YOU CANNOT HOLD THREE SONGS AT ONCE.', 2.8],
  w2end: ['VAEL', 'Operator... I built the Array. I opened the door. The Core... is me now. What is left of me.'],
  w2end2: ['ARC', 'That is not possible. Dr. Mira Vael died in the collapse.'],
  w2end3: ['VAEL', 'In one reality, yes.'],
  w3: ['ARC', 'Dimension Spheres. They shield the others. Kill them first.'],
  w3choir: ['CHOIR', 'OUR WORLD WENT SILENT. YOURS WILL SING FOR US.', 3.2],
  w3end: ['ARC', 'All three rings locked. Get on the dais and channel the Core.'],
  core1: ['VAEL', 'When you close the door, I go with it. ...Do it anyway.'],
  core2: ['CHOIR', 'SILENCE IS ALSO A SONG.', 2.4],
  core3: ['ARC', 'Almost there — hold the dais!'],

  // ending
  out1: ['VAEL', 'Thank you... I can see it now. What was on the other side.'],
  out2: ['ARC', 'Reality anchored. The fracture is sealing.'],
  out3: ['ARC', '...Operator. There is another signal. Coming from beneath all three realities. From dimension zero.'],

  // misc
  death: ['ARC', 'Operator down. Re-materialising at the last anchor point.'],
  eject: ['ARC', 'Stability collapsed — you were thrown back to the Material world.'],
}
