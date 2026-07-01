import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import Experience from './Experience.js'

// Easing doux (accélère puis décélère) pour le plongeon et les vols.
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

export default class Camera {
  constructor() {
    this.experience = new Experience()
    this.sizes = this.experience.sizes
    this.scene = this.experience.scene
    this.canvas = this.experience.canvas
    this.time = this.experience.time
    this.debug = this.experience.debug

    // Le déplacement n'est plus laissé libre à l'utilisateur : la caméra est
    // pilotée par des tweens ('intro' = plongeon, 'flying' = vol vers un POI,
    // 'idle' = immobile sur le dernier cadrage).
    this.state = 'idle'
    this.tween = null
    this.target = new THREE.Vector3(0, 1, 0) // point actuellement regardé
    // true seulement une fois posé sur un POI (après le plongeon) : garde la
    // caméra figée sur sa position de départ tant que l'intro n'a pas eu lieu,
    // et autorise le "nudge" au drag.
    this.hasSettled = false

    // Mode debug OrbitControls : activable via ?orbit OU le toggle du GUI.
    this.orbitEnabled = new URLSearchParams(location.search).has('orbit')

    // "Nudge" : petit décalage de vue au clic-drag autour du POI, avec
    // résistance (courbe tanh) et retour élastique au relâchement.
    this.dragging = false
    this.dragStart = { x: 0, y: 0 }
    this.nudge = { yaw: 0, pitch: 0 } // décalage angulaire courant (rad)
    this.nudgeTarget = { yaw: 0, pitch: 0 } // décalage visé (0 = revenu au point)
    this.nudgeParams = {
      maxYaw: 0.18, // amplitude horizontale max (rad, ~10°)
      maxPitch: 0.12, // amplitude verticale max (rad)
      sensitivity: 0.005, // px -> saturation tanh (plus petit = plus de course)
      spring: 8, // vitesse du ressort (suivi + retour)
    }
    this._sph = new THREE.Spherical() // scratch (évite les allocations/frame)
    this._v = new THREE.Vector3()

    this.setWaypoints()
    this.activeWaypoint = this.waypoints[0]
    this.setInstance()
    this.setControls()
    this.setPointer()
    this.setDebug()
  }

  // Points d'intérêt : chaque entrée est un cadrage caméra (position + point
  // regardé). Valeurs de départ raisonnables, à affiner / compléter via le GUI.
  setWaypoints() {
    this.waypoints = [
      {id:'overview', label:"Vue d'ensemble", pos:new THREE.Vector3(16.20882932321049,11.51622166628347,15.882438712267692), target:new THREE.Vector3(0,1,0)},
      {id:'river', label:"Rivière", pos:new THREE.Vector3(-2.637794371842698,0.5007052573516788,11.193091488848294), target:new THREE.Vector3(0,1,0)},
      {id:'lake', label:"Lac", pos:new THREE.Vector3(-9.683702981204801,7.228439006706954,-19.187319339458732), target:new THREE.Vector3(0,1,0)},
      {id:'bushes', label:"Buissons", pos:new THREE.Vector3(14.908339199698602,1.7059390208201872,12.585056853233777), target:new THREE.Vector3(0,1,0)},
      {id:'big_oak', label:"Vieux Chêne", pos:new THREE.Vector3(16.699852136748298,2.7085827748315414,-7.025902662510952), target:new THREE.Vector3(0,1,0)},
      {id:'small_oak', label:"Petit Chêne", pos:new THREE.Vector3(-11.93679465658688,1.6212688004805866,15.906369109137419), target:new THREE.Vector3(0,1,0)},
      /* { id: 'overview', label: "Vue d'ensemble", pos: new THREE.Vector3(0, 16, 28), target: new THREE.Vector3(0, 1, 0) },
      { id: 'hills', label: 'Collines', pos: new THREE.Vector3(-14, 7, 14), target: new THREE.Vector3(-4, 1, 2) },
      { id: 'lake', label: 'Lac', pos: new THREE.Vector3(12, 6, 14), target: new THREE.Vector3(2, 0, 2) },
      { id: 'waterfall', label: 'Cascade', pos: new THREE.Vector3(4, 9, -2), target: new THREE.Vector3(-2, 2, -12) }, */
    ]
  }

  setInstance() {
    this.instance = new THREE.PerspectiveCamera(75, this.sizes.width / this.sizes.height, 0.1, 200)
    // Position de départ du plongeon : haut et loin. La caméra y reste figée
    // (cachée derrière l'overlay de chargement) jusqu'à l'appel de startIntro().
    this.instance.position.set(0, 50, 82)
    this.target.copy(this.waypoints[0].target)
    this.instance.lookAt(this.target)
    this.scene.add(this.instance)
  }

  // OrbitControls toujours instancié, mais désactivé tant que orbitEnabled est
  // faux (ses handlers ignorent alors les événements). Sert au debug.
  setControls() {
    this.controls = new OrbitControls(this.instance, this.canvas)
    this.controls.enableDamping = true
    this.controls.target.copy(this.target)
    this.controls.enabled = this.orbitEnabled
  }

  // Active/désactive le contrôle libre, en synchronisant le point regardé pour
  // éviter tout saut de caméra à la bascule.
  setOrbit(enabled) {
    this.orbitEnabled = enabled

    if (enabled) {
      this.tween = null // stoppe un vol en cours
      this.state = 'idle'
      this.controls.target.copy(this.target)
      this.controls.enabled = true
    } else {
      // On récupère le point visé par l'orbit comme nouveau point regardé.
      this.target.copy(this.controls.target)
      this.controls.enabled = false
    }

    if (this.orbitController) this.orbitController.updateDisplay()
  }

  // Démarre le plongeon depuis la position haute vers le premier waypoint.
  // onComplete est appelé à la fin (utilisé pour révéler la barre de navigation).
  startIntro(onComplete) {
    if (this.orbitEnabled) {
      onComplete && onComplete()
      return
    }
    this.flyToWaypoint(this.waypoints[0], 3.6, 'intro', onComplete)
  }

  // Vol vers un waypoint via son index (utilisé par le bouton "Aller ici").
  flyTo(index, duration, state, onDone) {
    this.flyToWaypoint(this.waypoints[index], duration, state, onDone)
  }

  // Lance un vol fluide (position + point regardé) vers le waypoint donné.
  // Référencé par objet -> robuste à l'ajout/suppression de POI.
  flyToWaypoint(wp, duration = 2.2, state = 'flying', onDone = null) {
    if (!wp) return

    // Un vol reprend la main sur le contrôle libre.
    if (this.orbitEnabled) this.setOrbit(false)

    // Remet le nudge à zéro : on arrive sur le POI sans décalage résiduel.
    this.dragging = false
    this.nudge.yaw = this.nudge.pitch = 0
    this.nudgeTarget.yaw = this.nudgeTarget.pitch = 0
    this.canvas.style.cursor = ''

    this.activeWaypoint = wp
    this.state = state
    this.tween = {
      fromPos: this.instance.position.clone(),
      toPos: wp.pos.clone(),
      fromTarget: this.target.clone(),
      toTarget: wp.target.clone(),
      duration,
      elapsed: 0,
      onDone,
    }

    // Reflète la sélection sur la barre de navigation (clic GUI comme clic UI).
    if (this.experience.navigation) this.experience.navigation.setActive(wp)
  }

  resize() {
    this.instance.aspect = this.sizes.width / this.sizes.height
    this.instance.updateProjectionMatrix()
  }

  update() {
    // Contrôle libre (debug) : OrbitControls a la main, on ignore les tweens.
    if (this.orbitEnabled) {
      this.controls.update()
      return
    }

    // Avance le tween en cours (plongeon ou vol vers un POI).
    if (this.tween) {
      this.tween.elapsed += this.time.delta
      const t = Math.min(this.tween.elapsed / this.tween.duration, 1)
      const e = easeInOutCubic(t)

      this.instance.position.lerpVectors(this.tween.fromPos, this.tween.toPos, e)
      this.target.lerpVectors(this.tween.fromTarget, this.tween.toTarget, e)
      this.instance.lookAt(this.target)

      if (t >= 1) {
        const done = this.tween.onDone
        this.tween = null
        this.state = 'idle'
        this.hasSettled = true
        this.canvas.style.cursor = 'grab' // indique que la vue est manipulable
        done && done()
      }
      return
    }

    // Posé sur un POI : applique le décalage de vue (nudge) au drag + ressort.
    if (this.hasSettled) this.applyNudge()
  }

  // Décale légèrement la vue autour du POI actif selon le drag, avec ressort de
  // retour. Le décalage courant suit sa cible ; au relâchement la cible = 0,
  // donc la caméra revient d'elle-même sur le point.
  applyNudge() {
    const wp = this.activeWaypoint
    if (!wp) return

    const k = Math.min(1, this.time.delta * this.nudgeParams.spring)
    this.nudge.yaw += (this.nudgeTarget.yaw - this.nudge.yaw) * k
    this.nudge.pitch += (this.nudgeTarget.pitch - this.nudge.pitch) * k

    // Repart du cadrage exact du POI (pos/cible), en coordonnées sphériques
    // autour de la cible : le rayon (distance) reste constant, seuls les angles
    // bougent -> pas de zoom parasite.
    this._v.copy(wp.pos).sub(wp.target)
    this._sph.setFromVector3(this._v)
    this._sph.theta += this.nudge.yaw
    this._sph.phi = THREE.MathUtils.clamp(this._sph.phi + this.nudge.pitch, 0.15, Math.PI - 0.15)
    this._v.setFromSpherical(this._sph).add(wp.target)

    this.instance.position.copy(this._v)
    this.target.copy(wp.target)
    this.instance.lookAt(this.target)
  }

  // Clic-drag sur le canvas -> nudge (seulement une fois posé sur un POI et hors
  // mode orbit). Le mouvement/relâchement écoutent window pour suivre le drag
  // même si le curseur sort du canvas.
  setPointer() {
    const el = this.canvas

    const onDown = (e) => {
      if (this.orbitEnabled || !this.hasSettled || this.state !== 'idle') return
      this.dragging = true
      this.dragStart.x = e.clientX
      this.dragStart.y = e.clientY
      el.style.cursor = 'grabbing'
      if (el.setPointerCapture) el.setPointerCapture(e.pointerId)
    }

    const onMove = (e) => {
      if (!this.dragging) return
      const dx = e.clientX - this.dragStart.x
      const dy = e.clientY - this.dragStart.y
      const p = this.nudgeParams
      // tanh : résistance progressive (plus on tire, moins ça bouge) + borne.
      this.nudgeTarget.yaw = -p.maxYaw * Math.tanh(dx * p.sensitivity)
      this.nudgeTarget.pitch = -p.maxPitch * Math.tanh(dy * p.sensitivity)
    }

    const onUp = () => {
      if (!this.dragging) return
      this.dragging = false
      this.nudgeTarget.yaw = 0 // ressort de retour vers le POI
      this.nudgeTarget.pitch = 0
      el.style.cursor = 'grab'
    }

    el.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onUp)
  }

  setDebug() {
    this.debugFolder = this.debug.ui.addFolder('Caméra')

    // Toggle du contrôle libre OrbitControls.
    this.orbitController = this.debugFolder
      .add(this, 'orbitEnabled')
      .name('🕹️ Contrôle libre (orbit)')
      .onChange((v) => this.setOrbit(v))

    // --- Réglages du nudge (drag sur un POI) ---
    const nudgeFolder = this.debugFolder.addFolder('Interaction (drag POI)')
    nudgeFolder.add(this.nudgeParams, 'maxYaw', 0, 0.6, 0.01).name('Ampl. horizontale')
    nudgeFolder.add(this.nudgeParams, 'maxPitch', 0, 0.6, 0.01).name('Ampl. verticale')
    nudgeFolder.add(this.nudgeParams, 'sensitivity', 0.001, 0.02, 0.001).name('Sensibilité')
    nudgeFolder.add(this.nudgeParams, 'spring', 1, 20, 0.5).name('Ressort')

    // --- Ajout d'un point d'intérêt à partir du cadrage courant ---
    this.debugState = { newName: 'Nouveau point' }
    const addFolder = this.debugFolder.addFolder('Ajouter un POI')
    addFolder.add(this.debugState, 'newName').name('Nom')
    addFolder.add({ add: () => this.addWaypointFromView() }, 'add').name('➕ Ajouter (vue actuelle)')

    // --- Réglages fins par waypoint existant ---
    this.waypointsFolder = this.debugFolder.addFolder('Points existants')
    this.waypoints.forEach((wp) => this.addWaypointControls(wp))
  }

  // Capture la position/cible actuelle de la caméra comme nouveau waypoint,
  // et le branche partout (GUI + barre de navigation).
  addWaypointFromView() {
    const t = this.orbitEnabled ? this.controls.target : this.target
    const wp = {
      id: 'poi-' + this.waypoints.length,
      label: this.debugState.newName || `Point ${this.waypoints.length + 1}`,
      pos: this.instance.position.clone(),
      target: t.clone(),
    }

    this.waypoints.push(wp)
    this.addWaypointControls(wp)
    if (this.experience.navigation) this.experience.navigation.addWaypoint(wp)
  }

  // Crée le sous-dossier GUI d'un waypoint (aller, réglages fins, suppression).
  addWaypointControls(wp) {
    const f = this.waypointsFolder.addFolder(wp.label)
    wp.folder = f

    f.add({ go: () => this.flyToWaypoint(wp) }, 'go').name('▶ Aller ici')
    f.add(wp.pos, 'x', -60, 60, 0.1).name('pos x')
    f.add(wp.pos, 'y', 0, 60, 0.1).name('pos y')
    f.add(wp.pos, 'z', -60, 60, 0.1).name('pos z')
    f.add(wp.target, 'x', -30, 30, 0.1).name('cible x')
    f.add(wp.target, 'y', -5, 20, 0.1).name('cible y')
    f.add(wp.target, 'z', -30, 30, 0.1).name('cible z')
    f.add({ del: () => this.removeWaypoint(wp) }, 'del').name('🗑️ Supprimer')
  }

  // Retire un waypoint du système (garde toujours au moins un point).
  removeWaypoint(wp) {
    if (this.waypoints.length <= 1) {
      console.warn('Impossible de supprimer le dernier point d\'intérêt.')
      return
    }

    this.waypoints = this.waypoints.filter((w) => w !== wp)
    if (wp.folder) wp.folder.destroy()
    if (this.experience.navigation) this.experience.navigation.removeWaypoint(wp)
    if (this.activeWaypoint === wp) this.activeWaypoint = this.waypoints[0]
  }
}
