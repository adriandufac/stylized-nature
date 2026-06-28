# Vent sur les buissons et le feuillage des arbres

## Contexte

Aujourd'hui seule l'herbe réagit au vent (shader `grass/vertex.glsl`, piloté par la
classe `Wind`). Les buissons (`Bush.js`) et le feuillage des arbres (`Tree.js`)
sont des amas de quads texturés (billboards) totalement statiques. On veut leur
donner le même balancement, à partir de la même source de vent globale.

Décisions :
- **Base plantée** : pour les buissons la base reste fixe au sol et le haut oscille
  le plus (comme l'herbe) ; le feuillage des arbres oscille en masse.
- **Feuillage seulement** : les troncs ne bougent pas (pas de modif de `trunc/`).

Point clé : le shader **`src/shaders/bush/vertex.glsl` est partagé** par `Bush.js`
et le feuillage de `Tree.js`. Une seule modif du shader couvre les deux cas.

## Approche

Les quads sont des billboards : on déplace le **centre de l'instance** dans le plan
XZ (translation rigide du quad). Pas de cisaillement interne → **pas besoin de
corriger les normales** (contrairement à l'herbe dont le brin se déforme). Le
`vSphereNormal` reste inchangé, l'éclairage fluffy n'est pas affecté.

On réutilise la source de vent existante (`Wind`) exactement comme l'herbe : même
`uTime`, même `uWindDirection` (Vector2 partagé par référence), même `uWindStrength`.

### 1. Shader — `src/shaders/bush/vertex.glsl`

Ajouter en tête :
```glsl
uniform float uTime;
uniform float uWindStrength;
uniform vec2  uWindDirection;

attribute vec2 aWind; // x = amplitude (0 base -> 1 haut), y = déphasage par quad
```

Remplacer le calcul du centre par une version qui passe par l'espace **monde**
(via les built-ins `modelMatrix` / `viewMatrix`, dispo en GLSL1 et GLSL3) pour
y injecter le vent, puis revenir en vue :
```glsl
vec4 worldCenter = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);

// Onde spatio-temporelle identique à l'herbe + déphasage par quad (aWind.y)
float wave = sin(uTime * 1.5 + worldCenter.x * 0.5 + worldCenter.z * 0.5 + aWind.y);
vec3  windOffset = vec3(uWindDirection.x, 0.0, uWindDirection.y)
                 * (wave * aWind.x * uWindStrength * 2.0); // *2 : feuillage un peu plus ample que l'herbe
worldCenter.xyz += windOffset;

vec4 viewCenter = viewMatrix * worldCenter;
float quadScale = length(instanceMatrix[0].xyz);
viewCenter.xy += position.xy * quadScale;
gl_Position = projectionMatrix * viewCenter;
```
Le reste (`vUv`, `vSphereNormal`, `vColor`, `vTextureIndex`) est inchangé.

> Note : `modelMatrix`/`viewMatrix` sont des uniforms injectés par three.js dans les
> deux modes GLSL ; le facteur `2.0` est ajustable (ou à exposer plus tard).

### 2. `src/Experience/World/Bush.js`

- **`setMaterial()`** : ajouter aux `uniforms` :
  `uTime: { value: 0 }`, `uWindStrength: { value: this.wind.params.strength }`,
  `uWindDirection: { value: this.wind.direction }` (même réf que l'herbe).
- **`build()`** : créer `this.windFactors = new Float32Array(total * 2)` et, dans la
  boucle par quad, le remplir :
  - amplitude (base plantée) : hauteur du quad au-dessus du sol normalisée, ex.
    `clamp((this.dummy.position.y - groundY) / bush.size, 0, 1)` (≈ 0 en bas, 1 en haut) ;
  - déphasage : `Math.random() * Math.PI * 2`.
  Puis poser l'attribut :
  `this.bladeGeometry.setAttribute("aWind", new THREE.InstancedBufferAttribute(this.windFactors, 2))`.
- **`setSubscriptions()`** : s'abonner au vent comme l'herbe :
  `this.wind.on("change", () => { this.material.uniforms.uWindStrength.value = this.wind.params.strength })`.
- **Nouvelle méthode `update()`** : `this.material.uniforms.uTime.value = this.time.elapsed;`
  (calque exact de `Grass.update()`).

### 3. `src/Experience/World/Tree.js`

- **`setFoliageMaterial()`** : ajouter les mêmes 3 uniforms vent
  (`uTime`, `uWindStrength`, `uWindDirection` = `this.wind.direction`).
- **`buildFoliage()`** : créer `windFactors = new Float32Array(total * 2)` et le remplir
  par quad — feuillage d'arbre = **oscille en masse**, donc amplitude ≈ constante avec
  un léger aléa, ex. `0.85 + 0.15 * Math.random()` ; déphasage `Math.random()*PI*2`.
  Poser l'attribut `aWind` sur la géométrie (comme `aSphericalNormal`/`aColor`).
- **`setSubscriptions()`** : ajouter
  `this.wind.on("change", () => { this.foliageMaterial.uniforms.uWindStrength.value = this.wind.params.strength })`.
- **Nouvelle méthode `update()`** : `this.foliageMaterial.uniforms.uTime.value = this.time.elapsed;`
  (un seul matériau de feuillage partagé par tous les arbres → une seule maj suffit).

### 4. `src/Experience/World/World.js`

`Bush` et `Tree` ne sont pas dans la boucle d'update. Ajouter dans `update()` :
```js
this.bush.update();
this.tree.update();
```

## Fichiers modifiés

- `src/shaders/bush/vertex.glsl` (partagé buissons + feuillage)
- `src/Experience/World/Bush.js`
- `src/Experience/World/Tree.js`
- `src/Experience/World/World.js`

## Vérification

1. Lancer l'app (`npm run dev`) et observer : buissons et feuillage des arbres se
   balancent ; la **base des buissons reste plantée**, le haut bouge le plus ; les
   troncs restent immobiles.
2. Panneau debug **« Vent »** : faire varier *Force* → l'amplitude des buissons,
   du feuillage ET de l'herbe change ensemble ; faire varier *Direction* → tout se
   penche dans le même sens (cohérence avec l'herbe).
3. Vérifier que les quads d'un même amas ne bougent pas en parfait synchrone
   (déphasage `aWind.y` OK) et qu'il n'y a pas de scintillement/erreur d'éclairage
   (normales fluffy préservées).
4. Vérifier la console : pas d'erreur de compilation GLSL (le shader partagé doit
   compiler en GLSL1 — feuillage d'arbre — et GLSL3 — buissons).
