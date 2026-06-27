varying vec3 vWorldPosition;
varying vec3 vObjectPosition; // espace objet : Y = axe du tronc, stable malgré scale/placement
varying vec3 vNormal;         // normale MONDE (cohérente avec uSunDirection monde)

void main() {
  vObjectPosition = position;
  vNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz); // scale 0.1 uniforme -> direction OK après normalize
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPosition.xyz;
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}