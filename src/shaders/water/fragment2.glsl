// ── EAU « façon tuto Codrops » ──────────────────────────────────────────────
// Fragment : on REPRODUIT la méthode du tutoriel (qui abandonne la depth texture
// pour des raisons de perf) :
//   1) couleur par VIGNETTE (centre = couleur "loin/profond", bords = "près/peu profond")
//   2) motif de surface via bruit de Perlin/simplex qui DÉFILE avec le temps
//   3) écume = bandes blanches via smoothstep sur le bruit + liseré aux berges (bords UV)
//
// Différence assumée vs tuto : le tuto peint l'écume sur le TERRAIN (illusion).
// Ici on reste auto-contenu : l'écume de berge utilise le bord des UV du mesh d'eau.

uniform float uTime;

uniform vec3  uColorNear;   // peu profond / berge
uniform vec3  uColorFar;    // profond / centre
uniform vec3  uFoamColor;

uniform float uVignette;        // intensité du dégradé centre->bord
uniform float uNoiseScale;      // densité des bandes de surface
uniform float uNoiseThreshold;  // seuil d'apparition des bandes (0..1)
uniform float uFoamWidth;       // largeur de l'écume de berge (en UV)

uniform vec2  uFlowDirection;   // direction du courant
uniform float uFlowSpeed;       // vitesse de défilement du motif le long du courant

// ── Lumière (même logique manuelle que les shaders herbe/buisson) ───────────
uniform vec3  uSunDirection;    // direction du soleil (monde), partagée avec Environment
uniform vec3  uSunColor;        // teinte de la lumière directe
uniform float uAmbient;         // lumière ambiante (0..1)
uniform float uNormalStrength;  // amplitude de la perturbation de normale (rides)
uniform float uSpecStrength;    // intensité des éclats spéculaires
uniform float uShininess;       // dureté des éclats (plus grand = plus serré)
uniform float uFresnelPower;    // brillance aux angles rasants

// cameraPosition est fourni automatiquement par three.js (ShaderMaterial)

varying vec2 vUv;
varying vec3 vWorldPos;
varying float vElevation;

// ── Simplex noise 2D (Ashima / Gustavson, domaine public) ───────────────────
vec3 permute(vec3 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                     -0.577350269189626, 0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m; m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

void main() {
  // défilement : tout le mouvement de surface suit uFlowDirection à uFlowSpeed.
  vec2 flow = uFlowDirection * uTime * uFlowSpeed;

  // 1) DÉGRADÉ PAR VIGNETTE (cf. tuto) -----------------------------------------
  float vignette = length(vUv - 0.5) * uVignette;
  float v = smoothstep(0.1, 0.5, vignette);
  vec3 color = mix(uColorFar, uColorNear, v); // centre = far, bords = near

  // 2) MOTIF DE SURFACE QUI DÉFILE ---------------------------------------------
  vec2 p = vUv * uNoiseScale + flow;
  float n = snoise(p);
  n = n * 0.5 + 0.5; // 0..1
  // bandes claires stylisées : on illumine là où le bruit dépasse le seuil
  float bands = smoothstep(uNoiseThreshold, uNoiseThreshold + 0.08, n);
  color = mix(color, color + 0.18, bands * 0.5);

  // léger reflet animé par la houle du vertex
  color += vElevation * 0.04;

  // 3) ÉCUME ------------------------------------------------------------------
  // a) crêtes d'écume sur le motif de bruit (illusion de mousse de surface)
  float crestFoam = smoothstep(0.82, 0.92, n);
  // b) liseré d'écume aux berges = bord des UV, ondulé par le bruit
  float edge = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
  float foamW = uFoamWidth * (0.7 + 0.3 * n);
  float shoreFoam = 1.0 - smoothstep(0.0, foamW, edge);

  float foam = clamp(max(crestFoam, shoreFoam), 0.0, 1.0);
  color = mix(color, uFoamColor, foam);

  // 4) LUMIÈRE -----------------------------------------------------------------
  // Normale perturbée par le gradient du bruit (rides) sur un plan horizontal.
  float eps = 0.5;
  float nx = snoise(p + vec2(eps, 0.0));
  float nz = snoise(p + vec2(0.0, eps));
  vec3 normal = normalize(vec3(
    -(nx - (n * 2.0 - 1.0)) * uNormalStrength,
    1.0,
    -(nz - (n * 2.0 - 1.0)) * uNormalStrength
  ));

  vec3 sunDir  = normalize(uSunDirection);
  vec3 viewDir = normalize(cameraPosition - vWorldPos);
  float dayFactor = smoothstep(-0.1, 0.5, sunDir.y); // nuit -> 0

  // Diffus half-lambert (doux : la surface reste quasi horizontale)
  float diffuse = max(dot(normal, sunDir) * 0.5 + 0.5, 0.0) * dayFactor;
  color *= max(uAmbient, diffuse);

  // Spéculaire Blinn-Phong : les éclats scintillants qui font "lire" l'eau
  vec3 halfDir = normalize(sunDir + viewDir);
  float spec = pow(max(dot(normal, halfDir), 0.0), uShininess);
  color += uSunColor * spec * uSpecStrength * dayFactor;

  // Fresnel : la surface s'éclaircit aux angles rasants
  float fresnel = pow(1.0 - max(dot(normal, viewDir), 0.0), uFresnelPower);
  color = mix(color, color + uFoamColor * 0.25, fresnel * dayFactor);

  gl_FragColor = vec4(color, 0.92);
}
