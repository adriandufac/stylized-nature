uniform float uTime;
uniform float uWindStrength;

// Masque de courbure préparé sur la géométrie : 0 à la base -> 1 à la pointe.
// (instanceMatrix, position, projectionMatrix... sont injectés par three.js)
attribute vec3 color;

varying vec3 vColor;

void main() {
  vColor = color;

  // Position du sommet dans l'espace local de l'InstancedMesh (suit le terrain)
  vec4 instancePosition = instanceMatrix * vec4(position, 1.0);

  // Vent : l'amplitude croît vers la pointe (windMask), oscille dans l'espace et le temps.
  // La base (windMask = 0) reste plantée dans le sol.
  float windMask = color.x;
  float wave = sin(uTime * 1.5 + instancePosition.x * 0.5 + instancePosition.z * 0.5);
  instancePosition.x += wave * windMask * uWindStrength;

  gl_Position = projectionMatrix * modelViewMatrix * instancePosition;
}
