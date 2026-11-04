// The launch vehicle's boundary layer of hot gas (see plasmaSheath.vert.glsl). Both sides of the shell
// are drawn, and each adds the light along the line of sight through its half: the layer's thickness
// over the cosine of the angle to its normal, up to the chord through the shell where the line of sight
// grazes it (2 sqrt(2 R thickness)). So the layer is faint seen face on and bright along the limb, as a
// glowing skin looks. Its emissivity rises towards the nose, as the heating does (turbulent heating
// goes as the distance from the nose to the -0.2; hotter gas radiates more).
#include <common>
#include <logdepthbuf_pars_fragment>

uniform vec3 sheathEmission;  // per metre of path, at the base

varying vec3 vViewPosition;
varying vec3 vViewNormal;
varying float vThickness;
varying float vRadius;
varying float vFromNose;

void main() {
  #include <logdepthbuf_fragment>
  vec3 toCamera = normalize(-vViewPosition);
  float mu = abs(dot(normalize(vViewNormal), toCamera));
  float grazing = sqrt(vThickness / (8.0 * max(vRadius, 1e-3)));
  // (The very edge of the limb fades out: the layer's own edge is not sharp.)
  float path = vThickness / max(mu, grazing) * smoothstep(0.0, 1.5 * grazing, mu);
  float hotter = min(6.0, pow(max(vFromNose, 1e-4), -0.35));
  vec3 light = sheathEmission * hotter * path;
  gl_FragColor = vec4(1.0 - exp(-light), 1.0);
  #include <colorspace_fragment>
}
