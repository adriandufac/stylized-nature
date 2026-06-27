varying vec3 vWorldPosition;

void main() {
  // modelMatrix inclut la transform du nœud glTF (chaque rocher a la sienne) + celle du group.
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPosition.xyz;
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}