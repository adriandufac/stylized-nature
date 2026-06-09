uniform float uTime;
uniform float uWindStrength;
uniform float uBladeHeight; // hauteur locale du brin : convertit la pente du vent en angle correct

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
  modelPosition.x += wave * windMask * uWindStrength;

  // Normale dans l'espace monde (instanceMatrix inclus, sinon tous les brins s'éclairent pareil)
  vec3 modelNormal = normalize((modelMatrix * instanceMatrix * vec4(normal, 0.0)).xyz);

  // --- Correction de la normale due au vent (cisaillement) ---
  // Le vent décale x proportionnellement à windMask (donc à la hauteur) : pente constante le long du brin.
  // pente = d(décalage x) / d(y monde) = wave * uWindStrength / hauteur réelle du brin.
  float scaleY = length(instanceMatrix[1].xyz);     // facteur d'échelle Y de cette instance
  float worldHeight = scaleY * uBladeHeight;        // hauteur du brin dans le monde
  float windSlope = wave * uWindStrength / worldHeight;

  // Cisaillement de x par y => la normale bascule : n.y -= pente * n.x
  modelNormal.y -= windSlope * modelNormal.x;
  modelNormal = normalize(modelNormal);

  gl_Position = projectionMatrix * modelViewMatrix * modelPosition;
  
  vColor = color;
  vNormal = modelNormal; // Nécessaire pour l'éclairage dans le fragment shader
  vPosition = modelPosition.xyz;

}
