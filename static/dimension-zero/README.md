# DIMENSION ZERO

A first-person shooter for the browser, set in a fractured multiverse whose rules keep changing. It runs on Three.js (r180) and cannon-es. Both are vendored in `lib/`, so there is no build step and nothing to download at runtime.

## Run it

From the repository root:

```bash
npm install
npm start            # serves http://localhost:8080
```

Open **http://localhost:8080/dimension-zero/**. You can also click the **Dimension Zero** tile on the Games page (`/-`).

You can serve the folder from any static file server, for example `python3 -m http.server` inside `static/`. Opening `index.html` straight from disk won't work, because the browser blocks ES module imports from `file://`.

You need a browser with WebGL 2: any recent Chrome, Edge, Firefox or Safari.

## Deploy it

The game is a plain static site. Deploy the contents of this folder (the folder itself is the site root); don't deploy the whole repository.

- **Netlify:** drag this folder onto https://app.netlify.com/drop. `netlify.toml` is already included.
- **Vercel:** the dashboard has no drag-and-drop for folders. Run `npx vercel --prod` inside this folder, or import the repo and set **Root Directory** to `static/dimension-zero`. `vercel.json` is already included, so there is no framework preset or build command.
- **Any static host** (Cloudflare Pages, GitHub Pages, S3) also works. It must serve over HTTPS or localhost so the browser allows mouse capture.

## Controls

| Input                   | Action                                                                        |
| ----------------------- | ----------------------------------------------------------------------------- |
| Mouse                   | Look (click to capture the pointer, Esc releases it and opens the pause menu) |
| W A S D / Shift / Space | Move / sprint / jump                                                          |
| LMB / RMB               | Fire (hold to charge the Phase Cannon) / aim down sights                      |
| 1 2 3, mouse wheel      | Switch weapons                                                                |
| R                       | Reload                                                                        |
| **Q**                   | **Shift to the next dimension**                                               |
| E                       | Void Dash                                                                     |
| F                       | Speed Boost                                                                   |
| C                       | Slide while sprinting. In the air it triggers a Dimension Slam.               |

## Campaign

After the loading screen you land on the **title screen**. It plays a live demo reel: the camera tours the arena through all three realities while real enemies fight in the background.

- **Begin Campaign** plays a skippable opening cinematic (about 50 s), with narration, a title reveal and a drop into first person. Next comes **Calibration**, an interactive tutorial voiced by ARC that teaches looking, moving, sprinting, jumping, shooting, reloading, dimension shifting, the Phase Cannon, Void Dash and the Singularity Launcher against training drones. After that come the story waves, the core and the ending cinematic.
- **Skip to Combat** drops you straight into the waves.
- Hold **SPACE** to skip any cinematic. Press **ENTER** to skip calibration.
- If you die, you redeploy at the last checkpoint (the start of the current wave).

### Story

It is 2189. The Zero Point Array on orbital relay _Vestige_ tried to draw power from the space between realities. It folded the relay into the seam where three dimensions overlap. Aliens called **the Choir** poured through. You are a Zero Division operator, dropped in to reach the **Dimensional Core** and re-anchor reality. **ARC**, your handler AI, guides you. Broken transmissions come from **Dr. Mira Vael**, who built the Array and is not as dead as the records say.

Dialogue appears as subtitles. By default it is also voiced through your browser's built-in speech engine; you can switch that off in Settings → Voice narration.

### Mission

Survive three waves. Each one you clear locks a ring of the Dimensional Core. Once the core is online, stand on its dais to channel it while reality fights back.

## The three realities

|               | Material                           | Inverted                                                               | Fracture                                                                                                             |
| ------------- | ---------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Gravity       | normal                             | ~50% (jumps go about twice as high)                                    | normal                                                                                                               |
| Void Wardens  | shielded (80% damage absorbed)     | shielded                                                               | **shields shattered**                                                                                                |
| Rift Stalkers | normal                             | lose footing: slow, can't lunge                                        | enraged, blink toward you                                                                                            |
| Terrain       | cyan cover solid; gravity lifts on | **sky-bridge assembles** from the foundry walkway to the eastern perch | cyan cover goes intangible; **vault door folds open**; a fracture staircase and two portals appear; amber rifts burn |
| Cost          | —                                  | —                                                                      | stability drains (~13 s), then you're ejected                                                                        |

Shifting takes about 0.85 s. A luminous wavefront spreads out from you, the lighting, fog, sky, audio and music change, and structures morph: the megastructure, the pylons, the floating islands, the hall roof and the bridge slabs. Collision always uses stable boxes, and any geometry that appears around you pushes you out instead of trapping you.

## Weapons

- **Pulse Rifle**: hitscan automatic with bloom, recoil, ADS and a red-dot sight.
- **Singularity Launcher**: an arcing orb that opens a gravity well. The well drags in enemies and physics debris, deals damage over time, then collapses in a burst.
- **Phase Cannon**: a charged, piercing beam. It passes through violet energy barriers and up to four enemies, and it strips a Warden's shield in any reality.

## Graphics

- Ground-truth ambient occlusion (GTAO, at half resolution) for contact shadows. The sun has 4096² soft shadows on High.
- Reflections are captured from inside the arena once per reality.
- Exponential height fog with sun in-scattering, plus screen-space god rays from the sun (or the vortex, in the Fracture).
- Khronos PBR Neutral tone mapping, a filmic grade, film grain and subtle lens aberration.
- Higher-resolution procedural textures with ambient-occlusion maps. Large-scale variation breaks up texture tiling, and the plaza has rain puddles.
- Bullet-impact decals, instanced rubble and wind-swayed grass. Enemies have chitin skin and the weapons have a textured finish.
- Depth of field and a letterbox during cinematics.

Settings → Graphics quality scales all of this. **Medium** drops AO and uses 2048² shadows. **Low** also turns off bloom, god rays and depth of field, and uses 512² textures and 1024² shadows.

## Code layout

```
src/
  main.js            bootstrap, measured build steps, main loop
  loading/           cinematic 3D loading scene
  story/             script, narrator (subtitles + voice), cinematic director, shot lists, tutorial
  core/              renderer + post-processing, procedural textures, math
  world/             arena, materials/shaders, sky, dimensions, megastructure, core
  physics/           box collision world, cannon-es props
  player/            controller, input, first-person viewmodel
  weapons/           weapons, projectiles & singularity wells
  enemies/           base enemy, Rift Stalker, Void Warden, Dimension Sphere, flow-field nav
  game/              waves/objective/interactions, pickups
  ui/                HUD, menus, operators & skins
  audio/             synthesized SFX, ambience and adaptive music
```

The textures, models and audio are all generated procedurally at load time. The operator portraits, skin cards and logo in `assets/` are cropped from the project's concept art.

For automated testing, `?test` skips pointer lock and exposes `window.__dzStep(seconds)`. That steps the real simulation deterministically after real input events.
