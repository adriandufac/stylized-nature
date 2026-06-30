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
import GroundShadow from "./GroundShadow.js";

export default class World {
  constructor() {
    // Terrain Environment Wind sont sources de vérité.
    this.terrain = new Terrain();
    this.environment = new Environment();
    this.sky = new Sky(this.environment);
    this.wind = new Wind();

    // Ombres au sol rendues sur l'herbe : alimentées par les arbres et les buissons.
    this.groundShadow = new GroundShadow(this.environment);

    this.grass = new Grass(this.terrain, this.wind, this.environment, this.groundShadow);
    this.rain = new Rain(this.terrain, this.wind, this.environment);
    this.bush = new Bush(this.terrain, this.wind, this.environment, this.groundShadow);
    this.tree = new Tree(this.terrain, this.wind, this.environment, this.groundShadow);
    this.cliff = new Cliff(this.environment);
    // this.water = new Water();   // version depth texture (écume basée sur la vraie profondeur)
    this.water = new Water2(this.environment, this.wind);
    this.waterfall = new Waterfall(this.environment, this.wind);
  }

  update() {
    this.environment.update();
    this.groundShadow.update(); // d'abord : calcule les ellipses d'ombre lues par l'herbe
    
    this.sky.update();
    this.grass.update();
    this.rain.update();
    this.bush.update();
    this.tree.update();
    this.water.update();
    this.waterfall.update();
  }
}
