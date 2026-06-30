uniform vec3 uColor;
uniform float uOpacity;
uniform vec3 uSunDirection;
uniform float uAmbientLight;

varying float vAlpha;


void main() {
  float AmbientLight = uAmbientLight; // Ambient light
  // dayFactor : 1 quand le soleil est levé, 0 quand il passe sous l'horizon.
  // Même formule que l'herbe -> la pluie ne capte plus la lumière la nuit (devient invisible).
  float dayFactor = smoothstep(-0.15, 0.05, uSunDirection.y);

  float light = max(dayFactor, AmbientLight); // 

  // vAlpha : 1.0 à la tête -> 0.0 à la queue (traînée qui s'estompe).
  // uOpacity : fondu global de l'averse (transition beau <-> pluie).
  gl_FragColor = vec4(uColor, vAlpha * light * uOpacity);

  // Conversion espace linéaire -> sRGB (cohérent avec le shader d'herbe)
  #include <colorspace_fragment>
}
