uniform vec3  uBarkLow;       // pied / creux (sombre)
uniform vec3  uBarkHigh;      // haut / crêtes (clair)
uniform vec3  uGrainColor;    // teinte des stries
uniform float uGrainHoriz;    // fréquence HORIZONTALE (élevée -> stries fines, serrées)
uniform float uGrainVert;     // fréquence VERTICALE (faible -> stries allongées le long du tronc)
uniform float uGrainStrength; // 0..1 : visibilité des stries
uniform float uCreviceDepth;  // 0..1 : assombrit les creux du grain (fausse occlusion)
uniform float uGradientMin;   // Y OBJET du pied
uniform float uGradientMax;   // Y OBJET du sommet
uniform sampler2D uNoise;

uniform vec3  uSunDirection;
uniform float uAmbientLight;

// Contour lumineux (look Jordan Breton) — mettre uRimStrength à 0 pour le couper.
uniform vec3  uRimColor;
uniform float uRimStrength;

varying vec3 vWorldPosition;
varying vec3 vObjectPosition;
varying vec3 vNormal;

void main() {
  // Normale LISSE (réf = écorce lisse, pas en facettes).
  // -> Pour un rendu facetté façon rochers, remplacer par :
  //vec3 normal = normalize(cross(dFdx(vWorldPosition), dFdy(vWorldPosition)));
  vec3 normal = normalize(vNormal);

  // --- Grain VERTICAL : bruit étiré le long de l'axe du tronc (Y objet).
  // Beaucoup de variation horizontale (x+z) + très peu en vertical (y) => stries verticales.
  vec2 grainUV = vec2(
    (vObjectPosition.x + vObjectPosition.z) * uGrainHoriz,
    vObjectPosition.y * uGrainVert
  );
  float grain = texture2D(uNoise, grainUV).r;

  // --- Dégradé pied -> haut (en espace OBJET, donc stable par tronc).
  float h = smoothstep(uGradientMin, uGradientMax, vObjectPosition.y);
  vec3 base = mix(uBarkLow, uBarkHigh, h);

  // --- Stries : le grain pousse la couleur vers uGrainColor.
  base = mix(base, uGrainColor, grain * uGrainStrength);

  // --- Fausse occlusion : les creux (grain faible) sont assombris.
  base *= 1.0 - uCreviceDepth * (1.0 - grain);

  // --- Éclairage stylisé (identique herbe/rochers).
  float sunOrientation = dot(uSunDirection, normal);
  float dayFactor = smoothstep(-0.15, 0.05, uSunDirection.y);
  float diffuse = max(sunOrientation * 0.5 + 0.5, 0.0) * dayFactor;
  vec3 col = base * (uAmbientLight + diffuse * (1.0 - uAmbientLight)); // ambiant additif : garde l'ombrage directionnel même rasant

  // --- Rim light : éclaire la silhouette (fort là où la normale est ~perpendiculaire à la vue).
  vec3 viewDir = normalize(cameraPosition - vWorldPosition); // cameraPosition injecté par three
  float rim = pow(1.0 - max(dot(viewDir, normal), 0.0), 3.0);
  col += uRimColor * rim * uRimStrength * dayFactor;

  col = smoothstep(0.0, 1.0, col); // contraste stylisé
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>   // linéaire -> sRGB
}