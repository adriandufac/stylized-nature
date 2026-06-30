uniform vec3 uColor;
uniform float uOpacity; // fondu global : 1 la nuit, 0 le jour
varying vec2 vUv;

void main() {
  float dist = length(vUv - 0.5) * 2.0;          // 0 au centre -> ~1 au bord
  float disk = smoothstep(0.5, 0.45, dist);       // disque plein de la lune

  // Disque sombre décalé : creuse le croissant en le soustrayant au disque.
  float shadow = smoothstep(0.5, 0.45, length(vUv - vec2(0.62, 0.5)) * 2.0);
  float crescent = clamp(disk - shadow, 0.0, 1.0);

  // Léger halo, uniquement à l'extérieur du disque (1.0 - disk) pour garder le croissant net.
  float halo = smoothstep(0.85, 0.45, dist) * 0.18 * (1.0 - disk);

  float a = clamp(crescent + halo, 0.0, 1.0) * uOpacity;
  if (a < 0.001) discard;
  gl_FragColor = vec4(uColor, a);
  #include <colorspace_fragment>
}
