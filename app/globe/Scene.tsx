import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { distanceKm } from '../data/geo';
import { loadCoastTexture, textureSize } from '../data/loader';
import { RibbonBuilder, type Ribbon } from '../data/ribbon';
import { NEVER_SEEN } from '../data/types';
import { stage } from '../engine/stage';
import globeFrag from '../shaders/globe.frag?raw';
import globeVert from '../shaders/globe.vert?raw';
import lineFrag from '../shaders/line.frag?raw';
import lineVert from '../shaders/line.vert?raw';
import noise from '../shaders/noise.glsl?raw';
import { NIGHT, PALETTE } from './palette';
import { overlay } from './overlay';

const color = (hex: string) => new THREE.Color(hex);

/** Handles the poster export needs to render the live scene offscreen. */
export const gl3 = {
  renderer: null as THREE.WebGLRenderer | null,
  scene: null as THREE.Scene | null,
  size: 4096 as 4096 | 8192,
  globe: null as THREE.ShaderMaterial | null,
  lines: [] as THREE.ShaderMaterial[],
  stars: null as THREE.Object3D | null,
};

function emptySeen() {
  const t = new THREE.DataTexture(new Uint16Array([NEVER_SEEN]), 1, 1, THREE.RedIntegerFormat, THREE.UnsignedShortType);
  t.internalFormat = 'R16UI';
  t.needsUpdate = true;
  return t;
}

function Globe() {
  const { gl } = useThree();
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: globeVert,
        fragmentShader: globeFrag.replace('#include <noise>', noise),
        uniforms: {
          uImagery: { value: null },
          uDetail: { value: null },
          uDetailBounds: { value: new THREE.Vector4() },
          uHasDetail: { value: 0 },
          uCoast: { value: null },
          uSeen: { value: emptySeen() },
          uSeenSize: { value: new THREE.Vector2(1, 1) },
          uHasSeen: { value: 0 },
          uDay: { value: 0 },
          uTicksPerDay: { value: 16 },
          uHist: { value: new Array(9).fill(0) },
          uTime: { value: 0 },
          uSunDir: { value: new THREE.Vector3(1, 0.3, 0).normalize() },
          uHome: { value: new THREE.Vector3(1, 0, 0) },
          uHomeRadius: { value: 0.11 },
          uHomeAmount: { value: 0 },
          uKnownAge: { value: 99 },
          uSatellite: { value: 0 },
          uFlat: { value: 0 },
          uParchment: { value: color(PALETTE.parchment) },
          uParchmentDark: { value: color(PALETTE.parchmentDark) },
          uParchmentLight: { value: color(PALETTE.parchmentLight) },
          uInk: { value: color(PALETTE.ink) },
          uChar: { value: color(PALETTE.char) },
          uEmber: { value: color(PALETTE.ember).multiplyScalar(0.55) },
          uSea: { value: color(PALETTE.sea) },
          uSeaDeep: { value: color(PALETTE.seaDeep) },
          uNight: { value: new THREE.Vector3(...NIGHT) },
        },
      }),
    [],
  );
  gl3.globe = material;
  const geometry = useMemo(() => new THREE.SphereGeometry(1, 384, 192), []);
  const [, setReady] = useState(0);

  // Imagery: a small image first so the globe is never blank, then the full size.
  useEffect(() => {
    const size = textureSize(gl.capabilities.maxTextureSize);
    gl3.size = size;
    const loader = new THREE.TextureLoader();
    let cancelled = false;
    const apply = (url: string) =>
      loader.loadAsync(url).then((tex) => {
        if (cancelled) return;
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
        tex.wrapS = THREE.RepeatWrapping;
        const old = material.uniforms.uImagery.value as THREE.Texture | null;
        material.uniforms.uImagery.value = tex;
        old?.dispose();
        setReady((n) => n + 1);
      });
    apply('/imagery/earth-2048.jpg')
      .then(() => apply(`/imagery/earth-${size}.jpg`))
      .catch((err) => stage.setError(`Could not load the globe imagery (${String(err)}).`));
    loadCoastTexture(size)
      .then(({ width, height, data }) => {
        if (cancelled) return;
        const t = new THREE.DataTexture(data, width, height, THREE.RGFormat, THREE.UnsignedByteType);
        t.minFilter = THREE.LinearMipmapLinearFilter;
        t.magFilter = THREE.LinearFilter;
        t.generateMipmaps = true;
        t.wrapS = THREE.RepeatWrapping;
        t.needsUpdate = true;
        material.uniforms.uCoast.value = t;
      })
      .catch((err) => stage.setError(`Could not load the coastline data (${String(err)}).`));
    return () => {
      cancelled = true;
    };
  }, [gl, material]);

  // Sharper imagery for the voyage's region, swapped in when it arrives.
  const detailFor = useRef<string | null>(null);
  const loadDetail = (id: string | null, bounds: { west: number; east: number; south: number; north: number } | undefined) => {
    const u = material.uniforms;
    if (id === detailFor.current) return;
    detailFor.current = id;
    u.uHasDetail.value = 0;
    (u.uDetail.value as THREE.Texture | null)?.dispose();
    u.uDetail.value = null;
    if (!id || !bounds) return;
    new THREE.TextureLoader()
      .loadAsync(`/baked/${id}/detail-${gl3.size}.jpg`)
      .then((tex) => {
        if (detailFor.current !== id) return tex.dispose();
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
        tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
        tex.flipY = false;
        u.uDetail.value = tex;
        u.uDetailBounds.value.set(bounds.west, bounds.north, bounds.east, bounds.south);
        u.uHasDetail.value = 1;
      })
      .catch(() => undefined); // the 8K globe is still there
  };

  // The voyage's first-seen texture.
  const version = useRef(-1);
  useFrame(() => {
    const u = material.uniforms;
    if (stage.version !== version.current) {
      version.current = stage.version;
      const old = u.uSeen.value as THREE.Texture;
      const s = stage.scene;
      if (s) {
        const t = new THREE.DataTexture(s.seen.data, s.seen.width, s.seen.height, THREE.RedIntegerFormat, THREE.UnsignedShortType);
        t.internalFormat = 'R16UI';
        t.minFilter = THREE.NearestFilter;
        t.magFilter = THREE.NearestFilter;
        t.generateMipmaps = false;
        t.unpackAlignment = 2;
        t.needsUpdate = true;
        u.uSeen.value = t;
        u.uSeenSize.value.set(s.seen.width, s.seen.height);
        u.uTicksPerDay.value = s.route.ticksPerDay;
        u.uHasSeen.value = 1;
        loadDetail(s.id, s.route.detail);
      } else {
        u.uSeen.value = emptySeen();
        u.uSeenSize.value.set(1, 1);
        u.uHasSeen.value = 0;
        loadDetail(null, undefined);
      }
      old.dispose();
    }
    u.uDay.value = stage.clock?.day ?? 0;
    (u.uHist.value as number[]).splice(0, 9, ...stage.hist);
    u.uTime.value = stage.time;
    u.uSunDir.value.set(...stage.sunDir).normalize();
    u.uHome.value.set(...stage.homeDir);
    u.uHomeAmount.value = stage.homeAmount;
    u.uKnownAge.value = stage.knownAge;
    u.uSatellite.value = stage.satellite;
  });

  return <mesh geometry={geometry} material={material} />;
}

function ribbonGeometry(r: Ribbon) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(r.position, 3));
  g.setAttribute('aOther', new THREE.BufferAttribute(r.other, 3));
  g.setAttribute('aSide', new THREE.BufferAttribute(r.side, 1));
  g.setAttribute('aT', new THREE.BufferAttribute(r.t, 1));
  g.setAttribute('aDist', new THREE.BufferAttribute(r.dist, 1));
  g.setAttribute('aFlag', new THREE.BufferAttribute(r.flag, 1));
  g.setIndex(new THREE.BufferAttribute(r.index, 1));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1.1);
  return g;
}

function lineMaterial(mode: number, hex: string, width: number, opacity: number) {
  return new THREE.ShaderMaterial({
    vertexShader: lineVert,
    fragmentShader: lineFrag,
    transparent: true,
    depthWrite: false,
    // Quads are built in screen space; their winding depends on direction.
    side: THREE.DoubleSide,
    uniforms: {
      uMode: { value: mode },
      uDay: { value: 0 },
      uInkDay: { value: 0 },
      uColor: { value: color(hex) },
      uRiverColor: { value: color(PALETTE.river) },
      uOpacity: { value: opacity },
      uDash: { value: 30 },
      uDraw: { value: 1 },
      uFade: { value: 1 },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uWidth: { value: width },
    },
  });
}

/** Route, ghost map and debated-landfall rings for the current scene. */
function buildRoute() {
  const s = stage.scene;
  const route = new RibbonBuilder(1.0016);
  const ghost = new RibbonBuilder(1.0014);
  if (!s) return { route: route.build(), ghost: ghost.build() };
  let dist = 0;
  for (let i = 1; i < s.points.length; i++) {
    const a = s.points[i - 1];
    const b = s.points[i];
    if (a.leg !== b.leg) continue;
    const km = distanceKm(a.lon, a.lat, b.lon, b.lat);
    route.segment([a.lon, a.lat], [b.lon, b.lat], a.day, b.day, dist, dist + km, a.dashed || b.dashed ? 1 : 0);
    dist += km;
  }
  // Rule 3: show disagreement. Each candidate landfall gets a dashed ring when the moment arrives.
  for (const m of s.moments) {
    for (const c of m.candidates ?? []) {
      const r = 0.3;
      let prev: [number, number] | null = null;
      let d = 0;
      for (let k = 0; k <= 36; k++) {
        const a = (k / 36) * Math.PI * 2;
        const p: [number, number] = [c.lon + (r * Math.sin(a)) / Math.cos((c.lat * Math.PI) / 180), c.lat + r * Math.cos(a)];
        if (prev) {
          route.segment(prev, p, m.day, m.day, d, d + 2.3, 1);
          d += 2.3;
        }
        prev = p;
      }
    }
  }
  for (const line of s.route.ghost ?? []) {
    const c = line.coords;
    const n = c.length / 3;
    let total = 0;
    for (let i = 1; i < n; i++) total += distanceKm(c[(i - 1) * 3], c[(i - 1) * 3 + 1], c[i * 3], c[i * 3 + 1]);
    let along = 0;
    for (let i = 1; i < n; i++) {
      const km = distanceKm(c[(i - 1) * 3], c[(i - 1) * 3 + 1], c[i * 3], c[i * 3 + 1]);
      ghost.segment([c[(i - 1) * 3], c[(i - 1) * 3 + 1]], [c[i * 3], c[i * 3 + 1]], c[(i - 1) * 3 + 2], c[i * 3 + 2], along / total, (along + km) / total, 0);
      along += km;
    }
  }
  return { route: route.build(), ghost: ghost.build() };
}

function Lines() {
  const { size } = useThree();
  const mats = useMemo(
    () => ({
      coast: lineMaterial(0, PALETTE.coast, 1.3, 0.9),
      route: lineMaterial(1, PALETTE.route, 2.4, 0.95),
      ghost: lineMaterial(2, PALETTE.ghost, 1.7, 0.62),
    }),
    [],
  );
  gl3.lines = [mats.coast, mats.ghost, mats.route];
  const [geo, setGeo] = useState<{ coast: THREE.BufferGeometry; route: THREE.BufferGeometry; ghost: THREE.BufferGeometry } | null>(null);
  const version = useRef(-1);

  useFrame(() => {
    if (stage.version !== version.current) {
      version.current = stage.version;
      geo?.coast.dispose();
      geo?.route.dispose();
      geo?.ghost.dispose();
      if (stage.scene) {
        const r = buildRoute();
        setGeo({ coast: ribbonGeometry(stage.scene.coast), route: ribbonGeometry(r.route), ghost: ribbonGeometry(r.ghost) });
      } else setGeo(null);
    }
    const day = stage.clock?.day ?? 0;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    for (const m of Object.values(mats)) {
      m.uniforms.uDay.value = day;
      m.uniforms.uResolution.value.set(size.width, size.height);
      m.uniforms.uInkDay.value = stage.hist[6];
      m.uniforms.uWidth.value = (m === mats.route ? 2.6 : m === mats.coast ? 1.3 : 1.7) * Math.max(1, dpr * 0.75);
    }
    mats.coast.uniforms.uFade.value = stage.lineFade * (stage.knownAge < 50 ? Math.min(1, Math.max(0, stage.knownAge / 2)) : 1);
    mats.ghost.uniforms.uFade.value = stage.lineFade;
    mats.ghost.uniforms.uDraw.value = stage.ghostDraw;
    mats.route.uniforms.uDash.value = Math.max(4, (stage.orbit.distance - 1) * 6371 * 0.014);
  });

  if (!geo) return null;
  return (
    <>
      <mesh geometry={geo.coast} material={mats.coast} renderOrder={1} frustumCulled={false} />
      <mesh geometry={geo.ghost} material={mats.ghost} renderOrder={2} frustumCulled={false} />
      <mesh geometry={geo.route} material={mats.route} renderOrder={3} frustumCulled={false} />
    </>
  );
}

function Stars() {
  const points = useMemo(() => {
    const n = 1400;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const base = color(PALETTE.star);
    for (let i = 0; i < n; i++) {
      const z = rnd() * 2 - 1;
      const a = rnd() * Math.PI * 2;
      const r = Math.sqrt(1 - z * z);
      pos.set([Math.cos(a) * r * 60, z * 60, Math.sin(a) * r * 60], i * 3);
      const b = 0.15 + rnd() ** 3 * 0.6;
      col.set([base.r * b, base.g * b, base.b * b], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  }, []);
  return (
    <points geometry={points} frustumCulled={false} ref={(p) => void (gl3.stars = p)}>
      <pointsMaterial size={1.6} sizeAttenuation={false} vertexColors transparent opacity={0.9} depthWrite={false} />
    </points>
  );
}

function Driver() {
  const { camera, size, gl, scene } = useThree();
  gl3.renderer = gl;
  gl3.scene = scene;
  const shift = useRef(0);
  const lift = useRef(0);
  useFrame((_, dt) => {
    stage.aspect = size.width / Math.max(1, size.height);
    stage.frame(dt);
    const o = stage.orbit;
    const [x, y, z] = o.position();
    camera.position.set(x, y, z);
    const { up } = o.frame();
    camera.up.set(...up);
    camera.lookAt(0, 0, 0);
    const cam = camera as THREE.PerspectiveCamera;
    cam.near = Math.max(0.005, (o.distance - 1) * 0.3);
    cam.far = 200;
    // On wide screens the globe sits to the right of the landing title and the ending cartouche.
    const wide = size.width > 900;
    const wantShift = wide && stage.screen === 'landing' ? -0.2 * size.width : wide && stage.screen === 'ending' ? -0.16 * size.width : 0;
    shift.current += (wantShift - shift.current) * (1 - Math.exp(-dt / 0.6));
    // On phones the ending globe rides above the cartouche.
    const wantLift = !wide && stage.screen === 'ending' && size.width < size.height ? 0.22 * size.height : 0;
    lift.current += (wantLift - lift.current) * (1 - Math.exp(-dt / 0.6));
    if (Math.abs(shift.current) > 0.5 || Math.abs(lift.current) > 0.5) cam.setViewOffset(size.width, size.height, shift.current, lift.current, size.width, size.height);
    else cam.clearViewOffset();
    cam.updateProjectionMatrix();
    overlay.update(camera, size.width, size.height);
  }, -1);
  return null;
}

export function GlobeCanvas() {
  return (
    <Canvas
      className="globe-canvas"
      dpr={[1, 1.75]}
      gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
      camera={{ fov: 40, position: [0, 0, 3], near: 0.01, far: 200 }}
      onCreated={({ gl }) => {
        gl.setClearColor(new THREE.Color('#120d09'));
      }}
    >
      <Driver />
      <Stars />
      <Globe />
      <Lines />
    </Canvas>
  );
}
