import WorldComponent from './WorldComponent.js'

// Même référence que le slider du HUD (HUD.js) : le % affiché = strength / WIND_MAX_STRENGTH.
// On l'utilise pour que le seuil du son soit dans la MÊME échelle que le slider (0.3 = 30 %).
const WIND_MAX_STRENGTH = 0.6

/**
 * SOUND — ambiance sonore.
 *
 * - "nature" : boucle jouée en permanence (fond sonore).
 * - "rain"   : boucle dont le volume suit la météo (0 en sunny, monte en rainy/tempest),
 *   avec un fondu progressif à l'entrée comme à la sortie (lerp indépendant du framerate).
 *
 * Les navigateurs bloquent l'audio tant que l'utilisateur n'a pas interagi : on tente
 * de lancer la lecture tout de suite, et sinon on la débloque au premier geste
 * (pointerdown/keydown/touchstart).
 */
export default class Sound extends WorldComponent {
  constructor(weather, wind) {
    super()

    this.weather = weather
    this.wind = wind

    this.params = {
      natureVolume: 0.6, // volume du fond nature (hors tempête)
      rainVolumeMax: 0.75, // volume de la pluie à la densité maxi (tempest)
      windVolumeMax: 1.3, // gain du vent (le résultat est borné à 1)
      windThreshold: 0.3, // seuil dans l'échelle du slider HUD (0..1 = 0..100 %) : 0.3 = 30 %
      fadeSpeed: 0.5, // vitesse du fondu (~2 s)
      thunderVolume: 0.7, // volume d'un coup de tonnerre
      clickVolume: 0.6, // volume du clic (changement de couleur d'une luciole)
      secretVolume: 0.7, // volume du jingle de secret débloqué
    }

    // Boucles audio (HTMLAudioElement : simple et suffisant pour de l'ambiance).
    this.nature = this.makeAudio('/sounds/nature.mp3', this.params.natureVolume)
    this.rain = this.makeAudio('/sounds/rain.mp3', 0) // démarre muet, monte selon la météo
    this.windAudio = this.makeAudio('/sounds/wind.mp3', 0) // démarre muet, monte avec la force du vent

    // Coups de tonnerre : sources préchargées, jouées ponctuellement (one-shot) à
    // l'impact d'un éclair en tempête. On clone à la lecture pour autoriser le
    // recouvrement de deux tonnerres rapprochés.
    // `delay` (s) = décalage éclair->son (la lumière arrive avant le son). thunder2
    // a déjà cette pause dans le mp3 (delay 0) ; on la reproduit pour thunder1.
    this.thunders = [
      { audio: this.makeAudio('/sounds/thunder1.mp3', this.params.thunderVolume), delay: 0.6 },
      { audio: this.makeAudio('/sounds/thunder2.mp3', this.params.thunderVolume), delay: 0 },
      { audio: this.makeAudio('/sounds/thunder3.mp3', this.params.thunderVolume), delay: 0 },
    ]
    this.thunders.forEach((t) => (t.audio.loop = false))

    // Clic (changement de couleur d'une luciole) : one-shot, cloné à la lecture.
    this.click = this.makeAudio('/sounds/click.ogg', this.params.clickVolume)
    this.click.loop = false

    // Jingle joué une fois quand le secret est débloqué (toutes les lucioles identiques).
    this.secret = this.makeAudio('/sounds/zelda.mp3', this.params.secretVolume)
    this.secret.loop = false

    this.rainTarget = 0 // volume visé pour la pluie (posé par la météo)
    this.natureTarget = this.params.natureVolume // volume visé pour la nature
    this.started = false // la lecture a-t-elle pu démarrer ?

    this.setWeatherTargets() // état initial (sunny -> pluie 0, nature pleine)
    this.setSubscriptions()
    this.unlock() // tente de jouer ; sinon attend le premier geste
    this.setDebug()
  }

  makeAudio(src, volume) {
    const audio = new Audio(src)
    audio.loop = true
    audio.preload = 'auto'
    audio.volume = volume
    return audio
  }

  // Cibles de volume selon la météo :
  //  - pluie : fraction de la densité de pluie du preset (sunny 0 -> 0, rainy 0.06 ->
  //    ~moitié, tempest 0.12 -> plein) donc plus forte en tempête qu'en rainy.
  //  - nature : coupée en tempête (l'ambiance est dominée par l'orage), pleine sinon.
  setWeatherTargets() {
    const rain = this.weather.preset.rain
    const maxRain = this.weather.presets.tempest.rain || 0.12
    this.rainTarget = this.params.rainVolumeMax * Math.min(1, rain / maxRain)
    this.natureTarget = this.weather.current === 'tempest' ? 0 : this.params.natureVolume
  }

  setSubscriptions() {
    this.weather.on('change', () => this.setWeatherTargets())
  }

  // Joue un des deux tonnerres au hasard (appelé par Lightning à chaque impact).
  // Clone la source pour permettre des tonnerres qui se chevauchent, et respecte le
  // décalage éclair->son propre à chaque son.
  playThunder() {
    const t = this.thunders[(Math.random() * this.thunders.length) | 0]
    const play = () => {
      const a = t.audio.cloneNode()
      a.volume = this.params.thunderVolume
      a.play().catch(() => {}) // ignore le blocage autoplay (avant tout geste utilisateur)
    }
    if (t.delay > 0) setTimeout(play, t.delay * 1000)
    else play()
  }

  // Joue le son de clic (appelé quand une luciole change de couleur). Cloné pour
  // permettre des clics rapprochés qui se chevauchent.
  playClick() {
    const a = this.click.cloneNode()
    a.loop = false
    a.volume = this.params.clickVolume
    a.play().catch(() => {}) // ignore le blocage autoplay
  }

  // Jingle du secret débloqué (joué une fois par le déclencheur, pas cloné).
  playSecret() {
    this.secret.currentTime = 0
    this.secret.volume = this.params.secretVolume
    this.secret.play().catch(() => {})
  }

  // Démarre les boucles. Si l'autoplay est bloqué, réessaie au premier geste utilisateur.
  unlock() {
    const tryPlay = () => {
      const promises = [this.nature.play(), this.rain.play(), this.windAudio.play()]
      // Si les promesses résolvent, l'audio joue -> on retire les écouteurs de secours.
      Promise.allSettled(promises.filter(Boolean)).then((results) => {
        if (results.every((r) => r.status === 'fulfilled')) {
          this.started = true
          removeListeners()
        }
      })
    }

    const onGesture = () => tryPlay()
    const removeListeners = () => {
      window.removeEventListener('pointerdown', onGesture)
      window.removeEventListener('keydown', onGesture)
      window.removeEventListener('touchstart', onGesture)
    }

    tryPlay() // tentative immédiate (marche si un geste a déjà eu lieu)
    window.addEventListener('pointerdown', onGesture)
    window.addEventListener('keydown', onGesture)
    window.addEventListener('touchstart', onGesture)
  }

  setDebug() {
    const folder = this.debug.ui.addFolder('Son').close()
    folder
      .add(this.params, 'natureVolume', 0, 1, 0.01)
      .name('Volume nature')
      .onChange(() => this.setWeatherTargets())
    folder
      .add(this.params, 'rainVolumeMax', 0, 1, 0.01)
      .name('Volume pluie (max)')
      .onChange(() => this.setWeatherTargets())
    folder.add(this.params, 'windVolumeMax', 0, 1, 0.01).name('Volume vent (max)')
    folder.add(this.params, 'windThreshold', 0, 1, 0.01).name('Seuil vent')
    folder.add(this.params, 'fadeSpeed', 0.1, 3, 0.1).name('Vitesse fondu')
    folder.add(this.params, 'thunderVolume', 0, 1, 0.01).name('Volume tonnerre')
    folder.add(this.params, 'clickVolume', 0, 1, 0.01).name('Volume clic')
    folder.add(this.params, 'secretVolume', 0, 1, 0.01).name('Volume secret')
  }

  // Volume cible du vent : nul sous le seuil, puis monte avec la force. Tout est
  // exprimé dans l'échelle du slider HUD (strength / WIND_MAX_STRENGTH) pour que le
  // seuil corresponde au pourcentage affiché. windVolumeMax = gain, borné à 1.
  windTargetVolume() {
    const s = this.wind.params.strength / WIND_MAX_STRENGTH // 0..1 comme le slider
    const th = this.params.windThreshold
    if (s <= th || th >= 1) return 0
    const t = (s - th) / (1 - th) // 0 au seuil -> 1 au max du slider
    return Math.min(1, this.params.windVolumeMax * t)
  }

  update() {
    // Fondu progressif des volumes vers leurs cibles (indépendant du framerate).
    const k = Math.min(1, this.time.delta * this.params.fadeSpeed)
    this.rain.volume += (this.rainTarget - this.rain.volume) * k
    this.nature.volume += (this.natureTarget - this.nature.volume) * k
    // Borné [0,1] : un volume d'<audio> hors de cette plage lève une exception.
    const wv = this.windAudio.volume + (this.windTargetVolume() - this.windAudio.volume) * k
    this.windAudio.volume = Math.min(1, Math.max(0, wv))
  }
}
