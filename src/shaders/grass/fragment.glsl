uniform vec3 uBaseColor;
uniform vec3 uTipColor;
uniform vec3 uSunDirection;

varying vec3 vColor;
varying vec3 vNormal;

void main() {
  vec3 normal = normalize(vNormal);
  if (!gl_FrontFacing) normal = -normal; // face arrière (DoubleSide) : on utilise SA normale sortante
  float sunOrientation = dot(uSunDirection, normal);
  // vColor.x : 0 à la base -> 1 à la pointe. Dégradé vertical du brin.
  vec3 col = mix(uBaseColor, uTipColor, vColor.x);
  col *= sunOrientation * 0.5 + 0.5; // éclairage de type Lambert (diffuse) : orienté vers le soleil = plus clair
  col = smoothstep(0.1, 0.8, col); // Accentue les contrastes pour un rendu plus stylisé
  gl_FragColor = vec4(col, 1.0);

  // Conversion espace linéaire -> sRGB (sinon couleurs délavées avec un ShaderMaterial)
  #include <colorspace_fragment>
}
