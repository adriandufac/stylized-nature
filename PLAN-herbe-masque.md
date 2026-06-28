# Placement de l'herbe par masque image (3 niveaux)

## Contexte

Aujourd'hui l'herbe est générée **uniformément sur toute la surface** du terrain :
`Grass.build()` (`src/Experience/World/Grass.js:86-119`) crée un `MeshSurfaceSampler`
sur `terrain.mesh` et tire `params.count` points sur **toute** la géométrie, sans
aucun contrôle de zone.

Objectif : pouvoir **choisir où l'herbe pousse** via un **masque image en niveaux de
gris à 3 niveaux** :

- **Blanc** (luminance haute) → herbe **normale** (densité + hauteur pleines, comme aujourd'hui).
- **Noir** (luminance basse) → **pas d'herbe**.
- **Gris** (luminance intermédiaire) → herbe **plus courte et moins dense**.

Approche retenue : **échantillonnage par rejet**. Pour chaque brin on tire un point sur
le terrain, on convertit sa position monde `(x, z)` en coordonnée de pixel du masque, on
lit la luminance du pixel et on en déduit une **zone** (`none` / `short` / `full`). On
**rejette** le brin (zone noire, ou rejet probabiliste en zone grise) ou on le **garde en
réduisant sa hauteur** (zone grise). Résolution au pixel près (indépendante des `segments`
du terrain), sans toucher au shader (le filtrage se fait côté CPU, au moment du placement,
qui est déjà une boucle CPU). On évite ainsi `setWeightAttribute` du sampler, limité à la
résolution des sommets (64×64) et mal adapté à un masque tranché.

## Fichiers concernés

- **`src/Experience/World/Grass.js`** — seul fichier de logique à modifier.
- **`static/textures/grass-mask.png`** — nouveau fichier (le masque). Image en niveaux de
  gris : **blanc = herbe normale, gris = herbe courte/clairsemée, noir = vide**,
  idéalement carrée. À peindre toi-même (Photoshop/GIMP) avec 3 tons francs (ex. `#000`,
  `#808080`, `#fff`). Le terrain étant carré et centré, l'image couvre tout le terrain.

## Étapes d'implémentation (dans `Grass.js`)

### 1. Charger le masque et lire ses pixels (même pattern que `Bush.js:82-92`)

Dans le constructeur, ajouter des champs puis appeler `this.loadMask()` :

```js
this.maskParams = {
  enabled: true,
  url: '/textures/grass-mask.png',
  // Deux seuils découpent la luminance [0..1] en 3 zones :
  //   lum <  blackThreshold              -> none  (pas d'herbe)
  //   blackThreshold <= lum < whiteThreshold -> short (herbe courte/clairsemée)
  //   lum >= whiteThreshold              -> full  (herbe normale)
  blackThreshold: 0.25,
  whiteThreshold: 0.75,
  // Comportement de la zone grise :
  grayDensity: 0.4,      // proba de garder un brin tiré en zone grise (moins dense)
  grayHeightFactor: 0.5, // facteur appliqué à la hauteur (scale.y) en zone grise (plus court)
}
this.maskData = null   // Uint8ClampedArray des pixels, null tant que pas chargé
this.maskW = 0
this.maskH = 0
```

Méthode de chargement :

```js
loadMask() {
  new THREE.ImageLoader().load(
    this.maskParams.url,
    (img) => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0)
      this.maskData = ctx.getImageData(0, 0, img.width, img.height).data
      this.maskW = img.width
      this.maskH = img.height
      this.build() // le masque est prêt : on replace l'herbe
    },
    undefined,
    () => { /* masque absent/échec : on laisse l'herbe partout (maskData reste null) */ },
  )
}
```

> `build()` est déjà appelé dans le constructeur **avant** que le masque soit chargé
> (chargement async). Tant que `maskData` est `null`, la zone renvoyée est `full`
> → herbe partout (comportement actuel), puis `build()` est rappelé au chargement.

### 2. Classification : position monde → zone (`none` / `short` / `full`)

Le terrain est un `PlaneGeometry(size, size)` `rotateX(-π/2)`, centré sur l'origine, donc
`x, z ∈ [-size/2, +size/2]`. Mapping vers UV puis pixel, puis classement par seuils :

```js
sampleZone(pos) {
  if (!this.maskParams.enabled || !this.maskData) return 'full' // pas de masque => tout permis
  const size = this.terrain.params.size
  const u = (pos.x + size / 2) / size          // 0..1
  const v = (pos.z + size / 2) / size          // 0..1
  const px = Math.min(this.maskW - 1, Math.max(0, Math.floor(u * this.maskW)))
  const py = Math.min(this.maskH - 1, Math.max(0, Math.floor((1 - v) * this.maskH))) // image top-down
  const lum = this.maskData[(py * this.maskW + px) * 4] / 255 // canal R suffit (gris)

  if (lum < this.maskParams.blackThreshold) return 'none'
  if (lum < this.maskParams.whiteThreshold) return 'short'
  return 'full'
}
```

> L'orientation `(1 - v)` et l'axe U sont à **valider visuellement** ; si le masque
> apparaît inversé/tourné, ajuster le flip de `u`/`v` (un seul endroit à corriger).

### 3. Rejet + zone grise dans `build()` + gestion du `count` de l'InstancedMesh

Remplacer la boucle `for` actuelle (`Grass.js:98-115`) par une boucle de rejet. Comme un
`InstancedMesh` a un `count` figé, on alloue la capacité max puis on **réduit
`instancedMesh.count`** au nombre réellement placé (sinon les instances non remplies
gardent la matrice identité = un paquet de brins à l'origine).

Pour la zone grise : on applique d'abord un **rejet probabiliste** (`grayDensity`) pour la
densité réduite, puis pour les brins gardés on **multiplie `scale.y` par
`grayHeightFactor`** pour les rendre plus courts (seul l'axe Y change → brins plus bas
sans toucher à leur largeur) :

```js
this.instancedMesh = new THREE.InstancedMesh(this.bladeGeometry, this.material, this.params.count)

let placed = 0
let attempts = 0
const maxAttempts = this.params.count * 30 // garde-fou anti boucle infinie (zone autorisée très petite)

while (placed < this.params.count && attempts < maxAttempts) {
  attempts++
  sampler.sample(this.samplePos)

  const zone = this.sampleZone(this.samplePos)
  if (zone === 'none') continue                                  // noir => rejet
  if (zone === 'short' && Math.random() > this.maskParams.grayDensity) continue // gris => moins dense

  this.dummy.position.copy(this.samplePos)
  this.dummy.rotation.y = Math.random() * Math.PI * 2

  // Échelle de base (variété), puis raccourcissement en zone grise
  const s = 0.8 + Math.random() * 0.6
  let sy = s + Math.random() * 0.4
  if (zone === 'short') sy *= this.maskParams.grayHeightFactor
  this.dummy.scale.set(s, sy, s)

  this.dummy.updateMatrix()
  this.instancedMesh.setMatrixAt(placed, this.dummy.matrix)
  placed++
}

this.instancedMesh.count = placed // ne rend que les brins effectivement placés
this.instancedMesh.instanceMatrix.needsUpdate = true
this.scene.add(this.instancedMesh)
```

> `params.count` devient la cible **dans les zones autorisées** ; comme la zone grise
> rejette une partie des brins (`grayDensity`), atteindre `count` y demande plus de tirages
> — le garde-fou `maxAttempts` évite de boucler indéfiniment (on place simplement moins de
> brins). Si la couverture est faible, augmente `maxAttempts` ou réduis `count`.

### 4. Contrôles GUI (dans `setDebug()`, dossier « Herbe » existant)

```js
const maskFolder = folder.addFolder('Masque').close()
maskFolder.add(this.maskParams, 'enabled').name('Activer masque').onChange(() => this.build())
maskFolder.add(this.maskParams, 'blackThreshold', 0, 1, 0.01).name('Seuil noir').onChange(() => this.build())
maskFolder.add(this.maskParams, 'whiteThreshold', 0, 1, 0.01).name('Seuil blanc').onChange(() => this.build())
maskFolder.add(this.maskParams, 'grayDensity', 0, 1, 0.01).name('Densité zone grise').onChange(() => this.build())
maskFolder.add(this.maskParams, 'grayHeightFactor', 0.1, 1, 0.01).name('Hauteur zone grise').onChange(() => this.build())
// Optionnel : bouton pour réitérer sur l'image sans recharger la page
maskFolder.add({ reload: () => this.loadMask() }, 'reload').name('Recharger le masque')
```

> Garder `blackThreshold < whiteThreshold` (sinon la zone grise disparaît). On peut
> retomber sur l'ancien comportement **binaire** en mettant les deux seuils à la même
> valeur (plus aucune zone grise → blanc/noir seulement).

### 5. Abonnements existants — aucun changement

`setSubscriptions()` (`Grass.js:131-140`) appelle déjà `build()` sur `terrain 'rebuilt'`
et `'resampled'` : l'herbe se replace correctement avec le masque puisque tout le filtrage
est dans `build()`.

### Récap des ajouts au constructeur

Après les champs `maskParams/maskData/...`, garder l'ordre actuel et ajouter `loadMask()` :

```js
this.bladeGeometry = this.buildBladeGeometry()
this.setMaterial()
this.build()
this.loadMask()      // <-- nouveau (recharge build() une fois le masque prêt)
this.setSubscriptions()
this.setDebug()
```

## Vérification

1. `npm run dev` puis ouvrir la scène.
2. Sans masque (fichier absent ou « Activer masque » décoché) : l'herbe couvre tout le
   terrain comme avant (non-régression).
3. Ajouter `static/textures/grass-mask.png` avec **3 tons** (noir / gris `#808080` / blanc),
   par ex. trois bandes verticales. Recharger →
   - bande **blanche** : herbe normale,
   - bande **grise** : herbe visiblement plus **courte** et plus **clairsemée**,
   - bande **noire** : pas d'herbe.
4. Vérifier l'orientation : peindre une moitié blanche / moitié noire et confirmer le bon
   côté ; sinon ajuster le flip `u`/`v` dans `sampleZone()`.
5. Régler **Seuil noir** / **Seuil blanc** dans le GUI et confirmer que les frontières
   entre les 3 zones se déplacent.
6. Régler **Densité zone grise** (clairsemé ↔ dense) et **Hauteur zone grise**
   (court ↔ haut) et confirmer l'effet sur la bande grise uniquement.
7. Décocher « Activer masque » → l'herbe revient sur tout le terrain.
8. Modifier la taille du terrain (GUI Terrain → Maillage → Taille) → l'herbe reste alignée
   sur le masque (le mapping utilise `terrain.params.size`).
