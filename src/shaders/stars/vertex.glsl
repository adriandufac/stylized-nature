uniform float uNight;      // 0 = jour, 1 = nuit profonde (creux de la nuit)
uniform float uTime;       // temps écoulé (scintillement)
uniform float uSize;       // taille de base des étoiles (px)
uniform float uPixelRatio; // pour garder une taille constante en haute densité

attribute float aThreshold; // seuil d'apparition propre à l'étoile (0..1)
attribute float aScale;     // variation de taille
attribute float aPhase;     // phase de scintillement

varying float vAlpha;

void main() {
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);

  // L'étoile n'apparaît que lorsque la nuit dépasse SON seuil.
  // -> plus la nuit avance (uNight monte), plus d'étoiles franchissent leur seuil.
  float appear = smoothstep(aThreshold, aThreshold + 0.15, uNight);

  // Scintillement doux, déphasé par étoile.
  float twinkle = 0.65 + 0.35 * sin(uTime * 2.0 + aPhase);

  vAlpha = appear * twinkle;

  gl_PointSize = uSize * aScale * uPixelRatio;
  gl_Position = projectionMatrix * mvPosition;
}
