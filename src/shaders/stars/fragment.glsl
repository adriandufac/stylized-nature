uniform vec3 uColor;
varying float vAlpha;

void main() {
  if (vAlpha < 0.01) discard;

  // Point rond à bord doux (gl_PointCoord : 0..1 sur le quad du point).
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5) discard;
  float soft = smoothstep(0.5, 0.0, d);

  gl_FragColor = vec4(uColor, vAlpha * soft);
  #include <colorspace_fragment>
}
