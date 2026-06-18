import * as THREE from 'three'
import { MeshSurfaceSampler } from 'three/addons/math/MeshSurfaceSampler.js'
import WorldComponent from './WorldComponent.js'

import grassVertexShader from '../../shaders/grass/vertex.glsl'
import grassFragmentShader from '../../shaders/grass/fragment.glsl'

// Masque de courbure (base=0 -> pointe=1), constant quelle que soit la taille du brin.
const windBladePower = new Float32Array([
  0, 0, 0,  0, 0, 0,             // base    -> 0 (fixe)
  0.5, 0.5, 0.5,  0.5, 0.5, 0.5, // milieu  -> 0.5
  1, 1, 1,                       // pointe  -> 1 (bouge le plus)
])

export default class Grass extends WorldComponent {
  constructor(terrain, wind, environment) {
    super()

    this.terrain = terrain
    this.wind = wind
    this.environment = environment

    this.params = {
      BLADE_W: 0.1,
      BLADE_H: 0.5,
      count: 80000,
    }

    // Objet "fantôme" qui sert à calculer une matrice de transformation par brin.
    this.dummy = new THREE.Object3D()
    this.samplePos = new THREE.Vector3()
    this.instancedMesh = null

    this.bladeGeometry = this.buildBladeGeometry()
    this.setMaterial()
    this.build()
    this.setSubscriptions()
    this.setDebug()
  }

  // Construit la géométrie d'un brin à partir de params.BLADE_W / BLADE_H.
  buildBladeGeometry() {
    const w = this.params.BLADE_W
    const h = this.params.BLADE_H

    const geometry = new THREE.BufferGeometry()

    const vertices = new Float32Array([
      -w / 2, 0,     0, // 0 base gauche
       w / 2, 0,     0, // 1 base droite
      -w / 4, h / 2, 0, // 2 milieu gauche
       w / 4, h / 2, 0, // 3 milieu droit
       0,     h,     0, // 4 pointe
    ])

    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3))
    geometry.setIndex([0, 1, 2,  1, 3, 2,  2, 3, 4])
    geometry.computeVertexNormals()
    geometry.setAttribute('color', new THREE.BufferAttribute(windBladePower, 3))

    return geometry
  }

  setMaterial() {
    this.uniforms = {
      uTime: { value: 0 },
      uWindStrength: { value: this.wind.params.strength },
      uWindDirection: { value: this.wind.direction }, // même objet que Wind.direction : maj live
      uBladeHeight: { value: this.params.BLADE_H },   // hauteur locale du brin : sert à calculer la pente du vent pour la normale
      uBaseColor: { value: new THREE.Color('#3f706a') }, // vert foncé à la base
      uTipColor: { value: new THREE.Color('#a6d6cc') },  // vert clair à la pointe
      uSunDirection: { value: this.environment.sunDirection }, // partagé (réf) : muté en place par updateSun
      uAmbientLight: { value: this.environment.ambientIntensity },
    }

    this.material = new THREE.ShaderMaterial({
      vertexShader: grassVertexShader,
      fragmentShader: grassFragmentShader,
      uniforms: this.uniforms,
      side: THREE.DoubleSide,
    })
  }

  // (Re)construit l'InstancedMesh d'herbe avec params.count brins.
  // L'InstancedMesh ayant un count figé, on en recrée un à chaque changement.
  build() {
    if (this.instancedMesh) {
      this.scene.remove(this.instancedMesh)
      this.instancedMesh.dispose() // libère les buffers d'instances côté GPU
    }

    // Sampler reconstruit à chaque appel : il fige un instantané de la géométrie,
    // donc il doit refléter le terrain courant (taille/relief modifiés).
    const sampler = new MeshSurfaceSampler(this.terrain.mesh).build()

    this.instancedMesh = new THREE.InstancedMesh(this.bladeGeometry, this.material, this.params.count)

    for (let i = 0; i < this.params.count; i++) {
      // 1. On pioche un point à la surface du terrain (suit les collines)
      sampler.sample(this.samplePos)

      // 2. On y place le brin, base au sol
      this.dummy.position.copy(this.samplePos)

      // 3. Rotation aléatoire autour de Y : les brins ne sont pas tous alignés
      this.dummy.rotation.y = Math.random() * Math.PI * 2

      // 4. Échelle aléatoire : un peu de variété de taille (évite l'effet "pelouse tondue")
      const s = 0.8 + Math.random() * 0.6
      this.dummy.scale.set(s, s + Math.random() * 0.4, s)

      // 5. On fige la matrice et on l'assigne à l'instance i
      this.dummy.updateMatrix()
      this.instancedMesh.setMatrixAt(i, this.dummy.matrix)
    }

    this.instancedMesh.instanceMatrix.needsUpdate = true // important : prévenir le GPU
    this.scene.add(this.instancedMesh)
  }

  // Reconstruit la géométrie du brin (largeur/hauteur) et la branche sur l'herbe
  // Utilisé dans le GUI pour modifier params.BLADE_W / params.BLADE_H en live.
  rebuildBlades() {
    const old = this.bladeGeometry
    this.bladeGeometry = this.buildBladeGeometry()
    if (this.instancedMesh) this.instancedMesh.geometry = this.bladeGeometry
    this.uniforms.uBladeHeight.value = this.params.BLADE_H // la pente du vent dépend de la hauteur du brin
    old.dispose() // libère l'ancienne géométrie côté GPU
  }

  setSubscriptions() {
    // Terrain reconstruit (taille/subdivisions) ou relief modifié (octaves/seed) : se replacer
    this.terrain.on('rebuilt', () => this.build())
    this.terrain.on('resampled', () => this.build())

    // Vent : la direction est partagée par référence, seule la force passe par l'uniform
    this.wind.on('change', () => {
      this.uniforms.uWindStrength.value = this.wind.params.strength
    })
  }

  setDebug() {
    const folder = this.debug.ui.addFolder('Herbe')
    folder.add(this.params, 'count', 1000, 300000, 1000).name('Nombre de brins').onFinishChange(() => this.build())
    folder.add(this.params, 'BLADE_W', 0.01, 0.5, 0.01).name('Largeur brin').onChange(() => this.rebuildBlades())
    folder.add(this.params, 'BLADE_H', 0.1, 3, 0.05).name('Hauteur brin').onChange(() => this.rebuildBlades())
    folder.addColor({ base: '#1f5c2e' }, 'base').name('Couleur base').onChange((v) => this.uniforms.uBaseColor.value.set(v))
    folder.addColor({ tip: '#8fd152' }, 'tip').name('Couleur pointe').onChange((v) => this.uniforms.uTipColor.value.set(v))
  }

  update() {
    // Anime le balancement du vent
    this.uniforms.uTime.value = this.time.elapsed
  }
}
