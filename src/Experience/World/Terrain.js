import * as THREE from 'three'
import { createNoise2D } from 'simplex-noise'
import alea from 'alea'
import WorldComponent from './WorldComponent.js'

export default class Terrain extends WorldComponent {
  constructor() {
    super()

    this.params = {
      seed: 'w4spyxbk',
      size: 32,
      segments: 64,
      octaves: [
        { frequency: 0.091, amplitude: 0.65 }, // grandes collines
        { frequency: 0.067, amplitude: 0.6 },  // bosses moyennes
        { frequency: 0.018, amplitude: 0.3 },  // petits détails
      ],
    }

    this.regenerateNoise()
    this.setMesh()
    this.applyHeights()
    this.setDebug()
  }

  // (Re)crée le champ de bruit à partir du seed courant.
  // Toujours via alea => même seed = même terrain, reproductible.
  regenerateNoise() {
    this.noise2D = createNoise2D(alea(this.params.seed))
  }

  createGeometry() {
    const geometry = new THREE.PlaneGeometry(
      this.params.size,
      this.params.size,
      this.params.segments,
      this.params.segments,
    )
    geometry.rotateX(-Math.PI / 2)
    return geometry
  }

  setMesh() {
    this.geometry = this.createGeometry()
    this.material = new THREE.MeshStandardMaterial({
      color: '#3a7d44',
      flatShading: true,
    })
    this.mesh = new THREE.Mesh(this.geometry, this.material)
    this.scene.add(this.mesh)
  }

  // Applique le relief de bruit sur la géométrie existante
  applyHeights() {
    const pos = this.geometry.attributes.position
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const z = pos.getZ(i)

      // On combine plusieurs "octaves" de bruit pour du relief riche
      let height = 0
      for (const octave of this.params.octaves) {
        height += this.noise2D(x * octave.frequency, z * octave.frequency) * octave.amplitude
      }

      pos.setY(i, height)
    }

    pos.needsUpdate = true
    this.geometry.computeVertexNormals() // ESSENTIEL pour que la lumière soit correcte
  }

  // Reconstruit la géométrie quand size/segments changent, puis applique le relief.
  // Émet 'rebuilt' : l'herbe doit se replacer ET la boîte de pluie dépend de la taille.
  rebuild() {
    this.geometry.dispose()
    this.geometry = this.createGeometry()
    this.mesh.geometry = this.geometry
    this.applyHeights()
    this.trigger('rebuilt')
  }

  // Reconstruit le bruit depuis le seed courant, puis le relief.
  // Émet 'resampled' : seule l'herbe se replace (la pluie ne dépend pas du relief).
  applySeed() {
    this.regenerateNoise()
    this.applyHeights()
    this.trigger('resampled')
  }

  setDebug() {
    const folder = this.debug.ui.addFolder('Terrain')

    const meshFolder = folder.addFolder('Maillage').close()
    meshFolder.add(this.params, 'size', 10, 200, 1).name('Taille').onFinishChange(() => this.rebuild())
    meshFolder.add(this.params, 'segments', 16, 512, 1).name('Subdivisions').onFinishChange(() => this.rebuild())

    this.params.octaves.forEach((octave, i) => {
      const octaveFolder = folder.addFolder(`Octave ${i + 1}`).close()
      // onChange : terrain déformé en live ; onFinishChange : l'herbe se replace au relâchement
      octaveFolder.add(octave, 'frequency', 0.001, 1, 0.001).name('Fréquence')
        .onChange(() => this.applyHeights())
        .onFinishChange(() => this.trigger('resampled'))
      octaveFolder.add(octave, 'amplitude', 0, 10, 0.05).name('Amplitude')
        .onChange(() => this.applyHeights())
        .onFinishChange(() => this.trigger('resampled'))
    })

    // --- Seed du terrain (reproductible via alea) ---

    // Champ texte éditable : tape un seed précis pour retrouver un terrain donné.
    const seedCtrl = folder.add(this.params, 'seed').name('Seed').onFinishChange(() => this.applySeed())

    // Nouveau seed aléatoire MAIS reproductible : on stocke la chaîne et on l'affiche.
    folder.add({ newSeed: () => {
      this.params.seed = Math.random().toString(36).slice(2, 10)
      seedCtrl.updateDisplay() // sinon le champ garde l'ancienne valeur affichée
      this.applySeed()
    } }, 'newSeed').name('🎲 Nouveau seed')

    // Copie le seed courant dans le presse-papier.
    folder.add({ copySeed: () => {
      navigator.clipboard.writeText(this.params.seed)
        .then(() => console.log('Seed copié :', this.params.seed))
        .catch((e) => console.warn('Copie impossible :', e))
    } }, 'copySeed').name('📋 Copier le seed')
  }
}
