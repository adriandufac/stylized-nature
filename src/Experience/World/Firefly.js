import * as THREE from 'three'
import Interactable from '../Utils/Interactable.js'

/**
 * FIREFLY — une luciole : point lumineux additif (cœur + halo) qui flotte,
 * clignote, apparaît en fondu la nuit, et réagit à la souris (survol = contour
 * lumineux + curseur cliquable ; clic = nouvelle couleur aléatoire).
 *
 * `extends Interactable` : le survol/clic passent par le raycaster partagé
 * (Interaction). La cible de picking est le halo (plus large -> facile à viser).
 */
export default class Firefly extends Interactable {
  constructor({ x, z, groundY, glowTexture, palette, params, onColorChange }) {
    // Couleur de départ tirée dans la palette (avant super : JS interdit `this` avant).
    const color = palette[(Math.random() * palette.length) | 0]

    // Cœur : petit sprite vif, additif (la lueur vient du AdditiveBlending, pas de bloom).
    const coreMat = new THREE.SpriteMaterial({
      map: glowTexture,
      color: new THREE.Color(color),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0,
      fog: false,
    })
    const core = new THREE.Sprite(coreMat)

    // Halo : sprite plus large, opacité faible -> lueur diffuse. Sert aussi de cible
    // de raycast (surface confortable à survoler/cliquer).
    const haloMat = new THREE.SpriteMaterial({
      map: glowTexture,
      color: new THREE.Color(color),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0,
      fog: false,
    })
    const halo = new THREE.Sprite(haloMat)

    super({ object3D: halo, hoverable: true, clickable: true })

    this.params = params
    this.palette = palette
    this.color = color
    this.onColorChange = onColorChange // notifie le gestionnaire (détection "toutes pareilles")
    this.core = core
    this.coreMat = coreMat
    this.halo = halo
    this.haloMat = haloMat

    // Rendu APRÈS l'eau (renderOrder 1, depthWrite:false) : sinon l'eau transparente,
    // dessinée par-dessus, estompe les lucioles quand elle est en arrière-plan.
    this.halo.renderOrder = 2
    this.core.renderOrder = 3

    // Groupe déplacé chaque frame (halo derrière le cœur).
    this.group = new THREE.Group()
    this.group.add(this.halo)
    this.group.add(this.core)
    this.group.visible = false

    // Position de base sur le terrain + paramètres d'animation aléatoires par luciole.
    this.basePos = new THREE.Vector3(x, groundY, z)
    this.heightFactor = Math.random() // position dans la bande [minHeight, maxHeight]
    this.phase = Math.random() * Math.PI * 2
    this.bobSpeed = 0.5 + Math.random() * 0.8 // vitesse d'oscillation verticale
    this.bobAmp = 0.12 + Math.random() * 0.22 // amplitude verticale
    this.driftPhase = Math.random() * Math.PI * 2
    this.driftSpeed = 0.2 + Math.random() * 0.4 // dérive horizontale lente
    this.pulseSpeed = params.pulseSpeed * (0.7 + Math.random() * 0.6) // clignotement
    this.appearThreshold = Math.random() * 0.5 // apparition légèrement échelonnée (toutes bien allumées à mi-nuit)
    this.coreSize = params.coreSize * (0.7 + Math.random() * 0.6)
    this.haloRatio = params.haloSize / params.coreSize

    this.opacity = 0 // opacité courante (lerpée vers la cible)
    this.hoverBoost = 0 // 0..1 lissé : intensité du contour au survol

    this.core.scale.setScalar(this.coreSize)
    this.halo.scale.setScalar(this.coreSize * this.haloRatio)
  }

  update(visibility, elapsed, delta) {
    const p = this.params

    // Flottement : hauteur dans la bande + oscillation, dérive horizontale douce.
    const band = p.minHeight + (p.maxHeight - p.minHeight) * this.heightFactor
    const bob = Math.sin(elapsed * this.bobSpeed + this.phase) * this.bobAmp
    const dx = Math.sin(elapsed * this.driftSpeed + this.driftPhase) * p.driftRadius
    const dz = Math.cos(elapsed * this.driftSpeed * 0.8 + this.driftPhase) * p.driftRadius
    this.group.position.set(this.basePos.x + dx, this.basePos.y + band + bob, this.basePos.z + dz)

    // Clignotement (pulsation de luminosité) : plancher haut -> lucioles bien lumineuses.
    const pulse = 0.7 + 0.3 * Math.sin(elapsed * this.pulseSpeed + this.phase)

    // Apparition progressive : chaque luciole a son seuil -> elles s'allument en cascade.
    const appear = THREE.MathUtils.smoothstep(
      visibility,
      this.appearThreshold,
      this.appearThreshold + 0.15,
    )
    const targetOpacity = appear * pulse
    this.opacity += (targetOpacity - this.opacity) * Math.min(1, delta * 6)

    // Survol lissé (montée/descente douce du contour lumineux).
    const hoverTarget = this.hovered ? 1 : 0
    this.hoverBoost += (hoverTarget - this.hoverBoost) * Math.min(1, delta * 12)

    const visible = this.opacity > 0.01
    this.group.visible = visible
    // Cliquable uniquement une fois suffisamment visible (pas de picking le jour).
    this.enabled = appear > 0.35

    if (visible) {
      // Cœur : plein feu (additif) + un peu plus gros au survol.
      this.coreMat.opacity = Math.min(1, this.opacity)
      this.core.scale.setScalar(this.coreSize * (1 + 0.15 * this.hoverBoost))

      // Halo : lueur soutenue ; le "contour" s'intensifie et grossit au survol.
      this.haloMat.opacity = this.opacity * (0.55 + 0.85 * this.hoverBoost)
      this.halo.scale.setScalar(this.coreSize * this.haloRatio * (1 + 0.7 * this.hoverBoost))

      // Matrices à jour pour un raycast précis (Interaction tourne avant le rendu).
      this.group.updateMatrixWorld()
    }
  }

  // Clic : nouvelle couleur aléatoire, forcément différente de l'actuelle.
  onActivate() {
    let next = this.color
    if (this.palette.length > 1) {
      do {
        next = this.palette[(Math.random() * this.palette.length) | 0]
      } while (next === this.color)
    }
    this.color = next
    this.coreMat.color.set(next)
    this.haloMat.color.set(next)
    if (this.onColorChange) this.onColorChange(this)
  }

  destroy() {
    super.destroy() // se désenregistre du gestionnaire d'interaction
    if (this.group.parent) this.group.parent.remove(this.group)
    this.coreMat.dispose()
    this.haloMat.dispose()
  }
}
