uniform float uTime;
uniform vec3 uFallDirection; // direction de chute (gravité + vent), normalisée
uniform float uFallDistance; // distance parcourue avant recyclage de la goutte

attribute float aSpeed;  // vitesse propre à la goutte (désynchronise les chutes)
attribute float aOffset; // décalage de phase propre à la goutte (désynchronise le recyclage)
attribute float aAlpha;  // 1.0 à la tête de la goutte, 0.0 à la queue (dégradé d'opacité)

varying float vAlpha;

void main() {
  // Position de base du sommet dans l'espace monde
  vec4 modelPosition = modelMatrix * vec4(position, 1.0);

  // Chute recyclée : displacement monte avec le temps puis retombe à 0 (dent de scie via mod).
  // aSpeed et aOffset sont IDENTIQUES pour les 2 sommets d'une goutte -> le trait reste rigide
  // et se réinitialise d'un bloc (pas d'étirement au moment du recyclage).
  float displacement = mod(uTime * aSpeed + aOffset, uFallDistance);
  modelPosition.xyz += uFallDirection * displacement;

  vec4 viewPosition = viewMatrix * modelPosition;
  vec4 projectedPosition = projectionMatrix * viewPosition;
  gl_Position = projectedPosition;

  // Transmis au fragment pour le dégradé d'opacité tête -> queue
  vAlpha = aAlpha;
}
