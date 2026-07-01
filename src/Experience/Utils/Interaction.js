import * as THREE from 'three'
import Experience from '../Experience.js'

/**
 * INTERACTION — picking souris PARTAGÉ pour toute l'app (le premier vrai raycaster
 * de picking : Tree/Bush ne l'utilisent que verticalement pour la hauteur du sol).
 *
 * Un seul THREE.Raycaster + un suivi du pointeur, et un registre d'objets
 * `Interactable`. Chaque frame (appelé par Experience.update APRÈS world.update,
 * pour raycaster sur des positions à jour) :
 *   - met à jour le survol (onPointerEnter / onPointerLeave) et le curseur,
 *   - déclenche onClick sur l'item survolé quand un vrai clic (pas un drag) a eu lieu.
 *
 * Réutilisable : n'importe quel objet qui étend `Interactable` s'enregistre ici.
 */
export default class Interaction {
  constructor() {
    this.experience = new Experience()
    this.canvas = this.experience.canvas
    this.sizes = this.experience.sizes
    this.camera = this.experience.camera

    this.raycaster = new THREE.Raycaster()
    // Les lucioles sont des Sprites : leur seuil de picking se règle ici.
    this.raycaster.params.Sprite = { threshold: 0 }

    this.pointer = new THREE.Vector2() // coordonnées NDC (-1..1)
    this.pointerInside = false // le pointeur est-il au-dessus du canvas ?
    this.items = [] // registre d'Interactable
    this.hovered = null // Interactable actuellement survolé
    this.enabled = true

    this._savedCursor = '' // curseur d'origine, restauré en sortie de survol
    this._targets = [] // scratch : object3D à tester (rempli chaque frame)

    // Détection clic vs drag caméra : on ne "clique" que si le pointeur a peu bougé.
    this._downPos = { x: 0, y: 0 }
    this._downValid = false
    this._pendingClick = false
    this.clickThreshold = 5 // px de tolérance entre down et up

    this.setPointerEvents()
  }

  register(item) {
    if (!this.items.includes(item)) this.items.push(item)
  }

  unregister(item) {
    const i = this.items.indexOf(item)
    if (i !== -1) this.items.splice(i, 1)
    if (this.hovered === item) this.hovered = null
  }

  // NDC à partir de la position écran (mêmes bornes que setFromCamera attend).
  updatePointer(e) {
    this.pointer.x = (e.clientX / this.sizes.width) * 2 - 1
    this.pointer.y = -(e.clientY / this.sizes.height) * 2 + 1
  }

  setPointerEvents() {
    const el = this.canvas

    el.addEventListener('pointermove', (e) => {
      this.updatePointer(e)
      this.pointerInside = true
    })

    el.addEventListener('pointerdown', (e) => {
      this._downPos.x = e.clientX
      this._downPos.y = e.clientY
      this._downValid = true
    })

    // Un up proche du down = vrai clic (le drag de vue de la caméra est ignoré).
    el.addEventListener('pointerup', (e) => {
      if (!this._downValid) return
      this._downValid = false
      const dx = e.clientX - this._downPos.x
      const dy = e.clientY - this._downPos.y
      if (Math.hypot(dx, dy) <= this.clickThreshold) this._pendingClick = true
    })

    el.addEventListener('pointerleave', () => {
      this.pointerInside = false
      this._downValid = false
    })
  }

  // Applique/restaure le curseur "pointer" sans piétiner le grab/grabbing de la caméra.
  setCursorHovering(hovering) {
    if (hovering) {
      if (this.canvas.style.cursor !== 'pointer') {
        this._savedCursor = this.canvas.style.cursor
        this.canvas.style.cursor = 'pointer'
      }
    } else if (this.canvas.style.cursor === 'pointer') {
      this.canvas.style.cursor = this._savedCursor
    }
  }

  update() {
    if (!this.enabled) return

    // Cible de raycast : items activés et survolables uniquement.
    this._targets.length = 0
    for (const item of this.items) {
      if (item.enabled && item.hoverable && item.object3D) {
        this._targets.push(item.object3D)
      }
    }

    let next = null
    if (this.pointerInside && this._targets.length) {
      this.raycaster.setFromCamera(this.pointer, this.camera.instance)
      const hits = this.raycaster.intersectObjects(this._targets, false)
      if (hits.length) next = hits[0].object.userData.interactable || null
    }

    // Transition de survol.
    if (next !== this.hovered) {
      if (this.hovered) this.hovered.onPointerLeave()
      this.hovered = next
      if (this.hovered) this.hovered.onPointerEnter()
      this.setCursorHovering(!!this.hovered)
    }

    // Clic validé au-dessus d'un item cliquable -> activation.
    if (this._pendingClick) {
      this._pendingClick = false
      if (this.hovered && this.hovered.clickable) this.hovered.onClick()
    }
  }
}
