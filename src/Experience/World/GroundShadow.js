import * as THREE from "three";
import WorldComponent from "./WorldComponent.js";

/**
 * GROUND SHADOW — ombres au sol rendues UNIQUEMENT sur l'herbe (aucun objet 3D).
 *
 * Chaque ancre (pied d'un arbre / buisson) définit une empreinte (rayon + hauteur).
 * À partir de la direction du soleil, ce composant calcule pour chaque ancre une
 * ELLIPSE d'ombre au sol — orientée à l'opposé du soleil et allongée quand il descend.
 *
 * Le shader d'herbe lit ces ellipses (`anchors`, `shadowDir`, `dayFactor`) et assombrit
 * les brins qui tombent dedans. Ici on ne fait donc QUE calculer les ellipses chaque frame.
 */
export default class GroundShadow extends WorldComponent {
  constructor(sun) {
    super();

    this.sun = sun;

    this.params = {
      maxStretch: 6, // longueur max de l'étirement (clamp près de l'horizon)
      softness: 1, // facteur de taille de l'empreinte
    };

    this.anchors = []; // { x, z, radius, height } — émetteurs d'ombre (arbres/buissons)

    // Données PRÊTES POUR LE GPU, partagées PAR RÉFÉRENCE avec les uniforms de l'herbe
    // (même idiome que uSunDirection) : GroundShadow écrit ici, le shader d'herbe lit.
    // Un vec4 par ombre : (centreX, centreZ, demi-largeur, demi-longueur).
    this.ellipses = Array.from({ length: 32 }, () => new THREE.Vector4());
    this.count = 0; // nb d'ellipses valides
    this.shadowDir = new THREE.Vector2(0, 1); // direction horizontale (partagée)
    this.dayFactor = 1; // 0 la nuit -> 1 le jour

    this.setDebug();
  }

  // Enregistre une ombre. radius = empreinte au sol ; height = hauteur de l'objet
  // (pilote la longueur de l'ombre quand le soleil baisse).
  addAnchor({ x, z, radius = 1, height = 2 }) {
    const anchor = { x, z, radius, height };
    this.anchors.push(anchor);
    return anchor;
  }

  update() {
    const sun = this.sun.sunDirection;

    // S'estompe la nuit (même logique que le dayFactor des shaders).
    this.dayFactor = THREE.MathUtils.smoothstep(sun.y, 0.0, 0.3);

    // Direction horizontale de l'ombre, identique pour toutes les ancres.
    this.shadowDir.set(-sun.x, -sun.z);
    if (this.shadowDir.lengthSq() < 1e-6) this.shadowDir.set(0, 1); // soleil au zénith
    this.shadowDir.normalize();

    const n = Math.min(this.anchors.length, this.ellipses.length);
    for (let i = 0; i < n; i++) {
      const a = this.anchors[i];

      // Longueur du décalage projeté : un objet de hauteur h projette le sommet de
      // son ombre au sol à la distance h / sun.y. Soleil bas (sun.y petit) -> ombre longue.
      const projectedLength = a.height / Math.max(sun.y, 0.15); // max() évite la /0 à l'horizon

      // Décalage horizontal du pied vers le bout de l'ombre, à l'opposé du soleil.
      let offsetX = -sun.x * projectedLength;
      let offsetZ = -sun.z * projectedLength;

      // Bornage : sinon l'ombre file à l'infini quand le soleil rase l'horizon.
      const offsetLength = Math.hypot(offsetX, offsetZ);
      if (offsetLength > this.params.maxStretch) {
        const clampScale = this.params.maxStretch / offsetLength; // facteur de réduction (<1)
        offsetX *= clampScale;
        offsetZ *= clampScale;
      }
      const stretch = Math.hypot(offsetX, offsetZ); // longueur finale (après bornage)

      const halfWidth = a.radius * this.params.softness; // demi-largeur (perpendiculaire au soleil)
      const halfLength = halfWidth + stretch * 0.5; // demi-longueur (le long de l'étirement)
      // Écrit directement dans le vec4 partagé (centre = pied + décalage/2).
      this.ellipses[i].set(
        a.x + offsetX * 0.5,
        a.z + offsetZ * 0.5,
        halfWidth,
        halfLength,
      );
    }
    this.count = n;
  }

  setDebug() {
    const folder = this.debug.ui.addFolder("Ombres au sol").close();
    folder.add(this.params, "maxStretch", 1, 20, 0.5).name("Étirement max");
    folder.add(this.params, "softness", 0.3, 3, 0.05).name("Taille empreinte");
  }
}
