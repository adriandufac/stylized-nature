# Texture/couleur stylisée des rochers & falaise (shader)

## Contexte

Les rochers et la falaise sont chargés depuis `static/models/cliff2.glb` par
`Cliff.js` (`src/Experience/World/Cliff.js:31-50`). Aujourd'hui chaque mesh garde
**le matériau exporté de Blender** (`child.material` du glTF) : couleur plate, aucun
contrôle côté code, et pas le rendu visé.

Objectif : reproduire le look stylisé low-poly de la référence (`TMP.png`) **100% en
GLSL**, sans repasser par Blender. Trois ingrédients, dans l'esprit du shader d'herbe :

1. **Flat shading** (facettes nettes) — calculé dans le fragment via les dérivées, donc
   **indépendant des normales du `.glb`** (qu'elles soient lissées ou dures).
2. **Taches de couleur** par **bruit triplanaire** (`noiseTexture.png`) qui débordent des
   facettes → casse l'uniformité sans UV ni seams.
3. **Dégradé vertical** (selon la hauteur monde Y) : plus clair/verdâtre en haut (mousse /
   lumière zénithale), plus sombre en bas.

Éclairage **réutilisé tel quel** du shader d'herbe (`src/shaders/grass/fragment.glsl:10-24`) :
half-lambert × `dayFactor` + ambiant + `smoothstep` pour le contraste stylisé. On partage
`uSunDirection` / `uAmbientLight` **par référence** depuis `environment` (même pattern que
`Grass.setMaterial()` `Grass.js:160-178` et `Bush.setMaterial()` `Bush.js:62-78`), donc le
jour/nuit marchera automatiquement sans `update()`.

> Pas de vent, pas d'animation, pas de `uTime` : les rochers sont statiques. La seule
> chose « live » est la direction du soleil, mutée en place par `environment` → l'uniform
> (qui tient la **même** référence `Vector3`) se met à jour seul à chaque frame.

## Fichiers concernés

- **`src/shaders/rock/vertex.glsl`** — nouveau. Calcule la position monde et la passe au fragment.
- **`src/shaders/rock/fragment.glsl`** — nouveau. Flat shading + bruit triplanaire + dégradé + éclairage.
- **`src/Experience/World/Cliff.js`** — modifié. Construit le `ShaderMaterial`, charge la
  texture de bruit, et **remplace le matériau** de chaque mesh du glTF dans le `traverse`.
- **`static/textures/noiseTexture.png`** — **déjà présent**, réutilisé (wrap `Repeat`).

> `Cliff` reçoit actuellement zéro dépendance dans son constructeur (`Cliff.js:13`). Comme
> on a besoin de `environment` (soleil/ambiant), il faudra le passer à l'instanciation
> dans `World.js` (voir étape 4). Repérer où `new Cliff()` est appelé.

## Étapes d'implémentation

### 1. `src/shaders/rock/vertex.glsl`

On a juste besoin de la **position monde** (pour le triplanaire + le dégradé de hauteur) ;
la normale facettée est recalculée dans le fragment, donc on ne transmet pas `normal`.

```glsl
varying vec3 vWorldPosition;

void main() {
  // modelMatrix inclut la transform du nœud glTF (chaque rocher a la sienne) + celle du group.
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPosition.xyz;
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
```

### 2. `src/shaders/rock/fragment.glsl`

```glsl
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
```

> **Dérivées (`dFdx`/`dFdy`)** : natives en WebGL2 (three 0.184 l'utilise par défaut), rien
> à activer. Si jamais un contexte WebGL1 est forcé, ajouter
> `#extension GL_OES_standard_derivatives : enable` en tête du fichier.

> Le `smoothstep(0.0, 1.0, col)` est volontairement plus doux que celui de l'herbe
> (`0.1, 0.9`) pour ne pas cramer les rochers ; à régler à l'œil.

### 3. `Cliff.js` — matériau + chargement bruit + remplacement des matériaux glTF

Dans le **constructeur**, récupérer `environment`, charger le bruit, créer le matériau
AVANT `this.load()` :

```js
import rockVertexShader from "../../shaders/rock/vertex.glsl";
import rockFragmentShader from "../../shaders/rock/fragment.glsl";

constructor(environment) {
  super();
  this.environment = environment;

  this.params = { x: 0, y: 0, z: 0, rotationY: 0, scale: 1 }; // glb déjà cuit (cf. note existante)

  // Paramètres d'aspect (pilotés par le GUI).
  this.look = {
    lowColor:  "#2a2333", // bas sombre violacé
    highColor: "#6b7a5e", // haut verdâtre (mousse)
    tintColor: "#3a3142", // taches
    noiseScale: 0.15,
    tintStrength: 0.5,
    gradientMin: 0.0,  // hauteurs MONDE (le glb est cuit à y≈0.4..) -> à régler au GUI
    gradientMax: 6.0,
  };

  this.group = new THREE.Group();
  this.scene.add(this.group);

  this.setMaterial();   // crée this.material (+ this.uniforms)
  this.loadNoise();     // charge noiseTexture.png -> this.uniforms.uNoise.value
  this.load();          // charge le glb PUIS remplace les matériaux
}
```

```js
setMaterial() {
  this.uniforms = {
    uLowColor:     { value: new THREE.Color(this.look.lowColor) },
    uHighColor:    { value: new THREE.Color(this.look.highColor) },
    uTintColor:    { value: new THREE.Color(this.look.tintColor) },
    uNoiseScale:   { value: this.look.noiseScale },
    uTintStrength: { value: this.look.tintStrength },
    uGradientMin:  { value: this.look.gradientMin },
    uGradientMax:  { value: this.look.gradientMax },
    uNoise:        { value: null }, // rempli par loadNoise()
    uSunDirection: { value: this.environment.sunDirection },      // réf partagée
    uAmbientLight: { value: this.environment.ambientIntensity },
  };

  this.material = new THREE.ShaderMaterial({
    vertexShader: rockVertexShader,
    fragmentShader: rockFragmentShader,
    uniforms: this.uniforms,
    // side par défaut (FrontSide) : les rochers/falaise sont des volumes fermés.
  });
}

loadNoise() {
  new THREE.TextureLoader().load("/textures/noiseTexture.png", (tex) => {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.NoColorSpace; // c'est un bruit, pas une couleur
    this.uniforms.uNoise.value = tex;
  });
}
```

Dans `load()`, remplacer le matériau de chaque mesh (les anciens matériaux du glTF
deviennent inutiles → on les `dispose`) :

```js
root.traverse((child) => {
  if (child.isMesh) {
    child.material?.dispose();   // libère le matériau exporté de Blender
    child.material = this.material;
    child.castShadow = true;
    child.receiveShadow = true;
  }
});
```

> **Optionnel — distinguer falaise et rochers.** Dans `cliff2.glb`, la falaise = nœuds
> `Plane` / `Plane001` / `Plane002`, les rochers = `Icosphere*` (vérifié via l'inspection
> du glb). Si tu veux deux palettes, crée un 2e matériau et choisis selon
> `child.name.startsWith("Icosphere")`. Sinon, un seul matériau suffit pour commencer.

### 4. Passer `environment` à `Cliff` (dans `World.js`)

Repérer `new Cliff()` et le remplacer par `new Cliff(this.environment)` (adapter au nom
réel de la prop, comme c'est fait pour `Grass`/`Bush`). Sans ça, `this.environment` est
`undefined` et `setMaterial()` plante.

### 5. Contrôles GUI (dans `setDebug()`, dossier « Falaise » existant)

Compléter `setDebug()` (`Cliff.js:59-82`) — garder les transforms, ajouter un sous-dossier
« Aspect » :

```js
const look = folder.addFolder("Aspect").close();
look.addColor(this.look, "lowColor").name("Couleur bas")
  .onChange((v) => this.uniforms.uLowColor.value.set(v));
look.addColor(this.look, "highColor").name("Couleur haut")
  .onChange((v) => this.uniforms.uHighColor.value.set(v));
look.addColor(this.look, "tintColor").name("Couleur taches")
  .onChange((v) => this.uniforms.uTintColor.value.set(v));
look.add(this.look, "noiseScale", 0.01, 1, 0.01).name("Échelle bruit")
  .onChange((v) => (this.uniforms.uNoiseScale.value = v));
look.add(this.look, "tintStrength", 0, 1, 0.01).name("Force taches")
  .onChange((v) => (this.uniforms.uTintStrength.value = v));
look.add(this.look, "gradientMin", -5, 15, 0.1).name("Dégradé bas (Y)")
  .onChange((v) => (this.uniforms.uGradientMin.value = v));
look.add(this.look, "gradientMax", -5, 15, 0.1).name("Dégradé haut (Y)")
  .onChange((v) => (this.uniforms.uGradientMax.value = v));
```

## Points d'attention

- **Le glb est cuit** (cf. note dans `Cliff.js`) : les positions monde des rochers vont de
  `y ≈ -1.4` à `y ≈ 8.5` (cf. inspection des nœuds). Les seuils `gradientMin/Max` sont en
  **coordonnées monde**, à régler au GUI pour cadrer le dégradé sur la hauteur réelle.
- **Flat shading via dérivées** = le `.glb` peut garder ses normales lissées, on s'en moque.
  Si tu préfères au contraire t'appuyer sur des normales dures exportées, remplace le bloc
  `cross(dFdx, dFdy)` par une `varying vNormal` classique (mais l'export devra alors avoir
  des arêtes vives — d'où l'intérêt des dérivées, qui évitent de retoucher Blender).
- **Triplanaire** : si les taches « bavent » sur les faces ~horizontales, c'est normal (le
  poids `w.y` domine) ; ajuster `uNoiseScale`. Pas de seam possible (pas d'UV utilisée).
- **Ombres** : `castShadow/receiveShadow` restent posés, mais le `ShaderMaterial` custom ne
  gère pas la depth de shadow tout seul. Si les ombres disparaissent, ajouter un
  `customDepthMaterial` (hors scope ici — à traiter seulement si besoin).

## Vérification

1. `npm run dev`, ouvrir la scène, regarder la falaise + les rochers.
2. **Facettes** : le rendu doit être franchement facetté (flat shading), pas lisse.
3. **Taches** : monter **Force taches** → des blotches apparaissent et **débordent des
   triangles** (preuve que c'est le bruit, pas l'éclairage des faces).
4. **Dégradé** : régler **Dégradé bas/haut (Y)** → le bas s'assombrit, le haut s'éclaircit
   vers `highColor`. Caler les bornes sur la hauteur réelle des rochers.
5. **Jour/nuit** : bouger le soleil (GUI Environnement) → les rochers s'assombrissent la
   nuit et s'éclairent le jour, comme l'herbe (preuve que `uSunDirection` partagé marche).
6. **Couleurs** : les 3 color pickers modifient bien bas / haut / taches en live.
7. Comparer à `TMP.png` et ajuster `lowColor`/`highColor`/`tintColor`/`noiseScale` au GUI.
8. (Si activé) palette distincte falaise vs rochers : vérifier que seuls les `Icosphere*`
   changent.
</content>
</invoke>
