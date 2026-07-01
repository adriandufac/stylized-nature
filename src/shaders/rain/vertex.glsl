uniform float uTime;
uniform float uFallDistance; // distance parcourue avant recyclage de la goutte (= rainHeight)
uniform float uWindStrength; // force du vent (lerpée par la météo) -> inclinaison
uniform vec2  uWindDir;      // direction du vent dans le plan XZ (x -> X, y -> Z), réf partagée
uniform float uWindFactor;   // sensibilité de l'inclinaison au vent
uniform float uStreakLength; // longueur d'un trait de pluie
uniform float uDensityFrac;  // 0..1 : fraction de gouttes visibles (masque de densité)

attribute float aSpeed;  // vitesse propre à la goutte (désynchronise les chutes)
attribute float aOffset; // décalage de phase propre à la goutte (désynchronise le recyclage)
attribute float aAlpha;  // 1.0 à la tête de la goutte, 0.0 à la queue (dégradé d'opacité)
attribute float aIsTail; // 0.0 = tête, 1.0 = queue (la queue est décalée dans le shader)
attribute float aRand;   // [0,1] stable par goutte : seuil pour le masque de densité

varying float vAlpha;

void main() {
  // Inclinaison dérivée de la force du vent : tilt = atan(V_horizontal / V_chute).
  // strength 0 -> pluie verticale ; strength fort -> trait de plus en plus couché.
  // Calculée ICI (et non figée dans la géométrie) -> le vent change sans reconstruire.
  float tilt = atan(uWindStrength * uWindFactor);
  float horiz = uStreakLength * sin(tilt); // part horizontale du trait
  float vert = uStreakLength * cos(tilt);  // part verticale du trait

  // Tête = point de départ ; queue = plus haute (vert) et EN ARRIÈRE du vent (traînée).
  // aIsTail (0/1) sert de multiplicateur : la tête ne bouge pas, la queue est décalée.
  vec3 pos = position + aIsTail * vec3(-horiz * uWindDir.x, vert, -horiz * uWindDir.y);

  // Direction de chute = bas (-cos) + vers le vent (+dir * sin). Déjà unitaire.
  vec3 fallDir = vec3(sin(tilt) * uWindDir.x, -cos(tilt), sin(tilt) * uWindDir.y);

  // Chute recyclée : displacement monte avec le temps puis retombe à 0 (dent de scie via mod).
  // aSpeed/aOffset IDENTIQUES tête+queue -> le trait reste rigide et se réinitialise d'un bloc.
  float displacement = mod(uTime * aSpeed + aOffset, uFallDistance);

  vec4 modelPosition = modelMatrix * vec4(pos, 1.0);
  modelPosition.xyz += fallDir * displacement;

  gl_Position = projectionMatrix * viewMatrix * modelPosition;

  // Masque de densité : la goutte est visible si aRand < uDensityFrac (sinon alpha 0).
  // Lerper uDensityFrac fait apparaître/disparaître les gouttes progressivement.
  float visible = step(aRand, uDensityFrac);
  vAlpha = aAlpha * visible;
}
