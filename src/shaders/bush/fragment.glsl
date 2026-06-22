// En GLSL3 three.js ne déclare PLUS gl_FragColor automatiquement : on le fait nous-mêmes
// (identique à ce que three injecte en GLSL1), pour garder gl_FragColor + colorspace_fragment.
layout(location = 0) out highp vec4 pc_fragColor;
#define gl_FragColor pc_fragColor

uniform sampler2DArray uLeafTexture; // tableau de cartes de feuillage (plusieurs leaftest)
uniform vec3 uSunDirection;       // direction du soleil dans l'espace monde
uniform float uAmbientLight;      // intensité de la lumière ambiante (0 à 1)


varying vec2 vUv;
varying vec3 vSphereNormal;
varying vec3 vColor;              // couleur propre à ce buisson (par instance)
varying float vTextureIndex;     // quelle carte de feuillage échantillonner

void main () {

 vec4 tex = texture(uLeafTexture, vec3(vUv, vTextureIndex));
    if (tex.a < 0.5) discard;       // équivaut à alphaTest = 0.5
  vec3 normal = normalize(vSphereNormal);
  float sunOrientation = dot(uSunDirection, normal);
  float dayFactor = smoothstep(-0.1, 0.5, uSunDirection.y); // nuit -> 0
  float diffuse = max(sunOrientation * 0.5 + 0.5, 0.0) * dayFactor; // half-lambert

  vec3 col = vColor * vec3(tex.r, tex.r, tex.r);    // teinte propre au buisson x texture
  col *= max(diffuse, uAmbientLight*0.5);

  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}