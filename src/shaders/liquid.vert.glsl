varying vec3 vPos;
varying vec3 vNormalV;

void main() {
  vPos = position;
  vNormalV = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
