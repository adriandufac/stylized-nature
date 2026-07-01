import Terrain from "./Terrain.js";
import Environment from "./Environment.js";
import Wind from "./Wind.js";
import Grass from "./Grass.js";
import Rain from "./Rain.js";
import Bush from "./Bush.js";
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
    this.tree = new Tree(this.terrain, this.wind, this.environment, this.groundShadow);
    this.cliff = new Cliff(this.environment);
    // this.water = new Water();   // version depth texture (écume basée sur la vraie profondeur)
    this.water = new Water2(this.environment, this.wind);
    this.waterfall = new Waterfall(this.environment, this.wind);

    // Une fois TOUS les abonnés construits : applique l'état initial (sunny) à tous
    // (masque la pluie, pose le vent calme, cible les nuages sunny).
    this.weather.set("sunny");
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
    this.tree.update();
    this.water.update();
    this.waterfall.update();
  }
}
