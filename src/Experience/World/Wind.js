import * as THREE from 'three'
import WorldComponent from './WorldComponent.js'

/**
 * WIND — direction de vent globale, partagée par l'herbe et la pluie.
 * Source unique de vérité : un Vector2 dans le plan XZ (x -> axe X monde, y -> axe Z).
 */
export default class Wind extends WorldComponent {
  constructor() {
    super()

    this.params = {
      angle: 0,       // direction du vent dans le plan XZ (radians) : 0 = +X, PI/2 = +Z
      strength: 0.15, // force du balancement de l'herbe (uWindStrength)
    }

    // Partagé PAR RÉFÉRENCE avec l'uniform de l'herbe et lu par Rain.build() :
    // muté en place par updateWind, jamais réassigné.
    this.direction = new THREE.Vector2(Math.cos(this.params.angle), Math.sin(this.params.angle))

    this.setDebug()
  }

  // Recalcule la direction et prévient les consommateurs (herbe + pluie).
  updateWind() {
    this.direction.set(Math.cos(this.params.angle), Math.sin(this.params.angle)) // met aussi à jour l'uniform (même réf)
    this.trigger('change')
  }

  setDebug() {
    const folder = this.debug.ui.addFolder('Vent')
    folder.add(this.params, 'angle', -Math.PI, Math.PI, 0.001).name('Direction').onChange(() => this.updateWind())
    folder.add(this.params, 'strength', 0, 1, 0.01).name('Force').onChange(() => this.updateWind())
  }
}
