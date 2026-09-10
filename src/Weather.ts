import * as THREE from 'three';
import { altitudeAt, smooth } from './journeyMath';

/** Fade edges in displayed metres; wind accompanies both rain and alpine snow. */
export const weatherBands = {
  rain: [210, 290, 1020, 1120],
  wind: [210, 400, 2800, 2950],
  snow: [1120, 1230, 2800, 2950],
} as const;

export function weatherAtAltitude(altitude: number) {
  const band = ([a, b, c, d]: readonly number[]) => smooth((altitude - a) / (b - a)) * (1 - smooth((altitude - c) / (d - c)));
  return { rain: band(weatherBands.rain), wind: band(weatherBands.wind), snow: band(weatherBands.snow) };
}

const random = (seed: number) => { const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };
type Impact = { point: THREE.Vector3; normal: THREE.Vector3 };
export type RunoffPath = { left: THREE.Vector3[]; right: THREE.Vector3[] };

/** Raycast once against the rendered mountain and terrace triangles, never in the frame loop. */
function sampleImpacts(surfaces: THREE.Mesh[], count: number): Impact[] {
  const bounds = new THREE.Box3();
  surfaces.forEach(surface => { surface.updateWorldMatrix(true, false); bounds.union(new THREE.Box3().setFromObject(surface)); });
  const ray = new THREE.Raycaster();
  ray.ray.direction.set(0, -1, 0);
  const hits: Impact[] = [];
  for (let i = 0; i < count * 8 && hits.length < count; i++) {
    ray.ray.origin.set(THREE.MathUtils.lerp(bounds.min.x, bounds.max.x, random(i * 3 + 1)), bounds.max.y + 1,
      THREE.MathUtils.lerp(bounds.min.z, bounds.max.z, random(i * 3 + 2)));
    const hit = ray.intersectObjects(surfaces, false)[0];
    if (!hit?.face) continue;
    const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
    hits.push({ point: hit.point.clone().addScaledVector(normal, 0.018), normal });
  }
  return hits;
}

function impactGeometry(hits: Impact[], verticesPer: number) {
  const positions: number[] = [], normals: number[] = [], seeds: number[] = [];
  hits.forEach(({ point, normal }, index) => {
    for (let vertex = 0; vertex < verticesPer; vertex++) {
      positions.push(...point.toArray()); normals.push(...normal.toArray());
      seeds.push(random(index * 7 + 4), random(index * 11 + 5), vertex);
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('seed', new THREE.Float32BufferAttribute(seeds, 3));
  return geometry;
}

const shared = `
  uniform float uTime, uIntensity, uWind, uTravel, uPixelRatio;
  attribute vec3 seed;
  varying float vAlpha;
  vec3 windDirection = normalize(vec3(1.0, 0.0, 0.24));
  float dropSpeed() { return 10.0 + seed.x * 7.0; }
  float dropHeight() { return 7.0 + seed.x * 7.0; }
  float dropAge() { return mod(uTime + seed.y * 7.0, dropHeight() / dropSpeed() + 0.48); }
  vec3 tangent(vec3 n) { return normalize(cross(n, abs(n.y) > 0.95 ? vec3(0,0,1) : vec3(0,1,0))); }
`;
const lineFragment = `varying float vAlpha; uniform vec3 uColor;
  void main() {
    if (vAlpha < 0.005) discard;
    gl_FragColor = vec4(uColor, vAlpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;
const rainVertex = `${shared}
  void main() {
    float height = dropHeight() - dropAge() * dropSpeed();
    float tail = seed.z * (0.24 + seed.x * 0.22);
    vec3 fall = vec3(0, 1, 0) - windDirection * (0.13 + uWind * 0.17);
    vec3 p = position + fall * (max(0.0, height) + tail);
    vAlpha = uIntensity * (0.28 + seed.x * 0.32) * step(0.0, height) * (1.0 - seed.z * 0.65);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1);
  }`;
const splashVertex = `${shared}
  void main() {
    float age = dropAge() - dropHeight() / dropSpeed();
    float t = max(0.0, age);
    float angle = seed.z * 2.39996 + seed.y * 6.28318;
    vec3 side = tangent(normal);
    vec3 radial = side * cos(angle) + cross(normal, side) * sin(angle);
    vec3 p = position + radial * t * (0.4 + seed.x * 0.5)
      + normal * max(0.0, t * 1.45 - 3.3 * t * t) + windDirection * t * t * uWind * 0.6;
    vAlpha = uIntensity * step(0.0, age) * (1.0 - smoothstep(0.20, 0.44, t)) * 0.72;
    gl_PointSize = (1.5 + seed.x * 1.6) * uPixelRatio;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1);
  }`;
const softPointFragment = `varying float vAlpha; uniform vec3 uColor;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float alpha = (1.0 - smoothstep(0.12, 0.5, d)) * vAlpha;
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(uColor, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;
const rippleVertex = `${shared} varying vec2 vUv;
  void main() {
    vec2 corner = vec2(mod(seed.z, 2.0), floor(seed.z / 2.0));
    vUv = corner * 2.0 - 1.0;
    float age = dropAge() - dropHeight() / dropSpeed();
    float radius = 0.025 + max(0.0, age) * 0.28;
    vec3 side = tangent(normal);
    vec3 p = position + normal * 0.008 + (side * vUv.x + cross(normal, side) * vUv.y) * radius;
    vAlpha = uIntensity * step(0.0, age) * (1.0 - smoothstep(0.08, 0.46, age)) * 0.42;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1);
  }`;
const rippleFragment = `varying vec2 vUv; varying float vAlpha; uniform vec3 uColor;
  void main() {
    float radius = length(vUv);
    float ring = smoothstep(0.64, 0.78, radius) * (1.0 - smoothstep(0.82, 1.0, radius));
    gl_FragColor = vec4(uColor, ring * vAlpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;
const snowVertex = `${shared}
  void main() {
    float cycle = fract(seed.y + uTime * (0.035 + seed.x * 0.025));
    float height = (1.0 - cycle) * 18.0;
    float drift = smoothstep(0.0, 1.8, height);
    vec3 p = position + vec3(0, height, 0);
    // Integrated travel gives continuous sideways movement even as the gust speeds up or eases.
    p += windDirection * (sin(uTravel * 0.2 + seed.y * 6.28318) * 1.1 - height * (0.10 + uWind * 0.08)) * drift;
    p.x += sin(uTime * 0.8 + seed.y * 21.0) * 0.32 * drift;
    p.z += cos(uTime * 0.55 + seed.y * 17.0) * 0.24 * drift;
    vAlpha = uIntensity * (0.5 + seed.x * 0.45) * smoothstep(0.0, 0.2, height) * (1.0 - smoothstep(16.0, 18.0, height));
    gl_PointSize = uPixelRatio * (2.1 + seed.x * 3.0);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1);
  }`;
const snowFragment = `varying float vAlpha; uniform vec3 uColor;
  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float radius = length(p);
    float angle = atan(p.y, p.x);
    float arms = 0.75 + 0.25 * cos(angle * 6.0);
    float alpha = (1.0 - smoothstep(0.09, 0.49 * arms, radius)) * vAlpha;
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(uColor, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;
const windVertex = `${shared}
  void main() {
    float cycle = fract(seed.x + uTravel * (0.023 + seed.y * 0.009));
    float along = seed.z / 7.0;
    float x = -11.0 + cycle * 22.0 + along * (0.8 + uWind * 1.4);
    vec3 p = vec3(x, position.y + sin(along * 3.14159 + seed.y * 6.28 + uTime) * 0.07,
      position.z + x * 0.24);
    vAlpha = uIntensity * (0.08 + uWind * 0.17) * sin(along * 3.14159)
      * smoothstep(0.0, 0.12, cycle) * (1.0 - smoothstep(0.85, 1.0, cycle));
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1);
  }`;

function runoffGeometry(paths: RunoffPath[]) {
  const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  paths.forEach(({ left, right }) => {
    const offset = positions.length / 3;
    let distance = 0;
    left.forEach((point, index) => {
      if (index) distance += point.distanceTo(left[index - 1]);
      positions.push(...point.toArray(), ...right[index].toArray());
      uvs.push(0, distance, 1, distance);
      if (index) { const a = offset + index * 2; indices.push(a - 2, a, a - 1, a - 1, a, a + 1); }
    });
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return geometry;
}

export function createWeather(world: THREE.Group, mobile: boolean, pixelRatio: number, surfaces: THREE.Mesh[], paths: RunoffPath[]) {
  const root = new THREE.Group();
  root.name = 'mountain-weather';
  world.add(root); // Same coordinate system as the terrain, including pointer-driven world rotation.
  const hits = sampleImpacts(surfaces, mobile ? 480 : 1100);
  const state = { rain: 0, wind: 0, snow: 0, gust: 0, wet: 0 };
  const uniforms = { uTime: { value: 0 }, uWind: { value: 0 }, uTravel: { value: 0 }, uPixelRatio: { value: pixelRatio } };
  const material = (vertexShader: string, fragmentShader: string, color: string) => new THREE.ShaderMaterial({
    vertexShader, fragmentShader, transparent: true, depthWrite: false,
    uniforms: { ...uniforms, uIntensity: { value: 0 }, uColor: { value: new THREE.Color(color) } },
  });
  const rain = new THREE.LineSegments(impactGeometry(hits, 2), material(rainVertex, lineFragment, '#b9d4e4'));
  rain.name = 'terrain-rain';
  const splashes = new THREE.Points(impactGeometry(hits.filter((_, i) => i % 3 === 0), 3), material(splashVertex, softPointFragment, '#deeff6'));
  // Keep original seed indices: rain, splashes and rings must share the exact impact time.
  const splashSeeds = splashes.geometry.getAttribute('seed');
  for (let i = 0; i < splashSeeds.count; i++) { const source = Math.floor(i / 3) * 3; splashSeeds.setXY(i, random(source * 7 + 4), random(source * 11 + 5)); }
  splashes.name = 'rain-splashes';
  const rippleHits = hits.filter((_, i) => i % 4 === 0);
  const ripples = new THREE.Mesh(impactGeometry(rippleHits, 4), material(rippleVertex, rippleFragment, '#c5e6ed'));
  const rippleSeeds = ripples.geometry.getAttribute('seed');
  for (let i = 0; i < rippleSeeds.count; i++) { const source = Math.floor(i / 4) * 4; rippleSeeds.setXY(i, random(source * 7 + 4), random(source * 11 + 5)); }
  ripples.geometry.setIndex(rippleHits.flatMap((_, index) => { const a = index * 4; return [a, a + 1, a + 2, a + 2, a + 1, a + 3]; }));
  ripples.material.side = THREE.DoubleSide;
  ripples.name = 'surface-ripples';
  const snow = new THREE.Points(impactGeometry(hits.slice(0, mobile ? 360 : 850), 1), material(snowVertex, snowFragment, '#f4faff'));
  snow.name = 'windborne-snow';
  const windGeometry = impactGeometry(hits.slice(0, mobile ? 28 : 56), 8);
  const windPositions = windGeometry.getAttribute('position');
  for (let i = 0; i < windPositions.count; i++) {
    const stream = Math.floor(i / 8);
    windPositions.setY(i, 0.6 + random(stream * 5 + 8) * 16);
    windPositions.setZ(i, -2.1 + (random(stream * 5 + 9) - 0.5) * 10);
  }
  const windIndices: number[] = [];
  for (let i = 0; i < windGeometry.getAttribute('position').count; i += 8) for (let j = 0; j < 7; j++) windIndices.push(i + j, i + j + 1);
  windGeometry.setIndex(windIndices);
  const wind = new THREE.LineSegments(windGeometry, material(windVertex, lineFragment, '#abc1ca'));
  wind.name = 'mountain-gusts';
  const runoff = new THREE.Mesh(runoffGeometry(paths), material(`varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1); }`, `
    uniform float uTime, uIntensity; varying vec2 vUv;
    void main() {
      float edge = smoothstep(0.0, 0.22, vUv.x) * (1.0 - smoothstep(0.78, 1.0, vUv.x));
      float flow = pow(0.5 + 0.5 * sin(vUv.y * 19.0 - uTime * 12.0 + sin(vUv.x * 12.0)), 6.0);
      float channel = 0.5 + 0.5 * sin(vUv.x * 26.0 + vUv.y * 3.0 - uTime * 2.0);
      vec3 color = mix(vec3(0.19, 0.37, 0.4), vec3(0.72, 0.88, 0.91), flow * 0.75 + channel * 0.15);
      gl_FragColor = vec4(color, edge * uIntensity * (0.27 + flow * 0.48));
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`, '#b8e1e5'));
  runoff.material.side = THREE.DoubleSide;
  runoff.name = 'mountain-runoff';
  const objects = [rain, splashes, ripples, snow, wind, runoff];
  objects.forEach(object => { object.frustumCulled = false; object.visible = false; root.add(object); });
  let previousTime: number | undefined;
  const weather = {
    root, state, lean: 0, travel: 0,
    impactCount: hits.length,
    update(progress: number, elapsed: number, paused: boolean) {
      const dt = previousTime === undefined ? 0 : Math.max(0, Math.min(0.1, elapsed - previousTime));
      const first = previousTime === undefined;
      previousTime = elapsed;
      const targets = weatherAtAltitude(altitudeAt(progress));
      const fade = paused || first ? 1 : 1 - Math.exp(-dt * 5);
      for (const key of ['rain', 'wind', 'snow'] as const) state[key] += (targets[key] - state[key]) * fade;
      // Unequal overlapping pulses; one clock drives snow, wind lines, trees, clouds and the runner.
      state.gust = 0.18 + 0.58 * Math.pow(0.5 + 0.5 * Math.sin(elapsed * 0.94 - 0.7), 3)
        + 0.24 * Math.pow(0.5 + 0.5 * Math.sin(elapsed * 1.73 + 1.2), 6);
      weather.lean = state.wind * (0.3 + state.gust * 0.7);
      if (!paused) weather.travel += dt * (0.35 + weather.lean * 3.8);
      state.wet += (state.rain - state.wet) * (paused || first ? 1 : 1 - Math.exp(-dt * (state.rain > state.wet ? 2 : 0.55)));
      uniforms.uTime.value = elapsed; uniforms.uWind.value = weather.lean; uniforms.uTravel.value = weather.travel;
      const intensities = [state.rain, state.rain, state.rain, state.snow, state.wind, state.wet];
      objects.forEach((object, i) => { object.material.uniforms.uIntensity.value = intensities[i]; object.visible = intensities[i] > 0.01; });
      root.visible = objects.some(object => object.visible);
      return { dim: state.rain * 0.43 + state.snow * 0.13, cool: Math.min(1, state.rain * 0.6 + state.snow * 0.82 + state.wind * 0.1) };
    },
    setPixelRatio(value: number) { uniforms.uPixelRatio.value = value; },
    dispose() { objects.forEach(object => { object.geometry.dispose(); object.material.dispose(); }); root.removeFromParent(); },
  };
  return weather;
}
