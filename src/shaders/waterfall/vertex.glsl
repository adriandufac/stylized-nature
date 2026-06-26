varying vec2 vUv;
varying vec3 vWorldPos;
varying vec3 vNormal;

void main()
{
    vec4 worldPos = modelMatrix * vec4(position, 1.0);

    // Position finale
    gl_Position = projectionMatrix * viewMatrix * worldPos;

    // Varyings
    vUv = uv;
    vWorldPos = worldPos.xyz;
    // Normale du mesh en espace monde (cascade verticale -> on ne peut pas
    // supposer "vers le haut" comme le lac).
    vNormal = normalize(mat3(modelMatrix) * normal);
}
