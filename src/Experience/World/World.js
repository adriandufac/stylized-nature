import Terrain from './Terrain.js'
import Environment from './Environment.js'
import Wind from './Wind.js'
import Grass from './Grass.js'
import Rain from './Rain.js'

export default class World {
  constructor() {
    // L'ordre d'instanciation = ordre des dossiers du GUI (Terrain, Soleil, Vent, Herbe, Pluie)
    // et garantit que les sources de vérité (terrain, soleil, vent) existent avant leurs consommateurs.
    this.terrain = new Terrain()
    this.environment = new Environment()
    this.wind = new Wind()
    this.grass = new Grass(this.terrain, this.wind, this.environment)
    this.rain = new Rain(this.terrain, this.wind, this.environment)
    // futur : this.water = new Water(this.terrain, this.wind, this.environment)
  }

  update() {
    this.grass.update()
    this.rain.update()
  }
}
