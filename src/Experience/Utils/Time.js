import * as THREE from 'three'
import EventEmitter from './EventEmitter.js'

export default class Time extends EventEmitter {
  constructor() {
    super()

    // THREE.Clock pour garder un temps en SECONDES (consommé tel quel par uTime)
    this.clock = new THREE.Clock()
    this.elapsed = 0
    this.delta = 0

    window.requestAnimationFrame(() => this.tick())
  }

  tick() {
    const elapsed = this.clock.getElapsedTime()
    this.delta = elapsed - this.elapsed
    this.elapsed = elapsed

    this.trigger('tick')

    window.requestAnimationFrame(() => this.tick())
  }
}
