uniform float uTime;

attribute float aScale; // taille du puff
attribute float aPhase; // déphasage du bobbing vertical
attribute float aSeed;  // graine de variation (bruit fragment)

varying vec2 vUv;
varying float vSeed;

void main() {
  vUv = uv;
  vSeed = aSeed;

  // Centre de l'instance en view space (instanceMatrix fourni par l'InstancedMesh).
  vec4 mvCenter = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);

  // Bobbing vertical doux, déphasé par puff.
  mvCenter.y += sin(uTime * 0.5 + aPhase) * 0.3;

  // Billboard : le quad local (position dans [-0.5, 0.5]) est ajouté dans le plan
  // de la caméra (axes X/Y du view space) -> face toujours la caméra.
  mvCenter.xy += position.xy * aScale;

  gl_Position = projectionMatrix * mvCenter;
}
