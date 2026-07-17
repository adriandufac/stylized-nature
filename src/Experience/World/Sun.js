import * as THREE from 'three'
import WorldComponent from './WorldComponent.js'

// Axes de rotation réutilisés (évite d'allouer un Vector3 à chaque appel)
const SUN_AXIS_X = new THREE.Vector3(1, 0, 0) // axe Est-Ouest : sert à incliner le plan de l'arc
const SUN_AXIS_Y = new THREE.Vector3(0, 1, 0) // axe vertical : sert à orienter l'arc (azimut)

export default class Sun extends WorldComponent {
  constructor() {
    super()

    // Paramètres de la trajectoire du soleil (arc incliné)
    this.sunParams = {
      hour: 12,         // heure de la journée (0-24) : ~12 = zénith/midi. Lever/coucher dépendent de la déclinaison.
      inclination: 0.6, // inclinaison du PLAN de l'arc : 0 = passe par le zénith, plus grand = arc penché (culmine plus bas, vers le Sud)
      orientation: 0.0, // azimut : fait pivoter tout l'arc (l'axe lever→coucher) autour de la verticale
      declination: 0.41,// remonte tout l'arc : écarte lever/coucher. Avec le midi solaire à 14h -> lever ~6h / coucher ~22h. 0 = jour 8h-20h.
    }

    // Source unique de vérité, partagée PAR RÉFÉRENCE dans les uniforms
    // de l'herbe et de la pluie : mutée en place par updateSun, jamais réassignée.
    this.sunDirection = new THREE.Vector3()

    // Intensité ambiante consommée par les shaders herbe/pluie (snapshot non réactif)
    this.ambientIntensity = 0.4

    // cycle jour/nuit
    this.dayDuration = 120   // secondes pour un cycle 24h complet
    this.autoPlay = true

    this.setLights()
    this.updateSun()
    this.setDebug()
  }

  setLights() {
    this.ambientLight = new THREE.AmbientLight('#ffffff', 0.4)
    this.scene.add(this.ambientLight)

    this.directionalLight = new THREE.DirectionalLight('#ffffff', 1.5)
    this.scene.add(this.directionalLight)
  }

  // Recalcule la direction du soleil à partir des 3 paramètres.
  updateSun() {
    // Heure -> angle sur l'arc. Le "8" place le midi solaire (zénith, t=PI/2) à 14h.
    // Sans déclinaison : 8h = lever (t=0), 14h = zénith, 20h = coucher (t=PI).
    // La déclinaison écarte ensuite lever/coucher (0.41 -> ~6h / ~22h).
    const t = (this.sunParams.hour - 8) * (Math.PI / 12)

    // 1. Arc de base dans le plan vertical XY :
    //    t=0 -> (1,0,0) horizon Est | t=PI/2 -> (0,1,0) zénith | t=PI -> (-1,0,0) horizon Ouest
    this.sunDirection.set(Math.cos(t), Math.sin(t), 0)

    // 2. Inclinaison : on penche le plan de l'arc autour de l'axe Est-Ouest (X).
    //    Les points de lever/coucher (sur l'axe X) restent au sol ; seul le point haut bascule vers +Z (Sud).
    this.sunDirection.applyAxisAngle(SUN_AXIS_X, this.sunParams.inclination)

    // 3. Orientation : on fait pivoter l'arc complet autour de la verticale (Y) pour choisir la direction du lever.
    this.sunDirection.applyAxisAngle(SUN_AXIS_Y, this.sunParams.orientation)

    // 4. Déclinaison : décale tout l'arc vers le haut (la rotation Y préserve .y, donc on l'ajoute ici).
    //    Rallonge le jour et relève le soleil l'après-midi ; sans elle le coucher tombe à 18h pile.
    //    Reste périodique sur 24h (boucle auto sans saut à minuit).
    this.sunDirection.y += this.sunParams.declination

    this.sunDirection.normalize()
    this.directionalLight.position.copy(this.sunDirection)

    // Pas de mise à jour d'uniforms ici : herbe et pluie référencent sunDirection
    // directement (même objet), la mutation se propage toute seule.
  }

  update() {
    if (this.autoPlay) {
    this.sunParams.hour = (this.sunParams.hour + (this.time.delta / this.dayDuration) * 24) % 24
    this.updateSun()
    if (this.hourController) this.hourController.updateDisplay() // le slider suit
  }
  }
  setDebug() {
    const folder = this.debug.ui.addFolder('Soleil')
    folder.add(this.sunParams, 'hour', 0, 24, 0.1).name('Heure').onChange(() => this.updateSun())
    folder.add(this.sunParams, 'inclination', 0, Math.PI * 0.5, 0.001).name('Inclinaison').onChange(() => this.updateSun())
    folder.add(this.sunParams, 'orientation', -Math.PI, Math.PI, 0.001).name('Orientation').onChange(() => this.updateSun())
    folder.add(this.sunParams, 'declination', -0.3, 0.6, 0.001).name('Déclinaison (durée jour)').onChange(() => this.updateSun())
    this.hourController = folder.add(this.sunParams, 'hour', 0, 24, 0.1).name('Heure')
      .onChange(() => { this.autoPlay = false; this.updateSun() }) // saisie manuelle coupe l'auto
    folder.add(this, 'autoPlay').name('Cycle auto')
    folder.add(this, 'dayDuration', 10, 600, 1).name('Durée du jour (s)')
  }
}
