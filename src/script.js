import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { MeshSurfaceSampler } from 'three/addons/math/MeshSurfaceSampler.js';
import GUI from 'lil-gui'
import './style.css'

import grassVertexShader from './shaders/grass/vertex.glsl'
import grassFragmentShader from './shaders/grass/fragment.glsl'

import { createNoise2D } from 'simplex-noise';
import alea from 'alea';

let noise2D; // initialisé depuis terrainParams.seed plus bas (regenerateNoise)

// Canvas
const canvas = document.querySelector('canvas.webgl')

// Scene
const scene = new THREE.Scene()

// Sizes
const sizes = { width: window.innerWidth, height: window.innerHeight }

// Camera
const camera = new THREE.PerspectiveCamera(75, sizes.width / sizes.height, 0.1, 100)
camera.position.set(0, 15, 25)
scene.add(camera)


/** 
 * FLOOR 
 * */

// Paramètres du terrain (modifiables via le GUI)
const terrainParams = {
  seed: 'w4spyxbk',
  size: 32,
  segments: 64  ,
  octaves: [
    { frequency: 0.091, amplitude: 0.65 },   // grandes collines
    { frequency: 0.067, amplitude: 0.6 },   // bosses moyennes
    { frequency: 0.018,  amplitude: 0.3 }, // petits détails
  ],
}

// (Re)crée le champ de bruit à partir du seed courant.
// Toujours via alea => même seed = même terrain, reproductible.
function regenerateNoise() {
  noise2D = createNoise2D(alea(terrainParams.seed));
}
regenerateNoise();

let floorGeometry = new THREE.PlaneGeometry(
  terrainParams.size,
  terrainParams.size,
  terrainParams.segments,
  terrainParams.segments,
)
floorGeometry.rotateX(-Math.PI / 2);

const floorMaterial = new THREE.MeshStandardMaterial({
  color: '#3a7d44',
  flatShading: true,
})
const floor = new THREE.Mesh(floorGeometry, floorMaterial)
scene.add(floor)

// Applique le relief de bruit sur la géométrie existante
function applyTerrainHeights() {
  const pos = floorGeometry.attributes.position
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const z = pos.getZ(i)

    // On combine plusieurs "octaves" de bruit pour du relief riche
    let height = 0
    for (const octave of terrainParams.octaves) {
      height += noise2D(x * octave.frequency, z * octave.frequency) * octave.amplitude
    }

    pos.setY(i, height)
  }

  pos.needsUpdate = true
  floorGeometry.computeVertexNormals() // ESSENTIEL pour que la lumière soit correcte
}

// Reconstruit la géométrie quand size/segments changent, puis applique le relief
function rebuildTerrain() {
  floorGeometry.dispose()
  floorGeometry = new THREE.PlaneGeometry(
    terrainParams.size,
    terrainParams.size,
    terrainParams.segments,
    terrainParams.segments,
  )
  floorGeometry.rotateX(-Math.PI / 2)
  floor.geometry = floorGeometry
  applyTerrainHeights()
  buildGrass() // l'herbe doit se replacer sur le nouveau terrain
}

applyTerrainHeights();




/**
 * GRASS
 */

const grassParams = {
  BLADE_W: 0.1,
  BLADE_H: 0.5,
  count: 80000,
}

// Masque de courbure (base=0 -> pointe=1), constant quelle que soit la taille du brin.
const windBladePower = new Float32Array([
  0, 0, 0,  0, 0, 0,            // base    -> 0 (fixe)
  0.5, 0.5, 0.5,  0.5, 0.5, 0.5, // milieu  -> 0.5
  1, 1, 1,                       // pointe  -> 1 (bouge le plus)
]);

// Construit la géométrie d'un brin à partir de grassParams.BLADE_W / BLADE_H.
function buildBladeGeometry() {
  const w = grassParams.BLADE_W
  const h = grassParams.BLADE_H

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

let bladeGeometry = buildBladeGeometry();

const grassUniforms = {
  uTime: { value: 0 },
  uWindStrength: { value: 0.15 },
  uBladeHeight: { value: grassParams.BLADE_H }, // hauteur locale du brin : sert à calculer la pente du vent pour la normale
  uBaseColor: { value: new THREE.Color('#1f5c2e') }, // vert foncé à la base
  uTipColor: { value: new THREE.Color('#8fd152') },  // vert clair à la pointe
  uSunDirection: new THREE.Uniform(new THREE.Vector3(0, 0, 1)),
}

const grassMaterial = new THREE.ShaderMaterial({
  vertexShader: grassVertexShader,
  fragmentShader: grassFragmentShader,
  uniforms: grassUniforms,
  side: THREE.DoubleSide,
});


// Objet "fantôme" qui sert à calculer une matrice de transformation par brin.
const dummy = new THREE.Object3D();
const samplePos = new THREE.Vector3();

let grass = null;

// (Re)construit l'InstancedMesh d'herbe avec grassParams.count brins.
// L'InstancedMesh ayant un count figé, on en recrée un à chaque changement.
function buildGrass() {
  if (grass) {
    scene.remove(grass);
    grass.dispose(); // libère les buffers d'instances côté GPU
  }

  // Sampler reconstruit à chaque appel : il fige un instantané de la géométrie,
  // donc il doit refléter le terrain courant (taille/relief modifiés).
  const sampler = new MeshSurfaceSampler(floor).build();

  grass = new THREE.InstancedMesh(bladeGeometry, grassMaterial, grassParams.count);

  for (let i = 0; i < grassParams.count; i++) {
    // 1. On pioche un point à la surface du terrain (suit les collines)
    sampler.sample(samplePos);

    // 2. On y place le brin, base au sol
    dummy.position.copy(samplePos);

    // 3. Rotation aléatoire autour de Y : les brins ne sont pas tous alignés
    dummy.rotation.y = Math.random() * Math.PI * 2;

    // 4. Échelle aléatoire : un peu de variété de taille (évite l'effet "pelouse tondue")
    const s = 0.8 + Math.random() * 0.6;
    dummy.scale.set(s, s + Math.random() * 0.4, s);

    // 5. On fige la matrice et on l'assigne à l'instance i
    dummy.updateMatrix();
    grass.setMatrixAt(i, dummy.matrix);
  }

  grass.instanceMatrix.needsUpdate = true; // important : prévenir le GPU
  scene.add(grass);
}

buildGrass();

// Reconstruit la géométrie du brin (largeur/hauteur) et la branche sur l'herbe
// existante. Pas de re-sampling : seul le mesh source change, les instances restent.
function rebuildBlades() {
  const old = bladeGeometry;
  bladeGeometry = buildBladeGeometry();
  if (grass) grass.geometry = bladeGeometry;
  grassUniforms.uBladeHeight.value = grassParams.BLADE_H; // la pente du vent dépend de la hauteur du brin
  old.dispose(); // libère l'ancienne géométrie côté GPU
}


/**
 * SUN
 */

// Paramètres de la trajectoire du soleil (arc incliné)
const sunParams = {
  dayTime: Math.PI * 0.5,   // position SUR l'arc : 0 = lever (horizon Est), PI/2 = midi (point haut), PI = coucher (horizon Ouest), PI..2PI = sous l'horizon
  inclination: 0.6,         // inclinaison du PLAN de l'arc : 0 = passe par le zénith, plus grand = arc penché (culmine plus bas, vers le Sud)
  orientation: 0.0,         // azimut : fait pivoter tout l'arc (l'axe lever→coucher) autour de la verticale
}

const sunDirection = new THREE.Vector3();

// Axes de rotation réutilisés (évite d'allouer un Vector3 à chaque appel)
const SUN_AXIS_X = new THREE.Vector3(1, 0, 0) // axe Est-Ouest : sert à incliner le plan de l'arc
const SUN_AXIS_Y = new THREE.Vector3(0, 1, 0) // axe vertical : sert à orienter l'arc (azimut)

// Debug
const debugSun = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.1, 2),
    new THREE.MeshBasicMaterial()
)
scene.add(debugSun);
// Lights
const ambientLight = new THREE.AmbientLight('#ffffff', 0.0)
scene.add(ambientLight)

const directionalLight = new THREE.DirectionalLight('#ffffff', 1.5)
scene.add(directionalLight)

// Update : recalcule la direction du soleil à partir des 3 paramètres.
const updateSun = () =>
{
  const t = sunParams.dayTime

  // 1. Arc de base dans le plan vertical XY :
  //    t=0 -> (1,0,0) horizon Est | t=PI/2 -> (0,1,0) zénith | t=PI -> (-1,0,0) horizon Ouest
  sunDirection.set(Math.cos(t), Math.sin(t), 0)

  // 2. Inclinaison : on penche le plan de l'arc autour de l'axe Est-Ouest (X).
  //    Les points de lever/coucher (sur l'axe X) restent au sol ; seul le point haut bascule vers +Z (Sud).
  sunDirection.applyAxisAngle(SUN_AXIS_X, sunParams.inclination)

  // 3. Orientation : on fait pivoter l'arc complet autour de la verticale (Y) pour choisir la direction du lever.
  sunDirection.applyAxisAngle(SUN_AXIS_Y, sunParams.orientation)

  sunDirection.normalize();
  directionalLight.position.copy(sunDirection);

  // Debug
  debugSun.position.copy(sunDirection).multiplyScalar(20)

  //Uniforms
  grassUniforms.uSunDirection.value.copy(sunDirection);
}

updateSun();

// Controls
const controls = new OrbitControls(camera, canvas)
controls.enableDamping = true
controls.target.set(0, 0, 0)

// GUI — réglages du terrain
const gui = new GUI({ title: 'Terrain' })

const meshFolder = gui.addFolder('Maillage')
meshFolder.add(terrainParams, 'size', 10, 200, 1).name('Taille').onFinishChange(rebuildTerrain)
meshFolder.add(terrainParams, 'segments', 16, 512, 1).name('Subdivisions').onFinishChange(rebuildTerrain)

terrainParams.octaves.forEach((octave, i) => {
  const folder = gui.addFolder(`Octave ${i + 1}`)
  // onChange : terrain déformé en live ; onFinishChange : l'herbe se replace au relâchement
  folder.add(octave, 'frequency', 0.001, 1, 0.001).name('Fréquence').onChange(applyTerrainHeights).onFinishChange(buildGrass)
  folder.add(octave, 'amplitude', 0, 10, 0.05).name('Amplitude').onChange(applyTerrainHeights).onFinishChange(buildGrass)
})

// GUI — Soleil
const sunFolder = gui.addFolder('Soleil')
sunFolder.add(sunParams, 'dayTime', 0, Math.PI * 2, 0.001).name('Heure (arc)').onChange(updateSun)
sunFolder.add(sunParams, 'inclination', 0, Math.PI * 0.5, 0.001).name('Inclinaison').onChange(updateSun)
sunFolder.add(sunParams, 'orientation', - Math.PI, Math.PI, 0.001).name('Orientation').onChange(updateSun)


// --- Seed du terrain (reproductible via alea) ---

// Reconstruit le bruit depuis le seed courant, puis le terrain et l'herbe.
function applySeed() {
  regenerateNoise()
  applyTerrainHeights()
  buildGrass()
}

// Champ texte éditable : tape un seed précis pour retrouver un terrain donné.
const seedCtrl = gui.add(terrainParams, 'seed').name('Seed').onFinishChange(applySeed)

// Nouveau seed aléatoire MAIS reproductible : on stocke la chaîne et on l'affiche.
gui.add({ newSeed: () => {
  terrainParams.seed = Math.random().toString(36).slice(2, 10)
  seedCtrl.updateDisplay() // sinon le champ garde l'ancienne valeur affichée
  applySeed()
} }, 'newSeed').name('🎲 Nouveau seed')

// Copie le seed courant dans le presse-papier.
gui.add({ copySeed: () => {
  navigator.clipboard.writeText(terrainParams.seed)
    .then(() => console.log('Seed copié :', terrainParams.seed))
    .catch((e) => console.warn('Copie impossible :', e))
} }, 'copySeed').name('📋 Copier le seed')

// GUI — réglages de l'herbe (shader)
const grassFolder = gui.addFolder('Herbe')
grassFolder.add(grassParams, 'count', 1000, 300000, 1000).name('Nombre de brins').onFinishChange(buildGrass)
grassFolder.add(grassParams, 'BLADE_W', 0.01, 0.5, 0.01).name('Largeur brin').onChange(rebuildBlades)
grassFolder.add(grassParams, 'BLADE_H', 0.1, 3, 0.05).name('Hauteur brin').onChange(rebuildBlades)
grassFolder.add(grassUniforms.uWindStrength, 'value', 0, 1, 0.01).name('Force du vent')
grassFolder.addColor({ base: '#1f5c2e' }, 'base').name('Couleur base').onChange((v) => grassUniforms.uBaseColor.value.set(v))
grassFolder.addColor({ tip: '#8fd152' }, 'tip').name('Couleur pointe').onChange((v) => grassUniforms.uTipColor.value.set(v))

// Renderer
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
renderer.setSize(sizes.width, sizes.height)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

// Resize
window.addEventListener('resize', () => {
  sizes.width = window.innerWidth
  sizes.height = window.innerHeight

  camera.aspect = sizes.width / sizes.height
  camera.updateProjectionMatrix()

  renderer.setSize(sizes.width, sizes.height)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
})

// Animation loop
const clock = new THREE.Clock()

const tick = () => {
  const elapsedTime = clock.getElapsedTime()

  // Anime le vent de l'herbe
  grassUniforms.uTime.value = elapsedTime

  // Update controls (requis pour le damping)
  controls.update()

  renderer.render(scene, camera)
  window.requestAnimationFrame(tick)
}

tick()
