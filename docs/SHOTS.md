# Shots and video capture — user's guide

This guide shows how to capture a video recording of a scene rendered using the digital twin: how to frame and time a
camera move, turn it into a repeatable **shot**, preview it, and render it to a video file.

Everything happens inside the browser — no screen recorder, tar files, PowerShell or ffmpeg
are needed, and it all works with the mouse alone. Nothing in the panel, and nothing drawn to
help you set up a shot (camera paths, keyframe markers), ever appears in a video: a recording
captures only the 3D scene.

A **shot** (`.shot.json`) is a self-contained recipe for a piece of footage: the preset and every
parameter, the simulated time it starts at (which fixes where every vehicle and elevator is), the
camera path, any parameters that change while it plays, and the output video settings. Because the
model is deterministic, importing the same shot file on another computer reproduces exactly the
same frames. The file format is documented in
[`src/shots/ShotFormat.js`](../src/shots/ShotFormat.js).

> New to the panel? Jump to the [five-minute quick start](#five-minute-quick-start) and come back
> for the details.

## Contents

- [Opening the panel](#opening-the-panel)
- [Key ideas](#key-ideas)
- [Five-minute quick start](#five-minute-quick-start)
- [The panel, section by section](#the-panel-section-by-section)
  - [Time](#time)
  - [Sun](#sun)
  - [View](#view)
  - [Keyframes](#keyframes)
  - [Shot](#shot)
  - [Video export](#video-export)
  - [Render queue](#render-queue)
- [Live takes](#live-takes)
- [Rendering many shots unattended](#rendering-many-shots-unattended)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [Settings reference](#settings-reference)
- [Troubleshooting](#troubleshooting)

## Opening the panel

The **🎬 Shot & video** panel sits on the left of the window. Press **—** in its header to minimise
it; press the **🎬 Shots** tab that appears to bring it back. The panel remembers which sections you
had open between visits.

The panel has seven collapsible sections, top to bottom:

| Section | What it does |
|---|---|
| **Time** | Play, pause, scrub and jump the playhead; the playhead drives simulated time |
| **Sun** | Set the date and time of day the sunlight comes from |
| **View** | Switch between flying the camera (free view) and seeing what the shot sees |
| **Keyframes** | The timeline and per-keyframe editor — the heart of building a shot |
| **Shot** | Name, start time, duration, interpolation; new/import/export |
| **Video export** | Resolution, frame rate, codec, motion blur, supersampling; render and live take |
| **Render queue** | Render many shots one after another, unattended |

## Key ideas

A few concepts make everything else easier to follow:

- **Simulated time** is the clock of the model: where each launch vehicle, transit vehicle and
  elevator car is. It is measured in seconds from the start of the simulation.
- **The playhead drives simulated time.** When you play or scrub the shot, you are moving simulated
  time, so the whole scene animates. A shot's **time speed** controls how many simulated seconds
  pass per video second, so one shot can show a launch at 1× and then the long coast at 60×.
- **Video (shot) time** is seconds from the start of the shot's video — the x-axis of the timeline.
- **Keyframes** are snapshots of the camera (position, where it looks, field of view, …) at a given
  video time. The camera is interpolated smoothly between them.
- **Anchors** let a keyframe be defined *relative to a moving object* instead of the world. "Ride
  with launch vehicle #0" stays glued to that vehicle at every moment of the shot, however fast time
  runs. This is what makes chase shots reproducible.

## Five-minute quick start

This builds a short orbiting shot of the launcher. (For a finished example to pull apart instead,
**Import…** [`examples/shots/launch-to-orbit.shot.json`](examples/shots/launch-to-orbit.shot.json).)

1. **Pick the moment.** In **Time**, scrub to an interesting instant, or use **Next ▶** to jump to a
   launch. In the **Shot** section press **Now** next to *Starts at sim time* so the shot begins
   here.
2. **Frame the first view.** In **View**, click **Free view** and fly the camera with the mouse
   (drag to orbit, right-drag to pan, wheel to zoom). With the playhead at `0 s`, press **A** (or
   **+ Add keyframe**). That is keyframe 1.
3. **Frame the second view.** Move the playhead forward (type `6` into *Shot time*, or drag it on
   the timeline), fly the camera somewhere new, and press **A** again. You now have a two-keyframe
   move.
4. **Preview it.** Press **Shot camera** (or **B**) to see exactly what the video will show at the
   playhead, framed to the output aspect ratio. Press **▶ Play the shot from the start** to watch
   the whole move in real time.
5. **Render it.** Open **Video export**, choose a resolution and frame rate, and press
   **⏺ Render video**. The video downloads when it finishes.
6. **Save the recipe.** In **Shot**, press **Export…** to save a `.shot.json`. Anyone who imports it
   gets the identical footage.

## The panel, section by section

### Time

The **playhead** is a position in the shot's video, and moving it moves simulated time with it.

- **Transport:** go to start, play backwards, step back one frame, **play/pause**, step forward one
  frame, go to end. The speed menu on the right sets the playback (and rewind) speed, from **0.005× to
  100×**. This affects only how fast you *preview*; it is not the shot's own time speed.
- **Timeline:** drag the playhead or click on the ruler to move it; drag elsewhere to pan; use the
  wheel to zoom; **Fit** frames the whole shot. The green handles are the shot's start and end —
  drag them to move either. Moving the start keeps every keyframe at the same *simulated* moment.
- **Jump boxes:** type a *Simulated time* or a *Shot time* to go straight there.
- **Loop the shot** repeats it while playing.
- **Previous / Next** and the **Jump to…** menu go to the moments that matter: launches; and, for
  the object the selected keyframe follows, a launch's stages (mass driver, ramp, evacuated tube,
  free flight), a transit vehicle's arrivals and departures at each stop, or an elevator car leaving
  and reaching the ring and the ground.

The playhead can run before `0 s` or past the end while you hunt for the right instant; the shot
itself still starts and ends at its green handles.

### Sun

The lighting comes from a real sun position. **Day of year** and **Time of day (UTC)** set where the
sun is at simulated time 0; it then moves on as simulated time advances (a time warp moves it
faster). The section shows the local solar time and the sun's elevation at the place in view, so you
can line up a sunrise, golden hour or night shot. The sky colour, sunsets and the glow around the
sun all follow from this.

(Some presets place the sun themselves; for those the two controls have no effect, and the section
says so.)

### View

**The key idea: there are two cameras.** Picture a film set with two cameras pointed at the scene:

- **The free camera** is the one *you* hold. You fly it with the mouse to look around, scout angles
  and compose each shot. It is a scouting tool — it never appears in the final video.
- **The shot camera** is the one that films the video. It isn't flown by hand; instead it follows the
  path defined by your keyframes. At any playhead position it sits wherever that path says.

The **View** section chooses **which of the two cameras you are looking through right now**. It does
not change the shot — it only changes your viewpoint. The two buttons (also toggled with **B**):

- **Free view** — look through the *free camera* and fly it with the mouse (drag to orbit, right-drag
  to pan, wheel to zoom). Use this to find and frame a view before pressing **A** to turn it into a
  keyframe. In this mode the shot camera's whole path is drawn in the scene so you can see the move
  from the outside: the camera path in orange, the path of what it looks at in blue, a marker at each
  keyframe, and the shot camera itself at the current playhead. (Hide this drawing with **Show the
  shot's path in the free view**.)
- **Shot camera** — look *through the shot camera*: exactly what the video will show at the current
  playhead, letterboxed to the output aspect ratio. This is your framing check. You can't fly in this
  mode — scrub the playhead and the view follows the shot's path. Switch back to **Free view** to
  keep editing.

A simple way to think about it: **Free view = "I'm composing the shot"**, **Shot camera = "show me
what I've got."** Flip between them with **B** as you work.

The rest of the section:

- **▶ Play the shot from the start** — plays the whole shot in real time, from `0 s`, so you can
  watch the finished move. (It plays through the shot camera.)
- **Field of view (°)** — the free camera's field of view (how wide a view it has). When you press
  **A**, this value is baked into the new keyframe, so set it here before adding a keyframe to get a
  wide or telephoto look.
- **Move view to shot camera** — switches to Free view and teleports the free camera to wherever the
  shot camera is at the current playhead. Handy when you like the shot's framing at some moment and
  want to keep flying from there.
- **Stop following** — if the free camera is riding a moving object (because a keyframe you're editing
  follows one, or you pressed *Go to* on such a keyframe), this detaches it so it stays put again.

### Keyframes

This is where a shot is built. The **timeline** shows every keyframe; below it is the **list** and
the **editor** for the selected keyframe.

To add a keyframe: get into **Free view**, frame the shot, put the playhead at the video time you
want, and press **+ Add keyframe** (**A**). A new keyframe inherits the selected keyframe's settings,
including the object it follows, so chaining similar keyframes is quick. Click a keyframe (in the
list or on the timeline) to select and edit it; drag it on the timeline to retime it; press **K** to
delete the selected one.

Each keyframe has:

- **Time in shot (s)** — its video time.
- **Simulated time (s)** — the instant it lands on. Press **Now** to pin it to the current simulated
  time (jump to an event first). Setting this works out a **time speed** for you; *…by changing*
  chooses whether that adjusts the previous keyframe's speed or this one's.
- **Camera moves with** — the **anchor**: the *world*, or one particular launch vehicle, launch sled,
  adaptive nut, transit vehicle or elevator car. Choose a kind (the one nearest the middle of the
  keyframe's view is taken) or press **🎯 Pick** and click the object in the scene. The camera then
  rides with that object, keeping this keyframe's framing relative to it at every moment.
- **Camera frame** (for a moving anchor) — whether the view **turns with the object**, stays
  **level and turns only with its heading**, or **moves with it but never turns** (world-aligned).
- **Looks at** — by default the same object the camera rides; or a *different* anchor, e.g. ride
  with a transit vehicle but look at the terminus's elevator car. **🎯 Pick** works here too.
- **Time speed** — simulated seconds per video second at this keyframe (**0 freezes time**). Speeds
  blend smoothly between keyframes.
- **Field of view (°)**.
- **Path to next** — how the camera travels to the next keyframe:
  - **Direct** — a straight smooth curve through the keyframes.
  - **Orbit & zoom** — moves around the target with the distance changing by equal factors per
    second (e.g. 50 m out to 20,000 km in a few seconds) while keeping the subject framed.
  - **Auto** (default) — orbits when the distance changes more than threefold or the camera circles
    its subject, and moves directly otherwise.
- **Ease in and out** — the camera slows to a stop at this keyframe and starts off gently.

**Go to** moves the playhead and the free camera to the keyframe; **Update from view** replaces the
keyframe with the current view (relative to its objects as they are now); **Delete** removes it.

**Interpolation** (in the **Shot** section) is **Smooth spline** for hand-built shots, or **Linear**
for live takes.

### Shot

Metadata and file actions:

- **Name**.
- **Starts at sim time (s)** — the simulated instant the shot begins (press **Now** to use the
  current time). This fixes where everything in the scene is.
- **Duration (s)** — the shot's length; **Fit** ends it at the last keyframe.
- **Interpolation** — **Smooth spline** or **Linear**.
- **New shot** — an empty shot starting at the current simulated time (prompts first if you have
  unsaved keyframes).
- **Import…** — load a `.shot.json`. It restores the preset, every parameter (including the sun),
  the start time, the camera path and the output settings. A shot made with a different preset
  reloads the page with that preset first. Old shot files (from before keyframes could follow
  objects) still load.
- **Export…** — save the shot, with every parameter, as a `.shot.json`.

### Video export

Set these before you render:

- **Resolution** — pick a preset (720p up to 4K, plus portrait and square) or type a custom
  **Width × height** (even numbers; encoders need them for chroma subsampling).
- **Frame rate** — 24, 25, 30, 48, 50, 60 or 120 fps.
- **Codec (preferred)** — **AV1** (default), **H.264**, **H.265** or **VP9**. If the browser can't
  encode your choice at that size, it falls back automatically (AV1 → H.264 → H.265 → VP9).
- **Container** — **MP4** or **MKV**.
- **Bitrate (Mbps, 0 = auto)** — auto derives a deliberately high bitrate from the resolution and
  frame rate; set a number to override.
- **Motion blur** — removes temporal aliasing (strobing and the "wagon-wheel" effect) when the
  camera passes repeated structures — brackets, tube joints, screw threads, tethers — at speeds that
  beat with the frame rate. Each video frame becomes the average of several renders (**sub-frames**)
  spread over the **shutter angle** (360° leaves no gaps between frames). It affects recordings only,
  and rendering takes as many times longer as there are sub-frames.
  - **Adaptive** (recommended) chooses each frame's sub-frames from how fast the camera moves then:
    near things it moves at most **Camera step near things** (default 1 m — keep it under half the
    spacing of what you pass; mass-driver brackets are ~5 m apart) between sub-frames; further away
    the step grows so the nearest scenery moves at most **Scenery motion per sub-frame** (default
    2 px). **Most sub-frames per frame** caps it. A camera riding a launch vehicle gets hundreds of
    sub-frames; a slow pan gets the fewest.
  - **Fixed** uses the same **Sub-frames** count for every frame.
  - **Jitter sub-frame times** (off by default) puts each sub-frame at a random but repeatable
    moment within its share of the shutter, instead of evenly spaced. Evenly spaced sub-frames that
    move things more than a pixel each show as separate copies. When the step between them is close to
    a simple fraction of the spacing of what the camera passes (a 1 m step past 5 m brackets is
    exactly 1/5), the copies land in only a few places and stay sharp. At a whole number of spacings
    per frame they also freeze on screen, and near it they crawl. Jitter scatters the copies
    differently every frame, so that pattern becomes a faint grain, which is smaller with more
    sub-frames. It costs no extra rendering. Turn it on for fast passes along repeated structures.
    Leave it off when the sub-frames are already close together on screen, where it only adds grain.
    With jitter, what counts is how many sub-frames fall within one spacing of the repeated
    structure. That is fewest at low speed, so raise **Fewest sub-frames** to about 48. At high speed
    the many spacings passed per frame fill in by themselves, so **Most sub-frames per frame** can
    usually come down. For the launch-vehicle ride in `shots/FollowLaunchVehicle.shot.json`, 48 to 128
    rendered cleaner than the defaults (16 to 1024), at under half the sub-frames.
  - **Preview this frame** renders the frame at the playhead exactly as the recording will (motion
    blur and all) and shows it.
- **Supersampling** — render each frame at 1.5× to 4× the output resolution per axis and filter it
  down (Mitchell–Netravali filter in linear light), which removes the shimmer on thin lines and
  distant detail that the canvas's MSAA leaves. **2 × 2** is a good default (~2–2.5× the time per
  frame; 3 × 3 ~4.5×). The factor drops automatically if the GPU can't render that size.
- **Wait for terrain tiles** — each frame waits until the terrain it shows has finished streaming,
  so no frame contains half-loaded terrain.
- **Stream to a file (large videos)** — when your browser supports it, write straight to a file you
  choose instead of buffering the whole video in memory and downloading it. Recommended for long or
  high-resolution videos.

Then press **⏺ Render video**. Rendering is frame-by-frame at a fixed time step, independent of how
fast your computer draws, so the result looks identical on every machine. The panel estimates how
many renders the shot will take, and shows progress. Rendering requires a browser with a WebCodecs
video encoder (recent Chrome, Edge, Safari 17+, Firefox 130+); without one you can still build,
preview and export shots, just not render video in the browser — use the
[command-line renderer](#rendering-many-shots-unattended) instead.

### Render queue

Render several shots one after another without anyone at the computer. Add shots to the queue, press
**▶ Render the queue**, and each is rendered — with its own preset, parameters and output settings —
and saved, the page reloading between shots so every scene is set up fresh. **Export queue…** saves a
`.queue.json` you can render from the command line or on another computer. Rendering runs best with
the tab visible and the computer kept awake; for long unattended runs, the
[command-line renderer](#rendering-many-shots-unattended) is more robust.

## Live takes

A **live take** records a shot *as you fly the camera*, instead of placing keyframes by hand. Press
**Start live take** in **Video export**, then fly the camera with the mouse; every frame's camera
pose, and any parameter you change, is recorded (as a Linear-interpolated shot). With **Encode the
live take** on, the video file is written at the same time. Press **Stop live take** to finish, then
**Export…** the shot to keep it. A live take replaces the current shot, so export anything you want
to keep first.

## Rendering many shots unattended

For long overnight runs the command-line renderer is the most robust option. It renders shot files,
or a queue exported with **Export queue…**, in headless Chrome/Chromium/Edge — one fresh browser
page per shot — and writes each video straight into a folder:

```bash
# POSIX
npm run render -- --out renders docs/examples/shots/launch-to-orbit.shot.json
npm run render -- --out renders render.queue.json
```

```powershell
# Windows PowerShell
npm run render -- --out renders docs\examples\shots\launch-to-orbit.shot.json
npm run render -- --out renders render.queue.json
```

Each shot renders with its own preset, parameters and output settings, exactly as **⏺ Render video**
would. Progress is printed and a `render-log.txt` is kept in the output folder. A shot that fails, or
makes no progress for 30 minutes (`--stall-minutes`), is logged and skipped, and the next starts in a
fresh browser. Videos already present are skipped, so re-running carries on where it stopped
(`--overwrite` re-renders them). Each video is written to `<name>.part` and renamed when finished, so
a half-written file is never mistaken for a finished one.

One browser renders one frame at a time, and most of each frame's time is JavaScript on a single CPU
core, so the GPU is mostly idle. `--workers <n>` renders each shot in n browsers at once: each takes
the next few seconds of the shot (`--chunk-seconds`, default 5) and finished ranges are appended to
the render's saved segments in order. The result is the same video a single browser would make, and
an interrupted run resumes the same way (finished ranges are kept, whichever worker made them). Each
worker needs about 2 GB of memory and one CPU core; on an 8-core CPU, 4 to 8 workers is the useful
range.

```bash
# POSIX
npm run render -- --workers 6 --out renders docs/examples/shots/launch-to-orbit.shot.json
```

```powershell
# Windows PowerShell
npm run render -- --workers 6 --out renders docs\examples\shots\launch-to-orbit.shot.json
```

Options that apply to every shot: `--width`, `--height`, `--fps`, `--codec av1|avc|hevc|vp9`,
`--container mp4|mkv`, `--bitrate <Mbps>`, `--supersample 1|1.5|2|3|4`,
`--motion-blur off|fixed|adaptive`, `--motion-blur-jitter on|off`; `--workers <n>`, `--chunk-seconds <s>`; `--headful` shows the browser window. The full list is at the top
of [`scripts/render-shots.mjs`](../scripts/render-shots.mjs). Set `CHROME_PATH` if Chrome, Chromium
or Edge is not found automatically. Keep the computer from sleeping during the run (Windows:
Settings → System → Power; macOS: `caffeinate -i npm run render -- …`).

## Keyboard shortcuts

These act on the shot. (The full list is behind the **Keyboard shortcuts** button in the app.)

| Key | Action |
|---|---|
| `Space` | Play / pause the shot playhead (drives simulated time) |
| `A` | Add a camera keyframe at the playhead from the current view |
| `K` | Delete the selected keyframe |
| `B` | Switch between the free view and the shot camera |
| `,` | Step back one frame |
| `.` | Step forward one frame |

## Settings reference

### Anchor types

A keyframe's **Camera moves with** / **Looks at** can be any of:

| Anchor | Rides / looks at |
|---|---|
| **World** | A fixed point relative to the planet |
| **Launch vehicle** | A mass-driver launch vehicle |
| **Launch sled** | The sled that accelerates a vehicle |
| **Adaptive nut** | An adaptive nut on the mass driver |
| **Transit vehicle** | A transit vehicle on a ring lane |
| **Elevator car** | An elevator car |

**Camera frame** for a moving anchor: **Turns with the object** (follow), **Level, turns with its
heading** (level), or **Moves with it, never turns** (translate).

### Output defaults

| Setting | Default |
|---|---|
| Resolution | 1920 × 1080 |
| Frame rate | 60 fps |
| Duration | 10 s |
| Codec | AV1 (falls back to H.264 → H.265 → VP9) |
| Container | MP4 |
| Bitrate | Auto (high) |
| Motion blur | Off |
| Shutter angle | 360° |
| Jitter sub-frame times | Off |
| Supersampling | Off |
| Wait for terrain tiles | On |

## Troubleshooting

- **"Add at least one keyframe before rendering."** — The shot has no keyframes. Build the camera
  path first (see [Keyframes](#keyframes)).
- **"Recording needs a browser with WebCodecs."** — Your browser has no video encoder. Build,
  preview and **Export…** the shot, then render it in a recent Chrome/Edge, or with
  [`npm run render`](#rendering-many-shots-unattended).
- **"There is no <object> at this keyframe's moment."** — The object the keyframe wants to follow
  does not exist at that simulated time. Jump to a time when it does (use **Previous / Next** or
  **Jump to…** under **Time**), then set the anchor.
- **Blurry or missing terrain in the video** — turn on **Wait for terrain tiles** so each frame
  waits for its terrain to stream in.
- **Strobing / "wagon-wheel" motion past brackets or tethers** — turn on **Motion blur** (Adaptive),
  and keep *Camera step near things* under half the spacing of what the camera passes.
- **Sharp copies of brackets that freeze or crawl at certain speeds, even with motion blur** — the
  sub-frames are lining up with the bracket spacing. Turn on **Jitter sub-frame times** and raise
  **Fewest sub-frames** to about 48, so the grain it leaves is faint.
- **A shot imported fine but looks different** — check it was made with the same preset. Importing a
  shot from another preset reloads the page with that preset; let the reload finish.
- **The render is slow** — supersampling and motion blur multiply the work per frame. Lower the
  supersample factor, reduce sub-frames (or the *Most sub-frames per frame* cap), or render at a
  smaller resolution first to check the framing.

---

For the quick reference inside the main README, see
[Recording video and repeatable shots](../README.md#recording-video-and-repeatable-shots). For how
the code is organised, see [docs/ARCHITECTURE.md](ARCHITECTURE.md).
