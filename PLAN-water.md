# Phase 1 — Méthode 2 : meshes d'eau modelés + shader de foam

> **Version adaptée à l'architecture du projet** (singleton `Experience`, `WorldComponent`,
> `Time`/`Sizes`/`Debug`, shaders `.glsl` via `vite-plugin-glsl`, `Renderer` à passe unique).
> Le plan original supposait un `main.js` plat avec sa propre boucle — ce n'est pas notre cas,
> tout est recâblé ci-dessous pour s'insérer proprement dans l'`Experience`.

Plan d'action complet pour le lac, la rivière et la cascade en meshes séparés, avec le shader
d'écume basé sur la profondeur.

## Vue d'ensemble

Tu vas produire :

- **3 meshes d'eau** modelés dans Blender (lac, rivière, cascade), exportés en un seul `water.glb`.
- **1 utilitaire `DepthCapture`** : rend la scène solide (terrain + rochers + falaise) dans une
  texture de profondeur, une fois par frame, **piloté par le `Renderer`** (et non par une boucle
  maison).
- **1 composant `Water` (extends `WorldComponent`)** : charge `water.glb`, crée 3 matériaux shader
  (un par plan d'eau) avec leurs propres réglages, s'enregistre dans le GUI, et anime `uTime`.
- **2 shaders `.glsl`** (`src/shaders/water/vertex.glsl` + `fragment.glsl`) partagés par les trois
  plans d'eau, importés comme les shaders existants (`grass`, `rain`, `bush`).

Le principe du foam : dans le fragment shader, on compare la profondeur du sol (lue dans la depth
texture) avec la profondeur de la surface d'eau. Petite différence = bord = écume blanche. Grande
différence = eau profonde = couleur foncée.

### Ce qui change par rapport à l'archi existante

| Sujet | Convention du projet (à respecter) |
|---|---|
| Boucle | `Time` émet `tick` → `Experience.update()` → `renderer.update()`. **Pas** de `requestAnimationFrame` maison. |
| Temps | `this.time.elapsed` est **déjà en secondes** (`THREE.Clock`). On l'injecte tel quel dans `uTime`. |
| Render | `Renderer.update()` fait **un seul** `render()`. La passe de profondeur s'ajoute **avant**, dans `Renderer`. |
| Resize | `this.sizes.on('resize', …)` (EventEmitter). **Pas** de `window.addEventListener`. |
| Taille / DPR | `sizes.width`, `sizes.height`, `sizes.pixelRatio` (déjà clampé à 2). |
| GUI | `this.debug.ui.addFolder('Eau')` (lil-gui), comme `Cliff` / `Grass`. |
| Composant | hériter de `WorldComponent` (donne `scene`, `time`, `debug`), instancié dans `World.js`. |
| Shaders | fichiers `.glsl` dans `src/shaders/water/`, importés en string via `vite-plugin-glsl`. |
| Modèles | chargés depuis `/models/…` (dossier `public/models/`), via `GLTFLoader` de `three/addons`. |

---

## Partie A — Blender

> *(Inchangé sur le fond — seuls le dossier d'export et les noms d'objets sont fixés.)*

### Règles communes aux 3 meshes

- **Garde-les plats / simples** mais **subdivisés** : il faut assez de vertices pour les vagues
  (déplacement dans le vertex shader). Une grille trop pauvre = vagues anguleuses.
- **Applique les transforms** avant export : `Ctrl+A` → All Transforms (sinon l'échelle/rotation
  fausse les UV et la position).
- **Place-les à la bonne hauteur Y** directement dans Blender, pile sous le seuil de la brèche de
  sortie pour le lac. Comme ça, à l'import, ils sont déjà au bon endroit (on garde les transforms du
  GLB, on ne fait que remplacer le matériau).
- **Nomme chaque objet** précisément, on les retrouvera par leur nom à l'import : `water_lake`,
  `water_river`, `water_fall`.

### Le lac

1. Vue de dessus (`Numpad 7`). Ajoute un Plane, passe en Edit Mode, et découpe-le à la silhouette de
   ton bassin (vue du dessus). Pas besoin d'épouser le contour au pixel près : le foam dessinera la berge.
2. Subdivise la surface : `Right-click → Subdivide` plusieurs fois, ou un Subdivision Surface
   appliqué, pour avoir ~20–40 segments par côté.
3. UVs : `U → Project From View` (en vue de dessus) ou `U → Smart UV Project`. Les UV servent au
   défilement du bruit de surface ; une projection planaire du dessus est parfaite pour un lac.
4. Renomme l'objet `water_lake`.

### La rivière

1. Modélise un **ruban** : un Plane étiré le long du lit, qui suit les virages. Le plus simple : crée
   une courbe (`Add → Curve → Path`) qui suit le sillon, puis convertis-la en mesh, ou extrude un
   edge segment par segment le long du canal.
2. Subdivise **dans le sens de la longueur** (beaucoup de segments le long du flux, peu en largeur).
3. UVs **importantes** : l'axe **V doit suivre le sens du courant** (de l'amont vers l'aval). C'est
   ce qui rendra le défilement crédible. Vérifie dans l'UV Editor que V monte bien le long de la rivière.
4. Renomme `water_river`.

### La cascade

1. Une **nappe verticale** légèrement incurvée, plaquée sur la face de la falaise, du sommet jusqu'à
   la surface du lac.
2. Subdivise **verticalement**.
3. UVs : axe **V vertical** (de haut en bas), pour faire défiler la texture vers le bas.
4. Renomme `water_fall`.

### Export

`File → Export → glTF 2.0 (.glb)` avec :

- **Format** : GLB (binaire, un seul fichier).
- **Include** : Selected Objects (sélectionne tes 3 meshes d'eau), + Custom Properties.
- **Transform** : +Y Up (coché).
- **Geometry** : UVs + Normals cochés. Tu peux décocher les matériaux, on les remplace par le shader.

Exporte vers **`public/models/water.glb`** (à côté de `cliff.glb`), pour qu'il soit servi sur
`/models/water.glb` comme les autres modèles.

---

## Partie B — Architecture des fichiers

```
public/
  models/
    water.glb                         // les 3 meshes (déjà placés/nommés)
src/
  shaders/
    water/
      vertex.glsl                     // vagues + profondeur vue caméra
      fragment.glsl                   // dégradé profondeur + foam
  Experience/
    Renderer.js                       // [MODIFIÉ] possède DepthCapture, lance la passe avant le render
    Utils/
      DepthCapture.js                 // [NOUVEAU] capture la profondeur du solide
    World/
      World.js                        // [MODIFIÉ] instancie Water
      Water.js                        // [NOUVEAU] WorldComponent : charge water.glb, 3 matériaux, GUI
```

Les shaders sont des fichiers `.glsl` importés en string par `vite-plugin-glsl` (déjà configuré dans
`vite.config.js`), exactement comme `src/shaders/grass/*`.

---

## Partie C — Le code

### `src/shaders/water/vertex.glsl`

```glsl
uniform float uTime;
uniform float uWaveAmplitude;
uniform float uWaveFrequency;
uniform float uWaveSpeed;

varying vec2 vUv;
varying float vViewDepth; // profondeur de la surface d'eau, vue caméra

void main() {
  vUv = uv;
  vec3 pos = position;

  // vagues douces : deux sinusoïdes croisées sur le plan horizontal.
  // (pour la cascade verticale, on mettra uWaveAmplitude = 0)
  float wave = sin(pos.x * uWaveFrequency + uTime * uWaveSpeed)
             * cos(pos.z * uWaveFrequency * 1.3 + uTime * uWaveSpeed * 0.9);
  pos.y += wave * uWaveAmplitude;

  vec4 modelViewPos = modelViewMatrix * vec4(pos, 1.0);
  vViewDepth = -modelViewPos.z; // distance positive depuis la caméra
  gl_Position = projectionMatrix * modelViewPos;
}
```

### `src/shaders/water/fragment.glsl`

```glsl
#include <packing>

uniform sampler2D tDepth;
uniform float uCameraNear;
uniform float uCameraFar;
uniform vec2  uResolution;
uniform float uTime;

uniform vec3  uShallowColor;
uniform vec3  uDeepColor;
uniform vec3  uFoamColor;
uniform float uDeepDistance;   // à partir de quelle profondeur c'est "profond"
uniform float uFoamDistance;   // largeur de la bande d'écume
uniform float uFoamScrollSpeed;

uniform vec2  uFlowDirection;  // direction du courant (rivière/cascade)
uniform float uFlowSpeed;      // 0 pour le lac

varying vec2 vUv;
varying float vViewDepth;

// lit la profondeur LINÉAIRE du sol à l'écran
float readSceneDepth(vec2 screenUv) {
  float fragZ = texture2D(tDepth, screenUv).x;
  float viewZ = perspectiveDepthToViewZ(fragZ, uCameraNear, uCameraFar);
  return -viewZ; // distance positive
}

// bruit value simple pour faire onduler le bord de l'écume
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  float a = hash(i), b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

void main() {
  vec2 screenUv = gl_FragCoord.xy / uResolution;

  float sceneDepth = readSceneDepth(screenUv);
  float waterDepth = vViewDepth;

  // quantité d'eau entre la surface et le sol à ce pixel
  float depthDiff = max(sceneDepth - waterDepth, 0.0);

  // 1) couleur : peu profond -> profond
  float deepFactor = clamp(depthDiff / uDeepDistance, 0.0, 1.0);
  vec3 color = mix(uShallowColor, uDeepColor, deepFactor);

  // 2) écume : forte là où depthDiff est petit (berges, rochers, impact)
  vec2 flow = uFlowDirection * uFlowSpeed * uTime;
  float n = noise(vUv * 14.0 + flow + uTime * uFoamScrollSpeed);
  float foamEdge = uFoamDistance * (0.6 + 0.4 * n); // seuil qui ondule
  float foam = 1.0 - smoothstep(0.0, foamEdge, depthDiff);

  color = mix(color, uFoamColor, foam);

  gl_FragColor = vec4(color, 0.92);
}
```

> **Note debug** : pour l'étape 1 du test (voir plus bas), remplace temporairement la dernière ligne
> par `gl_FragColor = vec4(vec3(sceneDepth / uCameraFar), 1.0);` pour visualiser la depth texture.

### `src/Experience/Utils/DepthCapture.js`

Utilitaire bas niveau, **piloté par le `Renderer`** (qui lui fournit renderer + caméra + scène).
Rend la scène solide dans une render target en cachant les meshes d'eau, et expose la depth texture.

```js
import * as THREE from 'three'

/**
 * Capture la profondeur de la scène SANS l'eau, dans une DepthTexture.
 * Le fragment shader de l'eau lit cette texture pour calculer le foam de berge.
 * Piloté par Renderer.update() : une passe par frame, avant le render principal.
 */
export default class DepthCapture {
  constructor(renderer, camera, scene) {
    this.renderer = renderer
    this.camera = camera
    this.scene = scene

    const size = renderer.getDrawingBufferSize(new THREE.Vector2())

    this.target = new THREE.WebGLRenderTarget(size.x, size.y)
    this.target.texture.minFilter = THREE.NearestFilter
    this.target.texture.magFilter = THREE.NearestFilter

    // la texture de profondeur, c'est elle qu'on lira dans le shader
    this.target.depthTexture = new THREE.DepthTexture(size.x, size.y)
    this.target.depthTexture.type = THREE.UnsignedShortType
  }

  get depthTexture() {
    return this.target.depthTexture
  }

  // appelé depuis Renderer.resize() — sizes.width/height en CSS px, on applique le DPR ici
  setSize(width, height, pixelRatio) {
    this.target.setSize(width * pixelRatio, height * pixelRatio)
  }

  // rend la scène SANS l'eau dans la depth texture
  capture(waterMeshes) {
    for (const m of waterMeshes) m.visible = false

    this.renderer.setRenderTarget(this.target)
    this.renderer.render(this.scene, this.camera)
    this.renderer.setRenderTarget(null)

    for (const m of waterMeshes) m.visible = true
  }
}
```

### `src/Experience/Renderer.js` — modifications

On y instancie le `DepthCapture`, on lance la passe de profondeur **avant** le render principal, et
on propage le resize. La liste des meshes d'eau à cacher est lue sur `world.water` (qui peut ne pas
encore exister tant que le GLB n'est pas chargé → on garde la garde).

```js
import * as THREE from 'three'
import Experience from './Experience.js'
import DepthCapture from './Utils/DepthCapture.js'

export default class Renderer {
  constructor() {
    this.experience = new Experience()
    this.sizes = this.experience.sizes
    this.scene = this.experience.scene
    this.canvas = this.experience.canvas
    this.camera = this.experience.camera

    this.setInstance()

    // Capture de profondeur pour l'eau (lue par le fragment shader de Water)
    this.depthCapture = new DepthCapture(this.instance, this.camera.instance, this.scene)
  }

  setInstance() {
    this.instance = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true })
    this.instance.setSize(this.sizes.width, this.sizes.height)
    this.instance.setPixelRatio(this.sizes.pixelRatio)
  }

  resize() {
    this.instance.setSize(this.sizes.width, this.sizes.height)
    this.instance.setPixelRatio(this.sizes.pixelRatio)
    this.depthCapture.setSize(this.sizes.width, this.sizes.height, this.sizes.pixelRatio)
  }

  update() {
    // 1) passe de profondeur du solide (eau cachée) si l'eau est chargée
    const water = this.experience.world?.water
    if (water && water.meshes.length) {
      this.depthCapture.capture(water.meshes)
    }

    // 2) render principal (eau visible)
    this.instance.render(this.scene, this.camera.instance)
  }
}
```

> **Ordre d'instanciation** : dans `Experience.js`, `renderer` est créé **avant** `world`. Donc
> `renderer.depthCapture.depthTexture` existe déjà quand `Water` construit ses matériaux. ✅
> À l'inverse, au `update()`, `world` existe : la garde `world?.water && water.meshes.length` couvre
> la fenêtre entre le démarrage et la fin du chargement async du GLB.

### `src/Experience/World/Water.js`

Un composant pour les 3 plans d'eau. Charge `water.glb`, swap le matériau de chaque mesh nommé par un
`ShaderMaterial` configuré, expose `meshes` (pour le `DepthCapture`), anime `uTime`, et branche le GUI.

```js
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import WorldComponent from './WorldComponent.js'
import waterVertexShader from '../../shaders/water/vertex.glsl'
import waterFragmentShader from '../../shaders/water/fragment.glsl'

// WorldComponent fournit déjà this.experience / scene / time / debug (pas besoin de réimporter Experience)

/**
 * EAU — lac, rivière, cascade en meshes séparés (water.glb).
 * Chaque mesh reçoit un ShaderMaterial qui dessine un dégradé de profondeur + une écume de berge,
 * en lisant la depth texture produite par Renderer.depthCapture.
 */
export default class Water extends WorldComponent {
  constructor() {
    super() // initialise this.experience / scene / time / debug

    this.sizes = this.experience.sizes
    this.camera = this.experience.camera
    this.depthTexture = this.experience.renderer.depthCapture.depthTexture

    this.meshes = []     // remplis après chargement (lus par DepthCapture)
    this.materials = []  // pour animer uTime / régler via GUI

    // Réglages par plan d'eau (voir tableau en bas de plan)
    this.configs = {
      water_lake: {
        label: 'Lac',
        shallowColor: '#5aa6d6', deepColor: '#1d5a8a', foamColor: '#ffffff',
        deepDistance: 2.5, foamDistance: 0.5, foamScrollSpeed: 0.05,
        waveAmplitude: 0.06, waveFrequency: 1.5, waveSpeed: 0.8,
        flowDirection: new THREE.Vector2(0, 1), flowSpeed: 0.0,
      },
      water_river: {
        label: 'Rivière',
        shallowColor: '#5aa6d6', deepColor: '#1d5a8a', foamColor: '#ffffff',
        deepDistance: 1.0, foamDistance: 0.4, foamScrollSpeed: 0.05,
        waveAmplitude: 0.02, waveFrequency: 1.5, waveSpeed: 0.8,
        flowDirection: new THREE.Vector2(0, 1), flowSpeed: 0.4,
      },
      water_fall: {
        label: 'Cascade',
        shallowColor: '#5aa6d6', deepColor: '#1d5a8a', foamColor: '#ffffff',
        deepDistance: 0.6, foamDistance: 0.8, foamScrollSpeed: 0.05,
        waveAmplitude: 0.0, waveFrequency: 1.5, waveSpeed: 0.8,
        flowDirection: new THREE.Vector2(0, -1), flowSpeed: 1.2,
      },
    }

    this.load()
    this.sizes.on('resize', () => this.setResolution())
  }

  load() {
    const loader = new GLTFLoader()
    loader.load(
      '/models/water.glb',
      (gltf) => {
        for (const name of Object.keys(this.configs)) {
          const mesh = gltf.scene.getObjectByName(name)
          if (!mesh) {
            console.warn(`Water : mesh "${name}" introuvable dans water.glb`)
            continue
          }
          mesh.material = this.makeMaterial(this.configs[name])
          mesh.renderOrder = 1 // l'eau se rend après le solide
          this.meshes.push(mesh)
          this.materials.push(mesh.material)
        }
        this.scene.add(gltf.scene)
        this.setResolution()
        this.setDebug()
      },
      undefined,
      (err) => console.error('Échec du chargement de /models/water.glb', err),
    )
  }

  makeMaterial(o) {
    const uniforms = {
      uTime:            { value: 0 },
      tDepth:           { value: this.depthTexture },
      uCameraNear:      { value: this.camera.instance.near },
      uCameraFar:       { value: this.camera.instance.far },
      uResolution:      { value: new THREE.Vector2() }, // rempli par setResolution()
      uShallowColor:    { value: new THREE.Color(o.shallowColor) },
      uDeepColor:       { value: new THREE.Color(o.deepColor) },
      uFoamColor:       { value: new THREE.Color(o.foamColor) },
      uDeepDistance:    { value: o.deepDistance },
      uFoamDistance:    { value: o.foamDistance },
      uFoamScrollSpeed: { value: o.foamScrollSpeed },
      uWaveAmplitude:   { value: o.waveAmplitude },
      uWaveFrequency:   { value: o.waveFrequency },
      uWaveSpeed:       { value: o.waveSpeed },
      uFlowDirection:   { value: o.flowDirection },
      uFlowSpeed:       { value: o.flowSpeed },
    }

    return new THREE.ShaderMaterial({
      vertexShader: waterVertexShader,
      fragmentShader: waterFragmentShader,
      uniforms,
      transparent: true,
      depthWrite: false, // évite que l'eau s'auto-occulte salement
    })
  }

  setResolution() {
    const w = this.sizes.width * this.sizes.pixelRatio
    const h = this.sizes.height * this.sizes.pixelRatio
    for (const m of this.materials) m.uniforms.uResolution.value.set(w, h)
  }

  setDebug() {
    const root = this.debug.ui.addFolder('Eau').close()
    this.meshes.forEach((mesh, i) => {
      const o = this.configs[mesh.name]
      const u = this.materials[i].uniforms
      const f = root.addFolder(o.label).close()
      f.add(u.uDeepDistance, 'value', 0, 5, 0.05).name('Profondeur')
      f.add(u.uFoamDistance, 'value', 0, 2, 0.01).name('Écume (largeur)')
      f.add(u.uWaveAmplitude, 'value', 0, 0.3, 0.005).name('Vagues')
      f.add(u.uFlowSpeed, 'value', 0, 3, 0.05).name('Courant')
      f.addColor({ c: `#${u.uShallowColor.value.getHexString()}` }, 'c')
        .name('Couleur surface').onChange((v) => u.uShallowColor.value.set(v))
      f.addColor({ c: `#${u.uDeepColor.value.getHexString()}` }, 'c')
        .name('Couleur fond').onChange((v) => u.uDeepColor.value.set(v))
    })
  }

  update() {
    for (const m of this.materials) m.uniforms.uTime.value = this.time.elapsed
  }
}
```

> ⚠️ Pas besoin d'importer `Experience` dans `Water.js` : `super()` (de `WorldComponent`) renseigne
> déjà `this.experience` (+ `scene`, `time`, `debug`). On y lit ensuite `renderer`/`camera`/`sizes`.

### `src/Experience/World/World.js` — modifications

Instancier `Water` et l'appeler dans `update()` (pour animer `uTime`). Comme c'est la `World` qui
détient `water`, le `Renderer` le retrouve via `experience.world.water`.

```js
// … imports existants …
import Water from './Water.js'

export default class World {
  constructor() {
    this.terrain = new Terrain()
    this.environment = new Environment()
    this.wind = new Wind()

    this.grass = new Grass(this.terrain, this.wind, this.environment)
    this.rain = new Rain(this.terrain, this.wind, this.environment)
    this.bush = new Bush(this.terrain, this.wind, this.environment)
    this.tree = new Tree(this.terrain, this.wind, this.environment)
    this.cliff = new Cliff()
    this.water = new Water() // lac + rivière + cascade
  }

  update() {
    this.grass.update()
    this.rain.update()
    this.water.update()
  }
}
```

---

## Réglages par plan d'eau

| Paramètre | Lac | Rivière | Cascade |
|---|---|---|---|
| `flowSpeed` | `0.0` | `~0.4` | `~1.2` |
| `flowDirection` | — | sens aval `(0, 1)` | `(0, -1)` (bas) |
| `waveAmplitude` | `0.06` | `0.02` | `0.0` |
| `deepDistance` | `2.5` | `1.0` | `~0.6` |
| `foamDistance` | `0.5` | `0.4` | `0.8` |

La cascade reste sommaire avec ce shader (c'est une nappe qui défile). Le **vrai** rendu de cascade
(stries de foam + particules d'éclaboussure à l'impact) viendra en Phase 3. Pour l'instant, l'anneau
d'écume autour du point de chute est dessiné gratuitement par le shader du **lac** (le foam de
profondeur se déclenche là où la nappe verticale s'enfonce dans le plan du lac).

---

## Ordre de test (important)

1. **Vérifie d'abord la depth texture.** Avant de brancher le foam, sors
   `gl_FragColor = vec4(vec3(sceneDepth / uCameraFar), 1.0);` dans `fragment.glsl`. Tant que la
   profondeur est fausse (tout blanc, tout noir, ou inversé), rien d'autre ne marchera — c'est
   l'erreur n°1. Vérifie aussi que la passe `DepthCapture.capture()` tourne bien (mets un
   `console.log` une fois).
2. **Puis le dégradé** peu profond → profond (commente la partie foam).
3. **Puis le foam** sur les berges.
4. **Puis les vagues** et le défilement (`uTime` = `this.time.elapsed`, en secondes).
5. **Enfin** règle à l'œil via le dossier **« Eau »** du GUI (lil-gui), sous-dossiers Lac/Rivière/Cascade.

Si le foam apparaît partout ou nulle part : ton bassin est trop plat (`depthDiff` quasi constant) ou
ta hauteur d'eau est mal placée. Reviens régler le Y du plan **dans Blender** (puis ré-exporte), et,
si besoin, creuse un peu plus le fond du terrain.

---

## Points de vigilance spécifiques à notre archi

- **Coût de la double passe** : `DepthCapture.capture()` re-rend toute la scène une 2ᵉ fois par frame
  (terrain + falaise + herbe/arbres instanciés). Si le framerate chute, restreins la passe au solide
  via des **layers** (mets l'eau sur un layer exclu de la passe de profondeur, ou ne rends que les
  layers terrain/rochers). À optimiser seulement si nécessaire.
- **Transparence / tri** : 3 meshes transparents (`depthWrite: false`, `renderOrder: 1`). Si lac et
  cascade se chevauchent et clignotent, joue sur `renderOrder` (cascade après lac).
- **Précision de profondeur** : `DepthTexture` en `UnsignedShortType` suffit ici. Si tu vois du
  banding sur le foam, passe en `UnsignedInt248Type` (et `depthTexture.format = DepthStencilFormat`).
- **near/far** : la caméra du projet est `near = 0.1`, `far = 100`. `uCameraNear/Far` sont lus
  directement depuis `camera.instance`, donc cohérents automatiquement.
```
