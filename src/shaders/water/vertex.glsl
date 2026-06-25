uniform float uTime;
uniform float uWaveAmplitude;
uniform float uWaveFrequency;
uniform float uWaveSpeed;

varying vec2 vUv;
varying float vViewDepth; // profondeur de la surface d'eau, vue caméra

void main() {
  vUv = uv;
  vec3 pos = position;

  // vagues douces : deux sinusoïdes croisées sur le plan horizontal.
  // (pour la cascade verticale, on mettra uWaveAmplitude = 0)
  float wave = sin(pos.x * uWaveFrequency + uTime * uWaveSpeed)
             * cos(pos.z * uWaveFrequency * 1.3 + uTime * uWaveSpeed * 0.9);
  pos.y += wave * uWaveAmplitude;

  vec4 modelViewPos = modelViewMatrix * vec4(pos, 1.0);
  vViewDepth = -modelViewPos.z; // distance positive depuis la caméra
  gl_Position = projectionMatrix * modelViewPos;
}