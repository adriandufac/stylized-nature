import * as THREE from 'three'
import WorldComponent from './WorldComponent.js'
import Firefly from './Firefly.js'

const RAY_DOWN = new THREE.Vector3(0, -1, 0)

/**
 * FIREFLIES — lucioles nocturnes disposées EN CERCLE au-dessus de l'îlot central du lac.
 *
 * Le centre du cercle est lu au runtime sur le mesh "lake" (chargé en async par Water2)
 * -> robuste si le terrain/lac change. Chaque luciole flotte au-dessus de l'îlot, apparaît
 * EN FONDU la nuit (signal dérivé de sunDirection.y comme Sky) et disparaît en tempête
 * (gate météo lissé, comme Lightning). Chaque luciole est survolable/cliquable via le
 * raycaster partagé (Interaction) : survol = contour lumineux + curseur ; clic = couleur.
 */
export default class Fireflies extends WorldComponent {
  constructor(terrain, environment, weather, water) {
    super()

    this.terrain = terrain
    this.environment = environment
    this.weather = weather
    this.water = water

    this.params = {
      count: 10, // nombre de lucioles autour de l'îlot
      ringRadius: 4.2, // rayon du cercle autour du centre de l'îlot
      ringPhase: 0, // rotation du cercle (rad)
      centerX: 0, // centre du cercle (auto-calé sur le lac au chargement)
      centerZ: 0,
      minHeight: 2.8, // hauteur mini au-dessus de l'îlot (bien au-dessus du sol)
      maxHeight: 3.45, // hauteur maxi au-dessus de l'îlot
      coreSize: 0.5, // taille du cœur lumineux
      haloSize: 0.84, // taille du halo (lueur + cible de survol)
      driftRadius: 0.25, // dérive horizontale (garde le cercle reconnaissable)
      pulseSpeed: 2.0, // vitesse de clignotement de référence
    }

    // Palette : 3 couleurs bien distinctes — BLEU, ROUGE, VERT.
    this.palette = [
      '#2b6bff', // bleu
      '#ff2b2b', // rouge
      '#22e04a', // vert
    ]

    this.fireflies = []

    // Fondu météo : 1 = lucioles autorisées, 0 = tempête (masquées). Lerpé pour un fondu doux.
    this.weatherFactor = 1
    this.weatherTarget = 1

    // Raycaster vertical pour poser chaque luciole au-dessus du relief de l'îlot.
    this.rayDown = new THREE.Raycaster()

    this.glowTexture = this.makeGlowTexture()

    this.build()
    this.setSubscriptions()
    this.setDebug()
  }

  // Texture de lueur partagée : dégradé radial blanc -> transparent (teintée ensuite
  // par material.color, en AdditiveBlending -> effet glow sans post-processing).
  makeGlowTexture() {
    const size = 128
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size
    const ctx = canvas.getContext('2d')
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
    g.addColorStop(0.0, 'rgba(255,255,255,1)')
    g.addColorStop(0.2, 'rgba(255,255,255,0.9)')
    g.addColorStop(0.5, 'rgba(255,255,255,0.35)')
    g.addColorStop(1.0, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, size, size)

    const tex = new THREE.CanvasTexture(canvas)
    tex.needsUpdate = true
    return tex
  }

  // Centre (x,z) du mesh "lake" = centre de l'îlot central. null tant que le GLB n'est
  // pas chargé (Water2 émet 'loaded' -> on recale à ce moment).
  getLakeCenter() {
    if (!this.water || !this.water.meshes) return null
    const lake = this.water.meshes.find((m) => m.name === 'lake')
    if (!lake) return null
    lake.updateWorldMatrix(true, false)
    const c = new THREE.Box3().setFromObject(lake).getCenter(new THREE.Vector3())
    return { x: c.x, z: c.z }
  }

  // Cale le centre du cercle sur le lac puis reconstruit.
  recenterOnLake() {
    const c = this.getLakeCenter()
    if (c) {
      this.params.centerX = c.x
      this.params.centerZ = c.z
    }
    this.build()
  }

  // Hauteur du terrain (îlot) sous un point (x,z) via raycast vertical.
  groundHeightAt(x, z) {
    this.rayDown.set(new THREE.Vector3(x, 100, z), RAY_DOWN)
    const hit = this.rayDown.intersectObject(this.terrain.mesh, false)[0]
    return hit ? hit.point.y : 0
  }

  // (Re)construit les lucioles : réparties régulièrement sur un cercle autour de l'îlot.
  build() {
    this.destroyFireflies()

    const n = this.params.count
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + this.params.ringPhase
      const x = this.params.centerX + Math.cos(a) * this.params.ringRadius
      const z = this.params.centerZ + Math.sin(a) * this.params.ringRadius
      const groundY = this.groundHeightAt(x, z)

      const firefly = new Firefly({
        x,
        z,
        groundY,
        glowTexture: this.glowTexture,
        palette: this.palette,
        params: this.params,
        onColorChange: () => this.handleColorChange(),
      })
      this.scene.add(firefly.group)
      this.fireflies.push(firefly)
    }

    // État "unifié" initial (silencieux : pas d'événement au (re)build).
    this._unifiedColor = this.getCommonColor()
  }

  destroyFireflies() {
    for (const f of this.fireflies) f.destroy() // retire du scene + désenregistre du picking
    this.fireflies.length = 0
  }

  setSubscriptions() {
    // Le lac est chargé en async : on cale le cercle sur son centre dès qu'il est prêt.
    if (this.water) this.water.on('loaded', () => this.recenterOnLake())

    // Le terrain change de relief/taille -> on repose les lucioles (hauteurs à recalculer).
    this.terrain.on('rebuilt', () => this.build())
    this.terrain.on('resampled', () => this.build())

    // Météo : cible 0 en tempête (fondu de sortie), 1 sinon.
    this.weather.on('change', () => {
      this.weatherTarget = this.weather.current === 'tempest' ? 0 : 1
    })
  }

  setDebug() {
    const folder = this.debug.ui.addFolder('Lucioles').close()
    folder
      .add(this.params, 'count', 0, 30, 1)
      .name('Nombre')
      .onFinishChange(() => this.build())
    folder
      .add(this.params, 'ringRadius', 0.5, 12, 0.1)
      .name('Rayon du cercle')
      .onFinishChange(() => this.build())
    folder
      .add(this.params, 'ringPhase', 0, Math.PI * 2, 0.01)
      .name('Rotation')
      .onFinishChange(() => this.build())
    folder
      .add(this.params, 'centerX', -16, 16, 0.1)
      .name('Centre X')
      .onFinishChange(() => this.build())
    folder
      .add(this.params, 'centerZ', -16, 16, 0.1)
      .name('Centre Z')
      .onFinishChange(() => this.build())
    folder.add({ recenter: () => this.recenterOnLake() }, 'recenter').name('🎯 Recaler sur le lac')
    folder.add(this.params, 'minHeight', 0, 4, 0.05).name('Hauteur min')
    folder.add(this.params, 'maxHeight', 0, 6, 0.05).name('Hauteur max')
    folder.add(this.params, 'driftRadius', 0, 1, 0.01).name('Dérive')
    folder
      .add(this.params, 'coreSize', 0.05, 0.5, 0.01)
      .name('Taille cœur')
      .onFinishChange(() => this.build())
    folder
      .add(this.params, 'haloSize', 0.1, 1.5, 0.01)
      .name('Taille halo')
      .onFinishChange(() => this.build())
    folder
      .add(this.params, 'pulseSpeed', 0.5, 6, 0.1)
      .name('Clignotement')
      .onFinishChange(() => this.build())
  }

  // Couleur commune à TOUTES les lucioles, sinon null.
  getCommonColor() {
    if (!this.fireflies.length) return null
    const c = this.fireflies[0].color
    return this.fireflies.every((f) => f.color === c) ? c : null
  }

  // Appelé à chaque clic qui change la couleur d'une luciole. Émet des événements
  // seulement quand l'état BASCULE (évite de spammer à chaque clic) :
  //   - 'unified'  (couleur) : toutes les lucioles viennent d'atteindre la même couleur
  //   - 'broken'             : elles ne sont plus toutes identiques
  //   - 'colorchange' (couleurCommune|null) : à chaque changement, si besoin
  handleColorChange() {
    // Son de clic à chaque changement de couleur (déclenché par un clic sur une luciole).
    this.experience.world?.sound?.playClick()

    const common = this.getCommonColor()
    const wasUnified = this._unifiedColor !== null

    if (common !== null && !wasUnified) {
      this._unifiedColor = common
      this.trigger('unified', [common])
    } else if (common === null && wasUnified) {
      this._unifiedColor = null
      this.trigger('broken')
    } else {
      // Reste unifié mais la couleur commune a changé (toutes reteintées ensemble).
      this._unifiedColor = common
    }

    this.trigger('colorchange', [common])
  }

  update() {
    // Fondu météo (indépendant du framerate) : ~1 s pour basculer.
    this.weatherFactor +=
      (this.weatherTarget - this.weatherFactor) * Math.min(1, this.time.delta * 0.8)

    // Signal nuit : 1 = pleine nuit, 0 = jour (même dérivation que Sky).
    const nightFactor = 1 - THREE.MathUtils.smoothstep(this.environment.sunDirection.y, -0.2, 0.1)
    const visibility = nightFactor * this.weatherFactor

    const elapsed = this.time.elapsed
    const delta = this.time.delta
    for (const f of this.fireflies) f.update(visibility, elapsed, delta)
  }
}
