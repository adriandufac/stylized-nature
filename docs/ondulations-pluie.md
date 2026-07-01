# Ondulations de pluie sur l'eau — comment ça marche

Ce document explique **en détail** l'effet des ronds de pluie qui apparaissent sur le lac
et la rivière quand il pleut. Tout se passe dans le fragment shader
`src/shaders/water/fragment2.glsl` (partagé par le lac et la rivière), piloté depuis
`src/Experience/World/Water2.js`.

---

## 1. L'idée générale (sans code)

Quand une goutte tombe sur l'eau, elle crée un **rond** qui part du point d'impact,
**s'élargit**, puis **s'estompe**. On veut plein de ces ronds, répartis au hasard sur la
surface, apparaissant à des moments différents.

Le problème : un shader ne « garde pas de mémoire ». À chaque image, il repart de zéro et
calcule **la couleur d'un pixel** sans savoir ce qu'il y avait avant. On ne peut donc pas
« créer un rond puis le laisser vivre » comme on ferait avec un objet classique.

La solution : on rend l'effet **procédural et déterministe**. Pour un point donné de l'eau
et un instant donné, on **recalcule from scratch** « est-ce qu'il y a un front de rond qui
passe ici, maintenant ? ». Comme le calcul est toujours le même pour les mêmes entrées,
l'animation paraît continue alors qu'on recommence tout à chaque image.

Trois piliers rendent ça possible :

1. **Une grille** découpe l'eau en cellules ; chaque cellule héberge **un** rond.
2. **Un hash** (générateur pseudo-aléatoire stable) donne à chaque cellule une position
   d'impact et un décalage temporel fixes → les ronds sont dispersés et désynchronisés.
3. **Le temps (`uTime`)** fait grandir chaque rond : son rayon = une horloge qui tourne.

Le résultat de tout ça est un **relief virtuel** (des petites bosses circulaires) qu'on
n'affiche pas directement : on l'utilise pour **incliner la surface de l'eau** là où passent
les ronds, si bien que la lumière (reflets du soleil) accroche dessus. C'est ce qui donne
l'impression d'ondulations.

---

## 2. Les réglages (uniforms)

```glsl
uniform float uRainStrength;  // 0 = sec (aucun rond), 1 = pluie maxi
uniform float uRippleScale;   // densité de la grille : grand = cellules petites = plus de ronds
uniform float uRippleSpeed;   // vitesse d'expansion + cadence de naissance des ronds
```

- `uRainStrength` est **piloté par la météo** depuis `Water2.js` (`update()`), avec un fondu
  doux : 0 en `sunny`, ~0.5 en `rainy`, 1.0 en `tempest`. C'est le grand interrupteur de
  l'effet.
- `uRippleScale` et `uRippleSpeed` sont réglables dans le panneau debug
  (« Eau (tuto) › Lac/Rivière › Ondulations pluie »).

---

## 3. Le hash : un « dé » stable par cellule

```glsl
vec2 rippleHash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453);
}
```

Elle prend le **numéro d'une cellule** (ex. `(3, 4)`) et renvoie deux nombres « au hasard »
entre 0 et 1. Mais **au hasard de façon reproductible** : `rippleHash2((3,4))` renvoie
_toujours_ la même chose.

C'est indispensable car le shader tourne 60 fois/seconde : si la position d'un rond était
tirée au sort à chaque image, il **clignoterait**. Ici, la cellule `(3,4)` garde son impact
au même endroit → le rond grandit tranquillement au lieu de sauter partout.

> En clair : c'est le **dé** du shader. `random()` n'existe pas sur GPU, alors on le fabrique
> à partir de la position. Les constantes bizarres (`127.1`, `43758.5453`…) n'ont aucune
> signification : ce sont juste des valeurs qui « brassent » bien les nombres.

---

## 4. Le cœur : `rainRipples(world)`

Cette fonction reçoit un point sur l'eau (`world` = ses coordonnées `x,z` dans le monde) et
renvoie **un nombre** : la « hauteur » du relief d'ondulation à cet endroit (positif = crête
d'un rond, ~0 = eau plate).

### 4.1 Découper en grille

```glsl
vec2 uv   = world * uRippleScale;  // agrandit/rétrécit la grille
vec2 cell = floor(uv);             // numéro entier de la cellule (ex. (3,4))
vec2 f    = fract(uv);             // position DANS la cellule (0..1 sur x et z)
```

`floor` = la case, `fract` = où on est à l'intérieur de la case. Multiplier par
`uRippleScale` avant de découper permet de choisir la taille des cases (donc la densité de
ronds).

> On utilise les **coordonnées monde** (`vWorldPos.xz`), pas les UV du mesh. Ainsi la taille
> réelle d'un rond est identique sur le lac et la rivière, même si leurs UV diffèrent.

### 4.2 Parcourir la cellule + ses 8 voisines

```glsl
for (int y = -1; y <= 1; y++)
  for (int x = -1; x <= 1; x++) { ... }
```

Un rond peut **déborder** de sa cellule d'origine. Si on ne regardait que la cellule
courante, les ronds seraient coupés au bord des cases. On examine donc les **9 cellules**
autour du pixel (la sienne + 8 voisines) et on additionne leurs contributions.

### 4.3 Pour chaque cellule : où et quand ?

```glsl
vec2 rnd    = rippleHash2(cell + g);   // le "dé" de cette cellule
vec2 center = g + rnd;                 // position de l'impact (dans le repère du pixel)
```

`center` = le point d'impact de la goutte pour cette cellule, placé au hasard grâce au hash.

```glsl
float phase = fract(uTime * uRippleSpeed * (0.6 + 0.4 * rnd.x) + rnd.y);
```

`phase` est une **horloge qui tourne de 0 à 1 en boucle** (`fract` remet à 0 après 1). C'est
la « vie » du rond :

- `phase = 0` → le rond vient de naître (rayon nul, au point d'impact),
- `phase = 1` → il est au bout de sa vie (rayon max, éteint), puis ça recommence.

Le `+ rnd.y` **décale le départ** de chaque cellule (elles ne pulsent pas toutes ensemble),
et le `(0.6 + 0.4 * rnd.x)` fait varier légèrement la **vitesse** cellule par cellule.

### 4.4 Dessiner l'anneau

```glsl
float dist   = length(f - center);          // distance du pixel au point d'impact
float radius = phase;                        // le rayon du rond = l'horloge (0 -> 1)
float ring   = sin((dist - radius) * 30.0);  // oscillation autour du front
float band   = smoothstep(0.2, 0.0, abs(dist - radius)); // ne garde qu'un fin liseré au front
float life   = 1.0 - phase;                  // l'onde faiblit en vieillissant
```

- `dist` : à quelle distance est-on du centre de la goutte ?
- `radius` : où se trouve le front de l'onde en ce moment (il s'élargit avec `phase`).
- `ring` : un `sin` crée les **vaguelettes concentriques** autour du front (× 30 = plusieurs
  petites crêtes rapprochées).
- `band` : on ne veut pas de vaguelettes partout, seulement **près du front** (là où
  `dist ≈ radius`). `smoothstep(0.2, 0.0, abs(dist - radius))` vaut 1 pile sur le front et
  retombe vite à 0 dès qu'on s'en éloigne → un anneau fin.
- `life` : `1 - phase` fait **diminuer** l'amplitude à mesure que le rond vieillit → il
  s'estompe au lieu de disparaître d'un coup.

### 4.5 Combien de ronds ? (la « présence »)

```glsl
float cellRand = fract(sin(dot(cell + g, vec2(93.1, 47.7))) * 24634.6);
float present  = step(cellRand, uRainStrength * uRainStrength);
```

Toutes les cellules ne doivent pas forcément avoir un rond : par pluie légère, il en faut
peu. `cellRand` est un autre tirage aléatoire (un seul nombre) par cellule.
`step(cellRand, seuil)` vaut **1 si `cellRand < seuil`, sinon 0** : la cellule n'a un rond
que si son tirage passe sous le seuil.

Le seuil est `uRainStrength²` (au carré). Effet :

- `rainy` : 0.5² = **0.25** → ~un quart des cellules ont un rond,
- `tempest` : 1.0² = **1.0** → toutes les cellules,
- `sunny` : 0 → aucune.

> Le **carré** sert à réduire fortement le nombre en pluie légère sans toucher la tempête.
> C'est le réglage demandé : « deux fois moins de ronds en rainy ».

### 4.6 Tout assembler

```glsl
sum += ring * band * life * step(dist, 1.0) * present;
```

On additionne, pour les 9 cellules, la contribution de chaque rond :

- `ring * band * life` = la forme de l'anneau (vaguelettes × liseré fin × atténuation),
- `step(dist, 1.0)` = ignore ce qui est au-delà d'une cellule de distance (sécurité),
- `present` = 0 si la cellule n'a pas de rond (l'annule complètement).

`sum` est le **relief final** au point demandé.

---

## 5. Application : transformer le relief en lumière

Dans `main()`, juste après le calcul de la normale de l'eau :

```glsl
if (uRainStrength > 0.001) {          // temps sec -> on saute tout (aucun coût)
  float rEps = 0.02;
  vec2  rp   = vWorldPos.xz;
  float r0   = rainRipples(rp);
  float rX   = rainRipples(rp + vec2(rEps, 0.0));
  float rZ   = rainRipples(rp + vec2(0.0, rEps));
  normal.x -= (rX - r0) * uRainStrength * 1.5;
  normal.z -= (rZ - r0) * uRainStrength * 1.5;
  normal = normalize(normal);
  color += uFoamColor * max(r0, 0.0) * uRainStrength * 0.12;
}
```

### Pourquoi 3 appels à `rainRipples` ?

`rainRipples` donne une **hauteur**, mais pour éclairer une surface la lumière a besoin de la
**pente** (la direction dans laquelle la surface est inclinée = la **normale**). Pour
connaître la pente, on mesure la hauteur en 3 points très proches :

- `r0` : ici,
- `rX` : un tout petit pas vers l'est (`+rEps` en x),
- `rZ` : un tout petit pas vers le nord (`+rEps` en z).

La **différence** `rX - r0` dit « de combien ça monte quand j'avance en x » = la pente en x.
Idem pour z. On incline la normale de l'eau selon ces pentes (`normal.x -=`, `normal.z -=`).
C'est un **gradient calculé par différences finies** — la méthode standard pour transformer
un relief en normales.

> Cette normale inclinée est ensuite utilisée **plus bas dans le shader** par les calculs de
> lumière déjà existants (diffus, spéculaire Blinn-Phong, Fresnel). Les ronds n'ont pas leur
> propre éclairage : ils **empruntent** celui de l'eau. C'est pour ça qu'ils accrochent les
> reflets du soleil de façon cohérente avec le reste de la surface.

### Les deux derniers ingrédients

- `color += uFoamColor * r0 * ... * 0.12` : ajoute un **fin liseré clair** sur les crêtes,
  comme une petite écume au sommet de l'onde (subtil).
- Tout est multiplié par `uRainStrength` : à 0, les ronds n'ont **aucun** effet (et le
  `if (uRainStrength > 0.001)` évite même de faire les calculs → gratuit par temps sec).

---

## 6. Récapitulatif en une phrase par étape

1. On découpe l'eau en **cases** ; chaque case peut abriter un rond.
2. Un **hash** donne à chaque case une position d'impact et un timing fixes (pas de
   clignotement).
3. Une **horloge** (`phase`) fait grandir puis mourir le rond de chaque case.
4. On dessine un **fin anneau de vaguelettes** au niveau du front, atténué avec l'âge.
5. La **force de pluie** décide combien de cases ont un rond (au carré → peu en rainy).
6. On mesure la **pente** de ce relief (3 échantillons) pour incliner la surface…
7. …et la **lumière existante de l'eau** fait le reste : les ronds brillent au soleil.

---

## Fichiers concernés

- `src/shaders/water/fragment2.glsl` — tout l'effet (bloc « ONDULATIONS DE PLUIE »).
- `src/Experience/World/Water2.js` — uniforms + pilotage de `uRainStrength` par la météo.
- `src/Experience/World/Weather.js` — presets `sunny`/`rainy`/`tempest` (source de `preset.rain`).
