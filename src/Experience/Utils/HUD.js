import Experience from '../Experience.js'

/**
 * HUD — panneau "Nature" (maquette d'origine "Nature HUD") réécrit en vanilla JS
 * et branché DIRECTEMENT sur la scène :
 *   - Heure   -> Sun.sunParams.hour + autoPlay (lecture/écriture)
 *   - Vent    -> Wind.params.strength (via updateWind -> évènement 'change')
 *   - Météo   -> visibilité de la pluie (+ coup de vent en "Tempest")
 *
 * Source de vérité partagée avec la scène : le HUD lit l'heure réelle chaque
 * frame (update()) au lieu de tenir son propre compteur — pas de double horloge.
 */

// Skin "Nature" (washi / bois) — valeurs figées extraites du .dc.html d'origine.
const SKIN = {
  ink: '#4d3e34',
  panelBg: '#f4ece0',
  panelBorder: '#e0d2bf',
  wellBg: '#e9ddca',
  dialBg: '#fbf6ec',
  panelRadius: '20px',
  panelBorderW: '1.5px',
  // Ombre portée à FAIBLE flou : un grand flou (40px) est très coûteux à repeindre,
  // et la moindre mise à jour de texte dans le panneau le re-floute -> lag pendant
  // la lecture. Les insets (flou 0) sont gratuits, on les garde pour le relief.
  panelShadow:
    '0 6px 14px -8px rgba(70,50,30,.45), inset 0 2px 0 rgba(255,255,255,.7), inset 0 -3px 0 rgba(120,90,60,.10)',
  accent: '#d98fb0',
  accent2: '#7cc0ab',
}
SKIN.accentHalo = SKIN.accent + '40'

// Force du vent à fond de slider : strength = (pct/100) * WIND_MAX_STRENGTH.
const WIND_MAX_STRENGTH = 0.6

export default class HUD {
  constructor() {
    this.experience = new Experience()
    this.wind = this.experience.world.wind
    this.sun = this.experience.world.sun
    this.weatherCtrl = this.experience.world.weather // source de vérité météo

    // État propre au HUD (le reste est lu depuis la scène).
    this.windPct = Math.round(
      Math.min(100, Math.max(0, (this.wind.params.strength / WIND_MAX_STRENGTH) * 100)),
    )
    this.open = true
    this.drag = null // 'wind' | null

    this.injectGlobalStyles()
    this.build()
    this.bindEvents()
    // L'état initial (sunny) est posé par World via weather.set('sunny') ; le HUD
    // ne fait que refléter l'état courant.
    this.refreshWind()
    this.refreshWeatherButtons()
    this.refreshCollapse()
    this.refreshPlay() // état initial du bouton (lecture/pause)
    this.setupTimeCanvas()
    this.setupClockCanvas()
    this.refreshTime() // heure initiale (dessinée dans le canvas)
    this.drawClock()   // cadran + aiguille initiaux
  }

  // Police injectée une seule fois dans le <head>. (Aucune animation CSS : elles
  // créaient des couches GPU au-dessus du canvas WebGL et écroulaient le rendu.)
  injectGlobalStyles() {
    if (document.getElementById('hud-fonts')) return
    const link = document.createElement('link')
    link.id = 'hud-fonts'
    link.rel = 'stylesheet'
    link.href =
      'https://fonts.googleapis.com/css2?family=Zen+Maru+Gothic:wght@400;500;700&family=M+PLUS+Rounded+1c:wght@400;500;700&display=swap'
    document.head.appendChild(link)
  }

  build() {
    const S = SKIN

    // Traits de "souffle" du vent — STATIQUES (pas d'animation : voir injectGlobalStyles).
    // Répartis dans la bande pour suggérer le vent ; leur opacité suivra la force (refreshWind).
    const gustTops = ['4px', '14px', '9px', '20px']
    const gustLefts = ['14%', '52%', '30%', '70%']
    const gustWidths = ['46px', '64px', '38px', '54px']
    let gustsSvg = ''
    for (let i = 0; i < 4; i++) {
      gustsSvg += `<div data-hud="gust" style="position:absolute; top:${gustTops[i]}; left:${gustLefts[i]}; width:${gustWidths[i]}; height:2px; border-radius:2px; background:linear-gradient(90deg, transparent, ${S.accent});"></div>`
    }

    const label =
      "font-family:'Zen Maru Gothic',sans-serif; font-weight:700; font-size:10.5px; letter-spacing:.14em; text-transform:uppercase; color:" +
      S.ink +
      '; opacity:.75;'

    const root = document.createElement('div')
    root.className = 'hud-root'
    // Pas de transform/will-change ici : une couche GPU au-dessus du canvas WebGL
    // force sa recomposition en texture à chaque frame. On reste en DOM plat.
    root.style.cssText =
      'position:fixed; top:16px; right:16px; z-index:50; font-family:\'M PLUS Rounded 1c\', sans-serif;'

    root.innerHTML = `
      <div style="width:236px; border-radius:${S.panelRadius}; background:${S.panelBg}; border:${S.panelBorderW} solid ${S.panelBorder}; box-shadow:${S.panelShadow}; overflow:hidden;">

        <!-- header -->
        <button data-hud="toggle" style="width:100%; display:flex; align-items:center; justify-content:space-between; gap:8px; padding:9px 13px; border:none; background:transparent; cursor:pointer; font-family:'Zen Maru Gothic',sans-serif;">
          <span style="display:flex; align-items:center; gap:7px;">
            <span style="width:7px; height:7px; border-radius:50%; background:${S.accent}; box-shadow:0 0 0 3px ${S.accentHalo};"></span>
            <span style="font-weight:700; font-size:12.5px; letter-spacing:.05em; color:${S.ink};">Réglages</span>
          </span>
          <span data-hud="chevron" style="display:flex; align-items:center; justify-content:center; width:18px; height:18px; color:${S.ink}; transform:rotate(180deg); transition:transform .25s ease;">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
          </span>
        </button>

        <!-- collapsible body -->
        <div data-hud="body" style="max-height:640px; opacity:1; overflow:hidden; transition:max-height .3s ease, opacity .25s ease;">
        <div style="padding:2px 4px 12px;">

        <!-- WIND -->
        <div style="display:flex; flex-direction:column; gap:10px; padding:10px 16px;">
          <div style="display:flex; align-items:baseline; justify-content:space-between;">
            <span style="${label}">Vent</span>
            <span data-hud="windLabel" style="font-weight:700; font-size:12.5px; color:${S.accent};">Léger</span>
          </div>
          <div style="position:relative; height:22px; border-radius:9px; background:${S.wellBg}; overflow:hidden;">
            ${gustsSvg}
          </div>
          <div data-hud="windTrack" style="position:relative; height:18px; display:flex; align-items:center; cursor:pointer; touch-action:none;">
            <div style="position:absolute; left:0; right:0; height:5px; border-radius:5px; background:${S.wellBg};"></div>
            <div data-hud="windFill" style="position:absolute; left:0; height:5px; border-radius:5px; width:0%; background:linear-gradient(90deg, ${S.accent}, ${S.accent2});"></div>
            <div data-hud="windHandle" style="position:absolute; left:0%; transform:translateX(-50%); width:16px; height:16px; border-radius:50%; background:#fff; box-shadow:0 2px 7px rgba(20,40,50,.35), inset 0 0 0 3px ${S.accent};"></div>
          </div>
        </div>

        <div style="height:1px; margin:0 16px; background:linear-gradient(90deg, transparent, ${S.panelBorder}, transparent);"></div>

        <!-- HEURE : cadran + aiguille + heure, TOUT dessiné dans des <canvas>
             (pixels, pas de DOM) -> l'aiguille tourne en continu sans jamais muter
             le DOM, donc le MutationObserver de Bitwarden ne se déclenche pas. -->
        <div style="display:flex; flex-direction:column; align-items:center; gap:6px; padding:11px 16px;">
          <span style="${label}">Heure</span>
          <canvas data-hud="clockCanvas" style="width:90px; height:90px; display:block; cursor:grab;"></canvas>
          <div style="display:flex; align-items:center; gap:8px;">
            <canvas data-hud="timeCanvas" style="width:64px; height:22px; display:block;"></canvas>
            <button data-hud="play" style="display:flex; align-items:center; gap:7px; padding:6px 12px; border-radius:11px; border:none; cursor:pointer; background:${S.wellBg}; color:${S.ink}; font-family:'Zen Maru Gothic',sans-serif; font-weight:700; font-size:11px;">
              <span data-hud="playGlyph" style="color:${S.accent}; font-size:9px;">❙❙</span>
              <span data-hud="playText">Pause</span>
            </button>
          </div>
        </div>

        <div style="height:1px; margin:0 16px; background:linear-gradient(90deg, transparent, ${S.panelBorder}, transparent);"></div>

        <!-- WEATHER -->
        <div style="display:flex; flex-direction:column; gap:9px; padding:11px 16px 4px;">
          <span style="${label}">Météo</span>
          <div style="display:flex; gap:7px; justify-content:center;">
            <button data-hud="sunny" style="">
              <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <circle cx="12" cy="12" r="4.5"></circle>
                <line x1="12" y1="2" x2="12" y2="4.5"></line><line x1="12" y1="19.5" x2="12" y2="22"></line>
                <line x1="2" y1="12" x2="4.5" y2="12"></line><line x1="19.5" y1="12" x2="22" y2="12"></line>
                <line x1="5" y1="5" x2="6.8" y2="6.8"></line><line x1="17.2" y1="17.2" x2="19" y2="19"></line>
                <line x1="19" y1="5" x2="17.2" y2="6.8"></line><line x1="6.8" y1="17.2" x2="5" y2="19"></line>
              </svg>
              <span style="font-weight:700; font-size:10.5px;">Sunny</span>
            </button>
            <button data-hud="rainy" style="">
              <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M7 14a4 4 0 0 1 .4-7.96A5 5 0 0 1 17 7a3.5 3.5 0 0 1 .3 7"></path>
                <line x1="8" y1="18" x2="7" y2="21"></line>
                <line x1="12.5" y1="18" x2="11.5" y2="21"></line>
                <line x1="17" y1="18" x2="16" y2="21"></line>
              </svg>
              <span style="font-weight:700; font-size:10.5px;">Rainy</span>
            </button>
            <button data-hud="tempest" style="">
              <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M7 13a4 4 0 0 1 .4-7.96A5 5 0 0 1 17 6a3.5 3.5 0 0 1 .3 7"></path>
                <polygon points="12.5,12 9,17 11.5,17 10,21 14.5,15.5 12,15.5" fill="currentColor" stroke="none"></polygon>
              </svg>
              <span style="font-weight:700; font-size:10.5px;">Tempest</span>
            </button>
          </div>
        </div>

        </div>
        </div>
      </div>
    `

    document.body.appendChild(root)
    this.root = root

    // Références aux noeuds dynamiques.
    const q = (name) => root.querySelector(`[data-hud="${name}"]`)
    this.el = {
      toggle: q('toggle'),
      chevron: q('chevron'),
      body: q('body'),
      windLabel: q('windLabel'),
      windTrack: q('windTrack'),
      windFill: q('windFill'),
      windHandle: q('windHandle'),
      gusts: [...root.querySelectorAll('[data-hud="gust"]')],
      play: q('play'),
      playGlyph: q('playGlyph'),
      playText: q('playText'),
      timeCanvas: q('timeCanvas'),
      clockCanvas: q('clockCanvas'),
      sunny: q('sunny'),
      rainy: q('rainy'),
      tempest: q('tempest'),
    }
  }

  bindEvents() {
    this.el.toggle.addEventListener('click', () => {
      this.open = !this.open
      this.refreshCollapse()
    })

    this.el.play.addEventListener('click', () => {
      this.sun.autoPlay = !this.sun.autoPlay
      this.refreshPlay() // évènementiel : maj uniquement au clic, pas de timer
    })

    // Vent : drag sur le slider.
    this.el.windTrack.addEventListener('pointerdown', (e) => {
      this.drag = 'wind'
      this.updateWind(e)
    })

    // Heure : drag sur le cadran (canvas) pour régler l'heure manuellement.
    this.el.clockCanvas.addEventListener('pointerdown', (e) => {
      this.drag = 'clock'
      this.updateClock(e)
    })

    this._onMove = (e) => {
      if (this.drag === 'wind') this.updateWind(e)
      else if (this.drag === 'clock') this.updateClock(e)
    }
    this._onUp = () => {
      this.drag = null
    }
    window.addEventListener('pointermove', this._onMove)
    window.addEventListener('pointerup', this._onUp)

    this.el.sunny.addEventListener('click', () => this.pickWeather('sunny'))
    this.el.rainy.addEventListener('click', () => this.pickWeather('rainy'))
    this.el.tempest.addEventListener('click', () => this.pickWeather('tempest'))
  }

  // --- VENT -------------------------------------------------------------
  updateWind(e) {
    const r = this.el.windTrack.getBoundingClientRect()
    const pct = Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100))
    this.windPct = Math.round(pct)
    this.wind.params.strength = (this.windPct / 100) * WIND_MAX_STRENGTH
    this.wind.strengthTarget = this.wind.params.strength // drag = immédiat : pas de lerp de retour
    this.wind.updateWind() // recalcule la direction et notifie herbe/pluie/etc.
    this.refreshWind()
  }

  refreshWind() {
    // Synchronise depuis la force réelle du vent (source de vérité) : ainsi le slider
    // suit aussi les changements pilotés par la météo, pas seulement le drag manuel.
    this.windPct = Math.round(
      Math.min(100, Math.max(0, (this.wind.params.strength / WIND_MAX_STRENGTH) * 100)),
    )
    const w = this.windPct
    const label = w < 15 ? 'Calme' : w < 40 ? 'Léger' : w < 65 ? 'Modéré' : w < 85 ? 'Fort' : 'Violent'
    this.el.windFill.style.width = w + '%'
    this.el.windHandle.style.left = w + '%'
    this.el.windLabel.textContent = label
    // L'opacité des traits suit la force (remplace l'ancienne animation de souffle).
    const op = (0.25 + (w / 100) * 0.75).toFixed(2)
    for (const g of this.el.gusts) g.style.opacity = op
  }

  // --- TEMPS (lecture/pause uniquement) ---------------------------------
  // Évènementiel : appelé seulement à l'init et au clic. AUCUN timer, donc aucune
  // mise à jour continue de l'overlay -> rien ne perturbe le rendu WebGL.
  refreshPlay() {
    const auto = this.sun.autoPlay
    this.el.playGlyph.textContent = auto ? '❙❙' : '▶'
    this.el.playText.textContent = auto ? 'Pause' : 'Lecture'
  }

  // Prépare le contexte 2D de l'heure (résolution × DPR pour rester net).
  setupTimeCanvas() {
    const cv = this.el.timeCanvas
    this._timeW = 64
    this._timeH = 22
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    cv.width = this._timeW * dpr
    cv.height = this._timeH * dpr
    const ctx = cv.getContext('2d')
    ctx.scale(dpr, dpr)
    ctx.font = "700 18px 'Zen Maru Gothic', sans-serif"
    ctx.fillStyle = SKIN.ink
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'left'
    this._timeCtx = ctx
    // Redessine quand la police web est prête (le 1er rendu peut tomber sur le fallback).
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => {
        this._lastTimeStr = null
        this.refreshTime()
      })
    }
  }

  // Appelé chaque frame depuis Experience.update() (aligné rAF).
  update() {
    this.drawClock()   // aiguille (canvas, aucune mutation DOM)
    this.refreshTime() // heure digitale (canvas, gatée à la minute)
    // Le vent lerpe lors d'un changement météo -> le slider suit TANT QUE ça bouge
    // (aucune écriture DOM une fois stabilisé, strength === strengthTarget).
    if (this.wind.params.strength !== this.wind.strengthTarget) this.refreshWind()
  }

  // Prépare le canvas de l'horloge + met en CACHE le cadran statique (offscreen),
  // pour ne redessiner que l'aiguille à chaque frame.
  setupClockCanvas() {
    const cv = this.el.clockCanvas
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const px = 90 * dpr
    cv.width = px
    cv.height = px
    const ctx = cv.getContext('2d')
    ctx.scale(px / 100, px / 100) // on dessine ensuite en coordonnées 0..100
    this._clockCtx = ctx

    const off = document.createElement('canvas')
    off.width = px
    off.height = px
    const octx = off.getContext('2d')
    octx.scale(px / 100, px / 100)
    this.drawDial(octx)
    this._dialCanvas = off

    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => {
        this.drawDial(octx) // redessine les chiffres avec la vraie police
        this._lastClockT = null
        this.drawClock()
      })
    }
  }

  // Cadran statique (fond, bord, 24 graduations, chiffres) — dessiné une seule fois.
  drawDial(ctx) {
    const S = SKIN
    ctx.clearRect(0, 0, 100, 100)
    ctx.beginPath()
    ctx.arc(50, 50, 46, 0, Math.PI * 2)
    ctx.fillStyle = S.dialBg
    ctx.fill()
    ctx.lineWidth = 1.5
    ctx.strokeStyle = S.panelBorder
    ctx.stroke()
    ctx.lineCap = 'round'
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2
      const big = i % 6 === 0
      const rOut = 44
      const rIn = big ? 36 : 40
      const dayHr = i >= 6 && i < 19
      ctx.beginPath()
      ctx.moveTo(50 + rIn * Math.sin(a), 50 - rIn * Math.cos(a))
      ctx.lineTo(50 + rOut * Math.sin(a), 50 - rOut * Math.cos(a))
      ctx.strokeStyle = dayHr ? S.accent2 : 'rgba(90,110,120,.45)'
      ctx.lineWidth = big ? 2 : 1
      ctx.stroke()
    }
    ctx.fillStyle = S.ink
    ctx.font = "700 6px 'M PLUS Rounded 1c', sans-serif"
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('0', 50, 11)
    ctx.fillText('6', 88, 50)
    ctx.fillText('12', 50, 89)
    ctx.fillText('18', 12, 50)
  }

  // Aiguille + orbe + axe : redessinés chaque frame. Gate sur l'heure -> en pause,
  // rien ne change donc on ne redessine pas (canvas au repos).
  drawClock() {
    const t = this.sun.sunParams.hour
    if (t === this._lastClockT) return
    this._lastClockT = t
    const ctx = this._clockCtx
    const S = SKIN
    ctx.clearRect(0, 0, 100, 100)
    ctx.drawImage(this._dialCanvas, 0, 0, 100, 100)
    // Aiguille (pointe vers le haut à t=0, tourne avec l'heure).
    ctx.save()
    ctx.translate(50, 50)
    ctx.rotate((t / 24) * Math.PI * 2)
    ctx.strokeStyle = S.ink
    ctx.lineWidth = 3
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(0, -30)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(0, -32, 5.5, 0, Math.PI * 2)
    ctx.fillStyle = t >= 6 && t < 19 ? '#ffce54' : '#dfe7f2'
    ctx.fill()
    ctx.lineWidth = 1.2
    ctx.strokeStyle = '#fff'
    ctx.stroke()
    ctx.restore()
    // Axe central (au-dessus de l'aiguille).
    ctx.beginPath()
    ctx.arc(50, 50, 3.4, 0, Math.PI * 2)
    ctx.fillStyle = S.ink
    ctx.fill()
    ctx.beginPath()
    ctx.arc(50, 50, 1.4, 0, Math.PI * 2)
    ctx.fillStyle = '#fff'
    ctx.fill()
  }

  // Drag sur le cadran -> règle l'heure. Le redessin se fait dans le canvas (aucune
  // mutation DOM). On ne touche au bouton play (qui mute le DOM) QU'UNE fois, quand
  // le cycle auto se coupe -> pas de mutation DOM continue pendant le drag.
  updateClock(e) {
    const r = this.el.clockCanvas.getBoundingClientRect()
    const cx = r.left + r.width / 2
    const cy = r.top + r.height / 2
    let deg = (Math.atan2(e.clientX - cx, -(e.clientY - cy)) * 180) / Math.PI
    if (deg < 0) deg += 360
    this.sun.sunParams.hour = (deg / 360) * 24
    if (this.sun.autoPlay) {
      this.sun.autoPlay = false // saisie manuelle coupe le cycle auto
      this.refreshPlay() // une seule fois (le bouton passe à "Lecture")
    }
    this.sun.updateSun()
    this.drawClock() // l'aiguille suit le pointeur (canvas)
    this.refreshTime() // heure digitale (canvas)
  }

  // Dessine l'heure DANS LE CANVAS (pixels, pas de mutation DOM) -> n'éveille pas
  // l'observer de Bitwarden. Uniquement quand la minute change (gate).
  refreshTime() {
    const t = this.sun.sunParams.hour
    const hh = Math.floor(t)
    const mm = Math.floor((t - hh) * 60)
    const str = String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0')
    if (str === this._lastTimeStr) return
    this._lastTimeStr = str
    const ctx = this._timeCtx
    ctx.clearRect(0, 0, this._timeW, this._timeH)
    ctx.fillText(str, 0, this._timeH / 2 + 1)
  }

  // --- MÉTÉO ------------------------------------------------------------
  // Délègue à la source de vérité Weather : chaque composant (nuages, pluie, vent)
  // applique sa tranche via son abonnement 'change'. Le HUD ne fait que refléter.
  pickWeather(weather) {
    this.weatherCtrl.set(weather)
    // Le vent lerpe ensuite vers sa cible : le slider est animé frame par frame
    // dans update(). Ici on ne rafraîchit que les boutons.
    this.refreshWeatherButtons()
  }

  refreshWeatherButtons() {
    const S = SKIN
    const base =
      "display:flex; flex-direction:column; align-items:center; gap:4px; width:50px; padding:8px 4px; border-radius:13px; border:1.5px solid transparent; cursor:pointer; font-family:'M PLUS Rounded 1c',sans-serif; transition:all .18s ease;"
    const mk = (on) =>
      on
        ? base + `background:${S.accent}; border-color:${S.accent}; color:#fff; box-shadow:0 8px 18px -6px ${S.accent};`
        : base + `background:${S.wellBg}; color:${S.ink}; opacity:.82;`
    const w = this.weatherCtrl.current
    this.el.sunny.style.cssText = mk(w === 'sunny')
    this.el.rainy.style.cssText = mk(w === 'rainy')
    this.el.tempest.style.cssText = mk(w === 'tempest')
  }

  // --- DIVERS -----------------------------------------------------------
  refreshCollapse() {
    this.el.body.style.maxHeight = this.open ? '640px' : '0px'
    this.el.body.style.opacity = this.open ? '1' : '0'
    this.el.chevron.style.transform = this.open ? 'rotate(180deg)' : 'rotate(0deg)'
  }

  destroy() {
    window.removeEventListener('pointermove', this._onMove)
    window.removeEventListener('pointerup', this._onUp)
    this.root?.remove()
  }
}
