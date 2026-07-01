import * as THREE from 'three'
import Experience from '../Experience.js'

/**
 * ÉCRAN DE CHARGEMENT
 *
 * Pilote la progression réelle en s'abonnant au DefaultLoadingManager de Three
 * (tous les GLTFLoader/TextureLoader/ImageLoader du projet l'utilisent, faute
 * de manager custom). Doit être instancié AVANT le World pour capter tous les
 * chargements dès leur départ.
 *
 * Quand tout est prêt (assets + délai mini) : remplit la barre à 100 %, lance
 * le fondu de l'overlay ET déclenche le plongeon de la caméra.
 */
export default class Loading {
  constructor() {
    this.experience = new Experience()

    this.el = document.querySelector('.loader')
    this.bar = document.querySelector('.loader__bar-fill')
    this.pct = document.querySelector('.loader__pct')

    this.progress = 0
    this.done = false
    this.startTime = performance.now()
    this.minDuration = 1000 // ms : durée mini d'affichage (laisse voir le titre)
    this.finishTimer = null

    this.setManager()

    // Filet de sécurité : si aucun asset async n'est chargé (ou si onLoad ne se
    // déclenche jamais), on termine quand même après un délai max.
    this.fallbackTimer = setTimeout(() => this.finish(), 8000)
  }

  setManager() {
    const manager = THREE.DefaultLoadingManager

    // Un nouveau chargement démarre : annule un finish programmé (la file
    // s'était juste vidée un instant entre deux chargements en cascade).
    manager.onStart = () => {
      if (this.finishTimer) {
        clearTimeout(this.finishTimer)
        this.finishTimer = null
      }
    }

    manager.onProgress = (url, loaded, total) => {
      // Bornée à 90 % : le saut final à 100 % marque la vraie fin.
      const ratio = total > 0 ? loaded / total : 0
      this.setProgress(Math.min(ratio * 0.9, 0.9))
    }

    // La file est vide : probablement fini. On confirme après un court délai
    // (au cas où un chargement en cascade repart -> onStart l'annulera).
    manager.onLoad = () => {
      this.finishTimer = setTimeout(() => this.finish(), 300)
    }
  }

  setProgress(value) {
    this.progress = Math.max(this.progress, value) // monotone : jamais en arrière
    const percent = Math.round(this.progress * 100)
    if (this.bar) this.bar.style.width = `${percent}%`
    if (this.pct) this.pct.textContent = `${percent}%`
  }

  finish() {
    if (this.done) return

    // Respecte la durée mini d'affichage.
    const elapsed = performance.now() - this.startTime
    if (elapsed < this.minDuration) {
      setTimeout(() => this.finish(), this.minDuration - elapsed)
      return
    }

    this.done = true
    clearTimeout(this.fallbackTimer)

    // Barre à 100 %, puis fondu de l'overlay + départ du plongeon en même temps
    // (le mouvement se révèle pendant que l'écran s'efface).
    this.setProgress(1)
    setTimeout(() => {
      if (this.el) this.el.classList.add('loader--hidden')
      this.experience.begin()
      // Retire l'overlay du DOM une fois le fondu terminé.
      setTimeout(() => this.el && this.el.remove(), 1100)
    }, 450)
  }
}
