uniform vec3 uDayColor;    // teinte de jour (blanc cassé chaud)
uniform vec3 uNightColor;  // teinte de nuit (bleu sombre)
uniform vec3 uSunTint;     // pointe chaude côté soleil (halo)
uniform float uDayFactor;  // 0 = nuit -> 1 = jour
uniform float uOpacity;    // opacité globale
uniform float uBrightness; // 1 = nuages blancs (sunny/anneau) -> sombre (tempest)

varying vec2 vUv;
varying float vSeed;
varying float vVisible; // fondu météo (apparition/disparition ; anneau : 1)

// Bruit de valeur 2D léger (hash + interpolation) pour des bords cotonneux.
float hash(vec2 point) {
  return fract(sin(dot(point, vec2(127.1, 311.7))) * 43758.5453);
}
float noise(vec2 point) {
  vec2 cell = floor(point);
  vec2 local = fract(point);
  vec2 smoothLocal = local * local * (3.0 - 2.0 * local);
  float cornerBottomLeft = hash(cell);
  float cornerBottomRight = hash(cell + vec2(1.0, 0.0));
  float cornerTopLeft = hash(cell + vec2(0.0, 1.0));
  float cornerTopRight = hash(cell + vec2(1.0, 1.0));
  return mix(
    mix(cornerBottomLeft, cornerBottomRight, smoothLocal.x),
    mix(cornerTopLeft, cornerTopRight, smoothLocal.x),
    smoothLocal.y
  );
}

void main() {
  // Forme de puff : disque doux qui s'estompe vers le bord.
  float distanceToCenter = length(vUv - 0.5) * 2.0; // 0 au centre -> ~1 au bord

  // Bruit pour grignoter le contour (aspect cotonneux), varié par puff (vSeed).
  float edgeNoise = noise(vUv * 4.0 + vSeed * 17.0);
  // Rayon effectif perturbé, borné < 1.0 : distanceToCenter atteint 1.0 au milieu
  // des bords du quad. Si edgeRadius dépassait 1.0, l'alpha resterait > 0 pile au
  // bord et le carré du PlaneGeometry coupait net le nuage (arête droite visible).
  float edgeRadius = 0.55 + edgeNoise * 0.30; // -> [0.55, 0.85], toujours < 1.0

  float alpha = smoothstep(edgeRadius, edgeRadius - 0.45, distanceToCenter);
  if (alpha < 0.01) discard;

  // Volume stylisé : haut plus clair, bas plus sombre.
  float verticalShade = mix(0.78, 1.0, vUv.y);

  // Couleur jour/nuit + pointe chaude au lever/coucher.
  vec3 cloudColor = mix(uNightColor, uDayColor, uDayFactor) * verticalShade;
  float sunsetStrength = 1.0 - abs(uDayFactor * 2.0 - 1.0); // max à l'aube/crépuscule
  cloudColor += uSunTint * sunsetStrength * 0.25;

  // Assombrissement météo : sunny/anneau=1 (blanc) -> tempest~0.30 (très sombre).
  cloudColor *= uBrightness;

  gl_FragColor = vec4(cloudColor, alpha * uOpacity * vVisible);
  #include <colorspace_fragment>
}
