
attribute vec3 aSphericalNormal;
attribute vec3 aColor;
attribute float aTextureIndex;     // quelle carte de feuillage pour ce quad

uniform float uTime;
uniform float uWindStrength;
uniform vec2  uWindDirection;
uniform float uWindAmplitude; // sensibilité au vent, propre à ce composant (buisson / arbre)

attribute vec2 aWind;   // x : amplitude =>1 en haut 0 en bas( la base du buisson ne bouge pas) y: déphasage

varying vec2 vUv;
varying vec3 vSphereNormal;
varying vec3 vColor;
varying float vTextureIndex;

void main () {

    // Centre de l'instance en espace MONDE (origine locale -> instance -> monde).
    // On reste en monde pour y injecter le vent (direction/onde absolues, indépendantes de la caméra).
    vec4 worldCenter = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);

    // Wind effect : onde spatio-temporelle (cohérente avec l'herbe) + déphasage par quad (aWind.y).
    // worldCenter.x/z -> vague qui traverse le terrain ; aWind.y -> léger frémissement par quad.
    float wave = sin(uTime * 1.5 + worldCenter.x * 0.5 + worldCenter.z * 0.5 + aWind.y);
    vec3  windOffset = vec3(uWindDirection.x, 0.0, uWindDirection.y)
                 * (wave * aWind.x * uWindStrength * uWindAmplitude); // uWindAmplitude : sensibilité du composant
    worldCenter.xyz += windOffset;

    // Monde -> vue (on repart du centre DÉPLACÉ par le vent), puis billboard :
    // le quad reste face caméra, mis à l'échelle de l'instance.
    vec4 viewCenter = viewMatrix * worldCenter;
    float quadScale = length(instanceMatrix[0].xyz);
    viewCenter.xy += position.xy * quadScale;

    gl_Position = projectionMatrix * viewCenter;

    vUv = uv;
    vSphereNormal = normalize(aSphericalNormal);
    vColor = aColor;
    vTextureIndex = aTextureIndex;
}
