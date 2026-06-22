import * as THREE from 'three'
import WorldComponent from './WorldComponent.js'

import bushVertexShader from '../../shaders/bush/vertex.glsl'
import bushFragmentShader from '../../shaders/bush/fragment.glsl'

/**
 * BUSH — buissons placés À LA MAIN (pas de dispersion aléatoire comme l'herbe).
 * Chaque buisson = un amas de quads texturés (carte de feuillage), regroupés en
 * UN SEUL InstancedMesh pour un coût de rendu minimal (un seul draw call).
 *
 * Étape actuelle (placement) : MeshBasicMaterial + alphaTest, SANS shader custom.
 * But : valider que les touffes apparaissent au bon endroit, posées sur le relief.
 * Le billboard / l'éclairage / le vent viendront avec le ShaderMaterial à l'étape suivante.
 */
export default class Bush extends WorldComponent {
  constructor(terrain, wind, environment) {
    super()

    this.terrain = terrain
    this.wind = wind
    this.environment = environment

    // Buissons placés à la main. Chaque buisson définit TOUS ses paramètres :
    //   x, z   : position monde (le y est calculé par raycast sur le terrain)
    //   quads  : nb de cartes de feuillage
    //   radius : rayon de l'amas autour du centre
    //   size   : taille d'une carte
    this.bushes = [
      { x: 4,  z: -2, quads: 10, radius: 0.7, size: 1.3, color: '#7f5db1' },
      { x: -6, z: 3,  quads: 50, radius: 1.0, size: 1.0, color: '#c98bb0' },
      { x: 8,  z: 6,  quads: 4,  radius: 0.7, size: 1.9, color: '#88a8d4' },
      { x: -3, z: -7, quads: 10, radius: 0.7, size: 1.3, color: '#e0a3ab' },
      { x: 0,  z: 0,  quads: 14, radius: 0.7, size: 1.3, color: '#7fae9e' },
    ]

    // Outils réutilisés (évite d'allouer à chaque quad)
    this.dummy = new THREE.Object3D()
    this.dir = new THREE.Vector3()
    this._color = new THREE.Color() // scratch pour convertir bush.color en rgb
    this.raycaster = new THREE.Raycaster()
    this.instancedMesh = null

    // Les cartes de feuillage : chaque quad en piochera UNE au hasard (voir build()).
    // Elles sont empilées dans une seule texture array (sampler2DArray) -> 1 seul draw call.
    // ⚠️ toutes doivent avoir la MÊME taille (idéalement carré, puissance de 2 : 1024x1024).
    this.leafUrls = [
      '/textures/leaftest.png',
      '/textures/leaftest2.png',
      '/textures/leaftest3.png',
      '/textures/leaftest4.png',
    ]
    this.textureArray = null // rempli par loadTextures() (chargement asynchrone)

    this.bladeGeometry = new THREE.PlaneGeometry(1, 1) // UV déjà en [0,1]
    this.setMaterial()
    this.loadTextures() // charge le tableau de textures PUIS appelle build()
    this.setSubscriptions()
    this.setDebug()
  }

  setMaterial() {
    // alphaTest (discard) plutôt que transparence : le rendu reste OPAQUE,
    // donc pas de tri à gérer, le depth buffer fait le travail.
    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,   // requis pour sampler2DArray dans le fragment shader
      vertexShader: bushVertexShader,
      fragmentShader: bushFragmentShader,
      side: THREE.DoubleSide,   // quads visibles des deux côtés
      transparent: false,       // IMPORTANT : on utilise alphaTest (discard), PAS la transparence
      depthWrite: true,         // du coup on garde le depth write (tri correct, pas de halo)
      uniforms: {
        uSunDirection: { value: this.environment.sunDirection },
        uAmbientLight: { value: this.environment.ambientIntensity },
        uLeafTexture: { value: null }, // tableau de cartes de feuillage (rempli par loadTextures)
      },
    })
  }

  // Charge les N PNG, les empile dans UNE DataArrayTexture (sampler2DArray),
  // puis (re)construit le mesh. Chargement asynchrone -> build() appelé dans le callback.
  loadTextures() {
    const loader = new THREE.ImageLoader()
    const images = new Array(this.leafUrls.length)
    let loaded = 0
    this.leafUrls.forEach((url, i) => {
      loader.load(url, (img) => {
        images[i] = img
        if (++loaded === this.leafUrls.length) this.buildTextureArray(images)
      })
    })
  }

  buildTextureArray(images) {
    const w = images[0].width
    const h = images[0].height
    const depth = images.length

    // On dessine chaque image dans un canvas pour récupérer ses pixels RGBA bruts.
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')

    const data = new Uint8Array(w * h * 4 * depth)
    for (let i = 0; i < depth; i++) {
      ctx.clearRect(0, 0, w, h)
      ctx.drawImage(images[i], 0, 0, w, h) // force la même taille pour toutes
      const pixels = ctx.getImageData(0, 0, w, h).data
      data.set(pixels, i * w * h * 4) // empile la couche i
    }

    const tex = new THREE.DataArrayTexture(data, w, h, depth)
    tex.format = THREE.RGBAFormat
    tex.colorSpace = THREE.SRGBColorSpace // utilisée comme couleur
    tex.minFilter = THREE.LinearMipmapLinearFilter
    tex.magFilter = THREE.LinearFilter
    tex.generateMipmaps = true
    tex.needsUpdate = true

    this.textureArray = tex
    this.material.uniforms.uLeafTexture.value = tex
    this.build()
  }

  // Renvoie la hauteur du terrain (y) à la position (x, z) via un rayon vers le bas.
  groundHeightAt(x, z) {
    this.raycaster.set(new THREE.Vector3(x, 1000, z), new THREE.Vector3(0, -1, 0))
    const hit = this.raycaster.intersectObject(this.terrain.mesh)[0]
    return hit ? hit.point.y : 0
  }

  // (Re)construit l'InstancedMesh de tous les quads de tous les buissons.
  build() {
    if (this.instancedMesh) {
      this.scene.remove(this.instancedMesh)
      this.instancedMesh.dispose()
    }

    // Total = somme des quads de chaque buisson.
    const total = this.bushes.reduce((sum, b) => sum + b.quads, 0)
    this.instancedMesh = new THREE.InstancedMesh(this.bladeGeometry, this.material, total)

    this.sphericalNormals = new Float32Array(total * 3) // normales sphériques pour chaque quad
    this.instanceColors = new Float32Array(total * 3)   // couleur par quad (héritée du buisson)
    this.textureIndices = new Float32Array(total)       // index de la carte de feuillage (0..N-1) par quad

    let i = 0
    for (const bush of this.bushes) {
      const groundY = this.groundHeightAt(bush.x, bush.z)

      for (let q = 0; q < bush.quads; q++) {
        // Direction aléatoire dans une DEMI-sphère (y >= 0) : pas de quad sous terre.
        const angle = Math.random() * Math.PI * 2
        const yv = Math.random()                 // 0..1
        const ring = Math.sqrt(1 - yv * yv)      // rayon du cercle à cette hauteur
        this.dir.set(Math.cos(angle) * ring * 1.2, yv * 0.8, Math.sin(angle) * ring * 1.2)

        // Position du quad = centre au sol + offset dans l'amas, relevé pour poser la base.
        this.dummy.position.set(bush.x, groundY, bush.z)
          .addScaledVector(this.dir, bush.radius * (0.4 + 0.6 * Math.random()))
        this.dummy.position.y += bush.size * 0.5

        this.dummy.rotation.set(0, Math.random() * Math.PI * 2, 0) // yaw aléatoire
        const s = bush.size * (0.7 + 0.5 * Math.random())
        this.dummy.scale.set(s, s, s)

        
        this.dummy.updateMatrix();
        // spericalNormals pour simuler une sphere et effet fluffy
        this.sphericalNormals[i * 3]     = this.dir.x
        this.sphericalNormals[i * 3 + 1] = this.dir.y
        this.sphericalNormals[i * 3 + 2] = this.dir.z
        // chaque quad pioche une carte de feuillage au hasard
        this.textureIndices[i] = Math.floor(Math.random() * this.leafUrls.length)
        this.instancedMesh.setMatrixAt(i++, this.dummy.matrix)
      }
    }

    this.fillInstanceColors()
    this.bladeGeometry.setAttribute('aSphericalNormal', new THREE.InstancedBufferAttribute(this.sphericalNormals, 3))
    this.bladeGeometry.setAttribute('aColor', new THREE.InstancedBufferAttribute(this.instanceColors, 3))
    this.bladeGeometry.setAttribute('aTextureIndex', new THREE.InstancedBufferAttribute(this.textureIndices, 1))
    this.instancedMesh.instanceMatrix.needsUpdate = true
    this.scene.add(this.instancedMesh)
  }

  // Remplit le tableau des couleurs d'instance : chaque quad prend la couleur de son buisson.
  // THREE.Color convertit le hex (sRGB) en rgb linéaire ; le shader réencode en sortie.
  fillInstanceColors() {
    let i = 0
    for (const bush of this.bushes) {
      this._color.set(bush.color)
      const r = this._color.r, g = this._color.g, b = this._color.b
      for (let q = 0; q < bush.quads; q++) {
        this.instanceColors[i * 3]     = r
        this.instanceColors[i * 3 + 1] = g
        this.instanceColors[i * 3 + 2] = b
        i++
      }
    }
  }

  // Met à jour les couleurs SANS tout reconstruire : on réécrit juste l'attribut aColor.
  updateColors() {
    this.fillInstanceColors()
    this.bladeGeometry.getAttribute('aColor').needsUpdate = true
  }

  setSubscriptions() {
    // Le terrain change de taille/relief -> les hauteurs au sol changent, on replace.
    this.terrain.on('rebuilt', () => this.build())
    this.terrain.on('resampled', () => this.build())
  }

  setDebug() {
    const folder = this.debug.ui.addFolder('Buissons')
    // Un sous-dossier par buisson : on règle chacun indépendamment.
    this.bushes.forEach((bush, i) => {
      const sub = folder.addFolder(`Buisson ${i + 1}`).close()
      sub.add(bush, 'x', -16, 16, 0.5).name('Position X').onFinishChange(() => this.build())
      sub.add(bush, 'z', -16, 16, 0.5).name('Position Z').onFinishChange(() => this.build())
      sub.add(bush, 'quads', 1, 30, 1).name('Quads').onFinishChange(() => this.build())
      sub.add(bush, 'radius', 0.1, 3, 0.05).name('Rayon amas').onFinishChange(() => this.build())
      sub.add(bush, 'size', 0.3, 4, 0.05).name('Taille carte').onFinishChange(() => this.build())
      sub.addColor(bush, 'color').name('Couleur').onChange(() => this.updateColors())
    })
  }
}
