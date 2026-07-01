import WorldComponent from "./WorldComponent.js";

/**
 * WEATHER — source unique de vérité de la météo (sunny / rainy / tempest).
 *
 * Détient TOUTE la table de presets (nuages + pluie + vent) et l'état courant.
 * `set(name)` change l'état et émet 'change' (patron Wind.updateWind) ; chaque
 * consommateur (SkyClouds, Rain, Wind) s'abonne et applique SA propre tranche :
 *   - SkyClouds : preset.clouds -> cible lerpée (uCoverage/uBrightness/uOpacity/uSizeScale)
 *   - Rain      : preset.rain   -> visibilité + densité (rebuild)
 *   - Wind      : preset.wind   -> force du vent (updateWind)
 *
 * Le HUD n'est plus qu'un appelant : `weather.set('tempest')`.
 */
export default class Weather extends WorldComponent {
  constructor() {
    super();

    // Vitesse de transition commune (lerp Wind/Rain, indépendant du framerate) :
    // ~3 s pour atteindre la cible (k = min(1, delta * transitionSpeed)).
    this.transitionSpeed = 1.0;

    this.presets = {
      // clouds : ancienne table de SkyClouds. rain : densité de gouttes (0 = pas de
      // pluie -> masquée). rainy = valeur figée historique (0.06), tempest plus dense.
      // wind : sunny = défaut Wind (0.15), tempest = 0.54 (= 90 % de l'ancien
      // WIND_MAX_STRENGTH), rainy = brise.
      // sky : multiplicateur de luminosité du ciel (horizon + zénith) ; 1 = clair
      // (sunny), plus bas = ciel assombri par la couverture nuageuse (tempest).
      sunny: {
        clouds: { coverage: 0.05, brightness: 1.0, opacity: 0.9, sizeScale: 1.0 },
        rain: 0,
        wind: 0.15,
        sky: 1.0,
      },
      rainy: {
        clouds: { coverage: 0.55, brightness: 0.55, opacity: 0.95, sizeScale: 1.2 },
        rain: 0.06,
        wind: 0.3,
        sky: 0.7,
      },
      tempest: {
        clouds: { coverage: 1.0, brightness: 0.3, opacity: 1.0, sizeScale: 1.5 },
        rain: 0.12,
        wind: 0.54,
        sky: 0.15,
      },
    };

    this.current = "sunny";
  }

  // Preset actif (raccourci lu par les consommateurs dans leur handler 'change').
  get preset() {
    return this.presets[this.current];
  }

  // Change la météo et prévient tous les abonnés (patron Wind.updateWind).
  set(name) {
    if (!this.presets[name]) return;
    this.current = name;
    this.trigger("change");
  }
}
