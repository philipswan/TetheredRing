# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A browser-based Three.js simulation and engineering model of a **Tethered Ring** (a maglev-supported ring tethered to the planet), its transit system and elevators, and a mass-driver space launcher, with in-browser recording of repeatable camera shots. Plain ES modules (no TypeScript, no framework), bundled by Vite. Background: https://www.project-atlantis.com.

## Commands

```
npm install
npm run setup          # git lfs install --local, git lfs pull (assets/), then download textures/
npm run dev            # Vite dev server
npm run build          # production build -> dist/ (runtime data folders are not copied)
npm run lint           # ESLint
npm test               # node --test (tests/**/*.test.mjs)
npm run smoke          # headless Chrome/Chromium: loads "/" and fails on console errors
npm run bench:clouds   # cloud GPU timings + screenshots for tests/bench/cloudViews.json; --baseline <dir> diffs them
```

- Single test file: `node --test tests/shots/shots.test.mjs`.
- Headless checks: `SMOKE_GPU=1 node scripts/smoke.mjs --wait 40 --out shot.png --eval "<js>"`. Use `SMOKE_GPU=1` on a machine with a GPU, because the software renderer takes over a minute per terrain tile. `--eval` runs code against `window.tetheredRing` (app, scene, camera, launchSystem, transitSystem, dParamWithUnits, ...). `--page /tests/planet.html` targets a standalone test page.
- The app must stay usable on Windows. Document every command in both PowerShell and POSIX forms.
- Python tools (`tools/`) run in the repo's `.venv`. Add packages to it with uv (`uv pip install --python .venv/bin/python <package>`; Windows: `--python .venv\Scripts\python.exe`), then run with `.venv/bin/python -m tools.<...>`.
- `assets/**` is Git LFS (several GB) and `textures/` is downloaded. Don't search or grep inside them.

## Architecture (read docs/ARCHITECTURE.md for detail)

- **Entry point.** `src/main.js` creates `App` (`src/app/App.js`). App builds the scene from a preset, owns `step(dt)`/`render()`, and implements every GUI/keyboard action. Keyboard bindings live in one table in `src/input/KeyboardShortcuts.js`.
- **Parameters.** These are data in `src/params/parameterDefinitions.js`, held by `ParameterStore`:
  - `store.definitions` is the old `guidParamWithUnits`.
  - `store.derived` is the old `dParamWithUnits`, which subsystems read as `d.name.value`.
  - Each parameter's `onChange` names a handler in `App.parameterHandlers()`.
  - To add a parameter: add one line to the definitions, read it in the subsystem, and pick a handler.
- **Presets.** `src/presets/presets.js` is a registry of `{ id, label, apply(guidParamWithUnits, nonGUIParams) }`. A preset is selected with `?preset=` or the GUI dropdown (which reloads the page). `nonGUIParams` carries construction-time options (camera placement, terrain assets, lighting/shadows).
- **Time and determinism.** Simulated time comes only from `SimClock`. Animated systems must be pure functions of (parameters, time): no wall clock, no `Math.random()`, no frame-count dependence. This is what makes recorded shots reproducible on other machines. Extra state goes through `getAnimationState()`/`setAnimationState()`.
- **Planet.** `Planet` (`src/planet/Planet.js`) streams cubed-sphere KTX2 tiles from `assets/<name>/manifest.json`, which are baked by the Python pipeline in `tools/`. There is no other planet renderer.
- **Large repeated objects.** These use virtual objects placed along curves in a `ReferenceFrame` split into wedges; real meshes are pooled and assigned only to wedges near the camera. ObjectTracker finds trackable objects through `system.refFrames[i].wedges[j][className]` and `getFuturePosition(refFrame, dt)`.
- **Precision.** World coordinates are about 6.4e6 m and the GPU works in float32, so geometry must stay local to a nearby origin, with the large offset in `Object3D.position`. Never build meshes with absolute planet coordinates.
- **Rendering.**
  - The renderer uses a logarithmic depth buffer. Custom ShaderMaterials must include the `logdepthbuf_*` chunks (see `src/shaders/`), imported with `?raw`.
  - Stars and the Moon are drawn in `SkyPass`.
- **Shots.** `src/shots/ShotFormat.js` documents the `.shot.json` format. The shot playhead (`ShotController.tick`) drives `SimClock` through the shot's time warp (`ShotTiming.js`). Keyframes can be relative to moving objects (`Anchors.js`), so new moving things should be locatable at any simulated time. `ShotController` edits, previews, records live takes and renders at a fixed step; the floating panel is `src/ui/ShotSidebar.js`. `src/capture/VideoRecorder.js` encodes AV1 (falling back to H.264/HEVC/VP9) into MP4/MKV with WebCodecs.

## Conventions

- SI units throughout. Angles in parameters are degrees; `store.derived` converts where subsystems need radians.
- The scene frame is X = ECEF y, Y = ECEF z (the polar axis), Z = ECEF x.
- Match the surrounding code's style: 2-space indent, mostly no semicolons. Prettier is intentionally not used.
- Bugs found in the pre-refactor code are filed on GitLab (gitlab.bommanager.org/alastair/tethered-ring) with file:line references on the `2025changes` branch. Don't close those issues.
