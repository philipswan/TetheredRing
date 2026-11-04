// The launch vehicle's boundary layer of hot gas (src/launcher/LaunchVehicleGlow.js): a thin shell of
// light over the hull. The mesh is the hull; each vertex is moved out along the hull's normal by the
// layer's thickness (at reference conditions, scaled by sheathThicknessScale for the air the vehicle is
// in now: thicker in thinner air).
#include <common>
#include <logdepthbuf_pars_vertex>

uniform float sheathThicknessScale;

attribute float thickness;    // model units, at the reference conditions
attribute float fromNose;     // distance from the nose over the hull's length
attribute float hullRadius;   // model units

varying vec3 vViewPosition;
varying vec3 vViewNormal;
varying float vThickness;     // view units (m)
varying float vRadius;        // view units (m)
varying float vFromNose;

void main() {
  vec3 offset = normal * thickness * sheathThicknessScale;
  vec4 mvPosition = modelViewMatrix * vec4(position + offset, 1.0);
  vViewPosition = mvPosition.xyz;
  vViewNormal = normalize(normalMatrix * normal);
  vThickness = length(mat3(modelViewMatrix) * offset);
  vRadius = length(mat3(modelViewMatrix) * vec3(hullRadius, 0.0, 0.0)) + vThickness;
  vFromNose = fromNose;
  gl_Position = projectionMatrix * mvPosition;
  #include <logdepthbuf_vertex>
}
