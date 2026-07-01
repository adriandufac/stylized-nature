import Terrain from "./Terrain.js";
import Environment from "./Environment.js";
import Wind from "./Wind.js";
import Grass from "./Grass.js";
import Rain from "./Rain.js";
import Bush from "./Bush.js";
import Flowers from "./Flowers.js";
import Fireflies from "./Fireflies.js";
import Tree from "./Tree.js";
import Cliff from "./Cliff.js";
import Water from "./Water.js";
import Water2 from "./Water2.js";
import Waterfall from "./Waterfall.js";
import Sky from "./Sky.js";
import CloudsRing from "./CloudsRing.js";
import SkyClouds from "./SkyClouds.js";
import Weather from "./Weather.js";
import Lightning from "./Lightning.js";
import GroundShadow from "./GroundShadow.js";
import Sound from "./Sound.js";

export default class World {
  constructor() {
    // Terrain Environment Weather Wind sont sources de vérité.
    this.terrain = new Terrain();
    this.environment = new Environment();
    // Météo : créée AVANT ses abonnés (Sky, Wind, SkyClouds, Rain) pour qu'ils s'y abonnent.
    this.weather = new Weather();
    this.sky = new Sky(this.environment, this.weather);
    this.wind = new Wind(this.weather);
    this.cloudsRing = new CloudsRing(this.environment);
    this.skyClouds = new SkyClouds(this.environment, this.weather);
    this.lightning = new Lightning(this.weather, this.terrain);

    // Ombres au sol rendues sur l'herbe : alimentées par les arbres et les buissons.
    this.groundShadow = new GroundShadow(this.environment);

    this.grass = new Grass(this.terrain, this.wind, this.environment, this.groundShadow);
    this.rain = new Rain(this.terrain, this.wind, this.environment, this.weather);
    this.bush = new Bush(this.terrain, this.wind, this.environment, this.groundShadow);
    this.flowers = new Flowers(this.terrain, this.wind, this.environment);
    this.tree = new Tree(this.terrain, this.wind, this.environment, this.groundShadow);
    this.cliff = new Cliff(this.environment);
    // this.water = new Water();   // version depth texture (écume basée sur la vraie profondeur)
    this.water = new Water2(this.environment, this.wind);
    this.waterfall = new Waterfall(this.environment, this.wind);

    // Ambiance sonore : nature en continu + pluie fondue selon la météo + vent selon sa force.
    this.sound = new Sound(this.weather, this.wind);

    // Lucioles : en cercle au-dessus de l'îlot central du lac (nocturnes, hors tempête).
    // Après Water2 : elles lisent le centre du mesh "lake" (chargé en async) pour se placer.
    this.fireflies = new Fireflies(this.terrain, this.environment, this.weather, this.water);
    // Secret : quand le joueur passe les 10 lucioles à la même couleur. Une seule
    // fois par session (rechargement de page = nouvelle chance).
    this.secretUnlocked = false;
    this.fireflies.on("unified", () => {
      if (this.secretUnlocked) return;
      this.secretUnlocked = true;
      this.showSecretPopup();
      this.sound.playSecret(); // jingle zelda.mp3
    });

    // Une fois TOUS les abonnés construits : applique l'état initial (sunny) à tous
    // (masque la pluie, pose le vent calme, cible les nuages sunny).
    this.weather.set("sunny");
  }

  // Popup "secret unlocked" (auto-disparaît). Auto-suffisant (styles inline) pour
  // l'instant : à remplacer plus tard par un vrai effet si besoin.
  showSecretPopup() {
    const el = document.createElement("div");
    el.textContent = "🔓 Secret unlocked";
    Object.assign(el.style, {
      position: "fixed",
      top: "24px",
      left: "50%",
      transform: "translateX(-50%) translateY(-8px)",
      padding: "12px 20px",
      borderRadius: "10px",
      background: "rgba(20,20,30,0.85)",
      color: "#fff",
      font: "600 16px/1.2 system-ui, sans-serif",
      letterSpacing: "0.02em",
      boxShadow: "0 6px 24px rgba(0,0,0,0.35)",
      zIndex: "9999",
      opacity: "0",
      transition: "opacity .35s ease, transform .35s ease",
      pointerEvents: "none",
    });
    document.body.appendChild(el);

    requestAnimationFrame(() => {
      el.style.opacity = "1";
      el.style.transform = "translateX(-50%) translateY(0)";
    });
    setTimeout(() => {
      el.style.opacity = "0";
      el.style.transform = "translateX(-50%) translateY(-8px)";
      setTimeout(() => el.remove(), 400);
    }, 3000);
  }

  update() {
    this.environment.update();
    this.groundShadow.update(); // d'abord : calcule les ellipses d'ombre lues par l'herbe
    
    this.sky.update();
    this.cloudsRing.update();
    this.skyClouds.update();
    this.wind.update(); // lerpe la force du vent (notifie herbe/eau, marque la pluie dirty)
    this.lightning.update(); // éclairs de tempête + flash
    this.grass.update();
    this.rain.update();
    this.bush.update();
    this.flowers.update();
    this.fireflies.update();
    this.tree.update();
    this.water.update();
    this.waterfall.update();
    this.sound.update(); // fondu du volume de pluie
  }
}
