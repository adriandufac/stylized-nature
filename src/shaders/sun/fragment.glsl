uniform vec3 uColor;
uniform float uOpacity; // fondu global : 0 quand le soleil passe sous l'horizon
varying vec2 vUv;

void main() {
  float dist = length(vUv - 0.5) * 2.0;        // 0 au centre -> ~1 au bord
  float disk = smoothstep(0.5, 0.42, dist);    // cœur net
  float halo = smoothstep(1.0, 0.5, dist) * 0.5; // glow doux autour
  float a = clamp(disk + halo, 0.0, 1.0) * uOpacity;
  if (a < 0.001) discard;
  gl_FragColor = vec4(uColor, a);
  #include <colorspace_fragment>
}
