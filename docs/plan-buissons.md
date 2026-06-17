# Plan — Buissons (technique « quads + alphaMap », sans tronc)

Objectif : ajouter des **buissons** au monde en réutilisant la technique du blog
[douges.dev/blog/threejs-trees-1](https://douges.dev/blog/threejs-trees-1), mais **100 % en code**
(pas de modèle Blender) et **sans tronc** — juste le feuillage.

Le principe : un buisson n'est pas une géométrie organique, c'est un **amas de quads plats**
dont la **forme des feuilles vient d'une texture alpha**, pas de la géométrie. Un vertex shader
les fait « gonfler » face caméra (billboard) et onduler au vent ; le fragment shader découpe la
silhouette via `alphaTest` et les éclaire avec le soleil partagé.

---

## 0. Ce qu'on réutilise de l'existant

Le projet a déjà tous les briques. On calque sur `Grass.js` :

| Brique | Source existante | Réutilisation pour les buissons |
|---|---|---|
| Classe de base (scene/time/debug) | `WorldComponent` | `Bush extends WorldComponent` |
| Instanciation + dispersion | `Grass` (`InstancedMesh` + `MeshSurfaceSampler`) | même pattern, sur le terrain |
| Soleil partagé par référence | `Environment.sunDirection`, `ambientIntensity` | mêmes uniforms partagés |
| Éclairage stylisé + `dayFactor` | `shaders/grass/fragment.glsl` | copier la logique diffuse |
| Vent partagé + souscription | `Wind.direction` + `wind.on('change')` | même mécanisme |
| Import GLSL | `vite-plugin-glsl` (`import x from '...glsl'`) | idem |
| Dossier static | Vite sert `static/` (`publicDir: '../static'`) | texture de feuille dans `static/textures/` |

> Note : `src/Experience/World/Tree.js` existe déjà mais est **vide**. On peut le renommer
> `Bush.js` (recommandé, le nom est plus juste) ou le réutiliser tel quel.

---

## 1. Asset — la texture de feuille (alphaMap)

C'est le **seul** asset nécessaire (et il ne vient pas de Blender).

- Créer `static/textures/leaf.png` : une petite touffe de feuilles sur **fond transparent**
  (PNG avec canal alpha). 256×256 suffit.
- La forme de la silhouette = ce PNG. Le quad reste un rectangle ; l'alpha découpe la feuille.
- Option avancée plus tard : une 2e texture couleur (vert dégradé) ; pour commencer, une teinte
  uniforme + l'alphaMap suffit.

Chargement (pas de Resources manager dans le projet) :

```js
const texture = new THREE.TextureLoader().load('/textures/leaf.png')
texture.colorSpace = THREE.SRGBColorSpace // si on l'utilise comme map couleur
```

---

## 2. Fichiers à créer

```
static/textures/leaf.png            (asset)
src/Experience/World/Bush.js        (classe, calquée sur Grass.js)
src/shaders/bush/vertex.glsl        (billboard + vent)
src/shaders/bush/fragment.glsl      (alphaTest + éclairage soleil)
```

Et **brancher dans `World.js`** comme les autres composants réactifs :

```js
import Bush from './Bush.js'
// ...
this.bush = new Bush(this.terrain, this.wind, this.environment)
// dans update() : this.bush.update()
```

---

## 3. Géométrie — deux niveaux de dispersion

Un buisson = un **amas de quads** ; le monde = **plusieurs buissons** posés sur le terrain.
Deux niveaux à gérer :

### 3a. Placement des buissons (sur le terrain)
Comme l'herbe : `MeshSurfaceSampler(this.terrain.mesh)` pour piocher N centres de buissons
à la surface (ils suivent le relief). Paramètre `bushCount` (ex. 40).

### 3b. Forme d'un buisson (amas de quads autour d'un centre)
Pour chaque buisson, placer `quadsPerBush` quads (ex. 8–12) dont les centres sont **répartis
dans un petit volume sphérique** autour du centre du buisson :

```
pour chaque buisson b (centre = point samplé sur le terrain) :
    pour chaque quad q :
        // point aléatoire dans une demi-sphère (buisson posé au sol -> pas de quads sous terre)
        dir = vecteur aléatoire normalisé, y >= 0
        offset = dir * rayon * random()
        position du quad = centre_buisson + offset
        rotation Y aléatoire + échelle aléatoire (variété)
```

Implémentation : **un seul `InstancedMesh`** dont l'instance est un `PlaneGeometry(1, 1)`
(UV déjà en [0,1]). Nombre total d'instances = `bushCount * quadsPerBush`. On remplit la
matrice de chaque instance avec `dummy` (comme dans `Grass.build()`).

**Attribut par instance à ajouter** : la **normale sphérique** `dir` (le vecteur centre→quad),
stockée via `InstancedBufferAttribute`. Elle sert à éclairer le buisson comme un volume
(voir §5, le piège des normales plates).

---

## 4. Vertex shader (`shaders/bush/vertex.glsl`)

Trois rôles :

1. **Billboard / gonflement** : décaler les coins du quad en **view space** pour qu'il fasse
   toujours face à la caméra (effet « fluffy » du blog) :
   ```glsl
   vec4 viewCenter = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
   vec2 corner = (uv - 0.5) * uQuadSize;   // coins du quad, centrés
   viewCenter.xy += corner;                // décalage écran-plan = billboard
   gl_Position = projectionMatrix * viewCenter;
   ```
2. **Vent** : réutiliser l'approche de `grass/vertex.glsl` — décaler la position monde du quad
   selon `uWindDirection` et `uTime`, amplitude croissant avec la hauteur dans le buisson
   (un masque, comme `windBladePower` pour l'herbe). Optionnel pour la v1.
3. **Varyings** : passer `vUv`, la **normale sphérique d'instance** (`aSphereNormal`) en world
   space, et la position pour l'éclairage.

> La normale sphérique = `dir` calculé en §3b. On l'oriente en world space et on la passe au
> fragment : elle donne au buisson un éclairage **volumétrique** (clair côté soleil, sombre à
> l'opposé) malgré des quads plats.

---

## 5. Fragment shader (`shaders/bush/fragment.glsl`)

```glsl
uniform sampler2D uLeafTexture;   // alphaMap (ou map couleur+alpha)
uniform vec3 uSunDirection;       // partagé par réf depuis Environment
uniform float uAmbientLight;
uniform vec3 uColor;              // teinte du feuillage

varying vec2 vUv;
varying vec3 vSphereNormal;       // normale "volume", pas la normale plate du quad

void main() {
  vec4 tex = texture2D(uLeafTexture, vUv);

  // 1. Découpe de la silhouette (le coeur de la technique)
  if (tex.a < 0.5) discard;       // équivaut à alphaTest = 0.5

  // 2. Éclairage stylisé, calqué sur l'herbe
  vec3 normal = normalize(vSphereNormal);
  float sunOrientation = dot(uSunDirection, normal);
  float dayFactor = smoothstep(-0.1, 0.5, uSunDirection.y); // nuit -> 0
  float diffuse = max(sunOrientation * 0.5 + 0.5, 0.0) * dayFactor; // half-lambert

  vec3 col = uColor * tex.rgb;    // ou juste uColor si texture = alpha seul
  col *= max(diffuse, uAmbientLight);

  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
```

**Pourquoi la normale sphérique et pas la normale du quad** : exactement le problème rencontré
sur le specular de l'herbe — un quad plat a une normale constante, donc il s'éclaire à plat.
En éclairant avec la normale **centre→quad**, le buisson réagit à la lumière comme une boule.

---

## 6. Matériau — réglages critiques

```js
this.material = new THREE.ShaderMaterial({
  vertexShader: bushVertexShader,
  fragmentShader: bushFragmentShader,
  uniforms: this.uniforms,
  side: THREE.DoubleSide,   // quads visibles des deux côtés
  transparent: false,       // IMPORTANT : on utilise alphaTest (discard), PAS la transparence
  depthWrite: true,         // du coup on garde le depth write (tri correct, pas de halo)
})
```

> Piège classique : si on met `transparent: true`, on retombe sur les problèmes de tri /
> depth de la pluie. Avec la technique **alphaTest (`discard`)**, on reste **opaque** : pas de
> tri à gérer, le z-buffer fait son travail. C'est tout l'intérêt par rapport à un blending.

Uniforms partagés (par référence, comme l'herbe) :

```js
this.uniforms = {
  uTime:          { value: 0 },
  uQuadSize:      { value: 1.0 },
  uLeafTexture:   { value: texture },
  uColor:         { value: new THREE.Color('#3a7d44') },
  uSunDirection:  { value: this.environment.sunDirection },     // réf partagée
  uAmbientLight:  { value: this.environment.ambientIntensity },
  uWindDirection: { value: this.wind.direction },               // réf partagée
  uWindStrength:  { value: this.wind.params.strength },
}
```

---

## 7. Souscriptions (réactivité)

Comme `Grass` / `Rain` :

```js
setSubscriptions() {
  // Terrain reconstruit ou relief modifié -> les buissons doivent se replacer
  this.terrain.on('rebuilt',   () => this.build())
  this.terrain.on('resampled', () => this.build())

  // Vent : direction partagée par réf ; seule la force passe par l'uniform
  this.wind.on('change', () => {
    this.uniforms.uWindStrength.value = this.wind.params.strength
  })
}

update() {
  this.uniforms.uTime.value = this.time.elapsed
}
```

> Le soleil ne nécessite **aucune** souscription : `Environment` mute `sunDirection` en place,
> l'uniform partagé suit tout seul (même logique que l'herbe).

---

## 8. Panneau debug (lil-gui)

Dossier « Buissons » avec, a minima :

- `bushCount` (nb de buissons) — `onFinishChange(() => this.build())`
- `quadsPerBush` — `onFinishChange(() => this.build())`
- `radius` (rayon de l'amas) — `onFinishChange(() => this.build())`
- `uQuadSize` (taille d'un quad) — `onChange(v => this.uniforms.uQuadSize.value = v)`
- `uColor` (couleur feuillage) — `addColor(...).onChange(...)`

---

## 9. Ordre d'implémentation (étapes vérifiables)

1. **Asset** : créer `public/textures/leaf.png` (touffe sur fond transparent).
2. **Squelette** : `Bush.js extends WorldComponent`, constructeur prenant `(terrain, wind, environment)`,
   le brancher dans `World.js` (+ `update()`).
3. **Quads instanciés, sans shader custom** d'abord : `InstancedMesh` de `PlaneGeometry`,
   dispersion §3, avec un `MeshBasicMaterial({ map, alphaTest: 0.5, side: DoubleSide })`.
   → But : voir des touffes correctement placées et découpées **avant** d'écrire le GLSL.
4. **Vertex shader billboard** : remplacer par `ShaderMaterial`, ajouter le gonflement face caméra.
5. **Fragment shader** : `discard` + éclairage soleil avec la **normale sphérique** (attribut d'instance).
6. **Vent** : ajouter l'ondulation dans le vertex shader + souscription `wind.on('change')`.
7. **Debug** : exposer les paramètres.
8. **Souscriptions terrain** : `rebuilt` / `resampled` → `build()`.

Chaque étape est observable à l'écran : on ne passe au shader qu'une fois le placement validé.

---

## 10. Pièges identifiés (à garder en tête)

- **alphaTest, pas transparence** : `discard` garde le rendu opaque → pas de tri, pas de halo.
  Ne pas mettre `transparent: true`.
- **Normales plates** : éclairer avec la normale du quad = buisson plat sans volume. Utiliser
  la **normale sphérique d'instance** (même leçon que le specular de l'herbe).
- **`colorSpace` de la texture** : si on l'utilise comme couleur, `texture.colorSpace = SRGBColorSpace`,
  sinon couleurs délavées (cf. `#include <colorspace_fragment>` déjà présent dans les shaders).
- **Billboard en view space** : le décalage des coins se fait **après** `modelViewMatrix`,
  sinon les quads ne font pas face à la caméra.
- **`MeshSurfaceSampler` fige un instantané** : reconstruire le sampler dans `build()` à chaque
  changement de terrain (comme `Grass.build()`), sinon les buissons restent sur l'ancien relief.
- **Coût** : `bushCount * quadsPerBush` instances. Rester raisonnable (ex. 40 × 10 = 400 quads)
  avant d'optimiser.

---

## 11. Évolutions possibles (hors v1)

- Texture couleur séparée (dégradé vert clair en haut / foncé en bas) en plus de l'alphaMap.
- Variété de teinte par buisson (attribut d'instance `aTint`).
- Bloom (post-processing) si on veut des reflets de lumière sur le feuillage humide
  (lié à la discussion specular/pluie — nécessite un `EffectComposer`).
- Réaction au vent plus marquée sur les quads hauts (masque de hauteur dans le buisson).
