# Gestion de la pluie (analyse du gist + adaptation « toute la zone »)

Analyse de l'implémentation de pluie du gist
[`fromtheghost/cac323b8e935da9ffff24bbf23f994a7`](https://gist.github.com/fromtheghost/cac323b8e935da9ffff24bbf23f994a7),
et comment l'adapter pour couvrir **toute la scène** au lieu d'une petite zone.

---

## 1. Vue d'ensemble

La pluie n'est **pas** un système de particules classique. C'est :

- **Une seule géométrie** (`THREE.BufferGeometry`) contenant **30 000 gouttes**,
- chaque goutte = **un segment de ligne** (`THREE.LineSegments`), donc 2 sommets,
- rendue en **un seul draw call**,
- **animée entièrement dans le vertex shader** (le CPU ne bouge jamais une goutte).

C'est ce qui la rend très performante : pas de boucle JS par frame, pas de mise à jour de positions côté CPU. Tout se passe sur le GPU à partir d'un compteur de temps `uTime`.

---

## 2. Génération des gouttes (`generateRainData`)

Chaque goutte reçoit une position de départ **aléatoire dans une boîte** (`Box3`) :

```js
this.params.box = new THREE.Box3(
  new THREE.Vector3(-20, -20, -20),
  new THREE.Vector3( 20,  20,  20)
);

const startX = THREE.MathUtils.randFloat(box.min.x, box.max.x);
const startY = THREE.MathUtils.randFloat(box.min.y, box.max.y);
const startZ = THREE.MathUtils.randFloat(box.min.z, box.max.z);
```

Puis le **second sommet** (la fin du trait de pluie) est calculé en partant du
premier, incliné d'un angle de 44–45° (pluie poussée par le vent) :

```js
const angle = THREE.MathUtils.randFloat(44, 45) * (Math.PI / 180);
const endX = startX;
const endY = startY + this.params.length;                  // monte un peu en Y
const endZ = startZ + this.params.length * Math.sin(angle); // décalé en Z (inclinaison)
```

Chaque goutte porte plusieurs **attributs** (un par sommet) :

| Attribut    | Rôle |
|-------------|------|
| `position`  | début + fin du segment |
| `angle`     | inclinaison de la chute (vent) |
| `aLifespan` | durée de vie aléatoire `randFloat(25, 35)` → désynchronise les gouttes |
| `aSpeed`    | vitesse aléatoire `randFloat(5, 10)` → toutes ne tombent pas pareil |
| `color`     | `(1,1,1)` au sommet de tête, `(0,0,0)` au sommet de queue |

Le `color` n'est pas une couleur : c'est un **dégradé d'opacité** le long du trait (voir §5), qui donne l'aspect « traînée qui s'estompe ».

---

## 3. Animation de la chute (vertex shader)

Le matériau est un `LineBasicMaterial` standard, modifié via `onBeforeCompile`
(on injecte du code dans le shader Three.js plutôt que d'en écrire un from scratch) :

```glsl
float lifeLeft = ceil(uTime / aLifespan);
float displacement  = abs(lifeLeft) * mod(uTime, aSpeed * 0.1);
float displacementZ = displacement * sin(angle);
float displacementY = displacement * cos(angle);

transformed.z -= displacementZ; // la goutte avance en Z (vent)
transformed.y -= displacementY; // la goutte descend en Y (gravité)
```

L'idée clé : **`mod(uTime, aSpeed * 0.1)`** est une fonction « dent de scie ».
Quand `uTime` augmente, ce terme monte de 0 jusqu'à `aSpeed * 0.1`, puis
**retombe brutalement à 0** et recommence. Donc `displacement` :

1. croît → la goutte descend (et avance),
2. se remet à 0 → la goutte **réapparaît instantanément à sa position de départ**.

C'est tout le mécanisme de **recyclage** : aucune goutte n'est jamais détruite
ni recréée, elle « boucle » sur place via le `mod`. Comme chaque goutte a sa
propre `aSpeed` et sa propre `aLifespan`, elles ne se réinitialisent pas toutes
en même temps → l'œil ne perçoit pas la boucle.

> Note : le facteur `lifeLeft = ceil(uTime / aLifespan)` est un multiplicateur
> qui augmente lentement avec le temps ; il sert à faire varier l'amplitude de
> chute. C'est un peu artisanal (l'amplitude dérive très lentement sur de longues
> durées), mais le mouvement dominant reste la dent de scie du `mod`.

Et le compteur de temps, lui, est la **seule** chose mise à jour côté CPU :

```js
lineSegments.tick = () => {
  this.uniforms.uTime.value += this.game.time.delta;
};
```

---

## 4. La « zone » et POURQUOI elle existe (performance)

Le point central pour ta question. Toutes les gouttes sont **confinées dans la
`Box3`** de 40×40×40 unités. Cette zone borne deux choses :

- **Le volume simulé** : les 30 000 gouttes sont réparties dans `40³` unités. Si
  tu agrandis la boîte sans changer `count`, la **densité chute** (pluie clairsemée).
  Si tu veux garder la même densité sur un plus grand volume, il faut **plus de
  gouttes** → plus de coût.
- **Ce qui est à l'écran** : on ne rend de la pluie que là où on en a besoin.

Dans ce gist, la boîte est **fixe à l'origine du monde**. La pluie tombe donc
seulement dans ce cube de ±20 autour de `(0,0,0)`, pas ailleurs. C'est le
compromis perf : on ne simule qu'un petit volume.

> Astuce classique (que ce gist **ne fait pas**, mais qui est le vrai usage de la
> technique) : dans un grand monde, on **fait suivre la boîte à la caméra/au
> joueur** chaque frame. Comme on ne voit jamais loin à travers la pluie et
> qu'elle se ressemble partout, un petit cube recentré en permanence sur la
> caméra donne l'**illusion d'une pluie infinie** tout en ne simulant qu'un petit
> volume. C'est l'option idéale pour un monde ouvert.

---

## 5. Rendu (fragment shader)

```glsl
gl_FragColor.a   = min(gl_FragColor.r, uOpacity); // alpha = canal rouge du vertex color
gl_FragColor.rgb = vec3(0.0);                     // couleur forcée (ici noir)
```

Le `color` posé en §2 (`1` à la tête, `0` à la queue) devient ici l'**alpha** :
la tête de la goutte est opaque, la queue transparente → la traînée s'estompe.
La couleur RGB est écrasée (ici à noir ; c'est là qu'on choisirait une teinte de
pluie). Le matériau est `transparent: true` et `fog: false`.

---

## 6. Adapter à TOUTE la zone (ton besoin)

Tu ne veux pas un petit cube : tu veux de la pluie sur **tout le terrain**. Dans
ton projet le terrain fait `terrainParams.size` (32 par défaut), centré sur
l'origine, soit `±16` en X/Z. Deux stratégies :

### Option A — Agrandir la boîte à la taille du terrain (recommandé ici)

C'est le plus simple, et **adapté à ton cas** : ta scène est contenue (32×32) et
on la voit en entier d'un coup (caméra en orbite autour de l'origine). Pas besoin
de ruse de caméra : on dimensionne juste la boîte sur le terrain.

```js
const halfSize = terrainParams.size / 2; // 16 pour size = 32
const rainHeight = 20;                    // hauteur de la colonne de pluie

box = new THREE.Box3(
  new THREE.Vector3(-halfSize, 0,          -halfSize),
  new THREE.Vector3( halfSize, rainHeight,  halfSize)
);
```

**Mais** : si tu gardes `count = 30000` sur un volume plus grand, la pluie
devient clairsemée. Pour garder la même **densité**, fais croître `count`
proportionnellement au volume :

```js
// densité ≈ gouttes par unité de volume, constante
const volume  = (terrainParams.size ** 2) * rainHeight;
const density = 0.06; // à régler à l'œil
const count   = Math.round(volume * density);
```

Et il faudra **reconstruire la pluie** quand `terrainParams.size` change dans le
GUI (comme tu reconstruis déjà le terrain et l'herbe), puisque la `Box3` et le
`count` en dépendent.

### Option B — Boîte petite mais qui suit la caméra (pour plus tard)

Si un jour ta scène devient grande / explorable, repasse à une **petite** boîte
mais **recentrée sur la caméra** chaque frame, dans le `tick` :

```js
lineSegments.tick = () => {
  uTime.value += delta;
  // on recentre la zone de pluie sur la caméra (XZ ; on garde Y fixe)
  lineSegments.position.x = camera.position.x;
  lineSegments.position.z = camera.position.z;
};
```

Tu simules toujours peu de gouttes, mais elles sont toujours **autour de toi** →
illusion de pluie partout, coût constant. C'est le vrai intérêt de la technique
« zone ». Inutile tant que toute ta scène tient à l'écran.

### Recommandation

Pour ta scène actuelle (terrain fixe de 32, vue d'ensemble) → **Option A** :
boîte aux dimensions du terrain + `count` proportionnel au volume, reconstruite
avec le terrain. Garde l'Option B en tête pour quand/si le monde s'agrandira.

---

## 7. Points de vigilance en portant le code chez toi

- Ce gist dépend d'un framework maison (`Game`, `this.game.world…`,
  `updatables`, `time.delta`, `debug.ui`). Chez toi, remplace :
  - `this.game.time.delta` → ton `clock` / `delta` dans `tick()`,
  - l'ajout à `updatables` → ajout direct à la `scene` + mise à jour de `uTime`
    dans ta boucle `tick`,
  - le dossier `debug.ui` → ton instance `lil-gui`.
- La pluie est en `transparent: true` : surveille l'ordre de rendu vis-à-vis de
  ton herbe (aussi semi-transparente potentiellement) pour éviter les artefacts
  de tri.
- La couleur est forcée à noir dans le fragment : mets une teinte de pluie
  (gris clair / bleuté) si tu veux la voir sur fond sombre.
- Le `mod()` de recyclage suppose un `uTime` qui croît indéfiniment : c'est ok,
  mais garde en tête la lente dérive d'amplitude due à `lifeLeft` (§3).
```
