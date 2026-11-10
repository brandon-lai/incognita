varying vec3 vPos;
varying vec2 vUv;
varying vec3 vNormalW;
varying vec3 vViewW;

void main() {
  vPos = position;
  vUv = uv;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vViewW = normalize(cameraPosition - world.xyz);
  gl_Position = projectionMatrix * viewMatrix * world;
}
