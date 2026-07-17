import * as THREE from "three";
import WorldComponent from "./WorldComponent.js";
import skyVertexShader from "../../Shaders/Sky/vertex.glsl";
import skyFragmentShader from "../../Shaders/Sky/fragment.glsl";
import sunVertexShader from "../../Shaders/Sun/vertex.glsl";
import sunFragmentShader from "../../Shaders/Sun/fragment.glsl";
import moonVertexShader from "../../Shaders/Moon/vertex.glsl";
import moonFragmentShader from "../../Shaders/Moon/fragment.glsl";
import starsVertexShader from "../../Shaders/Stars/vertex.glsl";
import starsFragmentShader from "../../Shaders/Stars/fragment.glsl";

export default class Sky extends WorldComponent {
    constructor(sun, weather) {
        super();
        this.sun = sun;
        this.weather = weather;

        // Assombrissement météo du ciel : multiplicateur de luminosité (horizon +
        // zénith) appliqué APRÈS le calcul horaire. Transition à durée fixe + easing
        // smoothstep (même ressenti que la pluie), progressive dans les deux sens.
        this.weatherBrightness = 1;
        this._skyFrom = 1;
        this._skyTo = 1;
        this._skyT = 1; // progression 0..1 (1 = terminé)
        this.skyTransitionDuration = 3.5; // secondes
        this.weather.on("change", () => {
            this._skyFrom = this.weatherBrightness;
            this._skyTo = this.weather.preset.sky;
            this._skyT = 0;
        });

        // Palette du ciel : keyframes triées par heure (0-24).
        // On interpole horizon / zénith / soleil entre les deux keyframes encadrant
        // l'heure courante, avec bouclage 24h -> 0h pour une transition continue la nuit.
        // Heures alignées sur le cycle réel (déclinaison 0.41, midi solaire 14h -> lever ~6h, coucher ~22h).
        this.gradients = [
            { hour: 0,    horizon: new THREE.Color("#0a1030"), zenith: new THREE.Color("#05060f"), sun: new THREE.Color("#ffd9a0") }, // nuit profonde
            { hour: 5,    horizon: new THREE.Color("#3a2a55"), zenith: new THREE.Color("#141a40"), sun: new THREE.Color("#ff9a6b") }, // aube
            { hour: 6.5,  horizon: new THREE.Color("#ffae6b"), zenith: new THREE.Color("#5a7fb5"), sun: new THREE.Color("#ffb070") }, // lever (horizon chaud)
            { hour: 9,    horizon: new THREE.Color("#bfe3ff"), zenith: new THREE.Color("#2f7bd6"), sun: new THREE.Color("#fff4e0") }, // plein jour
            { hour: 20,   horizon: new THREE.Color("#bfe3ff"), zenith: new THREE.Color("#2f7bd6"), sun: new THREE.Color("#fff4e0") }, // jour maintenu jusqu'à 20h
            { hour: 22,   horizon: new THREE.Color("#ff7a4a"), zenith: new THREE.Color("#3a5aa0"), sun: new THREE.Color("#ffb070") }, // coucher (soleil ~horizon)
            { hour: 23,   horizon: new THREE.Color("#ff5e3a"), zenith: new THREE.Color("#2a3a7a"), sun: new THREE.Color("#ff7a4a") }, // crépuscule rouge
        ];

        this.radius = 90; // rayon du dôme (doit rester < camera.far)

        this.horizonColor = new THREE.Color();
        this.zenithColor = new THREE.Color();
        this.sunColor = new THREE.Color();
        this.moonColor = new THREE.Color("#cfe0ff"); // bleuté froid (constant)
        this.updateColors(this.sun.sunParams.hour); // init avant la création du matériau

        this.setMesh();
        this.setSun();
        this.setMoon();
        this.setStars();
        this.scene.add(this.sky);
        this.scene.add(this.sunMesh);
        this.scene.add(this.moon);
        this.scene.add(this.stars);
    }

    // Interpole la palette pour l'heure donnée et met à jour horizonColor/zenithColor/sunColor.
    updateColors(hour) {
        const stops = this.gradients;
        const n = stops.length;

        // Première keyframe dont l'heure dépasse `hour` -> b ; la précédente -> a (avec wrap).
        let i = 0;
        while (i < n && stops[i].hour <= hour) i++;
        const b = stops[i % n];
        const a = stops[(i - 1 + n) % n];

        // Durée de l'intervalle (le +24 %24 gère le saut 21h -> 0h).
        const span = ((b.hour - a.hour + 24) % 24) || 24;
        const t = ((hour - a.hour + 24) % 24) / span;

        this.horizonColor.lerpColors(a.horizon, b.horizon, t);
        this.zenithColor.lerpColors(a.zenith, b.zenith, t);
        this.sunColor.lerpColors(a.sun, b.sun, t);
    }
    

    setMesh() {
        this.skyGeometry = new THREE.SphereGeometry(this.radius, 32, 16);
        this.skyMaterial = new THREE.ShaderMaterial({
            side: THREE.BackSide,
            depthWrite: false,
            vertexShader: skyVertexShader,
            fragmentShader: skyFragmentShader,
            uniforms: {
                uHorizonColor: { value: this.horizonColor },
                uZenithColor: { value: this.zenithColor },
                uSunDirection: { value: this.sun.sunDirection },
                uSunColor: { value: this.sunColor },
            }
        })
        this.sky = new THREE.Mesh(this.skyGeometry, this.skyMaterial);
    }

    // Disque toon du soleil : billboard face caméra, posé sur le dôme dans la direction du soleil.
    setSun() {
        this.sunGeometry = new THREE.PlaneGeometry(10, 10);
        this.sunMaterial = new THREE.ShaderMaterial({
            transparent: true,
            depthWrite: false, // ne bloque pas le décor ; reste occultable par lui (depthTest par défaut)
            vertexShader: sunVertexShader,
            fragmentShader: sunFragmentShader,
            uniforms: {
                uColor: { value: this.sunColor }, // même couleur chaude que le halo du dôme
                uOpacity: { value: 1 },
            }
        })
        this.sunMesh = new THREE.Mesh(this.sunGeometry, this.sunMaterial);
        this.sunMesh.renderOrder = 1; // dessiné après le dôme
    }

    // Disque toon de la lune (croissant) : billboard posé à l'OPPOSÉ du soleil -> visible la nuit.
    setMoon() {
        this.moonGeometry = new THREE.PlaneGeometry(8, 8);
        this.moonMaterial = new THREE.ShaderMaterial({
            transparent: true,
            depthWrite: false,
            vertexShader: moonVertexShader,
            fragmentShader: moonFragmentShader,
            uniforms: {
                uColor: { value: this.moonColor },
                uOpacity: { value: 0 },
            }
        })
        this.moon = new THREE.Mesh(this.moonGeometry, this.moonMaterial);
        this.moon.renderOrder = 1;
    }

    // Étoiles : points lumineux sur la calotte supérieure du dôme.
    // Chaque étoile a un seuil d'apparition aléatoire -> elles se révèlent progressivement
    // à mesure que la nuit avance (uNight), puis s'effacent au lever.
    setStars() {
        const count = 700;
        const r = this.radius * 0.95;

        const positions = new Float32Array(count * 3);
        const thresholds = new Float32Array(count);
        const scales = new Float32Array(count);
        const phases = new Float32Array(count);

        for (let i = 0; i < count; i++) {
            // Direction aléatoire sur la calotte supérieure (y > 0).
            const theta = Math.random() * Math.PI * 2;
            const y = 0.05 + Math.random() * 0.95; // hauteur normalisée (évite l'horizon pile)
            const rxz = Math.sqrt(1 - y * y);
            positions[i * 3 + 0] = Math.cos(theta) * rxz * r;
            positions[i * 3 + 1] = y * r;
            positions[i * 3 + 2] = Math.sin(theta) * rxz * r;

            thresholds[i] = Math.random();           // 0 = apparaît tôt, 1 = seulement en nuit profonde
            scales[i] = 0.5 + Math.random() * 1.5;   // tailles variées
            phases[i] = Math.random() * Math.PI * 2; // scintillement déphasé
        }

        this.starsGeometry = new THREE.BufferGeometry();
        this.starsGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        this.starsGeometry.setAttribute("aThreshold", new THREE.BufferAttribute(thresholds, 1));
        this.starsGeometry.setAttribute("aScale", new THREE.BufferAttribute(scales, 1));
        this.starsGeometry.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));

        this.starsMaterial = new THREE.ShaderMaterial({
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending, // points lumineux qui s'ajoutent au ciel sombre
            vertexShader: starsVertexShader,
            fragmentShader: starsFragmentShader,
            uniforms: {
                uColor: { value: new THREE.Color("#eaf0ff") },
                uNight: { value: 0 },
                uTime: { value: 0 },
                uSize: { value: 2.5 },
                uPixelRatio: { value: this.experience.sizes.pixelRatio },
            }
        })

        this.stars = new THREE.Points(this.starsGeometry, this.starsMaterial);
        this.stars.frustumCulled = false; // on déplace l'objet chaque frame (suit la caméra)
        this.stars.renderOrder = 1;
    }

    update() {
        const camera = this.experience.camera.instance;
        const sunDir = this.sun.sunDirection;

        // Dôme : suit la caméra pour rester centré (rayon < camera.far).
        this.sky.position.copy(camera.position);

        // Assombrissement météo : progression smoothstep à durée fixe (comme la pluie).
        if (this._skyT < 1) {
            this._skyT = Math.min(1, this._skyT + this.time.delta / this.skyTransitionDuration);
            const e = this._skyT * this._skyT * (3 - 2 * this._skyT); // smoothstep
            this.weatherBrightness = this._skyFrom + (this._skyTo - this._skyFrom) * e;
        }

        // Couleurs selon l'heure (mutées en place -> uniforms à jour automatiquement)...
        this.updateColors(this.sun.sunParams.hour);
        // ... puis assombries selon la météo (horizon + zénith = le ciel lui-même).
        this.horizonColor.multiplyScalar(this.weatherBrightness);
        this.zenithColor.multiplyScalar(this.weatherBrightness);
        this.skyMaterial.uniforms.uSunDirection.value.copy(sunDir);

        // Soleil : posé sur le dôme dans la direction du soleil, orienté face caméra (billboard).
        this.sunMesh.position.copy(camera.position).addScaledVector(sunDir, this.radius * 0.9);
        this.sunMesh.quaternion.copy(camera.quaternion);
        // Fondu : disparaît quand le soleil passe sous l'horizon.
        this.sunMaterial.uniforms.uOpacity.value = THREE.MathUtils.smoothstep(sunDir.y, -0.1, 0.05);

        // Lune : à l'opposé du soleil (-sunDir), face caméra. Visible la nuit (sunDir.y < 0).
        this.moon.position.copy(camera.position).addScaledVector(sunDir, -this.radius * 0.9);
        this.moon.quaternion.copy(camera.quaternion);
        // nightFactor : 1 quand le soleil est bien sous l'horizon, 0 le jour.
        this.moonMaterial.uniforms.uOpacity.value = 1.0 - THREE.MathUtils.smoothstep(sunDir.y, -0.2, 0.1);

        // Étoiles : suivent la caméra. uNight = profondeur de nuit (max au creux ~2h),
        // donc elles se multiplient quand la nuit avance puis diminuent vers le lever.
        this.stars.position.copy(camera.position);
        this.starsMaterial.uniforms.uNight.value = 1.0 - THREE.MathUtils.smoothstep(sunDir.y, -0.35, 0.05);
        this.starsMaterial.uniforms.uTime.value = this.time.elapsed;
    }
}
