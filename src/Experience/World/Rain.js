import * as THREE from 'three'
import WorldComponent from './WorldComponent.js'

import rainVertexShader from '../../shaders/rain/vertex.glsl'
import rainFragmentShader from '../../shaders/rain/fragment.glsl'

/**
 * RAIN — averse de traits billboardés (LineSegments).
 *
 * La géométrie est construite UNE SEULE FOIS à la densité max (maxDensity) ; la
 * météo ne fait plus reconstruire : inclinaison (vent) et densité sont pilotées
 * par UNIFORMS dans le vertex shader :
 *   - uWindStrength / uWindDir : inclinaison + direction de chute (transition douce)
 *   - uDensityFrac (0..1)      : fraction de gouttes visibles (masque via aRand)
 * -> changer le vent ou la densité = simple lerp d'uniform, aucun re-tirage aléatoire
 *    des gouttes (pas de clignotement), et le drag manuel du vent devient fluide.
 */
export default class Rain extends WorldComponent {
  constructor(terrain, wind, environment, weather) {
    super()

    this.terrain = terrain
    this.wind = wind
    this.environment = environment
    this.weather = weather

    this.params = {
      rainHeight: 20, // hauteur de la colonne de pluie
      length: 0.5,    // longueur d'un trait de pluie
      windFactor: 6,  // sensibilité de l'inclinaison de la pluie au vent (réglage à l'œil)
      speedMin: 8,    // vitesse de chute minimale (unités/s)
      speedMax: 14,   // vitesse de chute maximale (unités/s)
    }

    // Densité de référence de la construction : les gouttes des presets météo en
    // sont une fraction (uDensityFrac = preset.rain / maxDensity). Doit être >= à
    // la plus forte densité de preset (tempest 0.12).
    this.maxDensity = 0.12

    // Transition de densité à DURÉE FIXE + easing smoothstep (lent au début ET à la
    // fin). Un lerp exponentiel paraissait asymétrique : apparition trop brutale
    // (la fraction bondit vite au départ) vs disparition lente. Le smoothstep rend
    // les deux sens également progressifs.
    this.densityDuration = 3.5 // secondes
    this._densFrom = 0 // fraction au début de la transition
    this._densTo = 0 // fraction cible
    this._densT = 1 // progression 0..1 (1 = terminé)

    this.setMesh()
    this.build()
    this.setSubscriptions()
    this.setDebug()
  }

  setMesh() {
    this.uniforms = {
      uTime: { value: 0 },
      uOpacity: { value: 0.9 },                       // fondu global (traînée tête->queue)
      uColor: { value: new THREE.Color('#cfe3ff') },  // teinte de pluie (gris bleuté)
      uFallDistance: { value: this.params.rainHeight },
      // Vent : uWindDir partage la RÉFÉRENCE Vector2 de Wind (mutée par updateWind)
      // -> la direction se propage sans reconstruire. uWindStrength (scalaire) est
      // poussé chaque frame dans update() pour suivre le lerp de Wind.
      uWindStrength: { value: this.wind.params.strength },
      uWindDir: { value: this.wind.direction },
      uWindFactor: { value: this.params.windFactor },
      uStreakLength: { value: this.params.length },
      uDensityFrac: { value: 0 },                     // 0..1 : fraction de gouttes visibles
      uSunDirection: { value: this.environment.sunDirection }, // partagé (réf)
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
    this.lines.visible = false // densité initiale 0 (sunny) -> masquée
    this.scene.add(this.lines)
  }

  // Construit les segments à la densité MAX. L'inclinaison/direction n'est PLUS figée
  // ici (calculée dans le shader) -> à régénérer uniquement si la taille du terrain change.
  build() {
    const halfSize = this.terrain.params.size / 2 // 16 pour size = 32
    const box = new THREE.Box3(
      new THREE.Vector3(-halfSize, 0,                      -halfSize),
      new THREE.Vector3( halfSize, this.params.rainHeight, halfSize),
    )

    const volume = (this.terrain.params.size ** 2) * this.params.rainHeight
    const count = Math.round(volume * this.maxDensity)

    const positions = new Float32Array(count * 6) // 2 sommets (tête/queue) x 3 coords
    const speeds = new Float32Array(count * 2)
    const offsets = new Float32Array(count * 2)
    const alphas = new Float32Array(count * 2)
    const isTail = new Float32Array(count * 2) // 0 = tête, 1 = queue (décalée dans le shader)
    const rands = new Float32Array(count * 2)  // seuil de densité, stable par goutte

    for (let i = 0; i < count; i++) {
      const startX = THREE.MathUtils.randFloat(box.min.x, box.max.x)
      const startY = THREE.MathUtils.randFloat(box.min.y, box.max.y)
      const startZ = THREE.MathUtils.randFloat(box.min.z, box.max.z)

      const i6 = i * 6 // 6 composantes par segment (2 sommets x 3 coords)
      // Tête ET queue partent du MÊME point ; la queue est décalée dans le vertex shader.
      positions[i6]     = startX
      positions[i6 + 1] = startY
      positions[i6 + 2] = startZ
      positions[i6 + 3] = startX
      positions[i6 + 4] = startY
      positions[i6 + 5] = startZ

      // Attributs par sommet : aSpeed/aOffset/aRand IDENTIQUES tête+queue -> trait rigide.
      const speed = THREE.MathUtils.randFloat(this.params.speedMin, this.params.speedMax)
      const offset = THREE.MathUtils.randFloat(0, this.params.rainHeight) // désync du recyclage
      const rand = Math.random() // seuil de masque de densité
      const v = i * 2 // index du sommet tête ; queue = v + 1
      speeds[v]  = speed;  speeds[v + 1]  = speed
      offsets[v] = offset; offsets[v + 1] = offset
      alphas[v]  = 1.0;    alphas[v + 1]  = 0.0 // tête opaque -> queue transparente
      isTail[v]  = 0.0;    isTail[v + 1]  = 1.0
      rands[v]   = rand;   rands[v + 1]   = rand
    }

    this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    this.geometry.setAttribute('aSpeed', new THREE.BufferAttribute(speeds, 1))
    this.geometry.setAttribute('aOffset', new THREE.BufferAttribute(offsets, 1))
    this.geometry.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1))
    this.geometry.setAttribute('aIsTail', new THREE.BufferAttribute(isTail, 1))
    this.geometry.setAttribute('aRand', new THREE.BufferAttribute(rands, 1))

    this.uniforms.uFallDistance.value = this.params.rainHeight
  }

  setSubscriptions() {
    // Seule la taille du terrain force une reconstruction (positions dans la boîte).
    // Le vent et la densité passent désormais par des uniforms -> aucune reconstruction.
    this.terrain.on('rebuilt', () => this.build())

    // Météo : démarre une transition (durée fixe) de la densité actuelle vers la cible.
    this.weather.on('change', () => {
      this._densFrom = this.uniforms.uDensityFrac.value
      this._densTo = this.weather.preset.rain / this.maxDensity
      this._densT = 0
    })
  }

  setDebug() {
    const folder = this.debug.ui.addFolder('Pluie')
    // Densité (fraction 0..1) : réglage immédiat (pas de fondu) pour le tuning.
    folder
      .add(this.uniforms.uDensityFrac, 'value', 0, 1, 0.01)
      .name('Densité')
      .onChange((v) => { this._densTo = v; this._densT = 1 }) // fige la transition sur cette valeur
    folder.add(this, 'densityDuration', 0.5, 8, 0.1).name('Durée fondu')
    folder
      .add(this.params, 'windFactor', 0, 20, 0.5)
      .name('Sensibilité au vent')
      .onChange((v) => (this.uniforms.uWindFactor.value = v)) // uniform live, pas de rebuild
  }

  update() {
    // Force du vent : suit la valeur lerpée par Wind (uniform live, aucune reconstruction).
    this.uniforms.uWindStrength.value = this.wind.params.strength

    // Densité : transition à durée fixe avec easing smoothstep (progressive dans les
    // deux sens, contrairement à un lerp exponentiel qui paraissait asymétrique).
    if (this._densT < 1) {
      this._densT = Math.min(1, this._densT + this.time.delta / this.densityDuration)
      const e = this._densT * this._densT * (3 - 2 * this._densT) // smoothstep
      this.uniforms.uDensityFrac.value = this._densFrom + (this._densTo - this._densFrom) * e
    }
    this.lines.visible = this.uniforms.uDensityFrac.value > 1e-4 // tout masqué -> off

    // Anime la chute de la pluie
    this.uniforms.uTime.value = this.time.elapsed
  }
}
