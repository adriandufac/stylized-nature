uniform vec3 uBaseColor;
uniform vec3 uTipColor;
uniform vec3 uSunDirection;
uniform float uAmbientLight;

varying vec3 vColor;
varying vec3 vNormal;
varying vec3 vPosition;

void main() {

  //LIGHTS
  
  float AmbientLight = uAmbientLight; // Ambient light
  vec3 normal = normalize(vNormal);
  if (!gl_FrontFacing) normal = -normal; // face arrière (DoubleSide) : on utilise SA normale sortante
  float sunOrientation = dot(uSunDirection, normal);
  // 0 quand le soleil est sous l'horizon, 1 quand il est bien levé
  float dayFactor = smoothstep(-0.1, 0.5, uSunDirection.y);
  float diffuse = max(sunOrientation *0.5 +0.5, 0.0) * dayFactor; // half lambert
  // vColor.x : 0 à la base -> 1 à la pointe. Dégradé vertical du brin.
  vec3 col = mix(uBaseColor, uTipColor, vColor.x);
  col *= max(diffuse, AmbientLight); // éclairage : diffuse + ambiant (pas de spéculaire pour un rendu stylisé)
  col = smoothstep(0.1, 0.8, col); // Accentue les contrastes pour un rendu plus stylisé*
  
  //Specular
  float specularFilter = pow(vColor.x, 30.0);
  vec3 viewDirection = normalize(vPosition - cameraPosition);
  vec3 lightReflection = reflect(-uSunDirection, normal);
  float specular = -dot(lightReflection, viewDirection);
  specular = max(specular, 0.0);
  specular = pow(specular, 40.0);
  float specularStrength = 20.5;

  col += specular * specularFilter * dayFactor * specularStrength; // filtre par la hauteur du brin et l'orientation du soleil


  gl_FragColor = vec4(col, 1.0);

  // Conversion espace linéaire -> sRGB (sinon couleurs délavées avec un ShaderMaterial)
  #include <colorspace_fragment>
}
