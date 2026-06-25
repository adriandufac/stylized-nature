// ── EAU « façon tuto Codrops » ──────────────────────────────────────────────
// Vertex : ondulation sinusoïdale simple de la surface (pas de depth, pas de flow ici).
// Le plan d'eau est horizontal -> on déplace la hauteur (y), pas z comme dans le tuto.

uniform float uTime;
uniform float uWaveSpeed;
uniform float uWaveAmplitude;
uniform float uWaveFrequency;

varying vec2 vUv;
varying vec3 vWorldPos;
varying float vElevation;

void main() {
  vUv = uv;
  vec3 pos = position;

  // Deux sinusoïdes croisées : houle douce et stylisée.
  float wave = sin(pos.x * uWaveFrequency + uTime * uWaveSpeed)
             + sin(pos.z * uWaveFrequency * 1.3 + uTime * uWaveSpeed * 0.8);
  vElevation = wave * 0.5;        // -1..1, réutilisé en fragment pour un reflet
  pos.y += vElevation * uWaveAmplitude;

  vec4 worldPos = modelMatrix * vec4(pos, 1.0);
  vWorldPos = worldPos.xyz;

  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
