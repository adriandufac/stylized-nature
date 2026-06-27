uniform vec3  uLowColor;     // bas du rocher (sombre)
uniform vec3  uHighColor;    // haut (clair / mousse)
uniform vec3  uTintColor;    // teinte des taches mélangée par le bruit
uniform float uNoiseScale;   // fréquence du bruit triplanaire (≈ 0.15)
uniform float uTintStrength; // 0..1 : intensité des taches
uniform float uGradientMin;  // Y monde où commence le bas
uniform float uGradientMax;  // Y monde où le haut est atteint
uniform sampler2D uNoise;    // noiseTexture.png (wrap Repeat)

uniform vec3  uSunDirection; // partagé par réf avec environment
uniform float uAmbientLight;

varying vec3 vWorldPosition;

// Bruit triplanaire : 3 projections planes mélangées par |normale|, pas d'UV ni de seam.
float triplanarNoise(vec3 p, vec3 n) {
  vec3 w = abs(n);
  w /= (w.x + w.y + w.z);
  float nx = texture2D(uNoise, p.zy).r; // plan YZ
  float ny = texture2D(uNoise, p.xz).r; // plan XZ
  float nz = texture2D(uNoise, p.xy).r; // plan XY
  return nx * w.x + ny * w.y + nz * w.z;
}

void main() {
  // --- Normale FACETTÉE : dérivées de la position monde -> normale plate par triangle.
  // Donne le flat shading quelle que soit la normale exportée du .glb.
  vec3 normal = normalize(cross(dFdx(vWorldPosition), dFdy(vWorldPosition)));

  // --- Couleur de base : dégradé vertical (bas sombre -> haut clair).
  float h = smoothstep(uGradientMin, uGradientMax, vWorldPosition.y);
  vec3 base = mix(uLowColor, uHighColor, h);

  // --- Taches : le bruit module vers uTintColor (déborde des facettes).
  float n = triplanarNoise(vWorldPosition * uNoiseScale, normal);
  base = mix(base, uTintColor, n * uTintStrength);

  // --- Éclairage stylisé (identique à l'herbe) : half-lambert * jour + ambiant.
  float sunOrientation = dot(uSunDirection, normal);
  float dayFactor = smoothstep(-0.1, 0.5, uSunDirection.y);
  float diffuse = max(sunOrientation * 0.5 + 0.5, 0.0) * dayFactor;

  vec3 col = base * max(diffuse, uAmbientLight);
  col = smoothstep(0.0, 1.0, col); // accentue le contraste (rendu stylisé)

  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment> // linéaire -> sRGB (sinon délavé avec un ShaderMaterial)
}
