uniform float uFillLevel;
uniform float uWobbleX;
uniform float uWobbleZ;
uniform float uTime;
uniform vec3 uColorA;
uniform vec3 uColorB;

varying vec3 vPos;
varying vec3 vNormalV;

void main() {
  float level = clamp(uFillLevel, 0.0, 1.0);
  if (level <= 0.001) discard;

  float surface = mix(-1.0, 1.0, level);
  float tilt = vPos.x * uWobbleX + vPos.z * uWobbleZ;
  float ripple = sin(vPos.x * 5.5 + uTime * 1.5) * 0.02 + cos(vPos.z * 4.5 - uTime * 1.2) * 0.02;
  float cut = surface + tilt + ripple;
  if (vPos.y > cut) discard;

  float depth = clamp((cut - vPos.y) / max(level * 2.0, 0.25), 0.0, 1.0);
  float meniscus = smoothstep(0.18, 0.0, cut - vPos.y);
  float facing = abs(normalize(vNormalV).z);
  float fresnel = pow(1.0 - clamp(facing, 0.0, 1.0), 2.0);
  vec3 liquid = mix(uColorA, uColorB, depth);
  vec3 color = liquid + uColorA * meniscus * 0.9 + uColorA * fresnel * 0.35;
  float alpha = mix(0.82, 1.0, meniscus);
  gl_FragColor = vec4(color, alpha);
}
