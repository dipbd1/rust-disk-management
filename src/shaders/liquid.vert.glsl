varying vec3 vPos;
varying vec3 vNormalV;
varying vec3 vWorldPos;

void main() {
  vPos = position;
  vNormalV = normalize(normalMatrix * normal);
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldPos = worldPos.xyz;
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
