
export default class FoliageWind {
  // amplitude : sensibilité au vent PROPRE à ce composant (buisson vs feuillage d'arbre).
  // Multiplie la force globale uWindStrength ; réglable ensuite via le debug.
  constructor(wind, amplitude = 2.0) {
    this.wind = wind;

    // Uniforms à étaler dans le ShaderMaterial. uWindDirection partage la MÊME
    // réf Vector2 que Wind (et que l'herbe) -> cohérence automatique de direction.
    this.uniforms = {
      uTime: { value: 0 },
      uWindStrength: { value: wind.params.strength },
      uWindDirection: { value: wind.direction },
      uWindAmplitude: { value: amplitude },
    };

    // La force est réglable dans le debug "Vent" -> on suit les changements.
    wind.on("change", () => {
      this.uniforms.uWindStrength.value = wind.params.strength;
    });
  }

  update(elapsed) {
    this.uniforms.uTime.value = elapsed;
  }
}
