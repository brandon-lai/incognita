// Screen-space ribbons for coastlines, rivers, the route and the ghost map.
// Each segment is a quad; this vertex sits at one end and is pushed sideways
// by half the line width in pixels.

attribute vec3 aOther;
attribute float aSide;
attribute float aT;
attribute float aDist;
attribute float aFlag;

uniform vec2 uResolution;
uniform float uWidth;

varying float vT;
varying float vDist;
varying float vFlag;
varying float vSide;

void main() {
  vec4 a = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  vec4 b = projectionMatrix * modelViewMatrix * vec4(aOther, 1.0);
  vec2 sa = a.xy / a.w;
  vec2 sb = b.xy / b.w;
  vec2 d = (sb - sa) * uResolution;
  vec2 dir = length(d) > 1e-6 ? normalize(d) : vec2(1.0, 0.0);
  float side = sign(aSide);
  if (abs(aSide) > 1.5) dir = -dir; // the b end: aOther points back along the line
  vec2 n = vec2(-dir.y, dir.x);
  a.xy += n * side * uWidth / uResolution * a.w;
  vT = aT;
  vDist = aDist;
  vFlag = aFlag;
  vSide = side;
  gl_Position = a;
}
