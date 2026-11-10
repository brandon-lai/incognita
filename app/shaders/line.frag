precision highp float;

uniform float uMode;      // 0 coast and rivers, 1 route, 2 ghost map
uniform float uDay;
uniform float uInkDay;    // the day about three seconds ago: lines drawn since then are still fresh ink
uniform vec3 uColor;
uniform vec3 uRiverColor;
uniform float uOpacity;
uniform float uDash;      // route: dash length in km at the current zoom
uniform float uDraw;      // ghost map: how much of each line has been drawn in, 0..1
uniform float uFade;      // everything fades for the satellite crossfade

varying float vT;
varying float vDist;
varying float vFlag;
varying float vSide;

void main() {
  float alpha = uOpacity * uFade;
  vec3 color = uColor;
  if (uMode < 0.5) {
    if (vT > uDay) discard;
    // Fresh ink is dark; once the land has washed into colour the outline stays, lighter.
    alpha *= vT > uInkDay ? 1.0 : 0.55;
    if (vFlag > 0.5) {
      color = uRiverColor;
      alpha *= 0.8;
    }
  } else if (uMode < 1.5) {
    if (vT > uDay) discard;
    if (vFlag > 0.5 && fract(vDist / uDash) > 0.56) discard;
  } else {
    if (vDist > uDraw) discard;
    if (vT >= 0.0) alpha *= 1.0 - smoothstep(vT, vT + 5.0, uDay);
  }
  float edge = 1.0 - smoothstep(0.45, 1.0, abs(vSide));
  gl_FragColor = vec4(color, alpha * edge);
  #include <colorspace_fragment>
}
