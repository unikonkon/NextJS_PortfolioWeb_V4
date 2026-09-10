import * as THREE from 'three';
import { clamp, smooth, terrainNoise } from './journeyMath';

export type WaterImpact = { point: THREE.Vector3; normal: THREE.Vector3 };
type SurfacePoint = WaterImpact;
export type DrainagePath = { points: SurfacePoint[]; distances: number[]; seed: number; speed: number; width: number; riverIndex: number };
// Matches the precipitation's +X/+Z wind. Gravity still governs flow along the surface.
const rainWind = new THREE.Vector3(1, 0, 0.24).normalize();

/** A small spatial index over actual triangles: exact height/normal queries, only during construction. */
export function createWaterSurface(surfaces: THREE.Mesh[]) {
  type Triangle = { a: THREE.Vector3; b: THREE.Vector3; c: THREE.Vector3; normal: THREE.Vector3; denominator: number };
  const cells = new Map<string, Triangle[]>();
  const cellSize = 0.4;
  const bounds = new THREE.Box3();
  for (const surface of surfaces) {
    surface.updateWorldMatrix(true, false);
    const geometry = surface.geometry, positions = geometry.getAttribute('position'), indices = geometry.index;
    for (let i = 0; i < (indices?.count ?? positions.count); i += 3) {
      const vertices = [0, 1, 2].map(j => new THREE.Vector3().fromBufferAttribute(positions, indices ? indices.getX(i + j) : i + j).applyMatrix4(surface.matrixWorld));
      const [a, b, c] = vertices;
      const normal = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
      if (normal.y < 0.00001) continue;
      const denominator = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z);
      const triangle = { a, b, c, normal, denominator };
      vertices.forEach(vertex => bounds.expandByPoint(vertex));
      const minX = Math.floor(Math.min(a.x, b.x, c.x) / cellSize), maxX = Math.floor(Math.max(a.x, b.x, c.x) / cellSize);
      const minZ = Math.floor(Math.min(a.z, b.z, c.z) / cellSize), maxZ = Math.floor(Math.max(a.z, b.z, c.z) / cellSize);
      for (let x = minX; x <= maxX; x++) for (let z = minZ; z <= maxZ; z++) {
        const key = `${x},${z}`, list = cells.get(key) ?? [];
        list.push(triangle); cells.set(key, list);
      }
    }
  }
  return {
    bounds,
    sample(x: number, z: number): SurfacePoint | null {
      const list = cells.get(`${Math.floor(x / cellSize)},${Math.floor(z / cellSize)}`);
      let best: Triangle | undefined, height = -Infinity;
      for (const triangle of list ?? []) {
        const { a, b, c, denominator } = triangle;
        const u = ((b.z - c.z) * (x - c.x) + (c.x - b.x) * (z - c.z)) / denominator;
        const v = ((c.z - a.z) * (x - c.x) + (a.x - c.x) * (z - c.z)) / denominator;
        if (u < -1e-6 || v < -1e-6 || u + v > 1.000001) continue;
        const y = u * a.y + v * b.y + (1 - u - v) * c.y;
        if (y > height) { height = y; best = triangle; }
      }
      return best ? { point: new THREE.Vector3(x, height, z), normal: best.normal.clone() } : null;
    },
  };
}

/** One connected channel from the eastern foothill to the existing island outlet, including the falling lip. */
export function createRiverCourse(mobile: boolean) {
  const controls = [
    [3.4, 0.07, -0.55], [2.95, 0.064, 0.25], [2.2, 0.057, 0.9], [1.4, 0.05, 1.6],
    [1.08, 0.04, 2.55], [0.8, 0.03, 3.6], [0.34, 0.02, 4.6], [0.05, 0.012, 5.46],
    [-0.015, -0.12, 5.65], [-0.06, -0.65, 5.75], [-0.14, -3.45, 5.85],
  ].map(point => new THREE.Vector3(...point));
  const curve = new THREE.CatmullRomCurve3(controls, false, 'centripetal');
  const count = mobile ? 100 : 160;
  const points = curve.getPoints(count);
  // Monotone height even at the transition from a shallow channel to the waterfall lip.
  for (let i = 1; i < points.length; i++) points[i].y = Math.min(points[i].y, points[i - 1].y);
  return points;
}

export function traceDrainage(surface: ReturnType<typeof createWaterSurface>, sources: WaterImpact[], river: THREE.Vector3[], mobile: boolean) {
  const paths: DrainagePath[] = [];
  const landing = river.filter(point => point.y > 0);
  const nearest = (point: THREE.Vector3) => {
    let best = 0, distance = Infinity;
    landing.forEach((target, i) => { const d = Math.hypot(target.x - point.x, target.z - point.z); if (d < distance) { distance = d; best = i; } });
    return { index: best, distance };
  };
  // Shuffle a fixed pool of real rain impacts; no random allocation or path finding in the frame loop.
  const candidates = sources.filter(hit => hit.point.y > 0.65 && hit.point.y < 10.5 && hit.point.x > -1.6 && hit.normal.dot(rainWind) > 0.05)
    .map((hit, index) => ({ hit, key: terrainNoise(index + 718) })).sort((a, b) => a.key - b.key).slice(0, mobile ? 48 : 80);
  for (const { hit } of candidates) {
    if (paths.length >= (mobile ? 12 : 22)) break;
    if (paths.some(path => path.points[0].point.distanceTo(hit.point) < 0.5)) continue;
    let current = surface.sample(hit.point.x, hit.point.z);
    if (!current) continue;
    const points: SurfacePoint[] = [current], distances = [0];
    let previous = new THREE.Vector3(current.normal.x, 0, current.normal.z).normalize();
    let riverIndex = -1;
    for (let step = 0; step < 230; step++) {
      const goal = nearest(current.point);
      if (current.point.y < 0.12 && goal.distance < 0.24) { riverIndex = goal.index; break; }
      const downhill = new THREE.Vector3(current.normal.x, 0, current.normal.z).normalize();
      const toRiver = landing[goal.index].clone().sub(current.point); toRiver.y = 0; toRiver.normalize();
      const flat = current.point.y < 0.12;
      const preferred = flat ? toRiver : downhill.multiplyScalar(0.8).addScaledVector(rainWind, 0.24).addScaledVector(previous, 0.3).normalize();
      // Shorter horizontal steps on steep rock keep the ribbon attached to narrow ridges.
      const stride = flat ? 0.105 : clamp(current.normal.y * 0.21, 0.025, 0.10);
      let best: SurfacePoint | null = null, bestScore = -Infinity, direction = previous;
      const heading = Math.atan2(preferred.z, preferred.x);
      for (let turn = -5; turn <= 5; turn++) {
        const angle = heading + turn * 0.27, dx = Math.cos(angle), dz = Math.sin(angle);
        const sample = surface.sample(current.point.x + dx * stride, current.point.z + dz * stride);
        if (!sample || sample.point.y > current.point.y + 0.0001) continue;
        const drop = current.point.y - sample.point.y;
        const score = (flat ? 0 : Math.min(4, drop / stride) * 0.35) + dx * preferred.x + dz * preferred.z
          + (dx * previous.x + dz * previous.z) * 0.25;
        if (score > bestScore) { best = sample; bestScore = score; direction = new THREE.Vector3(dx, 0, dz); }
      }
      if (!best) break;
      distances.push(distances.at(-1)! + best.point.distanceTo(current.point));
      points.push(best); current = best; previous = direction;
    }
    if (riverIndex < 0 || points.length < 10) continue; // Never draw a channel with a disconnected outlet.
    // A shallow film above the terrace feeds the slightly inset river without an uphill lip.
    points.forEach(sample => { sample.point.y = Math.max(0.085, sample.point.y); });
    const mouth = landing[riverIndex].clone();
    distances.push(distances.at(-1)! + mouth.distanceTo(current.point));
    points.push({ point: mouth, normal: new THREE.Vector3(0, 1, 0) });
    distances[0] = 0;
    for (let i = 1; i < points.length; i++) distances[i] = distances[i - 1] + points[i].point.distanceTo(points[i - 1].point);
    const seed = terrainNoise(paths.length * 17 + 57);
    paths.push({ points, distances, seed, speed: 1.1 + seed * 0.8, width: 0.026 + seed * 0.018, riverIndex });
  }
  return paths;
}

/** CPU counterpart of the shader's source pulse, used only at the bounded number of river junctions. */
export function runoffPulse(distance: number, length: number, seed: number, speed: number, time: number, sourceEnd = Infinity) {
  const period = length / speed + 12 + seed * 6, clock = time - seed * 3.5;
  if (clock < 0) return 0;
  const cycle = Math.floor(clock / period), age = clock - cycle * period;
  if (cycle * period + seed * 3.5 > sourceEnd) return 0;
  // Small integer arithmetic agrees in JavaScript and GLSL; no precision-sensitive sine hash.
  const hash = (n: number) => { const h = (n * 73 + Math.floor(seed * 997) * 31) % 251; return ((h * h * 17 + 43) % 251) / 251; };
  const start = hash(cycle + 1) * length * 0.28;
  const arrival = (distance - start) / speed;
  const duration = 3 + hash(cycle + 4) * 4;
  return smooth((distance - start) / 0.2) * smooth((age - arrival) / 0.45) * (1 - smooth((age - arrival - duration) / 1.3));
}

function drainageGeometry(paths: DrainagePath[], surface: ReturnType<typeof createWaterSurface>) {
  const positions: number[] = [], uvs: number[] = [], metadata: number[] = [], indices: number[] = [];
  for (const path of paths) {
    const offset = positions.length / 3, length = path.distances.at(-1)!;
    path.points.forEach(({ point, normal }, i) => {
      const tangent = path.points[Math.min(i + 1, path.points.length - 1)].point.clone().sub(path.points[Math.max(0, i - 1)].point);
      const side = tangent.cross(normal).normalize();
      const width = path.width * (0.65 + 0.65 * path.distances[i] / length);
      for (const edge of [-1, 1]) {
        const bank = point.clone().addScaledVector(side, width * edge);
        const sample = surface.sample(bank.x, bank.z);
        bank.y = Math.max(bank.y, sample?.point.y ?? bank.y) + 0.026;
        positions.push(...bank.toArray()); uvs.push((edge + 1) / 2, path.distances[i]);
        metadata.push(path.seed, path.speed, length);
      }
      if (i) { const a = offset + i * 2; indices.push(a - 2, a, a - 1, a - 1, a, a + 1); }
    });
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('flowData', new THREE.Float32BufferAttribute(metadata, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals(); geometry.computeBoundingSphere();
  return geometry;
}

/** Curved channel strips, with a continuous distance coordinate through the waterfall. */
function riverGeometry(course: THREE.Vector3[], outer = false) {
  const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  let distance = 0;
  const crossSections = outer ? 2 : 8;
  course.forEach((point, i) => {
    if (i) distance += point.distanceTo(course[i - 1]);
    const tangent = course[Math.min(i + 1, course.length - 1)].clone().sub(course[Math.max(0, i - 1)]);
    const side = new THREE.Vector3(tangent.z, 0, -tangent.x).normalize();
    const fall = 1 - smooth((point.y + 0.6) / 0.65);
    const width = (0.24 + 0.05 * Math.sin(distance * 1.7) + 0.08 * Math.sin(distance * 0.45) ** 2) * (1 - fall * 0.20) + (outer ? 0.055 : 0);
    for (let j = 0; j <= crossSections; j++) {
      const across = j / crossSections;
      const vertex = point.clone().addScaledVector(side, (across * 2 - 1) * width);
      if (outer) vertex.y -= 0.018;
      positions.push(...vertex.toArray()); uvs.push(across, distance);
      if (i && j) { const a = i * (crossSections + 1) + j, b = a - crossSections - 1; indices.push(b - 1, a - 1, b, b, a - 1, a); }
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals(); geometry.computeBoundingSphere();
  return geometry;
}

export function createMountainWater(world: THREE.Group, mobile: boolean, surfaces: THREE.Mesh[], impacts: WaterImpact[]) {
  const root = new THREE.Group(); root.name = 'mountain-water'; world.add(root);
  const surface = createWaterSurface(surfaces);
  const course = createRiverCourse(mobile);
  const paths = traceDrainage(surface, impacts, course, mobile);
  const uniforms = { uTime: { value: 0 }, uRainAge: { value: 0 }, uSourceEnd: { value: 1e7 }, uWet: { value: 0 }, uRain: { value: 0 }, uWind: { value: 0 }, uFlux: { value: 0 }, uFlow: { value: 0 } };
  const runoffMaterial = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: `attribute vec3 flowData; varying vec3 vFlow; varying vec2 vUv;
      void main() { vUv = uv; vFlow = flowData; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1); }`,
    fragmentShader: `uniform float uTime, uRainAge, uSourceEnd, uWet, uWind; varying vec3 vFlow; varying vec2 vUv;
      float random(float n) {
        float h = mod(n * 73.0 + floor(vFlow.x * 997.0) * 31.0, 251.0);
        return mod(h * h * 17.0 + 43.0, 251.0) / 251.0;
      }
      void main() {
        float period = vFlow.z / vFlow.y + 12.0 + vFlow.x * 6.0;
        float clock = uRainAge - vFlow.x * 3.5;
        float cycle = floor(max(0.0, clock) / period), age = mod(max(0.0, clock), period);
        float source = random(cycle + 1.0) * vFlow.z * 0.28;
        float arrival = (vUv.y - source) / vFlow.y;
        float duration = 3.0 + random(cycle + 4.0) * 4.0;
        float pulse = step(cycle * period + vFlow.x * 3.5, uSourceEnd) * step(0.0, clock) * smoothstep(0.0, 0.2, vUv.y - source)
          * smoothstep(0.0, 0.45, age - arrival) * (1.0 - smoothstep(duration, duration + 1.3, age - arrival));
        float wet = pulse * uWet;
        float edge = pow(max(0.0, sin(vUv.x * 3.14159)), 0.7);
        float filament = sin(vUv.x * 17.0 + sin(vUv.y * 4.7 - uTime * 1.3) * (0.8 + uWind * 0.4));
        float flow = pow(0.5 + 0.5 * sin(vUv.y * 15.0 - uTime * vFlow.y * 15.0 + filament), 8.0);
        float head = exp(-pow((age - arrival) * 4.0, 2.0));
        vec3 water = mix(vec3(0.07,0.20,0.22), vec3(0.58,0.79,0.83), flow * 0.55 + head * 0.35);
        float alpha = wet * edge * (0.32 + flow * 0.34 + head * 0.2);
        if (alpha < 0.008) discard;
        gl_FragColor = vec4(water, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const runoff = new THREE.Mesh(drainageGeometry(paths, surface), runoffMaterial); runoff.name = 'mountain-runoff'; root.add(runoff);
  const riverMaterial = new THREE.ShaderMaterial({
    uniforms, side: THREE.DoubleSide,
    vertexShader: `uniform float uTime, uFlux; varying vec2 vUv; varying vec3 vPosition; varying vec3 vView;
      void main() {
        vUv = uv; vec3 p = position;
        float edge = sin(uv.x * 3.14159);
        float onRiver = smoothstep(-0.15, 0.01, p.y);
        p.y += onRiver * edge * (0.004 + uFlux * 0.006) * sin(uv.y * 9.0 - uTime * 2.2 + uv.x * 5.0);
        vPosition = p; vView = cameraPosition - (modelMatrix * vec4(p, 1)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1);
      }`,
    fragmentShader: `uniform float uTime, uFlow, uRain, uFlux, uWind; varying vec2 vUv; varying vec3 vPosition; varying vec3 vView;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      void main() {
        float across = vUv.x, along = vUv.y;
        float edge = pow(abs(across * 2.0 - 1.0), 3.0);
        float fall = 1.0 - smoothstep(-0.5, 0.0, vPosition.y);
        float flow = along - uFlow;
        float ripple = sin(flow * 18.0 + sin(across * 25.0 + flow * 3.0) * 1.7);
        float fine = sin(flow * 43.0 + across * 35.0 + sin(flow * 5.0)) * 0.5 + 0.5;
        float fresnel = pow(1.0 - abs(normalize(vView).y), 3.0);
        vec3 deep = vec3(0.025, 0.18, 0.20), shallow = vec3(0.16, 0.36, 0.32);
        vec3 color = mix(deep, shallow, edge * 0.7 + 0.12 * ripple);
        color = mix(color, vec3(0.47, 0.66, 0.72), 0.18 + fresnel * 0.42);
        float glint = pow(max(0.0, ripple), 18.0) * (0.08 + fine * 0.13);
        float foam = smoothstep(0.79, 1.0, fine) * (edge * 0.18 + fall * 0.55) * (0.45 + uFlux * 0.55);
        // Small rain rings are stretched by the current and advected in the same downstream UV direction.
        vec2 cellUv = vec2(across * 4.0, along * 3.2 - uFlow * 0.45);
        vec2 cell = floor(cellUv), q = fract(cellUv) - 0.5;
        float seed = hash(cell), age = fract(uTime * (0.9 + seed * 0.4) + seed * 7.0);
        q.x += sin(age * 3.14) * uWind * 0.06;
        float ring = (1.0 - smoothstep(0.015, 0.045, abs(length(q) - age * 0.46))) * (1.0 - age);
        color += vec3(glint + foam + ring * uRain * (1.0 - fall) * 0.13);
        gl_FragColor = vec4(color, 1);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const river = new THREE.Mesh(riverGeometry(course), riverMaterial); river.name = 'flowing-river'; root.add(river);
  const bedMaterial = new THREE.MeshStandardMaterial({ color: '#667366', roughness: 0.93, side: THREE.DoubleSide });
  const bed = new THREE.Mesh(riverGeometry(course.filter(point => point.y > 0), true), bedMaterial); bed.name = 'river-banks'; bed.receiveShadow = true; root.add(bed);
  // A single instanced draw call softens the banks with small stones rather than a rectangular blue strip.
  const stoneMaterial = new THREE.MeshStandardMaterial({ color: '#8a9180', roughness: 0.96 });
  const stones = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), stoneMaterial, mobile ? 32 : 54);
  stones.name = 'river-stones'; stones.receiveShadow = true;
  const transform = new THREE.Object3D();
  const bankCourse = course.filter(point => point.y > 0.015);
  for (let i = 0; i < stones.count; i++) {
    const index = Math.min(bankCourse.length - 2, Math.floor(i / stones.count * bankCourse.length));
    const point = bankCourse[index], tangent = bankCourse[index + 1].clone().sub(point).normalize();
    const side = new THREE.Vector3(tangent.z, 0, -tangent.x).normalize();
    transform.position.copy(point).addScaledVector(side, (i % 2 ? -1 : 1) * (0.31 + terrainNoise(i + 8) * 0.045));
    transform.position.y = Math.max(0.015, point.y - 0.045);
    const size = 0.055 + terrainNoise(i + 41) * 0.055;
    transform.scale.set(size * 1.3, size * 0.55, size);
    transform.rotation.set(0.1, terrainNoise(i) * 6.28, 0.2); transform.updateMatrix(); stones.setMatrixAt(i, transform.matrix);
  }
  stones.instanceMatrix.needsUpdate = true; stones.computeBoundingSphere(); root.add(stones);
  let rainAge = 0, flow = 0, flux = 0, wet = 0, previousTime: number | undefined;
  let previousRain = 0, wasPaused = false, sourceEnd = 0;
  const water = {
    root, paths, course, state: { flux: 0, flow: 0, rainAge: 0, activeSources: 0 },
    update(elapsed: number, rain: number, wind: number, paused: boolean) {
      const first = previousTime === undefined;
      const dt = first ? 0 : Math.min(0.1, Math.max(0, elapsed - previousTime!)); previousTime = elapsed;
      const snap = first || (paused && wasPaused && Math.abs(rain - previousRain) > 0.01);
      wet += (rain - wet) * (snap ? 1 : paused ? 0 : 1 - Math.exp(-dt * (rain > wet ? 1.8 : 0.32)));
      if (rain > 0.01 || wet > 0.01) { if (snap) rainAge = 10; else if (!paused) rainAge += dt; } else rainAge = 0;
      if (rain > 0.02) sourceEnd = 1e7;
      else if (previousRain > 0.02 || first) sourceEnd = rainAge;
      let arriving = 0, activeSources = 0;
      for (const path of paths) {
        const length = path.distances.at(-1)!;
        arriving += runoffPulse(length, length, path.seed, path.speed, rainAge, sourceEnd);
        if (runoffPulse(length * 0.4, length, path.seed, path.speed, rainAge, sourceEnd) * wet > 0.05) activeSources++;
      }
      const incoming = rain * 0.24 + wet * arriving / Math.max(1, paths.length) * 1.6;
      flux += (Math.min(1, incoming) - flux) * (snap ? 1 : paused ? 0 : 1 - Math.exp(-dt * 0.6));
      if (!paused) flow += dt * (0.26 + flux * 0.8);
      uniforms.uTime.value = elapsed; uniforms.uRainAge.value = rainAge; uniforms.uSourceEnd.value = sourceEnd; uniforms.uWet.value = wet;
      uniforms.uRain.value = rain; uniforms.uWind.value = wind; uniforms.uFlux.value = flux; uniforms.uFlow.value = flow;
      runoff.visible = wet > 0.01;
      Object.assign(water.state, { flux, flow, rainAge, activeSources });
      previousRain = rain; wasPaused = paused;
    },
    dispose() {
      [runoff, river, bed, stones].forEach(object => { object.geometry.dispose(); object.material.dispose(); });
      stones.dispose(); root.removeFromParent();
    },
  };
  return water;
}
