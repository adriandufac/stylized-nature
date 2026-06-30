# Plan — Système Jour / Nuit (ciel stylisé, soleil, lune, étoiles)

Guide d'implémentation. Tu codes toi-même, ceci est la feuille de route avec les extraits clés.

## Contexte / état actuel

Le système de soleil **existe déjà** dans `src/Experience/World/Environment.js` :

- `sunParams.hour` (0-24), `updateSun()` calcule `sunDirection` (Vector3) **partagé par référence** dans tous les shaders.
- Chaque fragment shader applique déjà `float dayFactor = smoothstep(-0.1, 0.5, uSunDirection.y);` → le décor s'assombrit tout seul quand le soleil passe sous l'horizon. **Rien à toucher côté herbe/arbres/eau.**
- Le « soleil » actuel = `debugSun`, une petite icosphère (à remplacer).

**Manque (tout neuf) :** aucun ciel / `scene.background` / fog (fond noir), pas d'animation du temps (`updateSun()` n'est appelé que sur slider, `Environment` n'a pas d'`update()` et est absent de `World.update()`), pas de soleil visible / lune / étoiles.

**Choix retenus :** cycle **auto + manuel**, **dôme dégradé stylisé** (pas de fog/nuages), soleil & lune en **disques toon lumineux**.

---

## Étape 1 — Animer le temps : `Environment.js`

**Constructeur**, ajouter :
```js
this.dayDuration = 120   // secondes pour un cycle 24h complet
this.autoPlay = true
```

**Nouvelle méthode** `update()` (appelée chaque frame depuis World) :
```js
update() {
  if (this.autoPlay) {
    this.sunParams.hour = (this.sunParams.hour + (this.time.delta / this.dayDuration) * 24) % 24
    this.updateSun()
    if (this.hourController) this.hourController.updateDisplay() // le slider suit
  }
}
```

**`updateSun()`** : retirer les 2 lignes liées à `debugSun` (et sa création dans `setLights()`), le vrai soleil sera dans `Sky.js`. Garde le reste (calcul `sunDirection`, `directionalLight.position`).

**`setDebug()`** : stocker la référence du slider heure + ajouter les contrôles cycle :
```js
this.hourController = folder.add(this.sunParams, 'hour', 0, 24, 0.1).name('Heure')
  .onChange(() => { this.autoPlay = false; this.updateSun() }) // saisie manuelle coupe l'auto
folder.add(this, 'autoPlay').name('Cycle auto')
folder.add(this, 'dayDuration', 10, 600, 1).name('Durée du jour (s)')
```

---

## Étape 2 — Brancher dans la boucle : `World.js`

```js
import Sky from "./Sky.js";
// ...dans le constructeur, après this.environment :
this.sky = new Sky(this.environment);

// dans update(), EN PREMIER (les consommateurs lisent sunDirection ensuite) :
this.environment.update();
// ...
this.sky.update();
```

---

## Étape 3 — Nouveau composant `src/Experience/World/Sky.js`

Étend `WorldComponent` (fournit `scene`, `time`, `debug`, `experience`). Reçoit `environment` injecté (comme Grass/Bush). Contient 4 éléments + une palette. `update()` lit `environment.sunDirection` / `sunParams.hour`, met à jour uniforms & positions.

### Palette selon l'heure
Keyframes `{ hour, zenith, horizon }` en `THREE.Color`, interpolés (wrap 24h) :

| Heure | Zénith | Horizon | Ambiance |
|---|---|---|---|
| 0  | `#05060f` | `#0a1030` | nuit profonde |
| 5  | `#1a2350` | `#7a5a8a` | aube |
| 7  | `#4a7fc0` | `#ffae6b` | lever (horizon chaud) |
| 12 | `#2f7bd6` | `#bfe3ff` | midi |
| 17 | `#3a6ab0` | `#ff9a5a` | fin d'aprem |
| 19 | `#2a3a7a` | `#ff5e3a` | coucher |
| 21 | `#0a1030` | `#1a1a40` | nuit |

```js
getSkyColors(hour) {
  const k = this.keyframes
  let a = k[k.length - 1], b = k[0]
  for (let i = 0; i < k.length; i++) {
    if (hour < k[i].hour) { b = k[i]; a = k[i-1] ?? k[k.length-1]; break }
  }
  // gérer le wrap 0/24 pour t ; sinon lerp simple :
  const span = (b.hour - a.hour + 24) % 24 || 24
  const t = ((hour - a.hour + 24) % 24) / span
  this._zenith.lerpColors(a.zenith, b.zenith, t)
  this._horizon.lerpColors(a.horizon, b.horizon, t)
  return { zenith: this._zenith, horizon: this._horizon }
}
```
(`this._zenith` / `this._horizon` = `new THREE.Color()` réutilisés, alimentent les uniforms du dôme.)

### (a) Dôme dégradé
`SphereGeometry(R, 32, 16)` + `ShaderMaterial({ side: THREE.BackSide, depthWrite: false })`. **Suit la caméra** dans `update()` : `this.dome.position.copy(this.experience.camera.instance.position)`. Choisir `R` < `camera.far` (vérifie `Camera.js`, augmente `far` si besoin).

`src/shaders/sky/vertex.glsl`
```glsl
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
```
`src/shaders/sky/fragment.glsl`
```glsl
uniform vec3 uHorizon;
uniform vec3 uZenith;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
varying vec3 vDir;
void main() {
  float h = smoothstep(0.0, 0.4, vDir.y);
  vec3 col = mix(uHorizon, uZenith, h);
  // halo chaud autour du soleil, s'estompe quand il descend
  float d = max(dot(normalize(vDir), normalize(uSunDir)), 0.0);
  float glow = pow(d, 32.0) * smoothstep(-0.1, 0.2, uSunDir.y);
  col += uSunColor * glow;
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
```

### (b) Soleil disque toon
`PlaneGeometry(taille, taille)` (ou `Sprite`), `ShaderMaterial` transparent, `depthWrite:false`. Billboard face caméra (`this.sun.quaternion.copy(camera.quaternion)` chaque frame). Position : `this.sun.position.copy(camera.position).addScaledVector(sunDirection, R * 0.9)`. Couleur chaude pilotée par l'heure (plus rouge près de l'horizon : `mix(jaune, orange, 1 - sunDir.y)`).

Fragment (disque doux + halo radial) :
```glsl
uniform vec3 uColor;
varying vec2 vUv;
void main() {
  float dist = length(vUv - 0.5) * 2.0;
  float disk = smoothstep(0.5, 0.42, dist);   // cœur net
  float halo = smoothstep(1.0, 0.5, dist) * 0.5; // glow
  float a = clamp(disk + halo, 0.0, 1.0);
  gl_FragColor = vec4(uColor, a);
}
```

### (c) Lune disque toon (croissant)
Même base, position **opposée** : `addScaledVector(sunDirection, -R * 0.9)` → visible quand le soleil est sous l'horizon. Croissant = soustraire un 2ᵉ disque décalé dans le shader :
```glsl
float moon = smoothstep(0.5, 0.45, length(vUv-0.5)*2.0);
float shadow = smoothstep(0.5, 0.45, length(vUv-vec2(0.62,0.5))*2.0); // disque décalé
float a = clamp(moon - shadow, 0.0, 1.0);
```
Opacité globale × `nightFactor` (voir plus bas). Couleur bleuté clair `#cfe0ff`.

### (d) Étoiles
`THREE.Points` : ~600 positions aléatoires sur la **calotte supérieure** (y > 0) d'une sphère rayon `R*0.95`. `ShaderMaterial` additif (`blending: THREE.AdditiveBlending`, `depthWrite:false`), `sizeAttenuation`. Suivent la caméra. Opacité = `nightFactor`, scintillement avec `uTime` (= `time.elapsed`).

```js
// nightFactor : 1 quand le soleil est bien sous l'horizon, 0 le jour
const nightFactor = THREE.MathUtils.smoothstep(environment.sunDirection.y, 0.1, -0.2)
```
Appliquer `nightFactor` à `stars.material.uniforms.uOpacity` et `moon.material.uniforms.uOpacity`.

---

## Conventions à respecter (déjà en place dans le projet)

- **GLSL** importé via `vite-plugin-glsl` : `import skyFrag from "../../shaders/sky/fragment.glsl"`.
- `WorldComponent` → `this.scene`, `this.time` (`.delta`, `.elapsed`), `this.debug`, `this.experience.camera.instance`.
- lil-gui : `this.debug.ui.addFolder('Ciel')` (replié auto). Réutiliser ou compléter le folder « Soleil ».
- Injection de `environment` identique à `Grass/Bush/Tree` dans `World.js`.
- Pour distinguer aube/crépuscule : la **palette** utilise `hour` (6h≠18h) ; l'apparition lune/étoiles/halo utilise `sunDirection.y` (symétrique), cohérent avec le `dayFactor` des autres shaders.

## Hors-scope (déjà OK)
Assombrissement nocturne du décor : géré par le `dayFactor` existant via `sunDirection` partagé. Amélioration optionnelle plus tard : rendre `ambientIntensity` réactif (actuellement c'est un snapshot non réactif copié à la création des matériaux) pour un crépuscule plus marqué.

---

## Checklist de vérification (`npm run dev`)

- [ ] Le ciel défile seul (jour→coucher→nuit→aube) en ~2 min ; le slider « Heure » suit.
- [ ] Couleurs cohérentes : bleu clair midi, horizon orangé ~6h/18h, bleu nuit la nuit (plus de fond noir).
- [ ] Soleil disque toon visible, se lève à l'Est / se couche à l'Ouest ; halo chaud sur le dôme.
- [ ] La nuit : lune croissant à l'opposé + étoiles qui apparaissent puis s'effacent à l'aube.
- [ ] Slider « Heure » coupe l'auto et met à jour ciel + astres instantanément ; toggle « Cycle auto » relance.
- [ ] Pas de clipping du dôme en orbitant (R < `camera.far`) ; perfs stables.

## Fichiers
- **Modifier** : `Environment.js`, `World.js`.
- **Créer** : `World/Sky.js`, `shaders/sky/{vertex,fragment}.glsl`, `shaders/sun/{vertex,fragment}.glsl`, `shaders/moon/fragment.glsl`, `shaders/stars/{vertex,fragment}.glsl`.
