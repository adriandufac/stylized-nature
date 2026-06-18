uniform sampler2D uLeafTexture;  // texture de la carte de feuillage
uniform vec3 uSunDirection;       // direction du soleil dans l'espace monde
uniform float uAmbientLight;      // intensité de la lumière ambiante (0 à 1)


varying vec2 vUv;
varying vec3 vSphereNormal;
varying vec3 vColor;              // couleur propre à ce buisson (par instance)

void main () {

 vec4 tex = texture2D(uLeafTexture, vUv);
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