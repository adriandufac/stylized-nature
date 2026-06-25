#include <packing>

uniform sampler2D tDepth;
uniform float uCameraNear;
uniform float uCameraFar;
uniform vec2  uResolution;
uniform float uTime;

uniform vec3  uShallowColor;
uniform vec3  uDeepColor;
uniform vec3  uFoamColor;
uniform float uDeepDistance;   // à partir de quelle profondeur c'est "profond"
uniform float uFoamDistance;   // largeur de la bande d'écume
uniform float uFoamScrollSpeed;

uniform vec2  uFlowDirection;  // direction du courant (rivière/cascade)
uniform float uFlowSpeed;      // 0 pour le lac

varying vec2 vUv;
varying float vViewDepth;

// lit la profondeur LINÉAIRE du sol à l'écran
float readSceneDepth(vec2 screenUv) {
  float fragZ = texture2D(tDepth, screenUv).x;
  float viewZ = perspectiveDepthToViewZ(fragZ, uCameraNear, uCameraFar);
  return -viewZ; // distance positive
}

// bruit value simple pour faire onduler le bord de l'écume
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  float a = hash(i), b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

void main() {
  vec2 screenUv = gl_FragCoord.xy / uResolution;

  float sceneDepth = readSceneDepth(screenUv);
  float waterDepth = vViewDepth;

  // quantité d'eau entre la surface et le sol à ce pixel
  float depthDiff = max(sceneDepth - waterDepth, 0.0);

  // 1) couleur : peu profond -> profond
  float deepFactor = clamp(depthDiff / uDeepDistance, 0.0, 1.0);
  vec3 color = mix(uShallowColor, uDeepColor, deepFactor);

  // 2) écume : forte là où depthDiff est petit (berges, rochers, impact)
  vec2 flow = uFlowDirection * uFlowSpeed * uTime;
  float n = noise(vUv * 14.0 + flow + uTime * uFoamScrollSpeed);
  float foamEdge = uFoamDistance * (0.6 + 0.4 * n); // seuil qui ondule
  float foam = 1.0 - smoothstep(0.0, foamEdge, depthDiff);

  color = mix(color, uFoamColor, foam);

  gl_FragColor = vec4(color, 0.92);
}