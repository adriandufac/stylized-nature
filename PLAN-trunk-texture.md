# Texture/couleur stylisée des troncs (shader) — inspiration Jordan Breton

## Contexte

Les troncs sont des `.glb` chargés par `Tree.js` (`src/Experience/World/Tree.js:104-138`).
Aujourd'hui le mesh du tronc **garde le matériau exporté de Blender** : dans le `traverse`
de `loadOne()` (`Tree.js:114-121`) on ne touche que `castShadow`/`receiveShadow`, jamais
`child.material`. Aucun contrôle de couleur côté code.

Objectif : reproduire le look des troncs de **Jordan Breton** (cf. `TMP.png`) **en GLSL**,
sans Blender. Caractéristiques de la réf :

- **Stries verticales** marquées : l'écorce « coule » le long du tronc (grain de bois).
- **Creux sombres** entre les crêtes (fausse occlusion dans les rainures).
- **Dégradé** pied sombre → haut plus clair.
- **Contour lumineux** discret sur la silhouette (rim light), très présent dans son style.

C'est l'**adaptation du shader de rochers** (`PLAN-rock-texture.md`) avec **trois
différences clés** :

| | Rochers | Troncs |
|---|---|---|
| Bruit | **isotrope** (triplanaire) → taches | **anisotrope vertical** → stries d'écorce |
| Coordonnées | position **monde** | position **objet** (le grain suit l'axe du tronc, stable quels que soient l'échelle 0.1 et le placement) |
| Normale | **facettée** (dérivées) | **lissée** par défaut (la réf est lisse, pas en facettes dures) — flat dispo en 1 ligne |
| Extra | — | **rim light** optionnel (silhouette) |

Éclairage **réutilisé** du shader d'herbe/rochers (half-lambert × `dayFactor` + ambiant,
`smoothstep` de contraste), `uSunDirection`/`uAmbientLight` partagés **par référence**
depuis `environment` (comme `Tree.setFoliageMaterial()` `Tree.js:82-86`). Pas de `uTime`
(tronc statique ; le vent du feuillage est géré ailleurs).

## Fichiers concernés

- **`src/shaders/trunk/vertex.glsl`** — nouveau. Sort position monde + position objet + normale monde.
- **`src/shaders/trunk/fragment.glsl`** — nouveau. Grain vertical + creux + dégradé + éclairage + rim.
- **`src/Experience/World/Tree.js`** — modifié. Crée le `ShaderMaterial` du tronc, charge le
  bruit, et **remplace le matériau** des meshes dans le `traverse` de `loadOne()`. + GUI.
- **`static/textures/noiseTexture.png`** — **déjà présent**, réutilisé (wrap `Repeat`).

## Étapes d'implémentation

### 1. `src/shaders/trunk/vertex.glsl`

```glsl
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
```

### 2. `src/shaders/trunk/fragment.glsl`

```glsl
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
  //    vec3 normal = normalize(cross(dFdx(vWorldPosition), dFdy(vWorldPosition)));
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
  float dayFactor = smoothstep(-0.1, 0.5, uSunDirection.y);
  float diffuse = max(sunOrientation * 0.5 + 0.5, 0.0) * dayFactor;
  vec3 col = base * max(diffuse, uAmbientLight);

  // --- Rim light : éclaire la silhouette (fort là où la normale est ~perpendiculaire à la vue).
  vec3 viewDir = normalize(cameraPosition - vWorldPosition); // cameraPosition injecté par three
  float rim = pow(1.0 - max(dot(viewDir, normal), 0.0), 3.0);
  col += uRimColor * rim * uRimStrength * dayFactor;

  col = smoothstep(0.0, 1.0, col); // contraste stylisé
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>   // linéaire -> sRGB
}
```

### 3. `Tree.js` — matériau du tronc + bruit + remplacement + GUI

En tête du fichier :

```js
import trunkVertexShader from "../../shaders/trunk/vertex.glsl";
import trunkFragmentShader from "../../shaders/trunk/fragment.glsl";
```

Dans le **constructeur**, après `setFoliageMaterial()` :

```js
this.bark = {
  barkLow:  "#2a2530", // pied/creux sombre (voir palettes plus bas)
  barkHigh: "#6a5f63", // haut/crêtes clair
  grainColor: "#3a333b",
  grainHoriz: 0.8,   // stries serrées (fréquence horizontale)
  grainVert: 0.06,   // très allongées verticalement
  grainStrength: 0.6,
  creviceDepth: 0.35,
  gradientMin: 0.0,  // Y OBJET : à régler sur la hauteur réelle du modèle (cf. note)
  gradientMax: 20.0,
  rimColor: "#9fb4c8",
  rimStrength: 0.4,
};

this.setTrunkMaterial();
this.loadTrunkNoise();
```

```js
setTrunkMaterial() {
  this.trunkUniforms = {
    uBarkLow:       { value: new THREE.Color(this.bark.barkLow) },
    uBarkHigh:      { value: new THREE.Color(this.bark.barkHigh) },
    uGrainColor:    { value: new THREE.Color(this.bark.grainColor) },
    uGrainHoriz:    { value: this.bark.grainHoriz },
    uGrainVert:     { value: this.bark.grainVert },
    uGrainStrength: { value: this.bark.grainStrength },
    uCreviceDepth:  { value: this.bark.creviceDepth },
    uGradientMin:   { value: this.bark.gradientMin },
    uGradientMax:   { value: this.bark.gradientMax },
    uNoise:         { value: null },
    uSunDirection:  { value: this.environment.sunDirection },   // réf partagée
    uAmbientLight:  { value: this.environment.ambientIntensity },
    uRimColor:      { value: new THREE.Color(this.bark.rimColor) },
    uRimStrength:   { value: this.bark.rimStrength },
  };

  this.trunkMaterial = new THREE.ShaderMaterial({
    vertexShader: trunkVertexShader,
    fragmentShader: trunkFragmentShader,
    uniforms: this.trunkUniforms,
  });
}

loadTrunkNoise() {
  new THREE.TextureLoader().load("/textures/noiseTexture.png", (tex) => {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.NoColorSpace;
    this.trunkUniforms.uNoise.value = tex;
  });
}
```

Dans le `traverse` de `loadOne()` (`Tree.js:114-121`), brancher le matériau sur les meshes
(les Empties `tip_*` ne sont pas des meshes → intacts) :

```js
root.traverse((child) => {
  if (child.isMesh) {
    child.material?.dispose();          // libère le matériau exporté de Blender
    child.material = this.trunkMaterial; // <-- partagé par tous les troncs
    child.castShadow = true;
    child.receiveShadow = true;
  } else if (child.name.toLowerCase().startsWith("tip")) {
    tips.push(child.position.clone().multiplyScalar(this.params.scale));
  }
});
```

> **Matériau partagé** (un seul `trunkMaterial` pour tous les troncs) : simple et suffisant.
> Si tu veux une **écorce différente par arbre**, ajoute `barkLow/...` dans `treeConfigs` et
> fais `this.trunkMaterial.clone()` par arbre avec ses propres uniforms (comme la couleur de
> feuillage est déjà par-arbre).

### 4. Contrôles GUI (dans le dossier « Arbres » existant)

Dans `setDebug()`, sous le bloc `if (!this._debugFolder)` (`Tree.js:230-245`), ajouter un
sous-dossier « Écorce » (créé une seule fois, contrôles communs) :

```js
const bark = this._debugFolder.addFolder("Écorce").close();
const u = this.trunkUniforms;
bark.addColor(this.bark, "barkLow").name("Couleur pied").onChange((v) => u.uBarkLow.value.set(v));
bark.addColor(this.bark, "barkHigh").name("Couleur haut").onChange((v) => u.uBarkHigh.value.set(v));
bark.addColor(this.bark, "grainColor").name("Couleur stries").onChange((v) => u.uGrainColor.value.set(v));
bark.add(this.bark, "grainHoriz", 0.05, 3, 0.01).name("Stries (densité)").onChange((v) => (u.uGrainHoriz.value = v));
bark.add(this.bark, "grainVert", 0.01, 0.5, 0.005).name("Stries (étirement)").onChange((v) => (u.uGrainVert.value = v));
bark.add(this.bark, "grainStrength", 0, 1, 0.01).name("Force stries").onChange((v) => (u.uGrainStrength.value = v));
bark.add(this.bark, "creviceDepth", 0, 1, 0.01).name("Creux").onChange((v) => (u.uCreviceDepth.value = v));
bark.add(this.bark, "gradientMin", -5, 30, 0.1).name("Dégradé pied (Y obj)").onChange((v) => (u.uGradientMin.value = v));
bark.add(this.bark, "gradientMax", -5, 40, 0.1).name("Dégradé haut (Y obj)").onChange((v) => (u.uGradientMax.value = v));
bark.add(this.bark, "rimStrength", 0, 1.5, 0.01).name("Contour lumineux").onChange((v) => (u.uRimStrength.value = v));
bark.addColor(this.bark, "rimColor").name("Couleur contour").onChange((v) => u.uRimColor.value.set(v));
```

## Palettes (cohérentes avec ta scène : froide, pastel, pas de verdâtre)

Bark **neutre désaturée** que ta lumière jour/nuit teinte (comme la pierre).
`barkHigh` = `barkLow` **éclairci dans la même teinte** → dégradé propre.

### A) Écorce gris-taupe — *neutre, sûre*
```js
barkLow: "#2a2530", barkHigh: "#6a5f63", grainColor: "#3a333b", rimColor: "#9fb4c8"
```

### B) Écorce bleu-ardoise — *raccord avec la pierre/zen, très « Jordan Breton » nuit*
```js
barkLow: "#252a33", barkHigh: "#5f6b78", grainColor: "#343b46", rimColor: "#acc4d8"
```

### C) Écorce prune-grise — *écho aux buissons violet/rose (sakura)*
```js
barkLow: "#2c2630", barkHigh: "#6b5d66", grainColor: "#42384a", rimColor: "#c7a9c0"
```

Reco : **B (bleu-ardoise)** pour coller à la réf nocturne et à tes rochers gris-bleu, avec
`rimColor` froid pour la silhouette. **C** si tu veux que les troncs dialoguent avec les
fleurs.

## Points d'attention

- **`gradientMin/Max` sont en espace OBJET** (coords du modèle *avant* le scale 0.1). Un
  tronc modélisé sur ~20 unités de haut dans Blender → mettre `gradientMax ≈ 20`. **À régler
  au GUI** en regardant où le clair commence.
- **Axe du tronc.** Le grain suppose le tronc **modélisé Y vers le haut** (cas normal). Si un
  `.glb` est couché sur un autre axe, les stries partiront de travers → adapter `grainUV`
  (échanger les composantes) ou redresser le modèle.
- **Stries trop régulières ?** `noiseTexture.png` se répète : si un motif revient
  visiblement, baisse `grainHoriz`/`grainVert` ou superpose un 2e échantillon décalé
  (`texture2D(uNoise, grainUV*2.3 + 0.5)`).
- **Rim light** : c'est lui qui donne le côté « Jordan Breton ». S'il bave trop (tout le
  tronc brille), baisse `rimStrength` ou monte l'exposant `pow(..., 3.0)` → `5.0`.
- **Ombres** : `castShadow/receiveShadow` restent posés ; un `ShaderMaterial` custom ne
  projette pas forcément sa depth. Si les ombres du tronc disparaissent, ajouter un
  `customDepthMaterial` (hors scope, à traiter seulement si besoin).
- **Le feuillage est inchangé** : on ne touche qu'au matériau des **meshes** (le tronc) ; les
  amas de quads (`buildFoliage`) gardent `foliageMaterial`.

## Vérification

1. `npm run dev`, regarder les deux troncs (`trunc1.glb`, `trunc_oak.glb`).
2. **Stries verticales** : monter **Force stries** → des bandes apparaissent et **courent le
   long du tronc** (pas en diagonale ni en taches). Régler densité/étirement.
3. **Creux** : monter **Creux** → les rainures s'assombrissent, l'écorce gagne du relief.
4. **Dégradé** : régler **Dégradé pied/haut (Y obj)** → pied sombre, haut clair ; caler les
   bornes sur la hauteur réelle du modèle.
5. **Contour** : monter **Contour lumineux** → un liseré apparaît sur la silhouette du tronc.
6. **Jour/nuit** : bouger le soleil → le tronc s'assombrit la nuit, le rim ne s'allume qu'en
   journée (`* dayFactor`).
7. Comparer à `TMP.png` et choisir la palette (A/B/C), ajuster au GUI.
8. Vérifier que le **feuillage** est intact (seul le tronc a changé).
</content>
