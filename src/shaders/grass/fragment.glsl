uniform vec3 uBaseColor;
uniform vec3 uTipColor;

varying vec3 vColor;

void main() {
  // vColor.x : 0 à la base -> 1 à la pointe. Dégradé vertical du brin.
  vec3 col = mix(uBaseColor, uTipColor, vColor.x);

  gl_FragColor = vec4(col, 1.0);

  // Conversion espace linéaire -> sRGB (sinon couleurs délavées avec un ShaderMaterial)
  #include <colorspace_fragment>
}
