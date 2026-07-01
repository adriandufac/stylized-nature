import Experience from '../Experience.js'

/**
 * INTERACTABLE — base « survolable + cliquable » (raycasting).
 *
 * JS n'a qu'un seul parent : on combine donc hoverable + clickable dans une même
 * base réutilisable. Un objet qui l'étend fournit un `object3D` (cible du raycast)
 * et surcharge au besoin onHoverStart()/onHoverEnd()/onActivate().
 *
 * L'enregistrement/désenregistrement auprès du gestionnaire partagé `Interaction`
 * est automatique (constructor / destroy).
 */
export default class Interactable {
  constructor({ object3D, hoverable = true, clickable = true }) {
    this.experience = new Experience()

    this.object3D = object3D
    this.hoverable = hoverable
    this.clickable = clickable
    this.enabled = true // le gestionnaire ignore les items désactivés
    this.hovered = false

    // Lien retour depuis le mesh pické vers cet objet logique.
    if (this.object3D) this.object3D.userData.interactable = this

    this.experience.interaction.register(this)
  }

  // --- Appelés par Interaction (ne pas surcharger : surcharger les hooks ci-dessous) ---
  onPointerEnter() {
    if (this.hovered) return
    this.hovered = true
    this.onHoverStart()
  }

  onPointerLeave() {
    if (!this.hovered) return
    this.hovered = false
    this.onHoverEnd()
  }

  onClick() {
    this.onActivate()
  }

  // --- Hooks surchargeables (no-op par défaut) ---
  onHoverStart() {}
  onHoverEnd() {}
  onActivate() {}

  destroy() {
    this.experience.interaction.unregister(this)
    if (this.object3D) this.object3D.userData.interactable = null
  }
}
