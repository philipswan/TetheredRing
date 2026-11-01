# Architecture

The app is a Vite-bundled set of plain ES modules on top of Three.js. Everything is in metres, kilograms and seconds; the world origin is the planet centre.

## Layout

```
index.html            page shell (a canvas inside #simContainer)
src/main.js           bootstrap: reads URL parameters, creates App, exposes window.tetheredRing
src/app/              App (scene construction, per-frame loop, actions), RingAssembly, exports,
                      the Y-key launch trial sweep and F-key illustration settings
src/params/           parameterDefinitions.js (every tunable parameter, as data) and ParameterStore
src/ui/               ParameterGui (lil-gui panel generated from the parameter definitions); ShotSidebar and
                      Timeline (the shot and video panel)
src/presets/          presets.js (registry) and one file per larger preset
src/core/             SimClock (simulated time), ReferenceFrame (wedge-partitioned curves)
src/scene/            renderer, lighting, SkyPass (stars and Moon), overlays (logo, XYChart), backgrounds
src/planet/           Planet (public API) on CubedSpherePlanetRenderer (quadtree LOD terrain streaming)
src/ring/             tethered ring structure, tethers, markers, ring segments
src/transit/          transit vehicles, elevators, terminuses, habitats, solar arrays
src/launcher/         mass-driver launcher, trajectory and rocket simulation, launcher models
src/physics/          geodesy, planet specifications, atmosphere models
src/curves/           SuperCurve family (curves with arc-length and time parameterisations)
src/camera/           CameraController, ObjectTracker, modified OrbitControls, Google Earth playback
src/input/            keyboard shortcuts (one declarative table), VR controllers
src/shots/            shot file format, camera path, time warp, camera anchors, path overlay, ShotController
src/capture/          VideoRecorder (WebCodecs via mediabunny)
src/shaders/          GLSL, imported with Vite's ?raw
src/utils/            math helpers; tram.js is a compatibility barrel re-exporting the split modules
src/data/             JSON data (camera presets, mountain list, sample Google Earth project)
assets/               planet terrain tiles (Git LFS)
textures/, models/    runtime imagery and 3D models (textures/ is downloaded by npm run setup)
tools/                offline Python pipeline that bakes assets/ (see tools/build_planet2_assets.ps1)
scripts/              setup, texture sync and headless smoke test (Node)
tests/                node --test unit tests and standalone test pages
```

## Startup

`App.init()` builds the scene in a fixed order:

1. **Parameters.** `ParameterStore` is created from `createParameterDefinitions()`, then the preset (`?preset=` or the default) runs. A preset edits parameter values and fills `nonGUIParams`, which hold construction-time options such as camera placement, terrain asset sets, lighting and shadows.
2. **Renderer and base scene.** The renderer uses a logarithmic depth buffer. The scene contains `planetCoordSys`, which holds everything fixed to the planet, plus the camera group, lighting, the sky pass and the overlays.
3. **Planet.** `Planet` streams `assets/<name>/` tile sets. The defaults come from the planet's name: the global set (`earth`, `moon`). A preset adds regional high-resolution bakes as overlays with `planetSetup` (`src/presets/planetSetup.js`), which also sets the larger streaming budgets they need and the areas to load first. A listed bake that is not on the machine, or is still a Git LFS pointer, is skipped and the tiles below it are used, so presets list every bake for their area, made or not. Imagery credits are shown for the tile sets that loaded. See `docs/ASSETS.md` for the bakes, how to make one (`tools/adaptive_lod.py`, `EARTH_REGIONS`), and how assets get into LFS.
4. **Ring.** `RingAssembly` builds one `tetheredRingSystem` per ring spec, plus its tethers and markers.
5. **Transit system and launcher.** Both are built against the primary ring's curve.
6. **Camera.** `CameraController` places the camera from the preset options.
7. **GUI, shots and input.**

## Parameters

`ParameterStore` keeps exactly one copy of each value, so nothing needs synchronising by hand:

- `store.definitions[name]` is `{ value, units, min, max, folder, onChange, ... }`. Presets edit these before the GUI is built.
- `store.values` is the object the GUI binds to. Its properties are accessors onto `definitions[name].value`.
- `store.derived` is what every subsystem reads (historically `dParamWithUnits`). `derive()` refreshes it: it copies `autoMap` values, converts the ring latitude to radians, interpolates the ring eccentricity and selects the material properties for the chosen fibre and conductor.

When a control changes, `ParameterGui` calls `derive()` and then the App handler named by the parameter's `onChange`:

| Handler | What it does |
|---|---|
| `adjustRingDesign` | Rebuilds the ring, then updates the transit system and launcher |
| `updateTransitsystem` | Updates the transit system only |
| `updateLauncher` | Updates the launcher only |
| Visibility and material handlers | Change one thing in place |

To add a parameter:

1. Add one line to `parameterDefinitions.js`.
2. Read it in the subsystem as `dParamWithUnits.name.value`.
3. Pick (or add) an `onChange` handler in `App.parameterHandlers()`.

## Simulated time and determinism

`SimClock` is the only source of time.

- **Interactive viewing:** the shot playhead (`ShotController.tick`) decides it. Each frame the playhead moves by the real frame time (clamped so a backgrounded tab does not jump) times the playback rate, which may be negative (rewinding) or 0 (paused); the shot's time warp turns the playhead's video time into simulated time. Scrubbing and jumping set it directly. Everything animated must therefore cope with time going backwards or jumping.
- **Recording:** frame `i` is at video time `i/fps`, so simulated time is fixed for every frame.

Every animated system receives the simulation time in `animate(time, ...)`. Its state must be a pure function of the parameters and that time: no wall-clock time, no `Math.random()`, nothing that depends on how many frames were rendered. Anything that cannot be computed from time alone is exposed through `getAnimationState()` / `setAnimationState()` and stored in shot files. The star field uses a seeded random generator for the same reason.

## Per frame

`App.frame()` runs `shots.tick()` (which moves the clock), then `step(dt)`, then `render()`.

`step` does the following, in order:

1. `shots.beforeStep()`: when the shot camera drives the view, it is placed first, so the objects near it get their models in this frame
2. Ring raise/lower animation (parameter changes)
3. The Y-key launch trial sweep (when active)
4. `launchSystem.animate()` and `transitSystem.animate()`
5. `CameraController.update()`: tracking, tweens, zoom/climb and follow modes, then orbit controls and clipping planes
6. `planet.update(camera)`: level-of-detail selection and tile streaming
7. The shadow frustum follows the camera target

`render` draws four layers, clearing the depth buffer between them:

1. The sky pass: stars and the Moon, drawn with their own camera so the main camera's far plane can stay fitted to the planet
2. Any background image or Google Earth frame
3. The main scene (then the clouds over it)
4. The highlights, if any are on (see below)
5. The screen-space overlays

**Highlights.** The Rendering toggles `highlightRing`, `highlightRingTethers`, `highlightElevators`, `highlightMassDrivers`, `highlightMassDriverTethers` and `highlightLaunchVehicles` outline a class of structure over the finished frame with a 1 px white border, whatever the lighting and whatever is in front of it (`src/scene/Highlights.js`). Objects are tagged where they are built (`Highlights.tag(object, key)`, in `userData.highlight`, inherited by the subtree and copied by clones; the launcher's virtual object classes set `static highlightClass`, and `ModelPool` and `InstancedProxyPool` take a `highlight` option). Each frame with a class on, the visible meshes and lines of those classes go on layer 31 and are drawn alone, with an override material, into an offscreen target as a mask; a full-screen pass paints white each covered pixel next to an uncovered one, so silhouettes get a border just inside them and anything a pixel across (a distant object, a cable) shows whole. Only what is drawn is highlighted, so the ring and the mass driver also have a line along their curve that is drawn only while highlighted (`Highlights.curveStandIn`), for when they are too far away for their models. With every toggle off the pass costs nothing.

During recording, `ShotController` stops the animation loop and calls `step()`/`render()` itself, one fixed step at a time.

## Ring height and tether forces

The ring is designed on a sphere of the planet's equatorial radius (`commonRingVariables`, `tethers.js`), then fitted to the real planet (`src/ring/ringGeometry.js`):

- **Shape.** `ringPlaneOffset` moves the ring's plane along its axis (least squares). `placeAtHeightInRingPlane` then moves each point within the plane, towards or away from the axis, to `ringFinalAltitude` above sea level. The ring stays planar at a constant height. It becomes a slightly elliptical section of the flattened planet (eccentricity about 0.09 for the default ring).
- **Forces.** The ring has no stiffness of its own; only the moving ring's hoop load, constrained by the tethers. So the tethers must cancel every force on each part of the ring, in all three directions.
  - The moving ring has one speed all the way round, found from the nominal circular design. Its centrifugal load per metre acts along the curve's normal and goes as the local curvature.
  - At each tether, `RingAssembly.ringForcesAt` finds the pull that cancels gravity and that load. It then turns the tether's vertical plane about the local vertical (up to about 0.4 degrees for the default ring) so that the plane holds the whole pull.
  - `balancedPointBxAvePercent` (in `tethers.js`) finds the anchor placement at which the two staggered tether types give that pull, keeping `tetherPointBxDeltaPercent`.
  - Tethers whose designs are within `TETHER_DESIGN_STEP` share geometry.
- **Roots.** The tether geometry stops at the first fork. Below it, each tether's root (`src/ring/TetherRoots.js`) follows its trunk's catenary of constant stress down until it meets the rendered terrain under it: mountains or sea floor. Below sea level the tether is buoyed up by the water, so it hangs as a flatter catenary (`seaWaterDensity`). The roots are re-checked a few per frame as terrain tiles stream in. A tether under tension cannot hang below its catenary's lowest point; any root whose ground is deeper than that ends there (`TetherRoots.unreachable`).
- **Camera placement.** Presets whose camera positions were recorded against the old sphere-height ring set `nonGUIParams.cameraAtRingHeight`. The camera and its target are moved as the ring moved.

## Large repeated objects

Rings, tubes, rails, screws and vehicles are spread along curves tens of thousands of kilometres long. Each moving or repeated object type is a *virtual object* placed at a curve parameter inside a `ReferenceFrame`. A reference frame splits its curve into "wedges" (zones). Each frame, only the wedges near the camera get real meshes, taken from a pool of models.

The object tracker walks `system.refFrames[i].wedges[j][className]` to find trackable objects, so vehicles and elevator cars must stay discoverable there. Each provides `getFuturePosition(refFrame, dt)` (and `getFutureFrame` for orientation).

## Level of detail and performance

Detail is chosen from projected size in drawing-buffer pixels, not distance:

- `src/scene/PixelLOD.js` is a `THREE.LOD` whose levels have pixel thresholds. three.js calls its `update(camera)` during rendering. Levels are built lazily; expensive builds are limited to a few milliseconds per frame (`PixelLOD.buildBudget`) except while recording. A level's factory may return a Promise (built in the background; the next coarser level shows meanwhile), and a level can ask to be prefetched before it is needed. While recording, everything is built synchronously so every frame is complete. `PixelLOD.viewportHeight` (set by `App.setRenderSize`) and `PixelLOD.lodBias` (set by the quality setting) feed the calculation.
- `src/scene/InstancedProxyPool.js` draws many identical objects with one `InstancedMesh` per detail level. The code that places them still works with ordinary `Object3D` proxies; `syncAll()` (called from `App.render`) copies visible, in-frustum proxies into instances relative to the camera.
- Shader programs are compiled ahead of their first use, in the background (`src/scene/precompile.js`): every 120 frames `App.precompileShaders()` hands `renderer.compileAsync` a scene of stand-ins, one per material and kind of object not compiled before, from the main scene (drawn or not, e.g. the sea surface and the atmosphere while under the sea), the sky pass and the clouds' passes. Afterwards `warmPrograms` looks up each ready program's uniforms (three.js's first-use step, which waits for the driver) within a couple of milliseconds a frame. Otherwise three.js compiles a program when it first draws with it, which stalled the first frame above the sea by about half a second. The real clouds' large texture is uploaded as soon as it has loaded, for the same reason.
- `src/app/GraphicsQuality.js` sets the pixel ratio, LOD bias and terrain threshold. In Auto mode it adapts the render resolution to the frame time. Recording forces full quality.

Where it is used:

| Object | Technique |
|---|---|
| Screws | PixelLOD per screw: three thread levels sampled per turn to a chord-error tolerance, then a cylinder; geometry shared by the left/right pair and built by Web Workers (`ScrewGeometryBuilder.js`, most urgent first, dropping builds for screws that have gone past); fast segments (up to a turn of thread) share one geometry per 0.1% of thread speed, rotated onto each segment; models handed out early enough for the first thread level to be ready (`modelRange`); objects changing size by over 25% a frame (screws flashing past a tracking camera) skip their expensive levels (`PixelLOD.fleetingRatio`) |
| Adaptive nut grapplers | Two sets of InstancedMeshes per nut (pads, hardware; one InstancedMesh per part shape) inside PixelLODs; each part fades out by its own thickness (`SubPixelFade`, rods by width rather than area), and its PixelLOD stops drawing once the longest-lasting part has faded; placement skipped when not drawn |
| Lift fans | Instanced per chunk of 32 fans with full and low-poly levels; below 1.5 px each fan fades out by its on-screen size (`src/scene/SubPixelFade.js`) instead of popping in, and stops drawing at 0.3 px. Each chunk's fans lean into the wind at its centre (1° per m/s, at most 20°), worked out when the chunk is built and rebuilt when the weather date changes |
| Brackets | InstancedProxyPool with full and low-detail (4-segment arcs) shapes |
| Transit ring segments | Instanced layers (`src/ring/RingInstancedLayer.js`) |
| Planet | Screen-space texel error, edges matched to coarser neighbours (positions and heights) for crack-free LOD transitions, without skirts |
| Sea surface | A sea-level copy of each terrain tile that has ground below sea level, using the tile's own imagery (so the water has the local ocean colour and ends at the terrain's coastline); follows the tile's LOD and culling |
| Tethers | Each copy is a PixelLOD over variants with the last forks merged (the vertical fan to the rings first), used once the merged fan is under 0.1 px; a strand count keeps the combined light |
| Tethers and cables | Drawn at their real diameters (`src/scene/structureLines.js`). Each line is a faint cable of its colour covering part of its pixel, composited over what is behind it: it darkens a bright background (the day sky) and lightens a dark one, and overlapping lines hide each other instead of adding up, so the tethers do not brighten where they fork. The coverage is a glow, greatest for a structure's thickest member and less, as the square root of the diameter, for thinner ones, held out to `structureGlowDistance`. Sub-pixel strands sum to a visible structure. The coverage is reduced by the haze of the air between the camera and the line. The line is lit by the sun, sky and ground (see Sun, sky and atmosphere), so lines in the planet's shadow only show faintly. Tether area is conserved at every fork. Tether roots reach the terrain at their anchors (see Ring height and tether forces); elevator cables are sized from the car load (`elevatorCarMass`) |
| Mass-driver tube | A 1 px line along the track once the tube is under a pixel across |
| Ocean terminal mooring cables | One merged solid cable mesh while a cable is at least 1 px across (at its nearest point); a structure line along each cable always |

The launcher's reference frames split the track into a few hundred zones, each kilometres long. A virtual object class can define `static modelRange(pixelsPerRadian)` so that only objects within that distance of the camera get models (screws use the distance at which they shrink below their smallest drawn size).

### The screw thread model

The thread's phase along the screw comes from the adaptive nut's motion (`threadTime` and `threadSpeed` in `src/launcher/launcherPhysics.js`): the thread at each point matches the nut's speed as its centre passes. With constant acceleration, the unrolled flight is a quadratic in the thread angle. The screw geometry and the grappler pads both use these functions. The thread only starts where the groove between flights can hold a grappler pad plus its lift-away clearance (`threadStartDistance`, measured at the pad's inner edge); before that the screw is a plain shaft and pads stay disengaged.

The screw pulls the vehicle through the grapplers' magnetic coupling, and the coupling at its weakest limits the acceleration. The first aim is to keep the minimum number of grapplers gripping as high as possible; the average matters less, and hops themselves are cheap. The second aim is few gaps. A gap is either side of a gripping grappler where the neighbour on that side doesn't grip the same flight. Eddy currents are lost at each gap, and the faster the pads slide over the flights, the more each gap loses.

`adaptiveNutGrapplerSequencingMode` selects an algorithm through `src/launcher/grapplerPlacement.js`:

- **Original** (default) uses the original position-based switchover signal and nearest flight. The lift, untwist and return to centre follow `adaptiveNutGrapplerPadLiftAwayPortion`, `adaptiveNutGrapplerPadTwistPortion` and the remaining portion.
- **OriginalConstantRate** retains that flight selection and pose mapping, but derives the switchover threshold from time. Let `a = maxRotationAway / abs(rotationRate)` be the estimated time from mid-phase to handover and `b = adaptiveNutGrapplerSwitchoverTime / 2`. The half-hop starts at `a - b`, converted back to a rotation threshold. The signal rises from zero there to one at handover, then falls on the adjacent flight. A tighter mechanical range starts the motion earlier; if `a <= b`, the pad stays retracted rather than shortening the hop. The estimate uses the current relative phase drift, so acceleration can change the timing during the hop. A fixed signal duration does not imply constant angular velocity.
- **Scheduled** uses the incoming lattice planner described below, retaining the saved value `scheduled` for compatibility. The legacy integrated scheduler has been removed. Neither original mode builds a lattice plan, and no mode uses vehicle lead.

In Scheduled mode, which flight each grappler grips, and how it moves between them, is a pure function of the time since the nut's launch (`src/launcher/grapplerLattice.js`, one `GrapplerLatticePlan` per launch screw turn). Nothing is integrated from the launch: any moment can be shown without working up to it. Values are cached on a fixed time grid, but each is a pure function of its time.
- **Range.** A grappler can follow a flight across its range of motion: `adaptiveNutGrapplerMaxRangeOfMotion` turns either side of the middle of its travel, which is fixed to the nut and bounded by the screw's mount brackets.
- **The lattice.** The grapplers hold flights from one lattice of angles round the screw, `step` turns apart: the widest spacing of whole flights under the nut that fits in the travel, so every grappler always has a lattice flight within reach. Each holds the lattice flight nearest the middle of its travel. Neighbours therefore hold the same flight in runs, which end only where the drift of phase along the nut crosses half a step: as few runs as the spacing allows. When a flight drifts past half a step from the middle, the grappler hops to the next lattice flight, letting go half a hop's time before that moment and landing half a hop's time after.
- **Alone.** A grappler that would be alone on its flight is left free until a neighbour can join it.
- **Alignment.** Where the travel spans more than one flight spacing, there is more than one lattice (every second flight from the even or the odd ones, say). The one used has the fewest runs and free grapplers over the next 2 s. A change of lattice sweeps along the nut from front to back over 1 s, so the grapplers hop a few at a time where the old and new runs meet.
- **Narrow travel.** Where the travel is less than the spacing between flights, each grappler holds the nearest flight while it is within its travel, and is free in between.
- **Low speed.** At low speed the flights drift past fast and runs are short, so the grips are chained in layers instead (`src/launcher/grapplerLowSpeed.js`). The first layer keeps one grappler engaged from as early as one can be, starting with the grip that will last longest; before each grip lets go, the next has landed (the one lasting longest of those that can take over). Each further layer is another chain of the grips left free, so the guaranteed count rises: one, two, three... The lattice takes over at the earliest time from which its fewest engaged, for the rest of the run, is at least what the layers have kept engaged over the last hop: the guarantee never falls. The layers keep starting grips for two hops after that, and each grappler joins the lattice when its last grip from them ends (keeping its flight if that is its lattice flight).
- **Parking.** Grapplers that cannot grip are parked, raised and untwisted: those not on the thread yet, and those seeing flights that drift past faster than a hop can follow. They leave and rejoin the flights through the same movements.
- **Gaps.** How many runs there are is set by the screw. The grapplers sit in a line along it and the flights are helices, so the number of flights crossing the nut is `n · rps · nut length / speed`, and a run of neighbours on one flight ends at each crossing.

In Scheduled mode, between grips the grappler hops (`src/launcher/grapplerSwitchover.js`): detach, raise clear of the flights, untwist, move round, twist to the new flight, lower, attach. The movements overlap, each with its own smooth curve over the hop (`adaptiveNutGrapplerSwitchoverTime`, 0.6 s), so the pad never stops between them. While letting go, the pad slows to a stop short of the end of its travel.

`screwThreadLayout()` decides how many starts (flights) the screw has where. It always uses the most that leave room for a pad, in a doubling sequence that ends at `launcherMassDriverScrewThreadStarts` (for 8: 2, then 4, then 8; for 12: 6, then 12). The grapplers need an even number of flights, which also keeps the screw balanced, so every number in the sequence is even. Doubling keeps the existing flights and adds new ones halfway between them. Extra starts begin at a screw segment boundary, and each grappler uses the starts of the segment it is over, so screws and pads always agree. The launcher computes the layout once and shares it with the screws, the nuts and the specs.

Use `npm run profile` to measure a change (see the README).

## Floating-point precision

Three.js builds each object's model-view matrix in float64 on the CPU, but the GPU works in float32. At planet scale (6.4e6 m) a float32 has a resolution of about 0.5 m. Every mesh therefore keeps its vertex positions small, relative to a nearby origin, and puts the large offset in its `position`. That covers terrain tiles (relative to the tile centre), ring and track segments, the tethers and the trajectory line (in chunks). Do not create geometry with absolute planet coordinates. Shot camera paths are interpolated in float64 for the same reason.

## Shots and recording

The shot file format is documented at the top of `src/shots/ShotFormat.js`. A shot records:

- the preset id and a full parameter snapshot (taken when the shot is exported or rendered, so it includes the sun's date)
- the simulated start time and animation state
- camera keyframes, each at a video time, possibly relative to a moving object, with a time speed
- tracks for any parameter that changes during the shot (live takes)
- output settings

The pieces:

| Module | Role |
|---|---|
| `ShotTiming.js` | The time warp. Each keyframe's `speed` is simulated seconds per video second; between keyframes `speed + 0.05` changes geometrically, and simulated time is its exact integral, with an inverse for jumping to a simulated moment. `solveSpeedFor` finds the speed that puts a keyframe at a given moment. |
| `Anchors.js` | What a keyframe is relative to: the world or one particular object (launch `k`'s vehicle, sled or nut; the transit vehicle in lane `l` at frame position `p`; the elevator car at terminus `p`). The launcher and transit system answer where any such object is at any simulated time (`movingObjectFrameAt`, `vehicleFrameAt`, `elevatorCarFrameAt`), whether or not it has a model, because their animation is a pure function of time. Also lists candidates for picking and the events (launch stages, stops, elevator departures). |
| `CameraPath.js` | Interpolation. Every keyframe is resolved to world space at the *current* simulated time, then a Hermite spline with non-uniform Catmull-Rom tangents runs through them. Tangents only use neighbours tied to the same objects. Segments are `direct` (positions on the spline) or `orbit` (the target on the spline, the camera placed by direction and log-distance, the target moving in step with the distance), chosen per keyframe or automatically. |
| `ShotController.js` | The playhead (video time; drives `SimClock`), play/rewind/speeds, the free and shot-camera views, keyframe editing (changing a keyframe's anchor keeps its view at its own moment), picking objects under the mouse, fixed-step rendering, live takes and files. |
| `ShotPathOverlay.js` | The free view's drawing of the shot: the camera and target paths (sampled over the shot, each point at its own moment; chunked lines for precision), keyframe markers and a camera gizmo at the playhead. Hidden in the shot camera's view and while recording. |
| `src/ui/ShotSidebar.js`, `Timeline.js` | The panel on the left. Plain DOM; it only calls the controller (and sets the sun parameters). It is not part of the canvas, so it never appears in recordings. |

While recording, the path overlay and the tracking markers are hidden, and every frame is rendered at the output size with full quality.

Motion blur (`src/capture/MotionBlur.js`) is temporal supersampling: each video frame averages several sub-frames at moments spread over the shutter interval, centred on the frame's own moment. Each sub-frame is stepped and rendered to the canvas exactly as an ordinary frame (so nothing in the renderer knows about it), copied into a texture, converted to linear light and added into a float buffer; the average is converted back to sRGB and drawn to the canvas for the encoder. In adaptive mode the number of sub-frames per frame comes from the shot camera's motion over that frame's shutter (`adaptiveSubFrames`): a step of at most `motionBlurMaxStep` metres near things, growing with the distance to the nearest scenery (the closer of the camera's target and the ground) so that it moves at most `motionBlurMaxPixels` on screen. Terrain is waited for once per frame, not per sub-frame.

Supersampling (`src/capture/Supersampler.js`) enlarges the canvas itself (pixel ratio = the factor) while recording, so everything sized in pixels (the clouds' targets, pixel-based level of detail, line coverage) follows; the frame is filtered down with a Mitchell-Netravali filter in linear light into the canvas's output-sized bottom-left corner (where motion blur averages it), and copied to a 2D canvas for the encoder. Things whose look depends on pixel size are told the factor so a supersampled frame matches an ordinary one. Every recorded frame is made opaque, because the canvas has an alpha channel and the sky is nearly transparent there.

The render queue (`src/shots/RenderQueue.js`: the data and its pure operations, tested; `RenderQueueRunner.js`: running it in the page) renders many shots unattended. Each item holds a whole shot, so it carries its own preset, parameters, start time and output settings. Presets set construction-time options, so the page reloads to switch preset (and, by default, before every shot); the queue, the run state, the log and the output folder's handle live in IndexedDB, and `ShotController.resumePendingShot` carries a run on after the reload. Each shot is rendered by `ShotController.renderShotUnattended`, the same fixed-step path as **Render video**, with no dialogs. `scripts/render-shots.mjs` (`npm run render`) does the same from the command line: it starts Vite, opens a fresh headless page per shot with `?preset=`, calls `renderShotUnattended` with a `WritableStream` whose chunks are passed back to Node and written into the output file, and has a watchdog for shots that stop making progress.

`VideoRecorder` encodes the canvas with WebCodecs through mediabunny:

- AV1 is preferred; it falls back to H.264, then HEVC, then VP9.
- Output is MP4 or MKV.
- Recordings stream to disk where the File System Access API exists (Chrome, Edge) and are buffered in memory elsewhere.

## Testing

- `npm test` runs the unit tests: physics maths, the shot format, the camera path, the time warp, supersampling filter weights and the render queue.
- `npm run lint` runs ESLint.
- `npm run smoke` loads the full app in headless Chrome/Chromium and fails on any console error. Use `SMOKE_GPU=1` with real hardware; the software renderer takes over a minute to decode a single terrain tile. `--eval "<js>"` runs code against `window.tetheredRing` and prints the result, `--steps <file.mjs>` runs a multi-step check with screenshots, and `--page /tests/planet.html` targets a standalone test page.

## Sun, sky and atmosphere

- **Sun position.** `src/physics/solar.js` gives the subsolar point from the day of year and UTC time (NOAA approximation; effects longer than a year are ignored). `App.updateSun()` points the sun light along it every step, from the `sunDayOfYear` / `sunTimeOfDayUTC` parameters plus the simulated time. Left automatic, `App.resolveSunDate()` picks a repeatable daytime for the preset's opening view. Presets that place the sun themselves, and other bodies, keep their own.
- **Sun disc.** `SkyPass` draws the sun's disc and glow beyond the Moon. Seen through the air, the atmosphere shader draws it instead, because the sky is drawn over the sky pass.
- **Sunlight and skylight.** `src/scene/sunAndSkyLight.js` patches three.js's lights chunk, so every lit material (terrain, sea, ring, launcher, vehicles) is lit per fragment by the same atmosphere model as the sky:
  - The sun (`Lighting.sunLight`, intensity pi: full albedo under an overhead sun) is dimmed by the air between the fragment and the sun, reddening near the horizon, and is cut off where the planet is in the way. So the night side, ring and launcher included, is in the planet's shadow.
  - The ambient light is a hemisphere: the sky from above (`src/scene/skyIrradiance.js` integrates the sky's radiance for each sun elevation; it thins out with height) and the light bounced off the ground from below.
  - The scene's `AmbientLight` adds a little moonlight-coloured light on top, so things stay visible at night.
  - The lighting is only active while App renders the main scene (`Lighting.updateSkyLight`); the sky pass and other scenes keep three.js's plain lighting. Tethers and cables (`structureLines.js`) use the same model per vertex.
- **Atmosphere.** A shell 60 km above the ellipsoid, drawn from inside (its far side) and shaded per pixel by ray-marched single scattering (`src/shaders/atmosphere.frag.glsl`):
  - Rayleigh and Mie scattering with exponential density.
  - Sunlight attenuated along its path to each sample by the Chapman function.
  - Output is premultiplied over the background, dimmed by the air's transmittance, so stars fade by day.
  - From space it is the limb glow; from inside it is the sky. There is no switch-over between the two.
  - Like the sea fog, it is solved against the ellipsoid relative to the camera, with the large terms in float64 (`Planet.updateAtmosphere`).

**View status.** A readout in the bottom-right corner (`src/ui/ViewStatus.js`, **Rendering → showViewStatus**) shows the camera's latitude, longitude, altitude, heading, pitch and field of view, the date and time of day (UTC and local solar) and the simulated time; its Copy view button copies a link (`?preset=…&view=…`) holding the preset, the start's day of year and time of day (always), the simulated time, the camera in the planet's frame and every parameter changed from the preset's, which reopens exactly that view, paused at that moment. It is for reporting and reproducing what is seen; it is page HTML, so it is never recorded.

## Weather and clouds

- **Weather.** `src/physics/weather.js` gives the weather at any place and date: cloud cover, the low and high cloud layers' heights, rain and its convective share, and humidity, from a reanalysis climatology (`tools/sources/build_weather.py`; see docs/ASSETS.md) moved by the procedural lows and highs that also turn the wind (`src/physics/weatherNoise.js`). It is a pure function of place and date, so shots repeat. Squalls under heavy showers strengthen the wind on the sea (`seaWindAt`), which the boats and waves use.
- **Weather map.** `src/planet/clouds/weatherMap.js` evaluates the same formulas on the GPU into an equirectangular map (cover, rain, convective share, high cloud; low cloud base and top, wind), redrawn when the date changes. A test page check confirms it matches the CPU.
- **Clouds.** `src/planet/clouds/Clouds.js` draws volumetric clouds over the scene at half resolution, in three passes: a distance prepass (so clouds stop at the ground and at structures), a ray march through the shell from sea level to 13 km, and a composite. Cloud shapes come from tiling Perlin-Worley noise (`cloudNoise.js`), thresholded so the fraction cloudy matches the cover, anchored to the planet and drifting with the wind by flow-mapping. Convective weather gives cumulus that tower in showers; otherwise the layer is stratiform. Lighting uses the sun (through the cloud, with a two-lobed phase function and approximate multiple scattering), the sky and the ground (sunAndSkyLight.js), then the air's haze in front. Too far away for single clouds to be told apart, the density becomes its expected value, with large-scale structure added from a coarser tile of the same noise. The march samples only points fixed to the planet: it crosses the cells of a grid in the planet's axes (powers of two growing with the distance, so each divides the next), integrating the density across each cell's stretch by Simpson's rule from the grid's planes, with coarse cells skipped where the weather's layers or bounds on the noise (`cloudNoise.js` occupancy) show they are empty. Moving the camera changes only where the clouds are seen from, never what is sampled, so they do not shimmer, slide or pop; nothing changes from frame to frame, so recordings are repeatable. **Rendering → showClouds** turns them off.
- **Cloud types.** At every altitude the cloud cover is the satellite snapshot's (`src/planet/clouds/realClouds.js`, data in `assets/clouds`; see docs/ASSETS.md), the one nearest the simulated date in the year, so the sky seen from the ground matches the Earth seen from space; it is a real day, not the weather's, so the clouds do not line up with the weather's rain and wind. Without the imagery the weather's cover is used. The cover is shared between two layers: high cloud (cirrus, cirrostratus) takes the thin part of the opacity as far as the reanalysis has high cloud often, and, being thin, covers more of the sky than its opacity, as fibrous streaks drawn out along the wind aloft; low cloud takes the rest, as a few fair-weather cumulus where there is little (always a few), stratocumulus and then a stratus sheet as it rises, and towering cumulus in showers where the imagery shows cloud. Far away each layer's density becomes the expected value that gives its share of the opacity, so from space the clouds are the imagery. The haze through thin air is on the ground's own scale (`atmoHazeScale`), which turns the dark sea blue from space, and the sea surface adds the blue light deep water sends back. Over the clouds the haze is the brighter of the sky's light and its own physical scale (with multiple scattering), so clouds near the horizon seen from orbit are hazed blue-white rather than reddened.
- **Weather effects.** The same pass shades the scene under the clouds (screen space: from each pixel's scene point it marches towards the sun through the clouds, and dims the scene by the sun's share of the light there times that transmittance, and the sky's share under overcast), adds rain shafts under raining clouds and haze, mist or sea fog from the surface humidity (both cut visibility, lit by the sun reaching the end of the line of sight), and rain streaks over the view when the camera is in the rain. The reanalysis's rain is an area average; under the raining clouds it is heavier (`showerRain`), which also sets how high showers tower.

## The sea

On planets with oceans (`planetSpec.hasOcean`), the planet renderer draws the sea surface from above (see the table above). `src/planet/Ocean.js` handles being in the sea. When the camera is below sea level and above the sea floor, there is no sky: the background is the water colour, which darkens with depth, and the underside of the surface is drawn around the camera, out to twice the visibility. The underside follows Snell's window: within 48.6 degrees of the vertical it is mostly clear, reflecting more towards the window's edge (Fresnel's equations from water into air, softened by the ripples); beyond that it reflects totally and shows the water colour, opaque. A second copy of the disc draws that opaque part in the opaque pass with depth writes, so nothing above the surface shows through it, whatever order it is drawn in. Things fade into the water colour by how far the line of sight travels through water (`underwaterVisibility`, a visual cue rather than realism). The evacuated tube has no water inside it, so `src/planet/waterFog.js` leaves out the part of the line of sight that is inside the tube. It models the tube as a cylinder along its direction at the point nearest the camera (`launcher.tubeNear`), relative to the camera, and solves per fragment in the fog shader chunks. From inside the tube, the tube is clear and the water beyond its walls is fogged; from outside, looking through the tube adds no fog for the stretch inside it.

The surface seen from above (`CubedSpherePlanetRenderer._createWaterMaterial`) is the imagery's ocean colour as a mostly clear body of water, with a surface on top: wind-driven waves (`src/planet/seaWaves.js`) that reflect the sky by Fresnel's law (the sky by the atmosphere's own model) and glint in the sun, plus gusts and whitecaps. The waves are 72 trains in fixed directions whose phases are a pure function of place and simulated time, split per tile in float64 like the sea's noise. The wind at the camera's point on the sea, the same wind the sailboats sail in, sets only their amplitudes: the mean square slope is Cox and Munk's for the wind speed, and the trains are weighted towards the wind's direction. Waves too fine for their pixel are left out, and their slope variance roughens the glint instead, so it spreads into a glitter path with distance; that roughness follows the wind where it is (the weather map's wind, `seaRoughnessHere`), not the camera's, so from space the glint follows the weather instead of changing all at once as the point under the camera moves. The reflection is averaged over the sea's slopes: wave faces tilted away from the viewer are hidden behind those tilted towards it, so a rough sea reflects about 30% of the sky near the horizon (more only when calm), and sky from higher up than a mirror would. Whitecaps cover Monahan's fraction for the wind, in lacy patches a metre or two across. Wherever the sea is drawn in place of the surface (the tiles' and the camera disc's undersides from above, and the sea the sky draws near the horizon), it reflects the sky in the same way.

Seasonal sea ice (`src/planet/seaIce.js`, data in `assets/sea_ice`; see docs/ASSETS.md) is drawn on the sea surface, and on the ground just above sea level so it reaches the shore, for the simulated date (`showSeaIce`).

Sailboats (`src/scene/Sailboats.js`, model `models/sailboat.obj`) are drawn within 20 km of the camera while it is below 30 km, as references for scale (`showSailboats`): some at anchor close to the shore without sails, the rest sailing reaching legs to and fro, more of them near the shore. Where they are comes from a cell grid seeded by the cells' indices and the terrain heights of fixed tiles (`Planet.fixedHeightSampler`: the deepest tile at each place, not whatever is loaded for display), and where they sail from the simulated time, so they are the same on every machine. Their wind is the weather at the simulation's start date (`seaPlacement.windAt`, from `src/physics/wind.js`: a reanalysis climatology with procedural eddies; see docs/ASSETS.md), so changing the start date places them again. They keep clear of sea ice. They cast and receive shadows from the sun's local shadows (`Lighting.enableLocalShadows`: a 80 m frustum on the boat nearest the camera); because three.js looks shadows up from float32 world positions (good to ~0.5 m at planet scale), the boats' materials look them up from their position relative to the boats' origin instead.

Container ships (`src/scene/ContainerShips.js`, model `models/container_ship.obj`) sail the lanes of `src/data/shippingLanes.json` and lie at its anchorages off major ports (`showContainerShips`). Lanes are waypoints joined by great circles; each direction keeps to starboard, and `tools/check_shipping_lanes.py` checks every lane and anchorage against the elevation data (run it after editing them). Ships come in three sizes built from the one model (`SIZES`: the hull's midbody lengthened or shortened by whole bays, the beam scaled to the rows), with the superstructure in a random midbody bay, hull colours of the main lines, and containers stacked to random heights from the ship's load (`shipDesign`, tested in `tests/ships`). Their positions are a function of the simulated time and their designs of their seeds; anchored ships are placed from fixed terrain tiles, like the sailboats. The launcher gets ships of its own (`setLauncherTraffic`, from `launcher.pathPoints`): one lying within a few kilometres of its start and a dozen sailing to and fro along its mass driver's underwater stretch, within 10 km of it; a launcher on land gets a small anchorage and a lane at the nearest deep water. Cutters (`models/warship.obj`), white for the coast guard or grey for the navy, sail every lane, lie off about half the anchorages, and two coast guard cutters patrol each underwater launcher back and forth: one along its whole corridor, one around its start. From above the sea, a ship's hull fades into the water below the waterline over a few metres; the sea's own darkening of what is under it stays gentle so the submerged launcher tube stays in view.

An underwater launcher has an ocean terminal at its breech (`src/launcher/OceanTerminal.js`, model `models/launcher_ocean_terminal.obj`; `showLauncherOceanTerminal`), when the breech is at least 45 m down. The model has no materials, so `terminalModel.js` finds its parts by name and shape: the windows and doors by their size, the lamps by the downward faces of the lamp heads, and the breech and anchor points from its `_marker` rings. It triangulates the walls (n-gons with holes for the windows) by ear clipping, as OBJLoader's fans would cover the windows.
- The underwater terminal is placed with its launcher marker at the start of the tube (`launcher.startFrame()`), along the tube and level. The elevator shaft is stretched from the floating terminal down to it.
- The floating terminal and its pier turn about the shaft so that the pier points downwind (the wind at the start date, as for the ships). The underwater terminal does not turn.
- Two mooring cables run from each anchor marker, splayed diagonally out from the terminal's ends (`AnchorCables.js`). Each hangs as a catenary that meets the sea floor level at its anchor, 1.2 times the depth away. They are drawn as solid cable up close (one merged mesh) and as glowing structure lines from afar, like the launcher's mooring cables. The anchors follow the streamed terrain.
- Cargo traffic (`terminalPort.js`, a pure function of the simulated time, tested in `tests/launcher`): feeders (the container ship's smallest size) call at the berths either side of the pier in turn, on the launch cadence (below). Each sails in from 8 km downwind and is moved sideways onto its berth. A pedestal crane on the pier's edge (slewing, luffing jib, rotator spreader) lifts 5 to 10 containers off it, each the top of its stack within reach, onto a rack beside the crane. A lift-AGV carries each into the terminal through its door. The ship then turns away and sails off downwind. `TerminalTraffic.js` draws the ships (built by `ContainerShips.buildShip`), the cranes, AGVs, racks and containers in transit.
- Launch cadence (`src/launcher/launchCadence.js`, tested in `tests/launcher`): `launchVehicleSpacingInSeconds` is the one cadence. Launch k starts accelerating at launcher time k × spacing (simulated time `launcherStartDelayInSeconds` + k × spacing / `launcherSlowDownPassageOfTime`). At a launcher with an ocean terminal (decided from the breech's depth, not from whether the terminal is drawn), each launch's vehicle, nut and sled are first drawn out of the underwater terminal along the line of the tube, from 120 m behind the breech, over `launcherTerminalEgressDuration` (launcher time, so deltaT runs from minus that). They start from rest and arrive at the path's starting speed, or at most 3 m/s. The feeders call every launch, or every few launches when launches come faster than the berths can take ships (900 s). Each ship's containers are in the terminal and loaded by the time its launch leaves the bay (`terminalPort.terminalSchedule`). The launcher's launch stride is then a whole number of ships. The launcher's clock runs during the start delay so that the first egress can happen then; the screws still wait for the delay.
- Between dusk and dawn (the sun below 2 degrees, fully on by -4), the lamps light the pier and the things on it. They are spotlights computed only in those materials' shaders (`portLamps.js`, with lamp positions in view space from float64 matrices), not three.js spotlights, which every lit material would pay for. Their lenses glow, faint beams hang below them, and the terminal's windows and doors glow.

The tube's wall is clear, with a faint surface (`src/launcher/tubeWallLook.js`): it is more opaque at grazing angles, as glass is, with faint streaks along it, soft mottling and panel joints every 12 m. The detail fades out below a pixel.

From above the sea, `src/planet/seaDarkening.js` fades things into dark water by the length of the line of sight that lies inside the sea, so the sea floor and the lower slopes of islands beyond the horizon do not show through the water. The disc around the camera also acts as an opaque underside for rays that dip under the surface. The fade is added to three.js's fog shader chunks, so every built-in material gets it, and its uniforms are shared by reference across materials. The sea floor, the sea's underside and the surface's gusts and whitecaps use the same planet-anchored fractal noise (`src/planet/seaNoise.js`). The tube's far-away line, drawn over the surface, fades out under the water instead of darkening, as the cables do.

Where the mass-driver tube's centre is below sea level, `src/launcher/MooringCables.js` holds it down to the sea floor with inverted Vs of cables (`launcherMassDriverMooring*` parameters). There is one mooring every `launcherMassDriverMooringSpacing` metres, starting half a spacing in from the tube's end. Like the ring's tethers, each leg forks `launcherMassDriverMooringForkLevels` times on its way up: halfway up, then halfway along the rest, and so on, halving its cross-section each time. So one pair of anchors holds the tube at 2^levels points spread evenly over its spacing. The anchors use the streamed terrain heights and are re-checked as tiles load.
