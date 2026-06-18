import * as THREE from 'three'
import WorldComponent from './WorldComponent.js'

import rainVertexShader from '../../shaders/rain/vertex.glsl'
import rainFragmentShader from '../../shaders/rain/fragment.glsl'

export default class Rain extends WorldComponent {
  constructor(terrain, wind, environment) {
    super()

    this.terrain = terrain
    this.wind = wind
    this.environment = environment

    this.params = {
      rainHeight: 20, // hauteur de la colonne de pluie
      density: 0.06,  // gouttes par unité de volume
      length: 0.5,    // longueur d'un trait de pluie
      windFactor: 6,  // sensibilité de l'inclinaison de la pluie au vent (réglage à l'œil)
      speedMin: 8,    // vitesse de chute minimale (unités/s)
      speedMax: 14,   // vitesse de chute maximale (unités/s)
    }

    this.setMesh()
    this.build()
    this.setSubscriptions()
    this.setDebug()
  }

  setMesh() {
    this.uniforms = {
      uTime: { value: 0 },
      uOpacity: { value: 0.9 },                               // fondu global : démarrer/arrêter la pluie en douceur
      uColor: { value: new THREE.Color('#cfe3ff') },          // teinte de pluie (gris bleuté)
      uFallDirection: { value: new THREE.Vector3(0, -1, 0) }, // recalculé dans build
      uFallDistance: { value: this.params.rainHeight },       // recalculé dans build
      uSunDirection: { value: this.environment.sunDirection }, // partagé (réf) : muté en place par updateSun
      uAmbientLight: { value: this.environment.ambientIntensity },
    }

    this.geometry = new THREE.BufferGeometry()
    this.material = new THREE.ShaderMaterial({
      vertexShader: rainVertexShader,
      fragmentShader: rainFragmentShader,
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
    })
    this.lines = new THREE.LineSegments(this.geometry, this.material)
    this.scene.add(this.lines)
  }

  // (Re)génère les segments de pluie. L'inclinaison ET la direction du vent sont
  // FIGÉES dans la géométrie, donc on régénère quand la force/direction du vent
  // OU la taille du terrain change.
  build() {
    const halfSize = this.terrain.params.size / 2 // 16 pour size = 32
    const box = new THREE.Box3(
      new THREE.Vector3(-halfSize, 0,                      -halfSize),
      new THREE.Vector3( halfSize, this.params.rainHeight, halfSize),
    )

    // densité ≈ gouttes par unité de volume, constante
    const volume = (this.terrain.params.size ** 2) * this.params.rainHeight
    const count = Math.round(volume * this.params.density)

    // Inclinaison dérivée de la force du vent : tilt = atan(Vhorizontal / Vchute).
    // strength 0 -> pluie verticale ; strength fort -> trait de plus en plus couché.
    const tilt = Math.atan(this.wind.params.strength * this.params.windFactor)
    const horiz = this.params.length * Math.sin(tilt) // part horizontale du trait
    const vert = this.params.length * Math.cos(tilt)  // part verticale du trait

    const positions = new Float32Array(count * 6) // 2 sommets (tête/queue) x 3 coords
    const speeds = new Float32Array(count * 2)    // 1 par sommet
    const offsets = new Float32Array(count * 2)
    const alphas = new Float32Array(count * 2)

    for (let i = 0; i < count; i++) {
      const startX = THREE.MathUtils.randFloat(box.min.x, box.max.x)
      const startY = THREE.MathUtils.randFloat(box.min.y, box.max.y)
      const startZ = THREE.MathUtils.randFloat(box.min.z, box.max.z)

      const i6 = i * 6 // 6 composantes par segment (2 sommets x 3 coords)
      // Tête = point de départ (mène la chute)
      positions[i6]     = startX
      positions[i6 + 1] = startY
      positions[i6 + 2] = startZ
      // Queue : plus haute (vert) et EN ARRIÈRE du vent (la traînée traîne derrière la goutte).
      positions[i6 + 3] = startX - horiz * this.wind.direction.x
      positions[i6 + 4] = startY + vert
      positions[i6 + 5] = startZ - horiz * this.wind.direction.y

      // Attributs par sommet : aSpeed/aOffset IDENTIQUES tête+queue -> le trait reste rigide.
      const speed = THREE.MathUtils.randFloat(this.params.speedMin, this.params.speedMax)
      const offset = THREE.MathUtils.randFloat(0, this.params.rainHeight) // désync du recyclage
      const v = i * 2 // index du sommet tête ; queue = v + 1
      speeds[v]  = speed;  speeds[v + 1]  = speed
      offsets[v] = offset; offsets[v + 1] = offset
      alphas[v]  = 1.0;    alphas[v + 1]  = 0.0 // tête opaque -> queue transparente
    }

    this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    this.geometry.setAttribute('aSpeed', new THREE.BufferAttribute(speeds, 1))
    this.geometry.setAttribute('aOffset', new THREE.BufferAttribute(offsets, 1))
    this.geometry.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1))

    // Direction de chute = opposée au trait (la goutte glisse le long de sa propre ligne) :
    // vers le bas (-cos) et vers le vent (+windDirection * sin). Vecteur déjà unitaire.
    this.uniforms.uFallDirection.value.set(
      Math.sin(tilt) * this.wind.direction.x,
      -Math.cos(tilt),
      Math.sin(tilt) * this.wind.direction.y,
    )
    this.uniforms.uFallDistance.value = this.params.rainHeight
  }

  setSubscriptions() {
    // Taille du terrain -> boîte et nombre de gouttes. PAS 'resampled' : le relief n'affecte pas la pluie.
    this.terrain.on('rebuilt', () => this.build())

    // Vent : l'inclinaison/direction sont figées dans la géométrie -> régénérer
    this.wind.on('change', () => this.build())
  }

  setDebug() {
    const folder = this.debug.ui.addFolder('Pluie')
    folder.add(this.params, 'density', 0, 0.3, 0.005).name('Densité').onFinishChange(() => this.build())
    folder.add(this.params, 'windFactor', 0, 20, 0.5).name('Sensibilité au vent').onFinishChange(() => this.build())
  }

  update() {
    // Anime la chute de la pluie
    this.uniforms.uTime.value = this.time.elapsed
  }
}
