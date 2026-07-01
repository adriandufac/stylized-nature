import Experience from '../Experience.js'

/**
 * BARRE DE NAVIGATION (points d'intérêt)
 *
 * Construit une barre de boutons à partir des waypoints de la caméra. Un clic
 * fait voler la caméra vers le cadrage correspondant (Camera.flyToWaypoint).
 *
 * Les waypoints sont référencés par OBJET (pas par index) : la barre reste
 * cohérente quand on ajoute/supprime des POI depuis le debug.
 *
 * Reste cachée jusqu'à la fin du plongeon : Experience.begin() appelle show().
 */
export default class Navigation {
  constructor() {
    this.experience = new Experience()
    this.camera = this.experience.camera

    this.el = document.createElement('div')
    this.el.className = 'nav'
    document.body.appendChild(this.el)

    this.camera.waypoints.forEach((wp) => this.addWaypoint(wp))
  }

  // Crée le bouton d'un waypoint et l'ajoute à la barre.
  addWaypoint(wp) {
    const btn = document.createElement('button')
    btn.className = 'nav__item'
    btn.innerHTML = `<span class="nav__dot"></span><span class="nav__label">${wp.label}</span>`
    btn.addEventListener('click', () => this.camera.flyToWaypoint(wp))
    this.el.appendChild(btn)
    wp.button = btn

    this.setActive(this.camera.activeWaypoint)

    // Un POI ajouté depuis le debug doit être visible immédiatement pour le tester.
    this.show()
  }

  // Retire le bouton d'un waypoint supprimé.
  removeWaypoint(wp) {
    if (wp.button) wp.button.remove()
    wp.button = null
  }

  // Met en surbrillance le waypoint actif (appelé aussi bien par le clic UI que
  // par le "Aller ici" du GUI, via Camera.flyToWaypoint).
  setActive(active) {
    this.camera.waypoints.forEach((wp) => {
      if (wp.button) wp.button.classList.toggle('is-active', wp === active)
    })
  }

  show() {
    this.el.classList.add('nav--visible')
  }
}
