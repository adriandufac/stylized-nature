varying vec2 vUv;
varying vec3 vWorldPos;
varying vec3 vNormal;

uniform sampler2D uPerlinTexture;
uniform float uTime;
uniform float uFlowSpeed;

// Couleur / écume (mêmes réglages que le lac)
uniform vec3  uColorNear;
uniform vec3  uColorFar;
uniform vec3  uFoamColor;
uniform float uNoiseThreshold;

// Lumière (même logique que water/fragment2.glsl)
uniform vec3  uSunDirection;
uniform vec3  uSunColor;
uniform float uAmbient;
uniform float uNormalStrength;
uniform float uSpecStrength;
uniform float uShininess;
uniform float uFresnelPower;

void main()
{
    // ── Motif qui défile (ta version) ──────────────────────────────────────
    vec2 fallUv = vUv;
    fallUv.y -= uTime * uFlowSpeed;
    float n = texture(uPerlinTexture, fallUv).r;

    // Fondu des bords latéraux de la chute -> transparence sur les côtés
    float sides = smoothstep(0.0, 0.1, vUv.x) * smoothstep(1.0, 0.9, vUv.x);

    // 1) COULEUR : dégradé le long de la chute (haut clair -> bas profond)
    float grad = smoothstep(0.0, 1.0, vUv.y);
    vec3 color = mix(uColorNear, uColorFar, grad);

    // 2) MOTIF : bandes claires là où le bruit dépasse le seuil
    float bands = smoothstep(uNoiseThreshold, uNoiseThreshold + 0.08, n);
    color = mix(color, color + 0.18, bands * 0.5);

    // 3) ÉCUME : crêtes du bruit (mousse) + bas de la chute (bassin)
    float crestFoam  = smoothstep(0.82, 0.92, n);
    float bottomFoam = smoothstep(0.85, 1.0, vUv.y); // mousse au pied de la chute
    float foam = clamp(max(crestFoam, bottomFoam), 0.0, 1.0);
    color = mix(color, uFoamColor, foam);

    // 4) LUMIÈRE : Blinn-Phong, normale du mesh perturbée par le bruit (rides)
    float eps = 0.01;
    float nx = texture(uPerlinTexture, fallUv + vec2(eps, 0.0)).r;
    float ny = texture(uPerlinTexture, fallUv + vec2(0.0, eps)).r;
    vec3 normal = normalize(vNormal + vec3(-(nx - n), -(ny - n), 0.0) * uNormalStrength);

    vec3 sunDir  = normalize(uSunDirection);
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    float dayFactor = smoothstep(-0.15, 0.05, sunDir.y); // nuit -> 0

    // Diffus half-lambert
    float diffuse = max(dot(normal, sunDir) * 0.5 + 0.5, 0.0) * dayFactor;
    color *= uAmbient + diffuse * (1.0 - uAmbient); // ambiant additif : garde l'ombrage directionnel même rasant

    // Spéculaire (éclats)
    vec3 halfDir = normalize(sunDir + viewDir);
    float spec = pow(max(dot(normal, halfDir), 0.0), uShininess);
    color += uSunColor * spec * uSpecStrength * dayFactor;

    // Fresnel (bords plus clairs)
    float fresnel = pow(1.0 - max(dot(normal, viewDir), 0.0), uFresnelPower);
    color = mix(color, color + uFoamColor * 0.25, fresnel * dayFactor);

    // Alpha : corps de la chute visible, fondu sur les côtés, renforcé par le bruit
    float alpha = sides * (0.6 + 0.4 * n);

    gl_FragColor = vec4(color, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}
