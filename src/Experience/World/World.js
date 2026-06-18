import Terrain from './Terrain.js'
import Environment from './Environment.js'
import Wind from './Wind.js'
import Grass from './Grass.js'
import Rain from './Rain.js'
import Bush from './Bush.js'
import Tree from './Tree.js'

export default class World {
  constructor() {
    // Terrain Environment Wind sont sources de vérité.
    this.terrain = new Terrain()
    this.environment = new Environment()
    this.wind = new Wind()


    this.grass = new Grass(this.terrain, this.wind, this.environment)
    this.rain = new Rain(this.terrain, this.wind, this.environment)
    this.bush = new Bush(this.terrain, this.wind, this.environment)
    this.tree = new Tree(this.terrain, this.wind, this.environment)
    // futur : this.water = new Water(this.terrain, this.wind, this.environment)
  }

  update() {
    this.grass.update()
    this.rain.update()
  }
}
