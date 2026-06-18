
attribute vec3 aSphericalNormal;
attribute vec3 aColor;

varying vec2 vUv;
varying vec3 vSphereNormal;
varying vec3 vColor;

void main () {


    vec4 viewCenter = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    float quadScale = length(instanceMatrix[0].xyz);
    viewCenter.xy += position.xy * quadScale;

    gl_Position = projectionMatrix * viewCenter;

    vUv = uv;
    vSphereNormal = normalize(aSphericalNormal);
    vColor = aColor;
}