# SpaceportLauncher

Select **SpaceportLauncher** in the preset menu, or open `?preset=SpaceportLauncher`.
The initial side camera targets the launch vehicle at 10x the overview zoom and tracks it.
The initial shot lasts through capture; the timeline event menu includes rendezvous
at apogee and capture completion.

The Chimborazo launcher is sized by solving launch speed and ramp upward acceleration
for a 300 km apogee and an inertial apogee speed 1,000 m/s below circular speed.
The solve includes the rotating Earth and the production ramp dynamics. With the
preset defaults the mass-driver exit speed is approximately 6.569 km/s, apogee
speed is 6.726 km/s, and circular speed is 7.726 km/s. Altitudes use the launcher's
local planet-radius reference, consistently with its trajectory calculations.

The station follows a prescribed 300 km circular orbit in the spacecraft's orbital
plane. The capture entry, 5 km behind its leading edge, meets the spacecraft at apogee. The spacecraft then slides
back along the station's curved electromagnetic capture track while accelerating
at 5 m/s². Removing the 1 km/s relative speed takes 200 s and 100 km of relative
travel (`deltaV² / (2 acceleration)`), within the 110 km station, leaving a 5 km margin at each end. The track supplies
the radial support needed to keep the slower spacecraft at the station's radius.
After capture, spacecraft and station coast together at circular speed. The vehicle
continues orbiting and remains trackable beyond the sampled trajectory. The station's displayed
altitude is raised throughout the scene so the spacecraft remains visible below it.
The spacecraft follows its physical trajectory without a visual shift on approach. The adaptive nut is hidden in this preset.

The evacuated tube ends at 14 km, slightly below the original 15 km design.
The rocket throttles to cancel aerodynamic drag (the existing non-adaptive thrust
mode), preserving the designed trajectory rather than circularizing it. The preset
carries 3,000 kg of propellant and permits up to 514.49 kg/s, with a drag coefficient
of 0.035. Thrust demand and fuel consumption are checked against those limits.
Exact time-based airspeed, drag and flow telemetry drives plasma and exhaust;
their displayed geometry follows the vehicle's render-only scale controls.

The station orbit remains prescribed without recoil, and its structural and power
systems are not modelled. A station shorter than its required capture distance is
rejected instead of silently extending the track.

The Launcher controls include `spaceportApogeeAltitude`, `spaceportVelocityDeficit`,
`spaceportStationLength`, and `spaceportCaptureAcceleration`. Engineering specs
include apogee and circular speeds, rendezvous time, capture time and track use.

`launcherVisualRadiusScale` magnifies vehicle, sled, nut and tube cross sections.
`launcherVisualLengthScale` magnifies only the vehicle, sled and nut lengths.
The preset uses 2,000x radius and 900x length for visibility from the overview.
Both default to 1 in other presets. These are render transforms: physical dimensions,
launcher path lengths, trajectories, masses, costs and engineering sizing are unchanged.
Storage uses a separate display layout to contain the exaggerated hardware while
retaining its physical engineering layout. Station rendering is schematic.

The preset disables the Chimborazo regional enhancement layer and hides the stashing
facility. `showStashingFacility` in Rendering controls its visibility independently
of recovery motion and engineering calculations; other presets default to showing it.

Press **6** to track the centre of the displayed spaceport, or press it again to
release tracking. **Shift+6** logs scene-object counts.

Camera moves with, Look at, tracking targets, and shot-anchor validation share
`src/camera/TrackedObjects.js`. Add a target descriptor there to expose it to all
these controls; custom targets provide a time-based world frame for shot playback.
