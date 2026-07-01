uniform float uTime;
uniform float uCoverage;  // 0 = ciel dégagé -> 1 = couverture maximale (anneau : 1)
uniform float uSizeScale; // multiplicateur de taille global (météo ; anneau : 1)

attribute float aScale; // taille du puff
attribute float aPhase; // déphasage du bobbing vertical
attribute float aSeed;  // graine de variation (bruit fragment)
attribute float aRank;  // rang [0,1] : seuil d'apparition selon la couverture

varying vec2 vUv;
varying float vSeed;
varying float vVisible; // 0 caché -> 1 visible (fondu météo ; anneau : toujours 1)

void main() {
  vUv = uv;
  vSeed = aSeed;

  // Apparition progressive : le puff est visible quand son rang <= uCoverage,
  // avec une bande de fondu juste au-dessus du seuil pour qu'il grossisse/rétrécisse
  // en douceur. Bande unilatérale -> uCoverage=1 rend TOUS les puffs pleinement
  // visibles (anneau de l'île : uCoverage=1 -> vVisible=1 partout, inchangé ;
  // tempest : couverture=1 -> tous visibles).
  float band = 0.12;
  vVisible = 1.0 - smoothstep(uCoverage, uCoverage + band, aRank);

  // Centre de l'instance en view space (instanceMatrix fourni par l'InstancedMesh).
  vec4 mvCenter = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);

  // Bobbing vertical doux, déphasé par puff.
  mvCenter.y += sin(uTime * 0.5 + aPhase) * 0.3;

  // Billboard : le quad local (position dans [-0.5, 0.5]) est ajouté dans le plan
  // de la caméra (axes X/Y du view space) -> face toujours la caméra.
  // L'échelle est modulée par vVisible : le puff grossit en apparaissant.
  // uSizeScale module la taille selon la météo (lerpé côté CPU, pas de pop).
  mvCenter.xy += position.xy * aScale * vVisible * uSizeScale;

  gl_Position = projectionMatrix * mvCenter;
}
