uniform float uFillLevel;
uniform float uWobbleX;
uniform float uWobbleZ;
uniform float uTime;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform float uSelected;
uniform float uHovered;
uniform float uOpacity;
uniform float uIsHub;

varying vec3 vPos;
varying vec3 vNormalV;
varying vec3 vWorldPos;

void main() {
  float level = clamp(uFillLevel, 0.0, 1.0);
  if (level <= 0.001) discard;

  float surface = mix(-0.98, 0.98, level);
  float tilt = vPos.x * uWobbleX + vPos.z * uWobbleZ;
  float ripple = sin(vPos.x * 6.0 + uTime * 2.2) * 0.025 + cos(vPos.z * 5.0 - uTime * 1.8) * 0.025;
  float cut = surface + tilt + ripple;
  if (vPos.y > cut) discard;

  float distToSurface = cut - vPos.y;
  float depth = clamp(distToSurface / max(level * 1.8, 0.25), 0.0, 1.0);
  float meniscus = smoothstep(0.14, 0.0, distToSurface);

  // Subsurface and internal caustics
  float caustics = (sin(vPos.x * 11.0 + uTime * 1.8) * cos(vPos.z * 11.0 - uTime * 1.5) * 0.5 + 0.5) * 0.18;
  vec3 liquid = mix(uColorA, uColorB, pow(depth, 0.7));
  liquid += uColorA * caustics * (1.0 - depth * 0.4);

  // View-angle fresnel reflection
  float facing = abs(normalize(vNormalV).z);
  float fresnel = pow(1.0 - clamp(facing, 0.0, 1.0), 2.2);

  // Dynamic excitation boost on selection / hover / hub
  float energy = uSelected * 0.4 + uHovered * 0.22 + uIsHub * 0.18;
  vec3 highlight = uColorA * (meniscus * 1.25 + fresnel * 0.4 + energy);

  vec3 finalColor = liquid + highlight;
  float alpha = mix(0.85, 1.0, meniscus) * clamp(uOpacity, 0.1, 1.0);

  gl_FragColor = vec4(finalColor, alpha);
}
