import * as THREE from 'three'
import WorldComponent from './WorldComponent.js'

// Axes de rotation réutilisés (évite d'allouer un Vector3 à chaque appel)
const SUN_AXIS_X = new THREE.Vector3(1, 0, 0) // axe Est-Ouest : sert à incliner le plan de l'arc
const SUN_AXIS_Y = new THREE.Vector3(0, 1, 0) // axe vertical : sert à orienter l'arc (azimut)

export default class Environment extends WorldComponent {
  constructor() {
    super()

    // Paramètres de la trajectoire du soleil (arc incliné)
    this.sunParams = {
      hour: 12,         // heure de la journée (0-24) : 6 = lever (Est), 12 = zénith/midi, 18 = coucher (Ouest), 0/24 = minuit
      inclination: 0.6, // inclinaison du PLAN de l'arc : 0 = passe par le zénith, plus grand = arc penché (culmine plus bas, vers le Sud)
      orientation: 0.0, // azimut : fait pivoter tout l'arc (l'axe lever→coucher) autour de la verticale
    }

    // Source unique de vérité, partagée PAR RÉFÉRENCE dans les uniforms
    // de l'herbe et de la pluie : mutée en place par updateSun, jamais réassignée.
    this.sunDirection = new THREE.Vector3()

    // Intensité ambiante consommée par les shaders herbe/pluie (snapshot non réactif)
    this.ambientIntensity = 0.4

    this.setLights()
    this.updateSun()
    this.setDebug()
  }

  setLights() {
    this.ambientLight = new THREE.AmbientLight('#ffffff', 0.4)
    this.scene.add(this.ambientLight)

    this.directionalLight = new THREE.DirectionalLight('#ffffff', 1.5)
    this.scene.add(this.directionalLight)

    // Debug : boule qui matérialise la position du soleil
    this.debugSun = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.1, 2),
      new THREE.MeshBasicMaterial(),
    )
    this.scene.add(this.debugSun)
  }

  // Recalcule la direction du soleil à partir des 3 paramètres.
  updateSun() {
    // Heure -> angle sur l'arc. 6h = lever (t=0), 12h = zénith (t=PI/2), 18h = coucher (t=PI),
    // 0h/24h = minuit (t=-PI/2, soleil droit en dessous).
    const t = (this.sunParams.hour - 6) * (Math.PI / 12)

    // 1. Arc de base dans le plan vertical XY :
    //    t=0 -> (1,0,0) horizon Est | t=PI/2 -> (0,1,0) zénith | t=PI -> (-1,0,0) horizon Ouest
    this.sunDirection.set(Math.cos(t), Math.sin(t), 0)

    // 2. Inclinaison : on penche le plan de l'arc autour de l'axe Est-Ouest (X).
    //    Les points de lever/coucher (sur l'axe X) restent au sol ; seul le point haut bascule vers +Z (Sud).
    this.sunDirection.applyAxisAngle(SUN_AXIS_X, this.sunParams.inclination)

    // 3. Orientation : on fait pivoter l'arc complet autour de la verticale (Y) pour choisir la direction du lever.
    this.sunDirection.applyAxisAngle(SUN_AXIS_Y, this.sunParams.orientation)

    this.sunDirection.normalize()
    this.directionalLight.position.copy(this.sunDirection)

    // Debug
    this.debugSun.position.copy(this.sunDirection).multiplyScalar(20)

    // Pas de mise à jour d'uniforms ici : herbe et pluie référencent sunDirection
    // directement (même objet), la mutation se propage toute seule.
  }

  setDebug() {
    const folder = this.debug.ui.addFolder('Soleil')
    folder.add(this.sunParams, 'hour', 0, 24, 0.1).name('Heure').onChange(() => this.updateSun())
    folder.add(this.sunParams, 'inclination', 0, Math.PI * 0.5, 0.001).name('Inclinaison').onChange(() => this.updateSun())
    folder.add(this.sunParams, 'orientation', -Math.PI, Math.PI, 0.001).name('Orientation').onChange(() => this.updateSun())
  }
}
