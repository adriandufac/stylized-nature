import * as THREE from 'three'
import Debug from './Utils/Debug.js'
import Sizes from './Utils/Sizes.js'
import Time from './Utils/Time.js'
import Camera from './Camera.js'
import Renderer from './Renderer.js'
import World from './World/World.js'
import Exporter from './Exporter.js'
import HUD from './Utils/HUD.js'
import Loading from './Utils/Loading.js'
import Navigation from './Utils/Navigation.js'
import Interaction from './Utils/Interaction.js'

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

    // Picking souris partagé (raycaster) : créé AVANT le World pour que ses objets
    // interactifs (lucioles) puissent s'y enregistrer à leur construction.
    this.interaction = new Interaction()

    // Loading AVANT le World : s'abonne au DefaultLoadingManager pour capter
    // tous les chargements d'assets (.glb, textures) dès leur départ.
    this.loading = new Loading()

    this.world = new World()

    // Outil d'export .glb (terrain + falaise) comme référence pour Blender.
    this.exporter = new Exporter([this.world.terrain.mesh, this.world.cliff.group])

    // HUD météo : branché directement sur Wind / Environment / Rain.
    this.hud = new HUD()

    // Barre de navigation (points d'intérêt) : cachée jusqu'à la fin du plongeon.
    this.navigation = new Navigation()

    this.sizes.on('resize', () => this.resize())
    this.time.on('tick', () => this.update())
  }

  // Appelé par Loading quand les assets sont prêts et l'overlay commence à
  // s'effacer : lance le plongeon, puis révèle la navigation à son terme.
  begin() {
    this.camera.startIntro(() => this.navigation.show())
  }

  resize() {
    this.camera.resize()
    this.renderer.resize()
  }

  update() {
    this.camera.update()
    this.world.update()
    // Après world.update() : les lucioles ont bougé, le raycast porte sur leurs
    // positions à jour (survol/clic).
    this.interaction.update()
    // Écriture DOM de l'heure alignée sur la frame (gatée : ne fait rien la plupart
    // du temps) -> fondue dans la passe de rendu, pas de pipeline séparé comme setInterval.
    this.hud.update()
    this.renderer.update()
  }
}
