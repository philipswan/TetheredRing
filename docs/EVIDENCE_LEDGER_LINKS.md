# Evidence Ledger Links

Select **Evidence Ledger Links** in the Preset menu, or open `?preset=EvidenceLedgerLinks`.
It inherits the Hawaii engineering model and enables lift fans. Expensive scenery and effects
are disabled, including clouds, atmosphere, ocean, sea ice, boats, ring/transit scenery,
brackets, rocket glow and charts.

The Rendering folder has two independent, shot-saveable switches (off by default elsewhere):

- `showObjectLabels`: compact names for identifiable main launcher components.
- `showEvidenceLedgerLinks`: separate cards containing complete claim statements and clickable links.

`src/scene/EvidenceLedgerCallouts.js` centralizes discovery, attachment, projection, visibility,
layout, canvas graphics and browser link controls. The app lazily creates it and invokes its
last overlay pass. `src/scene/evidenceLedgerClaims.json` contains all 48 reviewed VPSL claims,
full titles, destinations, scene associations and display instructions. No network access is
needed during playback. Claims are links to the Ledger, not assertions of review verdicts.

## Attachments and visibility

Anchors bind to physical objects, not GPU draw addresses. `InstancedProxyPool` reorders instance
slots by camera distance each frame; callouts ignore those render batches and use their logical
scene proxies/semantic parents. Pooled screws include segment identity; moving models include
launch identity. A change of physical source starts a fresh quiet interval.

An attachment is stored in local component coordinates and transformed by the current rendered
`matrixWorld`. Switching LODs, adding crew meshes or moving the camera cannot change that local
point. Spacecraft, nut and sled use their known body centres, transformed through the actual
model, its visual scale and parent. Stored nuts/sleds use the crane's rendered storage models.
No smoothing is applied to projected attachment dots, which would make them lag behind objects.
The terminus retains one selected hull/deck attachment while it remains visible, without switching
at sea level. Mooring leaders end on rendered line vertices.

The three section labels are **Horizontal Acceleration Section**, **Ramp Section** (the full
ramp, including the electromagnetic braking portion) and **Elevated Evacuated Tube**. A section
binds to the closest curve point when acquired and keeps that point while in view. Camera-focus
changes do not drag its anchor along the track. Leaving the view permits a new attachment.
The exit airlock has the fixed EET endpoint; Mauna Kea has a geodetic summit landmark supplied
by the Evidence Ledger preset, rather than an anchor on the tube or the camera's orbit target.

Visibility requires a prominent projected size, frustum checks, planet-body visibility and no
visible-terrain occlusion. Terrain is checked before selecting a representative, so an occluded
preferred instance cannot monopolize the label. Missing terrain tiles limit occlusion precision.
Fast screen motion hides callouts: 0.2 seconds of quiet motion is required, and movement above
18% of viewport height per second suppresses labels. A camera tracking a fast spacecraft can
therefore retain that spacecraft's labels while other hardware rushing past is suppressed.
Interactive motion uses wall time, with duplicate render passes ignored. Shot playback/recording
uses nearby camera/trajectory evaluations, avoiding a quiet-time gap when a segment starts.

## Layout and recording

Each category has a fixed side and vertical offset in `LABEL_SLOTS`. Cards follow their anchors
without flipping sides or repacking to another row. At most six cards, including two claims,
are shown. A card is hidden if its slot cannot fit safely. Layout checks the same leader polyline
that is drawn: no leader crossings, overlapping leader segments, lines through other cards or UI,
or cards covering attachment dots. Two cards for the same object may share its attachment dot.
Clamping cannot reverse the leader elbow or put an attachment behind its own card.

Cards, leaders and topic icons use an independent 2D canvas at the display's native pixel
resolution during interactive viewing. Adaptive graphics quality only changes the scene buffer;
stationary label pixels remain unchanged. The overlay follows the scene's displayed frame,
including letterboxing, and ignores pointer events so camera controls still work. Browser link
hit regions use the same layout. The related-claims panel is interactive browser UI; primary and
related links retain the complete claim text and open a new tab.

During fixed-step or live video recording, the display overlay is hidden and those same graphics
are composited into the WebGL canvas at the capture buffer's resolution. This keeps labels in
exported video without displaying two copies. The related-claims panel is not burned into video.

Display resizing, monitor pixel density and recording may resize the label backing canvas.
Each change replaces and disposes the previous CanvasTexture, since allocated WebGL texture
storage cannot be resized in place. Adaptive scene pixel ratio changes do not resize the
interactive label canvas.

## Claim associations and conditions

The November 11, 2026 review moved suitable-site and land-use claims onto the **mountain**, four
daily departures onto the **spacecraft**, modulation costs and renewable-energy storage onto the
**screws**, and conventional materials onto the **horizontal acceleration structure**. These are
associations with the hardware discussed, not new physical simulations or validations.

Only claims without a suitable modeled object retain fixed icons: **Economy** ($) has historical
electromagnetic-launcher cost comparisons, investment returns and total project costs;
**Environment** has whole-settlement lifecycle emissions; **Industry** has workforce and spinoff
benefits. Each remaining icon assignment explains its reason in `display.instructions`.
There is no empty Operations icon. All 48 claims remain accessible from their associated target.

Every claim has `target`, a complete `title`, concise catalog `label`, and a `display` rule:

- `visible`: the associated component/landmark is identifiable.
- `atmosphericFlight`: supersonic spacecraft free flight outside the tube, below 100 km, in air.
- `spaceFlight`: spacecraft free flight above 100 km (Mars-transfer aggregation).
- `poweredFlight`: spacecraft free flight with positive rocket mass flow (engine ignition).
- `onLauncher`: spacecraft still on a launcher curve (combined launch-train mass).
- `topic`: fixed icon, with an explanation of why no scene object represents it.

`claimApplies` interprets the rules. Object labels are independent of claim eligibility. Main
components include spacecraft, adaptive nut, launch sled, screws, guideway, three sections,
airlock, terminus, moorings, seabed anchors, Stashing Facility, lift fans and rocket engine.
Boats, crew, ring scenery and individual terminus subparts are excluded.

Validation:

- `node --test tests/scene/evidenceCallouts.test.mjs`
- `npm run smoke -- --url-params "preset=EvidenceLedgerLinks&quality=low" --steps tests/browser/evidenceCallouts.steps.mjs`
- `npm run smoke -- --page /tests/evidence-callouts.html --wait 1 --steps tests/browser/evidenceCalloutResolution.steps.mjs`
- `npm run smoke -- --url-params "preset=EvidenceLedgerLinks" --steps tests/browser/evidenceCalloutReportedView.steps.mjs`

Regression coverage includes reordered GPU slots, LOD changes, rendered parent/scale/crane
transforms, source changes, terrain selection, section-point retention, crossing leaders, full
claim titles, conditional claims, independent toggles and canvas recording. Browser checks orbit
the real spacecraft (comparing to the rendered hull), exit airlock and Mauna Kea.
The rendering regressions check native label resolution and identical stationary pixels across
adaptive scene resolutions, letterboxed alignment, and recording framebuffer pixels. They also
check that texture resizing does not leak GPU resources, and restore the reported
79.834-second view before exercising mouse orbiting. Coordinate-only tests cannot detect a stale
or incorrectly sized GPU overlay texture.
