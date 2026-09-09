import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { altitudes, blend, clamp, measureProgress, mountainRadiusAt, mountainSnowline, smooth, terrainNoise, travel } from './journeyMath';
import { skillCategories } from '../data/skillCategories';
import { createMountainFarm } from './MountainFarm';
import { createSkyFlight, flightBoarding, flightEnd, flightStart } from './SkyFlight';
import { createSpaceEffects, createSpaceFlight, spaceBoarding, spaceBoardingStart } from './SpaceFlight';

/**
 * Journey — a single continuous low-poly world rendered once behind the page.
 * The world is a tall vertical column: ground (island & cabin) → mountain (trail,
 * milestone flags, summit) → sky (clouds, balloon, floating islands) → space
 * (planet, rocket, satellite, stars). The camera rises along that column as the
 * visitor scrolls through the four chapters, so the whole page reads as one trip.
 */

// Camera look-at points for each chapter (world units) plus one "beyond space" point.
// Each station sits ~7 units below its chapter's landmark: the strip of scene that stays visible above the
// content cards is 6–11 units above the camera target, so the summit, the floating islands and the planet
// are on screen exactly as their chapter opens.
// The mountain is 14 units tall; the sky and space chapters sit `lift` units higher than they would above a 10-unit peak.
const lift = 4;
const stations = [
  new THREE.Vector3(0.2, -0.2, 0.3),
  new THREE.Vector3(-0.8, 6.2, -2),
  new THREE.Vector3(0.9, 8.5 + lift, 0),
  new THREE.Vector3(0.4, 20.5 + lift, 0),
  new THREE.Vector3(0.4, 24.5 + lift, 0),
];
// Backdrop colours for each chapter (light → deep space).
const palette = ['#f4f1e4', '#e2e8dd', '#cfe1ef', '#101a2d', '#070b17'].map(hex => new THREE.Color(hex));

function colorAt(progress: number, out: THREE.Color) {
  const q = clamp(progress, 0, palette.length - 1);
  const index = Math.min(Math.floor(q), palette.length - 2);
  return out.copy(palette[index]).lerp(palette[index + 1], blend(q - index));
}

interface JourneyProps {
  paused: boolean;
  onChapter: (index: number) => void;
  onProgress?: (progress: number) => void;
  /** Called once if WebGL is unavailable, so the page can show the skill cards as a plain grid instead. */
  onFallback?: () => void;
}

export default function Journey({ paused, onChapter, onProgress, onFallback }: JourneyProps) {
  const host = useRef<HTMLDivElement>(null);
  const cards = useRef<(HTMLDivElement | null)[]>([]);
  const pauseRef = useRef(paused);
  const chapterRef = useRef(onChapter);
  const progressRef = useRef(onProgress);
  const fallbackRef = useRef(onFallback);
  const [failed, setFailed] = useState(false);
  useEffect(() => { pauseRef.current = paused; }, [paused]);
  useEffect(() => { fallbackRef.current = onFallback; }, [onFallback]);
  useEffect(() => { if (failed) fallbackRef.current?.(); }, [failed]);
  useEffect(() => { chapterRef.current = onChapter; progressRef.current = onProgress; }, [onChapter, onProgress]);

  useEffect(() => {
    const container = host.current!;
    const root = document.documentElement;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    } catch {
      setFailed(true);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-7, 7, 6, -6, 0.1, 200);
    const viewDirection = new THREE.Vector3(11, 9, 14).normalize();
    const hemisphere = new THREE.HemisphereLight(0xf8ffff, 0x65704a, 2.6);
    scene.add(hemisphere);
    const sun = new THREE.DirectionalLight(0xfff4d9, 3.8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 0.5, far: 80 });
    sun.shadow.bias = -0.00025;
    sun.shadow.normalBias = 0.025;
    scene.add(sun, sun.target);

    const world = new THREE.Group();
    scene.add(world);
    const materials = new Map<string, THREE.Material>();
    const material = (color: string, glow = false) => {
      const key = `${color}${glow ? '!' : ''}`;
      if (!materials.has(key)) materials.set(key, glow ? new THREE.MeshBasicMaterial({ color }) : new THREE.MeshStandardMaterial({ color, roughness: 0.86, flatShading: true }));
      return materials.get(key)!;
    };
    type Vec = [number, number, number];
    // Default parent for new objects: `world` for the ground and mountain, then the lifted `upper` group for sky and space.
    let stage: THREE.Object3D = world;
    function mesh(geometry: THREE.BufferGeometry, color: string, position: Vec, parent: THREE.Object3D = stage, glow = false) {
      const object = new THREE.Mesh(geometry, material(color, glow));
      object.position.set(...position);
      object.castShadow = !glow;
      object.receiveShadow = !glow;
      parent.add(object);
      return object;
    }
    const box = (size: Vec, color: string, position: Vec, parent: THREE.Object3D = stage) => mesh(new THREE.BoxGeometry(...size), color, position, parent);
    function group(position: Vec, parent: THREE.Object3D = stage, scale = 1) {
      const item = new THREE.Group();
      item.position.set(...position);
      item.scale.setScalar(scale);
      parent.add(item);
      return item;
    }
    function tree(position: Vec, scale = 1, parent: THREE.Object3D = stage) {
      const item = group(position, parent, scale);
      mesh(new THREE.CylinderGeometry(0.09, 0.13, 0.7, 6), '#75604a', [0, 0.3, 0], item);
      for (let layer = 0; layer < 3; layer++) mesh(new THREE.ConeGeometry(0.62 - layer * 0.13, 1.05, 7), ['#426747', '#547955', '#6c8c60'][layer], [0, 0.8 + layer * 0.38, 0], item);
    }
    const clouds: { group: THREE.Group; base: number; speed: number }[] = [];
    function cloud(position: Vec, scale = 1, speed = 1) {
      const item = group(position, stage, scale);
      for (let piece = 0; piece < 5; piece++) {
        const puff = mesh(new THREE.IcosahedronGeometry(0.6, 2), '#ffffff', [(piece - 2) * 0.48, Math.sin(piece * 2) * 0.17, Math.cos(piece) * 0.12], item);
        puff.scale.y = 0.65 + (piece % 2) * 0.4;
        puff.castShadow = false;
      }
      clouds.push({ group: item, base: position[0], speed });
    }
    function flag(position: Vec, color: string, height = 0.9, parent: THREE.Object3D = stage) {
      const item = group(position, parent);
      box([0.05, height, 0.05], '#5e655d', [0, height / 2, 0], item);
      const banner = box([0.5, 0.28, 0.03], color, [0.26, height - 0.16, 0], item);
      flags.push(banner);
      return item;
    }
    const flags: THREE.Mesh[] = [];
    const floaters: { object: THREE.Object3D; base: number; amplitude: number; phase: number }[] = [];
    const float = (object: THREE.Object3D, amplitude = 0.12, phase = 0) => floaters.push({ object, base: object.position.y, amplitude, phase });

    /* ---------- Chapter 1 · Ground: the island where the first line of code was written ---------- */
    // Broader foothill terrace supports the range and two farm plots without scaling the runner or cabin.
    const island = mesh(new THREE.CylinderGeometry(6.3, 4.5, 2.1, 12, 2), '#777260', [-1, -1.5, -1.3]);
    island.scale.set(1.2, 1, 1.12);
    island.rotation.y = 0.17;
    const islandBottom = mesh(new THREE.ConeGeometry(4.55, 2.2, 10), '#626859', [-1, -3.3, -1.3]);
    islandBottom.rotation.z = Math.PI;
    islandBottom.scale.set(1.2, 1, 1.12);
    const terrace = mesh(new THREE.CylinderGeometry(6.35, 6.2, 0.32, 12), '#a4b780', [-1, -0.3, -1.3]);
    const turf = mesh(new THREE.CylinderGeometry(6.22, 6.3, 0.16, 12), '#b8c693', [-1, -0.08, -1.3]);
    for (const layer of [terrace, turf]) { layer.rotation.y = 0.17; layer.scale.set(1.2, 1, 1.12); }
    const river = box([0.7, 0.06, 3.5], '#90ccd0', [1.4, 0.04, 1.15]);
    river.rotation.y = -0.18;
    box([0.38, 0.045, 2.85], '#90ccd0', [0.6, 0.025, 4.12]).rotation.y = -0.36;
    box([0.48, 3.4, 0.12], '#a3d8d9', [0.1, -1.68, 5.48]);
    for (let stream = 0; stream < 4; stream++) box([0.025, 2.8 - stream * 0.23, 0.03], '#d9efdf', [-0.06 + stream * 0.1, -1.55, 5.56]);
    ([[-2.9, 0, 1.2], [-3.7, 0, 0.9], [-2.3, 0, 2.3], [2.6, 0, -0.9], [3.1, 0, 0.3], [4.4, 0, -0.6], [-3.5, 0, 3.2], [-1.1, 0, 3]] as Vec[]).forEach((position, index) => tree(position, 0.6 + (index % 3) * 0.16));
    const farm = createMountainFarm(materials);
    world.add(farm.root);
    // The cabin: where curiosity started. A warm window glows so it reads as "home" from far away.
    const cabin = group([-0.1, 0.02, 1.3]);
    box([1.25, 0.95, 1], '#e8d8b4', [0, 0.48, 0], cabin);
    const roof = mesh(new THREE.ConeGeometry(1.03, 0.75, 4), '#6a7564', [0, 1.24, 0], cabin);
    roof.rotation.y = Math.PI / 4;
    roof.scale.z = 0.92;
    box([0.3, 0.55, 0.035], '#626c51', [0, 0.28, 0.52], cabin);
    box([0.28, 0.28, 0.04], '#f9cd75', [0.4, 0.6, 0.52], cabin);
    mesh(new THREE.BoxGeometry(0.2, 0.2, 0.03), '#ffe8a3', [0.4, 0.6, 0.53], cabin, true);
    box([0.2, 0.6, 0.2], '#a6a08a', [0.35, 1.4, -0.2], cabin);
    for (let step = 0; step < 4; step++) box([0.34, 0.055, 0.22], '#e1d9ba', [-0.1 - step * 0.16, 0.03, 1.95 + step * 0.3]);
    // Workbench with a tiny screen and electronics: the engineering roots (IoT, Arduino).
    const bench = group([1.6, 0, 2.15]);
    bench.rotation.y = -0.4;
    box([0.95, 0.06, 0.52], '#aa825d', [0, 0.36, 0], bench);
    for (const side of [-1, 1]) box([0.06, 0.34, 0.05], '#8c704b', [side * 0.38, 0.17, 0.18], bench);
    box([0.34, 0.24, 0.03], '#4c5d63', [-0.18, 0.52, -0.08], bench);
    mesh(new THREE.BoxGeometry(0.28, 0.17, 0.02), '#c7ed91', [-0.18, 0.53, -0.06], bench, true);
    box([0.14, 0.05, 0.1], '#e26d5a', [0.18, 0.42, 0.05], bench);
    box([0.1, 0.05, 0.1], '#6caaa9', [0.32, 0.42, -0.1], bench);
    box([0.08, 0.08, 0.08], '#f9cd75', [0.05, 0.43, 0.15], bench);
    // Signpost pointing up the mountain.
    const signpost = group([-1.35, 0, 2.55]);
    box([0.06, 1.15, 0.06], '#75604a', [0, 0.57, 0], signpost);
    const signTop = box([0.55, 0.16, 0.04], '#e1d9ba', [0.18, 1.0, 0], signpost);
    signTop.rotation.z = 0.12;
    box([0.42, 0.16, 0.04], '#c7ed91', [-0.12, 0.76, 0], signpost).rotation.z = -0.1;
    // Lantern by the door.
    box([0.05, 0.8, 0.05], '#5e655d', [0.85, 0.4, 1.95]);
    mesh(new THREE.OctahedronGeometry(0.11), '#ffd98a', [0.85, 0.88, 1.95], stage, true);
    for (let rock = 0; rock < 9; rock++) {
      const angle = rock * 2.39;
      const stone = mesh(new THREE.DodecahedronGeometry(0.2 + (rock % 3) * 0.07), '#a0aa91', [Math.cos(angle) * 3.5, 0.1, Math.sin(angle) * 3.3]);
      stone.scale.y = 0.55;
    }
    cloud([-4.8, -2.4, 1.6], 0.7, 0.6);
    cloud([4.6, -1.6, 2.6], 0.6, 0.8);

    /* ---------- Chapter 2 · Mountain: the climb, with one camp per skill category along a switchback trail ---------- */
    // The peak sits towards the back of the island so the wider foot of the taller mountain clears the cabin.
    const peak: Vec = [-0.9, -0.4, -2.1];
    const mountainHeight = 14; // 40% taller than the first version: room for one camp (and its card) per skill category
    const mountainRadius = 3.5;
    const facing = Math.atan2(14, 11); // camera-facing trail corridor
    const terrain: { surface: THREE.Mesh; base: Vec; height: number; radius: number; seed: number }[] = [];
    function detailedMountain(base: Vec, height: number, radius: number, color: string, seed: number) {
      const sectors = 18;
      const levels = 14;
      const positions: number[] = [];
      const indices: number[] = [];
      for (let level = 0; level <= levels; level++) {
        for (let sector = 0; sector < sectors; sector++) {
          const angle = sector / sectors * Math.PI * 2;
          const t = level / levels;
          const elevation = t + Math.sin(angle * 4 + seed + level * 1.3) * 0.035 * Math.sin(Math.PI * t);
          const r = mountainRadiusAt(radius, elevation, angle, seed);
          positions.push(Math.cos(angle) * r, elevation * height, Math.sin(angle) * r);
          if (level === levels) continue;
          const a = level * sectors + sector;
          const b = a + sectors;
          const c = level * sectors + (sector + 1) % sectors;
          indices.push(a, b, c);
          if (level < levels - 1) indices.push(c, b, c + sectors);
        }
      }
      const baseCenter = positions.length / 3;
      positions.push(0, 0, 0);
      for (let sector = 0; sector < sectors; sector++) indices.push(baseCenter, sector, (sector + 1) % sectors);
      const indexed = new THREE.BufferGeometry();
      indexed.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      indexed.setIndex(indices);
      const geometry = indexed.toNonIndexed();
      indexed.dispose();
      geometry.computeVertexNormals();
      const vertices = geometry.getAttribute('position');
      const colors: number[] = [];
      const grassColor = new THREE.Color(color);
      const rockColor = new THREE.Color('#88877c');
      const snowColor = new THREE.Color('#edf1e4');
      const faceColor = new THREE.Color();
      for (let face = 0; face < vertices.count; face += 3) {
        const x = (vertices.getX(face) + vertices.getX(face + 1) + vertices.getX(face + 2)) / 3;
        const z = (vertices.getZ(face) + vertices.getZ(face + 1) + vertices.getZ(face + 2)) / 3;
        const t = (vertices.getY(face) + vertices.getY(face + 1) + vertices.getY(face + 2)) / (3 * height);
        const snow = t > mountainSnowline(Math.atan2(z, x), seed);
        faceColor.copy(snow ? snowColor : grassColor);
        if (!snow) faceColor.lerp(rockColor, smooth((t - 0.24) / 0.48) * 0.8);
        const band = !snow && Math.sin(t * Math.PI * 13 + seed) > 0.55 ? 0.91 : 1;
        faceColor.multiplyScalar((0.94 + terrainNoise(seed * 91 + face) * 0.12) * band);
        for (let vertex = 0; vertex < 3; vertex++) colors.push(faceColor.r, faceColor.g, faceColor.b);
      }
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      const surfaceMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.98, flatShading: true });
      materials.set(`mountain-terrain-${seed}`, surfaceMaterial);
      const surface = new THREE.Mesh(geometry, surfaceMaterial);
      surface.position.set(...base);
      surface.castShadow = surface.receiveShadow = true;
      world.add(surface);
      surface.updateMatrixWorld(true);
      const mountain = { surface, base, height, radius, seed };
      terrain.push(mountain);
      return mountain;
    }
    // Two rear peaks frame the existing trail. Their bases sit behind the runner and skill camps.
    const rearPeaks: { base: Vec; height: number; radius: number; color: string }[] = [
      { base: [-5.6, -0.45, -3.0], height: 10.6, radius: 2.35, color: '#8d9b83' },
      { base: [0.5, -0.45, -6.4], height: 11.8, radius: 2.5, color: '#9eaa8d' },
    ];
    rearPeaks.forEach(({ base, height, radius, color }, index) => detailedMountain(base, height, radius, color, index + 2));
    const mainMountain = detailedMountain(peak, mountainHeight, mountainRadius, '#7b8b73', 1);
    detailedMountain([-3.4, -0.5, -0.4], 5.2, 1.8, '#97a48a', 4);
    detailedMountain([2.0, -0.5, -3.0], 3.8, 1.2, '#8e9c83', 5);
    const summit: Vec = [peak[0], peak[1] + mountainHeight, peak[2]];

    // Sample the actual triangles once at startup, so steps, plants and rocks sit on the new slopes.
    const slopeRay = new THREE.Raycaster();
    const radial = new THREE.Vector3();
    function slopePoint(mountain: typeof terrain[number], height: number, angle: number, clearance = 0.04): Vec {
      radial.set(Math.cos(angle), 0, Math.sin(angle));
      slopeRay.ray.origin.set(mountain.base[0], mountain.base[1] + height, mountain.base[2]).addScaledVector(radial, mountain.radius * 2);
      slopeRay.ray.direction.copy(radial).negate();
      const hit = slopeRay.intersectObject(mountain.surface, false)[0];
      if (hit) return hit.point.addScaledVector(radial, clearance).toArray() as Vec;
      const radius = mountainRadiusAt(mountain.radius, height / mountain.height, angle, mountain.seed) + clearance;
      return [mountain.base[0] + radial.x * radius, mountain.base[1] + height, mountain.base[2] + radial.z * radius];
    }

    // Repeated details share four instanced draw calls across the whole range, with no per-frame work.
    const rocks: { position: Vec; size: number; seed: number }[] = [];
    const pines: { position: Vec; size: number; seed: number }[] = [];
    terrain.forEach(mountain => {
      const count = mountain === mainMountain ? 38 : 20;
      for (let index = 0; index < count; index++) {
        const seed = mountain.seed * 100 + index;
        const angle = facing + (index % 2 ? -1 : 1) * (0.55 + terrainNoise(seed) * 1.5);
        const height = mountain.height * (0.06 + terrainNoise(seed + 17) * 0.66);
        const position = slopePoint(mountain, height, angle, 0.025);
        rocks.push({ position, size: 0.11 + terrainNoise(seed + 21) * 0.16, seed });
        if (index % 2 === 0 && height < mountain.height * 0.5) {
          pines.push({ position, size: 0.24 + terrainNoise(seed + 39) * 0.22, seed });
        }
      }
    });
    const instanceTransform = new THREE.Object3D();
    function detailInstances(geometry: THREE.BufferGeometry, color: string, details: typeof rocks, part: 'rock' | 'trunk' | 'lower' | 'upper') {
      const instances = new THREE.InstancedMesh(geometry, material(color), details.length);
      instances.castShadow = instances.receiveShadow = true;
      details.forEach(({ position, size, seed }, index) => {
        instanceTransform.position.set(...position);
        instanceTransform.rotation.set(0, terrainNoise(seed + 52) * Math.PI * 2, 0);
        if (part === 'rock') {
          instanceTransform.scale.set(size * 1.5, size * 0.7, size);
          instanceTransform.rotation.z = (terrainNoise(seed + 63) - 0.5) * 0.6;
        } else {
          instanceTransform.scale.setScalar(size);
          instanceTransform.position.y += size * ({ trunk: 0.27, lower: 0.7, upper: 1.05 }[part]);
        }
        instanceTransform.updateMatrix();
        instances.setMatrixAt(index, instanceTransform.matrix);
      });
      instances.instanceMatrix.needsUpdate = true;
      instances.computeBoundingSphere();
      world.add(instances);
    }
    detailInstances(new THREE.DodecahedronGeometry(1, 0), '#858a78', rocks, 'rock');
    detailInstances(new THREE.CylinderGeometry(0.07, 0.1, 0.54, 5), '#76614c', pines, 'trunk');
    detailInstances(new THREE.ConeGeometry(0.46, 0.95, 6), '#4b6c50', pines, 'lower');
    detailInstances(new THREE.ConeGeometry(0.34, 0.85, 6), '#698258', pines, 'upper');

    // A visible sun and lightweight rays; the existing shadow-casting light supplies the actual illumination.
    const mountainSun = group([0.5, 14.3, -5.5]);
    const sunDisc = mesh(new THREE.SphereGeometry(0.72, 20, 12), '#ffe6a1', [0, 0, 0], mountainSun, true);
    const sunDiscMaterial = new THREE.MeshBasicMaterial({ color: '#ffe6a1', transparent: true, depthWrite: false });
    sunDisc.material = sunDiscMaterial;
    materials.set('mountain-sun-disc', sunDiscMaterial);
    const glowCanvas = document.createElement('canvas');
    glowCanvas.width = glowCanvas.height = 128;
    const glowContext = glowCanvas.getContext('2d')!;
    const glowGradient = glowContext.createRadialGradient(64, 64, 8, 64, 64, 64);
    glowGradient.addColorStop(0, 'rgba(255, 229, 155, 0.85)');
    glowGradient.addColorStop(0.3, 'rgba(255, 207, 112, 0.4)');
    glowGradient.addColorStop(1, 'rgba(255, 207, 112, 0)');
    glowContext.fillStyle = glowGradient;
    glowContext.fillRect(0, 0, 128, 128);
    const glowTexture = new THREE.CanvasTexture(glowCanvas);
    glowTexture.colorSpace = THREE.SRGBColorSpace;
    const glowMaterial = new THREE.SpriteMaterial({ map: glowTexture, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    materials.set('mountain-sun-glow', glowMaterial);
    const sunGlow = new THREE.Sprite(glowMaterial);
    sunGlow.scale.set(4.8, 4.8, 1);
    mountainSun.add(sunGlow);
    const rayMaterial = new THREE.ShaderMaterial({
      uniforms: { strength: { value: 0 } },
      vertexShader: `varying vec2 rayUv;
        void main() { rayUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `varying vec2 rayUv; uniform float strength;
        void main() {
          float edge = pow(sin(rayUv.x * 3.14159265), 2.0);
          float fade = smoothstep(0.0, 0.2, rayUv.y) * (1.0 - smoothstep(0.75, 1.0, rayUv.y));
          gl_FragColor = vec4(1.0, 0.82, 0.48, edge * fade * strength * 0.12);
        }`,
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    });
    materials.set('mountain-sun-rays', rayMaterial);
    const sunRays = group([0, 0, 0]);
    const raySide = new THREE.Vector3(14, 0, -11).normalize();
    ([[-5.6, 4.4, -2.5], [-0.6, 6.5, -1.5], [1.3, 5.2, -5.8]] as Vec[]).forEach(destination => {
      const start = mountainSun.position;
      const end = new THREE.Vector3(...destination);
      const vertices = [start.clone().addScaledVector(raySide, -0.08), start.clone().addScaledVector(raySide, 0.08), end.clone().addScaledVector(raySide, -0.85), end.clone().addScaledVector(raySide, 0.85)];
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices.flatMap(vertex => vertex.toArray()), 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 1, 1, 0, 0, 1, 0], 2));
      geometry.setIndex([0, 2, 1, 1, 2, 3]);
      sunRays.add(new THREE.Mesh(geometry, rayMaterial));
    });
    const sunWorldPosition = new THREE.Vector3();
    const mountainLightTarget = new THREE.Vector3();
    const daylightColor = new THREE.Color('#fff4d9');
    const mountainLightColor = new THREE.Color('#ffdfa3');
    // Switchback trail on the camera-facing slope: it swings left and right of the facing direction, so the whole
    // climb (runner, flags and camps) stays in view. Each skill camp sits at the outer end of a switchback,
    // alternating left / right. Camps are read in pairs (left + right = one stop) and all eight sit on the lower
    // half of the slope, because every pair is on screen by 910 M on the altimeter (see cardAltitudes). Above the
    // camps the trail keeps zigzagging up to the summit. The swing is small, so the whole trail stays about half
    // the length of the first version (≈19 vs 38 units).
    const campBase = 1.4;
    const campSpacing = 1.15;
    const trailSwing = 0.27;
    const trailPoint = (height: number): Vec => {
      const angle = facing + trailSwing * Math.cos((Math.PI * (height - campBase)) / campSpacing);
      return slopePoint(mainMountain, height, angle, 0.08);
    };
    const trailVertices: number[] = [];
    const trailIndices: number[] = [];
    for (let step = 0; step <= 88; step++) {
      const height = 0.45 + step / 88 * (mountainHeight - 1.1);
      const angle = facing + trailSwing * Math.cos((Math.PI * (height - campBase)) / campSpacing);
      const width = 0.16 / Math.max(0.4, mountainRadiusAt(mountainRadius, height / mountainHeight, angle, 1));
      trailVertices.push(...slopePoint(mainMountain, height, angle - width, 0.035), ...slopePoint(mainMountain, height, angle + width, 0.035));
      if (step > 0) {
        const index = step * 2;
        trailIndices.push(index - 2, index, index - 1, index - 1, index, index + 1);
      }
    }
    const trailGeometry = new THREE.BufferGeometry();
    trailGeometry.setAttribute('position', new THREE.Float32BufferAttribute(trailVertices, 3));
    trailGeometry.setIndex(trailIndices);
    trailGeometry.computeVertexNormals();
    const trailMaterial = new THREE.MeshStandardMaterial({ color: '#ad9d7e', roughness: 1, side: THREE.DoubleSide });
    materials.set('mountain-trail', trailMaterial);
    const trailSurface = new THREE.Mesh(trailGeometry, trailMaterial);
    trailSurface.receiveShadow = true;
    world.add(trailSurface);
    for (let height = 0.5; height < mountainHeight - 1; height += 0.2) {
      const stone = box([0.24, 0.06, 0.24], Math.round(height / 0.2) % 2 ? '#d9c9a2' : '#e6dbbd', trailPoint(height));
      stone.rotation.y = height * 2;
    }
    const milestones: [number, string][] = [[2.9, '#e8c46a'], [6.9, '#e2a27a'], [11.6, '#c7ed91']];
    milestones.forEach(([height, color]) => flag(trailPoint(height), color, 0.95));
    // Base camp tent: the pause to learn before the next push.
    const camp = group(trailPoint(10.2));
    const tent = mesh(new THREE.ConeGeometry(0.42, 0.42, 4), '#d99a6c', [0, 0.21, 0], camp);
    tent.rotation.y = Math.PI / 4;
    mesh(new THREE.OctahedronGeometry(0.07), '#ffb26b', [0.35, 0.08, 0.2], camp, true);
    // Skill camps: a ledge and a signpost per category from data/skillCategories.ts. Their world positions are
    // projected every rendered frame to place the HTML skill cards (see updateSkillCards below).
    const campColors = ['#e8c46a', '#e2a27a', '#6caaa9', '#c7ed91', '#f9cd75', '#db9872', '#9fb8e8', '#e26d5a'];
    const campAnchors = skillCategories.map((_, index) => {
      const point = trailPoint(campBase + index * campSpacing);
      const ledge = group(point);
      mesh(new THREE.CylinderGeometry(0.36, 0.3, 0.1, 7), '#d9c9a2', [0, 0.03, 0], ledge);
      box([0.045, 0.62, 0.045], '#75604a', [0.14, 0.36, 0.06], ledge);
      box([0.36, 0.2, 0.035], campColors[index % campColors.length], [0.14, 0.6, 0.06], ledge);
      mesh(new THREE.OctahedronGeometry(0.06), '#fff6d6', [0.14, 0.78, 0.06], ledge, true);
      return new THREE.Vector3(point[0] + 0.14, point[1] + 0.9, point[2] + 0.06);
    });
    // Summit flag: the current chapter, planted at the top.
    flag(summit, '#c7ed91', 1.15);
    cloud([-4.6, 6.4, -0.6], 0.75, 0.7);
    cloud([3.8, 9.2, -2.4], 0.65, 0.9);
    cloud([-2.8, 12.6, 1.6], 0.55, 1.1);
    // Everything above the mountain lives in a group lifted by `lift`, so the sky and space keep their layout.
    const upper = group([0, lift, 0], world);
    stage = upper;

    /* ---------- Chapter 3 · Sky: experiments let loose above the clouds ---------- */
    const balloon = group([1.6, 16, 0.5], stage, 0.85);
    const envelope = mesh(new THREE.SphereGeometry(2, 12, 10), '#db9872', [0, 2.2, 0], balloon);
    envelope.scale.y = 1.15;
    mesh(new THREE.ConeGeometry(1.55, 1.8, 12), '#edc999', [0, 0.8, 0], balloon).rotation.z = Math.PI;
    box([0.9, 0.6, 0.8], '#9a7756', [0, -1.2, 0], balloon);
    for (const side of [-1, 1]) {
      box([0.04, 1.5, 0.04], '#7b6e5c', [side * 0.4, -0.3, 0.3], balloon);
      box([0.04, 1.5, 0.04], '#7b6e5c', [side * 0.4, -0.3, -0.3], balloon);
    }
    float(balloon, 0.22, 0);
    // Floating islands: ideas that became real projects.
    function floatingIsland(position: Vec, scale: number, phase: number) {
      const item = group(position, stage, scale);
      mesh(new THREE.CylinderGeometry(1, 0.55, 0.7, 7), '#777260', [0, -0.35, 0], item);
      mesh(new THREE.ConeGeometry(0.55, 0.9, 6), '#626859', [0, -1.1, 0], item).rotation.z = Math.PI;
      mesh(new THREE.CylinderGeometry(1.02, 0.95, 0.18, 7), '#a4b780', [0, 0.02, 0], item);
      tree([0.25, 0.1, 0.1], 0.55, item);
      mesh(new THREE.DodecahedronGeometry(0.16), '#a0aa91', [-0.45, 0.14, 0.2], item);
      float(item, 0.18, phase);
      return item;
    }
    const islandA = floatingIsland([-3.2, 14.4, -1], 1, 1.3);
    flag([0.4, 0.1, -0.4], '#e2a27a', 0.7, islandA);
    floatingIsland([3.9, 18.9, -1.8], 0.8, 2.6);
    // Paper planes: small experiments sent out to see what flies.
    for (const [index, position] of ([[-1.4, 13.2, 1.6], [-3.6, 17.8, 0.4], [3.2, 14.6, 1.2]] as Vec[]).entries()) {
      const plane = mesh(new THREE.TetrahedronGeometry(0.36), '#fbfbf4', position);
      plane.scale.set(1.1, 0.25, 1.5);
      plane.rotation.set(0.2, index * 1.4, -0.35 + index * 0.2);
      float(plane, 0.15, index * 1.7);
    }
    // Code tiles: little building blocks drifting between the clouds.
    ([['#c7ed91', -0.6, 18.4, 1.2], ['#f9cd75', 0.3, 13.6, -0.4], ['#e26d5a', -2.2, 16.1, 1.8], ['#6caaa9', 4.2, 16.9, 0.2]] as [string, number, number, number][]).forEach(([color, x, y, z], index) => {
      const tile = box([0.7, 0.07, 0.45], color, [x, y, z]);
      tile.rotation.set(-0.2, index * 0.7, 0.15);
      float(tile, 0.1, index * 0.9 + 0.4);
    });
    cloud([-2.6, 12.4, 0.8], 1.15, 0.7);
    cloud([3.4, 12.9, -1.2], 0.85, 1);
    cloud([-4.6, 15.9, -2], 0.7, 0.8);
    cloud([1.2, 15.1, 2.2], 0.6, 1.2);
    cloud([4.8, 17.2, 1], 0.55, 0.9);
    cloud([-1.6, 19.6, -1.4], 1, 0.6);
    cloud([2.6, 20.6, 0.6], 0.7, 1.1);
    cloud([-4.2, 21.4, 0], 0.6, 0.9);

    /* ---------- Chapter 4 · Space: the next frontier ---------- */
    const planet = group([-1.4, 26.2, -0.5]);
    mesh(new THREE.IcosahedronGeometry(2, 3), '#9aab90', [0, 0, 0], planet);
    for (let patch = 0; patch < 6; patch++) {
      const angle = patch * 2.1;
      const land = mesh(new THREE.DodecahedronGeometry(0.42 + (patch % 2) * 0.16), '#7c9a8f', [Math.cos(angle) * 1.85, Math.sin(patch * 1.3) * 1.2, Math.sin(angle) * 1.85], planet);
      land.scale.setScalar(0.9);
    }
    const ring = mesh(new THREE.TorusGeometry(3.1, 0.07, 6, 100), '#d6c9a9', [0, 0, 0], planet);
    ring.rotation.set(1.2, 0.3, -0.3);
    mesh(new THREE.IcosahedronGeometry(0.5, 1), '#c0ac8f', [3.6, 24.4, -1.6]);
    const satellite = group([-3.9, 30.2, -0.8]);
    box([0.34, 0.34, 0.34], '#d8dcd0', [0, 0, 0], satellite);
    mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.4, 5), '#9aa397', [0, 0.35, 0], satellite);
    mesh(new THREE.OctahedronGeometry(0.07), '#c7ed91', [0, 0.58, 0], satellite, true);
    for (const side of [-1, 1]) box([0.85, 0.02, 0.36], '#5f7fb0', [side * 0.65, 0, 0], satellite);
    float(satellite, 0.1, 2.2);
    for (let star = 0; star < 90; star++) {
      const seed = star * 2.399;
      const bright = star % 7 === 0;
      mesh(new THREE.OctahedronGeometry(bright ? 0.09 : 0.04), bright ? '#fff6d6' : '#e8eacf', [Math.sin(seed) * 8.5, 21 + ((star * 0.911) % 15), -3.5 - ((star * 0.37) % 3)], stage, true);
    }
    for (let star = 0; star < 18; star++) mesh(new THREE.OctahedronGeometry(0.035), '#e8eacf', [Math.sin(star * 1.7) * 8, 18 + (star % 4) * 0.8, -4 - (star % 3)], stage, true);

    stage = world;
    const spaceEffects = createSpaceEffects(materials);
    camera.add(spaceEffects.root);
    scene.add(camera);

    /* ---------- The runner: one small figure that travels the whole journey as the visitor scrolls ---------- */
    // Route keyframes: [c, x, y, z] where c is the camera's eased progress (chapter index + travel(fraction)).
    // Keying the route to the camera's own easing keeps the runner inside the strip of scene that is visible
    // above the content cards (roughly 1–6 units above the camera target early in a travel gap, 6–11 units at
    // the end of it). Ground: cabin door → island loop. Mountain: the switchback trail, camp by camp, a little
    // behind the point where each skill card pops in. Sky: boards a plane and flies to an island. Space: walks
    // into a capsule, then ascends past the planet with the same passenger visible in its cockpit.
    const route: [number, number, number, number][] = [
      [0, -0.1, 0.03, 2.35], [0.008, -0.62, 0.03, 2.98], [0.016, 0.75, 0.03, 2.9], [0.024, 1.0, 0.03, 1.7],
    ];
    const rest = (from: number, until: number, x: number, y: number, z: number) => route.push([from, x, y, z], [until, x + 0.02, y, z + 0.02]);
    // Cards pop in two at a time, keyed to the altimeter: pair k (camps 2k and 2k+1, left + right) is fully visible
    // when the altimeter reads cardAltitudes[k] metres and fades in over the 20 M before that. During the ground
    // chapter the altimeter shows altitudes[1] × c, so c = metres / altitudes[1]. The runner then visits the camps one
    // by one behind the cards (one camp per ≈50 M) and walks on to the summit, where it waits for the mountain chapter.
    const cardAltitudes = [470, 600, 710, 910];
    const pairCount = Math.ceil(skillCategories.length / 2);
    const pairKeys = Array.from({ length: pairCount }, (_, index) => cardAltitudes[Math.min(index, cardAltitudes.length - 1)] / altitudes[1]);
    const fadeWindow = 20 / altitudes[1];
    const runnerStep = 0.02;
    const campKeys: number[] = [];
    skillCategories.forEach((_, index) => campKeys.push(Math.max(pairKeys[Math.floor(index / 2)] + runnerStep, (campKeys[index - 1] ?? 0) + runnerStep)));
    const summitKey = 0.8;
    const climb: [number, number][] = [[0.5, 0.03], ...skillCategories.map((_, index): [number, number] => [campBase + index * campSpacing, campKeys[index]]), [mountainHeight - 0.4, summitKey]];
    const cForHeight = (height: number) => {
      for (let step = 0; step < climb.length - 1; step++) {
        const [h0, c0] = climb[step];
        const [h1, c1] = climb[step + 1];
        if (height <= h1) return c0 + ((c1 - c0) * (height - h0)) / (h1 - h0);
      }
      return climb[climb.length - 1][1];
    };
    for (let height = 0.5; height <= mountainHeight - 0.5; height += 0.25) {
      const point = trailPoint(height);
      route.push([cForHeight(height), point[0], point[1] + 0.06, point[2]]);
    }
    rest(summitKey + 0.01, 1.45, summit[0] + 0.3, summit[1] + 0.02, summit[2] + 0.1);
    const boardingPoint = route[route.length - 1];
    const flight = createSkyFlight(new THREE.Vector3(boardingPoint[1], boardingPoint[2], boardingPoint[3]), new THREE.Vector3(3.9, 19.05 + lift, -1.8), materials);
    world.add(flight.root);
    const flightPoint = new THREE.Vector3();
    const flightTangent = new THREE.Vector3();
    for (const progress of [1.6, 1.75, 1.85, 1.95]) {
      flight.sample(progress, flightPoint, flightTangent);
      route.push([progress, flightPoint.x, flightPoint.y, flightPoint.z]);
    }
    rest(2.02, 2.35, 3.9, 19.05 + lift, -1.8);
    const spaceDock = route[route.length - 1];
    const spaceFlight = createSpaceFlight(new THREE.Vector3(spaceDock[1], spaceDock[2], spaceDock[3]), new THREE.Vector3(3.7, 34.8, 1.5), materials);
    world.add(spaceFlight.root);
    for (const progress of [2.48, 2.6, 2.8, 3, 3.1, 3.2]) {
      spaceFlight.sample(progress, flightPoint, flightTangent);
      route.push([progress, flightPoint.x, flightPoint.y, flightPoint.z]);
    }
    // Chord length per segment: resting segments (near-zero length) get no hop arc.
    const segmentLength = route.slice(1).map(([, x, y, z], index) => Math.hypot(x - route[index][1], y - route[index][2], z - route[index][3]));
    const routeCurve = new THREE.CatmullRomCurve3(route.map(([, x, y, z]) => new THREE.Vector3(x, y, z)), false, 'centripetal', 0.5);
    const runner = group([route[0][1], route[0][2], route[0][3]]);
    const body = group([0, 0, 0], runner);
    const skin = '#f1d3b3';
    const head = mesh(new THREE.SphereGeometry(0.115, 10, 8), skin, [0, 0.79, 0], body);
    const hair = mesh(new THREE.SphereGeometry(0.12, 10, 8), '#3a2f2a', [0, 0.83, -0.03], body);
    hair.scale.set(1, 0.72, 1);
    mesh(new THREE.BoxGeometry(0.26, 0.32, 0.16), '#e26d5a', [0, 0.53, 0], body);
    mesh(new THREE.BoxGeometry(0.16, 0.2, 0.08), '#c7ed91', [0, 0.55, -0.13], body);
    const limb = (position: Vec, size: Vec, color: string, foot?: string) => {
      const pivot = group(position, body);
      mesh(new THREE.BoxGeometry(...size), color, [0, -size[1] / 2, 0], pivot);
      if (foot) mesh(new THREE.BoxGeometry(size[0] + 0.02, 0.06, size[2] + 0.08), foot, [0, -size[1] - 0.02, 0.03], pivot);
      return pivot;
    };
    const legL = limb([-0.075, 0.37, 0], [0.09, 0.33, 0.1], '#3f5a8a', '#f6f1e2');
    const legR = limb([0.075, 0.37, 0], [0.09, 0.33, 0.1], '#3f5a8a', '#f6f1e2');
    const armL = limb([-0.17, 0.67, 0], [0.07, 0.28, 0.08], '#e26d5a');
    const armR = limb([0.17, 0.67, 0], [0.07, 0.28, 0.08], '#e26d5a');
    // Space helmet: fades in once the runner leaves the atmosphere.
    const helmetMaterial = new THREE.MeshBasicMaterial({ color: '#dff4ff', transparent: true, opacity: 0, depthWrite: false });
    materials.set('helmet', helmetMaterial);
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), helmetMaterial);
    helmet.position.set(0, 0.79, 0);
    helmet.visible = false;
    body.add(helmet);
    const runnerState = { progress: 0, previous: runner.position.clone(), speed: 0, stride: 0, amplitude: 0 };
    const runnerPoint = new THREE.Vector3();
    const runnerTangent = new THREE.Vector3();
    const runnerAhead = new THREE.Vector3();
    const yUp = new THREE.Vector3(0, 1, 0);
    const lerpAngle = (from: number, to: number, k: number) => from + (to - from) * k;
    let progressNow = 0;

    // Places and animates the runner for an eased progress value; returns true when anything moved.
    const updateRunner = (rawProgress: number, deltaMs: number) => {
      const chapter = Math.min(3, Math.floor(rawProgress));
      const progress = chapter + travel(rawProgress - chapter); // camera-eased progress, see `route`
      const last = route.length - 1;
      let index = 0;
      while (index < last - 1 && progress >= route[index + 1][0]) index++;
      const local = clamp((progress - route[index][0]) / Math.max(1e-6, route[index + 1][0] - route[index][0]), 0, 1);
      const t = clamp((index + local) / last, 0, 1);
      routeCurve.getPoint(t, runnerPoint);
      routeCurve.getTangent(t, runnerTangent);
      if (progress >= flightStart && progress <= flightEnd) flight.sample(progress, runnerPoint, runnerTangent);
      if (progress >= spaceBoardingStart) spaceFlight.sample(progress, runnerPoint, runnerTangent);
      const capsuleBoarding = spaceBoarding(progress);
      const boarding = Math.max(flightBoarding(progress), capsuleBoarding);
      // The same passenger boards each vehicle; the capsule keeps them seated through space.
      const hopWeight = smooth((progress - 1.45) / 0.08) * (1 - smooth((progress - 2.35) / 0.1)) * (1 - boarding);
      const hop = segmentLength[index] > 0.2 ? Math.sin(Math.PI * local) * 0.7 * hopWeight : 0;
      const dt = Math.max(1, deltaMs) / 1000;
      const distance = runnerPoint.distanceTo(runnerState.previous);
      runnerState.previous.copy(runnerPoint);
      // With motion paused (reduced-motion users) the figure simply stands at its place: no run cycle, no extra frames.
      const rawSpeed = pauseRef.current ? 0 : Math.min(distance / dt, 6);
      runnerState.speed += (rawSpeed - runnerState.speed) * (pauseRef.current ? 1 : Math.min(1, dt * 12));
      const targetAmplitude = clamp(runnerState.speed / 1.2, 0, 1) * (1 - boarding);
      runnerState.amplitude += (targetAmplitude - runnerState.amplitude) * (pauseRef.current ? 1 : Math.min(1, dt * 10));
      runnerState.stride += distance * 9;
      const bob = Math.abs(Math.sin(runnerState.stride)) * 0.045 * runnerState.amplitude * (1 - hopWeight);
      runner.position.set(runnerPoint.x, runnerPoint.y + hop + bob, runnerPoint.z);
      flight.update(progress, elapsed, pauseRef.current, runner.position);
      spaceFlight.update(progress, elapsed, pauseRef.current);
      // Face along the route (yaw only), so the figure runs "forwards" around the spiral.
      runnerTangent.y = 0;
      if (runnerTangent.lengthSq() > 1e-6) {
        runnerAhead.copy(runner.position).add(runnerTangent.normalize());
        runner.lookAt(runnerAhead);
      }
      if (boarding > 0) runner.quaternion.slerp(capsuleBoarding > 0 ? spaceFlight.spacecraft.quaternion : flight.aircraft.quaternion, boarding);
      // Pose blending: walking and hopping ease into a seated passenger pose.
      const swing = Math.sin(runnerState.stride) * runnerState.amplitude;
      const airborne = hopWeight * Math.sin(Math.PI * local);
      const k = pauseRef.current ? 1 : Math.min(1, dt * 14);
      legL.rotation.x = lerpAngle(legL.rotation.x, swing * 0.95 * (1 - airborne) + airborne * 0.75, k);
      legR.rotation.x = lerpAngle(legR.rotation.x, -swing * 0.95 * (1 - airborne) - airborne * 0.55, k);
      armL.rotation.x = lerpAngle(armL.rotation.x, -swing * 0.8 * (1 - airborne) - airborne * 1.6, k);
      armR.rotation.x = lerpAngle(armR.rotation.x, swing * 0.8 * (1 - airborne) - airborne * 1.6, k);
      armL.rotation.z = lerpAngle(armL.rotation.z, 0.1, k);
      armR.rotation.z = lerpAngle(armR.rotation.z, -0.1, k);
      body.rotation.x = lerpAngle(body.rotation.x, runnerState.amplitude * 0.18 * (1 - airborne) - airborne * 0.2, k);
      body.rotation.z = lerpAngle(body.rotation.z, 0, k);
      body.position.y = -0.08 * boarding;
      body.rotation.x *= 1 - boarding;
      body.rotation.z *= 1 - boarding;
      legL.rotation.x = lerpAngle(legL.rotation.x, -1.15, boarding);
      legR.rotation.x = lerpAngle(legR.rotation.x, -1.15, boarding);
      armL.rotation.x = lerpAngle(armL.rotation.x, -0.85, boarding);
      armR.rotation.x = lerpAngle(armR.rotation.x, -0.85, boarding);
      armL.rotation.z *= 1 - capsuleBoarding;
      armR.rotation.z *= 1 - capsuleBoarding;
      helmet.visible = capsuleBoarding > 0.02;
      helmetMaterial.opacity = 0.2 * capsuleBoarding;
      // Only real travel counts as "moving" (drives the 60 fps budget); the idle float/bob is ambient like the clouds.
      return distance > 1e-4 || runnerState.amplitude > 0.01;
    };

    // HTML skill cards anchored to the camps. Runs only on rendered frames; writes transform/opacity straight to
    // the DOM (no React work), so the cards track the 3D scene without lag and cost almost nothing.
    // Visibility follows the scroll position itself (no time easing), so a card is on screen the moment the
    // visitor scrolls past its camp; only its position eases along with the camera.
    const projected = new THREE.Vector3();
    let cardWidth = 220;
    // A card whose chips wrap past two rows at the base width grows 70% wider so its skills stay scannable; on
    // viewports without room for two widened cards side by side the growth is scaled down (none on phones).
    const cardWidths: number[] = new Array(skillCategories.length).fill(cardWidth);
    const sideWidths = [cardWidth, cardWidth]; // widest card per side (left, right): the outer column sits beyond it
    const measureCards = () => {
      const room = (window.innerWidth - 44) / (2 * cardWidth);
      const factor = room < 1.15 ? 1 : Math.min(1.7, room); // not worth widening by a few pixels
      sideWidths[0] = sideWidths[1] = cardWidth;
      cards.current.forEach((node, index) => {
        if (!node) return;
        node.style.width = `${cardWidth}px`;
        let rows = 0;
        let lastTop = -1;
        node.querySelectorAll<HTMLElement>('.skill-chips li').forEach(chip => { if (chip.offsetTop !== lastTop) { rows++; lastTop = chip.offsetTop; } });
        const width = rows > 2 ? Math.round(cardWidth * factor) : cardWidth;
        cardWidths[index] = width;
        node.style.width = `${width}px`;
        node.classList.toggle('wide', width !== cardWidth);
        sideWidths[index % 2] = Math.max(sideWidths[index % 2], width);
      });
    };
    let climbFade = '';
    // Once a pair has been shown it stays on screen when the visitor scrolls back up through the climb: pairs above
    // the current position sit at 40% like the older ones, and everything fades only when the visitor scrolls back
    // into the hero itself (below keepAltitude, where the cards would sit behind the hero text). Narrow screens only
    // have room for one pair, so there only the first pair is kept when scrolling back above its altitude.
    const shown: boolean[] = new Array(pairCount).fill(false);
    const keepKey = 430 / altitudes[1];
    // Cards on one side of the mountain are laid out newest-first so they never overlap: the card that is
    // appearing sits at its camp, older cards are moved down below it (and into a second, outer column when there is
    // room further out, with hysteresis so they do not hop between columns while scrolling), and an older card that
    // no longer fits on screen is hidden instead of being drawn over another card.
    const columnOf: number[] = new Array(skillCategories.length).fill(0);
    const stacks = [[0, 0], [0, 0]]; // per side (left, right): bottom edge of the last placed (newer) card per column
    const alpha: number[] = new Array(skillCategories.length).fill(0);
    const revealOf: number[] = new Array(skillCategories.length).fill(0);
    const updateSkillCards = () => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (!width || !height) return;
      const chapter = Math.min(3, Math.floor(progressNow));
      const live = chapter + travel(progressNow - chapter);
      // Cards fade out at the end of the climb, before the mountain chapter's intro (which floats over the scene
      // with no panel behind it) scrolls into view; this follows the raw scroll position so it is never late.
      const hideAll = 1 - smooth((progressNow - 0.94) / 0.05);
      const narrow = width < 700;
      const keep = smooth((live - keepKey + fadeWindow) / fadeWindow);
      stacks[0][0] = stacks[0][1] = stacks[1][0] = stacks[1][1] = Infinity;
      // The climb's chapter label (App's .climb-head) fades out as the first pair pops (and stays out while cards are kept).
      const fade = (1 - Math.max(smooth((live - pairKeys[0] + fadeWindow) / fadeWindow), shown[0] ? keep : 0)).toFixed(2);
      if (fade !== climbFade) { climbFade = fade; root.style.setProperty('--climb-fade', fade); }
      // Pass 1: how visible each card is. A pair only starts to appear once the pair before it is fully in.
      let previousRaw = 1;
      for (let index = 0; index < campAnchors.length; index++) {
        const pair = Math.floor(index / 2);
        // Fully visible exactly at the pair's altitude; the fade-in runs over the 20 M before it.
        const raw = index % 2 === 0 ? Math.min(smooth((live - pairKeys[pair] + fadeWindow) / fadeWindow), previousRaw >= 0.999 ? 1 : 0) : revealOf[index - 1];
        revealOf[index] = raw;
        if (index % 2 === 1) previousRaw = raw;
        if (raw >= 0.999) shown[pair] = true;
        const sticky = shown[pair] && (!narrow || pair === 0);
        const reveal = (sticky ? (narrow ? 1 : 0.4 + 0.6 * raw) * keep : raw) * hideAll;
        // Desktop keeps the current and previous pair readable and dims older ones; narrow screens show one pair at a time.
        const later = pairKeys[pair + (narrow ? 1 : 2)];
        // Narrow screens cross-fade pairs: the old pair fades out exactly while the next fades in, so they never stack
        // (pairs only a few tens of metres apart hand over almost immediately).
        const dim = later === undefined ? 1 : 1 - (narrow ? smooth((live - later + fadeWindow) / fadeWindow) : 0.6 * smooth((live - later + fadeWindow * 0.3) / fadeWindow));
        alpha[index] = reveal * dim;
      }
      // Pass 2: place the newest visible cards first; older ones stack below them or give way.
      const gap = 14;
      stacks[0][0] = stacks[0][1] = stacks[1][0] = stacks[1][1] = 8 - gap;
      for (let index = campAnchors.length - 1; index >= 0; index--) {
        const node = cards.current[index];
        if (!node) continue;
        const side = index % 2 === 0 ? -1 : 1;
        const stack = stacks[side < 0 ? 0 : 1];
        let placed = false;
        if (alpha[index] > 0.002) {
          projected.copy(campAnchors[index]).applyMatrix4(world.matrixWorld).project(camera);
          const ownWidth = cardWidths[index];
          const sideWidth = sideWidths[side < 0 ? 0 : 1];
          const cardHeight = node.offsetHeight;
          let x = ((projected.x + 1) / 2) * width;
          x = side < 0 ? Math.max(x, ownWidth + gap + 8) : Math.min(x, width - ownWidth - gap - 8);
          const desired = ((1 - projected.y) / 2) * height - 6; // bottom edge of the card at its camp
          const bottomAt = (column: number) => Math.max(desired, stack[column] + gap + cardHeight);
          const fits = (column: number, margin: number) => bottomAt(column) <= height - 8 - margin;
          const outerX = x + side * (sideWidth + gap);
          const outerRoom = side < 0 ? outerX - ownWidth - gap >= 8 : outerX + ownWidth + gap <= width - 8;
          let column = columnOf[index];
          if (column === 1 && (!outerRoom || fits(0, 40))) column = 0;
          if (column === 0 && !fits(0, 0) && outerRoom && fits(1, 0)) column = 1;
          columnOf[index] = column;
          if (fits(column, 0)) {
            const y = bottomAt(column);
            stack[column] = y;
            const cx = column === 1 ? outerX : x;
            node.style.visibility = 'visible';
            node.style.opacity = alpha[index].toFixed(3);
            node.style.transform = `translate3d(${(cx + side * gap).toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(${side < 0 ? '-100%' : '0'}, -100%) scale(${(0.86 + 0.14 * revealOf[index]).toFixed(3)})`;
            placed = true;
          }
        }
        if (!placed && node.style.visibility !== 'hidden') { node.style.visibility = 'hidden'; node.style.opacity = '0'; }
      }
    };

    /* ---------- Interaction & frame loop ---------- */
    const pointer = { x: 0, y: 0 };
    const move = (event: PointerEvent) => {
      pointer.x = event.clientX / window.innerWidth - 0.5;
      pointer.y = event.clientY / window.innerHeight - 0.5;
    };
    window.addEventListener('pointermove', move, { passive: true });
    const contextLost = (event: Event) => { event.preventDefault(); setFailed(true); };
    renderer.domElement.addEventListener('webglcontextlost', contextLost);

    let wide = true;
    const resize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      if (!width || !height) return;
      const aspect = width / height;
      wide = width > 800;
      const vertical = wide ? Math.max(5.8, 5.8 / aspect) : Math.max(6, 4.9 / aspect);
      const horizontal = vertical * aspect;
      // The landscape stays centred beneath the full-width story at every viewport.
      camera.left = -horizontal;
      camera.right = horizontal;
      camera.top = vertical * 1.6;
      camera.bottom = -vertical * .4;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
      cardWidth = Math.min(236, Math.round(width * 0.44)); // two cards (left + right) fit side by side on a 360px phone
      measureCards();
      dirty = true;
    };
    window.addEventListener('resize', resize);
    let hidden = false;
    const visibility = () => { hidden = document.hidden; dirty = true; };
    document.addEventListener('visibilitychange', visibility);

    const target = stations[0].clone();
    const goal = new THREE.Vector3();
    const bottomColor = new THREE.Color();
    const topColor = new THREE.Color();
    let chapter = -1;
    let dirty = true;
    let lastFrame = 0;
    let elapsed = 0;
    let animation = 0;

    const applyProgress = (progress: number) => {
      progressNow = progress;
      const index = Math.min(Math.floor(progress), stations.length - 2);
      goal.lerpVectors(stations[index], stations[index + 1], travel(progress - index));
      // Keep the expanded terrace and gardener above the viewport edge, then return to the climb framing.
      goal.y -= 1.6 * (1 - smooth((progress - 0.65) / 0.25));
      goal.y += pauseRef.current ? 0 : pointer.y * 0.25;
      goal.x += pauseRef.current ? 0 : pointer.x * 0.35;
      colorAt(progress, bottomColor);
      colorAt(progress + 0.25, topColor);
      root.style.setProperty('--sky-bottom', `#${bottomColor.getHexString()}`);
      root.style.setProperty('--sky-top', `#${topColor.getHexString()}`);
      root.style.setProperty('--stars', smooth((progress - 2.55) / 0.4).toFixed(3));
      hemisphere.intensity = 2.6 - 1.2 * smooth((progress - 2.4) / 0.8);
      const nextChapter = clamp(Math.floor(progress + 0.15), 0, 3);
      if (nextChapter !== chapter) { chapter = nextChapter; chapterRef.current(chapter); }
      progressRef.current?.(progress);
    };

    // Chapter/altimeter/backdrop updates run on scroll events too, so the UI stays in sync
    // even when the WebGL frame loop is slow (low-end GPUs, software rendering).
    const sync = () => { applyProgress(measureProgress()); dirty = true; };
    window.addEventListener('scroll', sync, { passive: true });

    let active = true;
    let lastRaf = 0;
    let rafGap = 16; // smoothed interval between animation frames: grows when the device cannot keep 60 fps
    const animate = (timestamp: number) => {
      animation = requestAnimationFrame(animate);
      if (lastRaf) rafGap += (Math.min(timestamp - lastRaf, 100) - rafGap) * 0.1;
      lastRaf = timestamp;
      // Full frame rate while the camera or runner is moving and the browser sustains it; otherwise ~30 fps.
      if (timestamp - lastFrame < (active && rafGap < 24 ? 15 : 32)) return;
      const delta = Math.min(timestamp - lastFrame, 50);
      lastFrame = timestamp;
      if (hidden) return;
      applyProgress(measureProgress());
      const distance = target.distanceTo(goal);
      if (distance > 0.0005) {
        // Time-based easing (≈250 ms time constant) so the camera keeps pace with scrolling at any frame rate.
        if (pauseRef.current) target.copy(goal);
        else target.lerp(goal, 1 - Math.exp(-delta / 250));
        dirty = true;
      }
      // The runner eases towards the scrolled progress with the same time constant as the camera, so both stay in step.
      if (pauseRef.current) runnerState.progress = progressNow;
      else runnerState.progress += (progressNow - runnerState.progress) * (1 - Math.exp(-delta / 250));
      const runnerMoved = updateRunner(runnerState.progress, delta);
      if (runnerMoved) dirty = true;
      active = distance > 0.002 || runnerMoved;
      if (!pauseRef.current) {
        elapsed += delta / 1000;
        world.rotation.y += (pointer.x * 0.12 + Math.sin(elapsed * 0.15) * 0.03 - world.rotation.y) * 0.04;
        clouds.forEach((item, index) => { item.group.position.x = item.base + Math.sin(elapsed * 0.25 * item.speed + index) * 0.35; });
        floaters.forEach(item => { item.object.position.y = item.base + Math.sin(elapsed * 0.8 + item.phase) * item.amplitude; });
        flags.forEach((banner, index) => { banner.rotation.y = Math.sin(elapsed * 2.4 + index) * 0.22; });
        planet.rotation.y = elapsed * 0.08;
        ring.rotation.z = -0.3 + elapsed * 0.05;
        satellite.rotation.y = elapsed * 0.4;
        dirty = true;
      }
      if (!dirty) return;
      dirty = false;
      camera.position.copy(target).addScaledVector(viewDirection, 40);
      camera.lookAt(target);
      sun.position.set(target.x - 5, target.y + 12, target.z + 7);
      sun.target.position.copy(target);
      // Blend into the visible sun's world position during the climb, so the cast shadows
      // agree with the disc and rays even while the landscape rotates slightly with the pointer.
      const sunlight = smooth((runnerState.progress - 0.4) / 0.45) * (1 - smooth((runnerState.progress - 1.45) / 0.5));
      mountainSun.visible = sunRays.visible = sunlight > 0.001;
      sunDiscMaterial.opacity = sunlight;
      glowMaterial.opacity = sunlight * 0.8;
      rayMaterial.uniforms.strength.value = sunlight;
      mountainSun.getWorldPosition(sunWorldPosition);
      mountainLightTarget.set(peak[0], 5, peak[2]);
      world.localToWorld(mountainLightTarget);
      sun.position.lerp(sunWorldPosition, sunlight);
      sun.target.position.lerp(mountainLightTarget, sunlight);
      sun.color.copy(daylightColor).lerp(mountainLightColor, sunlight);
      sun.intensity = 3.8 + sunlight * 0.6;
      hemisphere.intensity = 2.6 - 0.9 * sunlight - 1.2 * smooth((progressNow - 2.4) / 0.8);
      farm.update(elapsed, camera, pauseRef.current);
      const spaceChapter = Math.min(3, Math.floor(runnerState.progress));
      spaceEffects.update(spaceChapter + travel(runnerState.progress - spaceChapter), elapsed, pauseRef.current, camera, container.clientWidth);
      renderer.render(scene, camera);
      updateSkillCards();
    };
    resize();
    // Chip wrapping depends on the web fonts, so re-measure the cards once they are in.
    document.fonts?.ready.then(() => { measureCards(); dirty = true; });
    updateRunner(0, 16);
    animation = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animation);
      window.removeEventListener('resize', resize);
      window.removeEventListener('scroll', sync);
      window.removeEventListener('pointermove', move);
      document.removeEventListener('visibilitychange', visibility);
      renderer.domElement.removeEventListener('webglcontextlost', contextLost);
      scene.traverse(object => {
        if (object instanceof THREE.Mesh) object.geometry.dispose();
        if (object instanceof THREE.InstancedMesh) object.dispose();
      });
      materials.forEach(item => item.dispose());
      glowTexture.dispose();
      sun.shadow.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return <>
    <div ref={host} className="journey-stage" role="img" aria-label="โลกสามมิติแบบต่อเนื่อง ฐานภูเขากว้างมีสวนผักและแปลงข้าว พร้อมชาวสวนสวมหมวกกำลังพรวนดิน มีนักวิ่งตัวเล็กออกจากกระท่อมบนพื้นดิน วิ่งขึ้นภูเขาผ่านแคมป์ทักษะแต่ละหมวด มีภูเขาด้านหลังเพิ่มอีกสองลูก ดวงอาทิตย์ส่องแสงและทอดเงาบนไหล่เขา ตัวละครขึ้นเครื่องบินจากยอดเขา บินผ่านเมฆพร้อมนกห้าตัวไปยังเกาะลอย แล้วเดินขึ้นยานอวกาศและนั่งในห้องนักบินขณะยานลอยขึ้นผ่านดาวเคราะห์ มีดาวหางตกช้า ๆ บริเวณด้านข้าง แทนการเดินทางของการเป็นโปรแกรมเมอร์">
      {failed && <div className="world-fallback"><span>△</span><p>โลกของการเรียนรู้ไม่มีที่สิ้นสุด</p><small>อุปกรณ์นี้แสดงฉากแบบเรียบง่าย</small></div>}
    </div>
    {!failed && <div className="skill-overlay" aria-hidden="true">
      {skillCategories.map((item, index) => <div key={item.name} ref={element => { cards.current[index] = element; }} className="skill-card" style={{ zIndex: 10 + index }}>
        <span className="eyebrow"><span className="group-icon">{item.icon}</span>{item.path} · {item.skills.length}</span>
        <h3>{item.name}</h3>
        <ul className="skill-chips">{item.skills.map(skill => <li key={skill}>{skill}</li>)}</ul>
      </div>)}
    </div>}
  </>;
}
