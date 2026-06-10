uniform float uTime;
uniform float uWindStrength;
uniform float uBladeHeight; // hauteur locale du brin : convertit la pente du vent en angle correct
uniform vec2 uWindDirection; // direction du vent dans le plan XZ (x -> axe X monde, y -> axe Z monde)

// Masque de courbure préparé sur la géométrie : 0 à la base -> 1 à la pointe.
// (instanceMatrix, position, projectionMatrix... sont injectés par three.js)
attribute vec3 color;

varying vec3 vColor;
varying vec3 vNormal;
varying vec3 vPosition;

void main() {
  

  // Position du sommet dans l'espace local de l'InstancedMesh (suit le terrain)
  vec4 modelPosition = instanceMatrix * vec4(position, 1.0);

  // Vent : l'amplitude croît vers la pointe (windMask), oscille dans l'espace et le temps.
  // La base (windMask = 0) reste plantée dans le sol.
  float windMask = color.x;
  float wave = sin(uTime * 1.5 + modelPosition.x * 0.5 + modelPosition.z * 0.5);
  // Décalage dans le plan XZ, orienté par la direction de vent globale (avant : X seul)
  vec2 windOffset = uWindDirection * (wave * windMask * uWindStrength);
  modelPosition.x += windOffset.x;
  modelPosition.z += windOffset.y;

  // Normale dans l'espace monde (instanceMatrix inclus, sinon tous les brins s'éclairent pareil)
  vec3 modelNormal = normalize((modelMatrix * instanceMatrix * vec4(normal, 0.0)).xyz);

  // --- Correction de la normale due au vent (cisaillement) ---
  // Le vent décale x proportionnellement à windMask (donc à la hauteur) : pente constante le long du brin.
  // pente = d(décalage x) / d(y monde) = wave * uWindStrength / hauteur réelle du brin.
  float scaleY = length(instanceMatrix[1].xyz);     // facteur d'échelle Y de cette instance
  float worldHeight = scaleY * uBladeHeight;        // hauteur du brin dans le monde
  float windSlope = wave * uWindStrength / worldHeight;

  // Cisaillement horizontal (suivant uWindDirection) par y => la normale bascule.
  // Cas X seul : n.y -= pente * n.x. Généralisé : n.y -= pente * (d.x*n.x + d.z*n.z).
  modelNormal.y -= windSlope * (uWindDirection.x * modelNormal.x + uWindDirection.y * modelNormal.z);
  modelNormal = normalize(modelNormal);

  gl_Position = projectionMatrix * modelViewMatrix * modelPosition;
  
  vColor = color;
  vNormal = modelNormal; // Nécessaire pour l'éclairage dans le fragment shader
  vPosition = modelPosition.xyz;

}
