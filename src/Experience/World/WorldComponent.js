import Experience from '../Experience.js'
import EventEmitter from '../Utils/EventEmitter.js'

/**
 * Classe de base des composants du World.
 * - EventEmitter : Terrain/Wind émettent leurs changements, les autres s'abonnent.
 * - Donne accès aux services communs (scene, time, debug) sans boilerplate.
 * - update()/destroy() no-op : World peut les appeler de façon polymorphe.
 */
export default class WorldComponent extends EventEmitter {
  constructor() {
    super()

    this.experience = new Experience()
    this.scene = this.experience.scene
    this.time = this.experience.time
    this.debug = this.experience.debug
  }

  update() {}

  destroy() {}
}
