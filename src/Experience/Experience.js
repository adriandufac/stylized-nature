import * as THREE from 'three'
import Debug from './Utils/Debug.js'
import Sizes from './Utils/Sizes.js'
import Time from './Utils/Time.js'
import Camera from './Camera.js'
import Renderer from './Renderer.js'
import World from './World/World.js'
import Exporter from './Exporter.js'

let instance = null

export default class Experience {
  constructor(canvas) {
    // Singleton : les autres classes récupèrent la même instance via new Experience()
    if (instance) return instance
    instance = this

    this.canvas = canvas

    this.debug = new Debug()
    this.sizes = new Sizes()
    this.time = new Time()
    this.scene = new THREE.Scene()
    this.camera = new Camera()
    this.renderer = new Renderer()
    this.world = new World()

    // Outil d'export .glb (terrain + falaise) comme référence pour Blender.
    this.exporter = new Exporter([this.world.terrain.mesh, this.world.cliff.group])

    this.sizes.on('resize', () => this.resize())
    this.time.on('tick', () => this.update())
  }

  resize() {
    this.camera.resize()
    this.renderer.resize()
  }

  update() {
    this.camera.update()
    this.world.update()
    this.renderer.update()
  }
}
