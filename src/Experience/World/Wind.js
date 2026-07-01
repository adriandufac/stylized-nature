import * as THREE from 'three'
import WorldComponent from './WorldComponent.js'

/**
 * WIND — direction de vent globale, partagée par l'herbe et la pluie.
 * Source unique de vérité : un Vector2 dans le plan XZ (x -> axe X monde, y -> axe Z).
 */
export default class Wind extends WorldComponent {
  constructor(weather) {
    super()

    this.weather = weather

    this.params = {
      angle: 0,       // direction du vent dans le plan XZ (radians) : 0 = +X, PI/2 = +Z
      strength: 0.15, // force du balancement de l'herbe (uWindStrength) ; pilotée par la météo
    }

    // Cible lerpée : la météo la fixe, update() rapproche strength en douceur (~3 s).
    this.strengthTarget = this.params.strength

    // Partagé PAR RÉFÉRENCE avec l'uniform de l'herbe et lu par Rain.build() :
    // muté en place par updateWind, jamais réassigné.
    this.direction = new THREE.Vector2(Math.cos(this.params.angle), Math.sin(this.params.angle))

    // La météo fixe la CIBLE de force (sunny calme -> tempest rafale) ; le lerp se
    // fait frame par frame dans update() pour une transition douce.
    this.weather.on('change', () => {
      this.strengthTarget = this.weather.preset.wind
    })

    this.setDebug()
  }

  // Rapproche strength de la cible météo puis notifie les consommateurs tant que ça
  // bouge (herbe/eau suivent l'uniform, la pluie régénère son inclinaison).
  update() {
    const s = this.params.strength
    if (Math.abs(this.strengthTarget - s) < 1e-4) return // stabilisé : rien à faire

    const k = Math.min(1, this.time.delta * this.weather.transitionSpeed)
    let next = s + (this.strengthTarget - s) * k
    if (Math.abs(this.strengthTarget - next) < 1e-4) next = this.strengthTarget // snap final
    this.params.strength = next
    this.updateWind()
  }

  // Recalcule la direction et prévient les consommateurs (herbe + pluie).
  updateWind() {
    this.direction.set(Math.cos(this.params.angle), Math.sin(this.params.angle)) // met aussi à jour l'uniform (même réf)
    this.trigger('change')
  }

  setDebug() {
    const folder = this.debug.ui.addFolder('Vent')
    folder.add(this.params, 'angle', -Math.PI, Math.PI, 0.001).name('Direction').onChange(() => this.updateWind())
    folder.add(this.params, 'strength', 0, 1, 0.01).name('Force').onChange(() => { this.strengthTarget = this.params.strength; this.updateWind() })
  }
}
