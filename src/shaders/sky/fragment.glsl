uniform vec3 uHorizonColor;
uniform vec3 uZenithColor;
uniform vec3 uSunDirection;
uniform vec3 uSunColor;
varying vec3 vDir;

void main() {
  float h = smoothstep(0.0, 0.4, vDir.y);
  vec3 col = mix(uHorizonColor, uZenithColor, h);
  // halo chaud autour du soleil, s'estompe quand il descend
  float d = max(dot(normalize(vDir), normalize(uSunDirection)), 0.0);
  float glow = pow(d, 32.0) * smoothstep(-0.1, 0.2, uSunDirection.y);
  col += uSunColor * glow;
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}