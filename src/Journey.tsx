import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { createFlourishes, createPopTriggers } from './Flourish';
import { createWeather } from './Weather';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createTraveler, createTravelerLighting } from './Traveler';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { batchStaticScene, createCloudGeometry, createPineCrown, createPlanet, createRockRelief, noise3 } from './SceneAssets';
import { advanceRunStride, altitudeAt, altitudes, blend, clamp, mountainRadiusAt, mountainSnowline, mountainTrailAngle, smooth, terrainNoise, travel } from './journeyMath';
import { skillCategories } from '../data/skillCategories';
import { createMountainFarm } from './MountainFarm';
import { createSkyFlight, flightBoarding, flightEnd, flightRevealStart, flightStart } from './SkyFlight';
import { createSpaceEffects, createSpaceFlight, spaceBoarding, spaceBoardingStart } from './SpaceFlight';

/**
 * Journey — a single continuous physically lit miniature world rendered once behind the page.
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
    // Defer GPU allocation by one frame so React's development mount/unmount probe can cancel it.
    const setup = () => {
      const container = host.current!;
      const root = document.documentElement;
      let renderer: THREE.WebGLRenderer;
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
      } catch {
        setFailed(true);
        return;
      }
      // Quality profile decided once at start-up. Phones/tablets render at 1x with cheap shadows and fewer shadow
      // casters, so the first scroll is already smooth instead of waiting for the adaptive resolution drop below.
      const mobile = window.innerWidth <= 800 || (window.matchMedia?.('(pointer: coarse)').matches ?? false);
      let pixelRatio = Math.min(window.devicePixelRatio, mobile ? 1 : 1.75);
      renderer.setPixelRatio(pixelRatio);
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.12;
      renderer.setClearColor(0x000000, 0);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = mobile ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
      renderer.domElement.style.visibility = 'hidden';
      container.appendChild(renderer.domElement);
      // Development-only counters let browser tests inspect the actual GPU workload without a UI overlay.
      const diagnostics = import.meta.env.DEV ? { calls: 0, triangles: 0, frames: 0, pixelRatio, cpuMs: 0, aircraftY: 0, passengerY: 0, progress: 0 } : null;
      if (diagnostics) Object.defineProperty(renderer.domElement, 'journeyDiagnostics', { value: diagnostics });

      const scene = new THREE.Scene();
      const room = new RoomEnvironment();
      const pmrem = new THREE.PMREMGenerator(renderer);
      const environment = pmrem.fromScene(room, 0.04, 0.1, 100, { size: 128 });
      scene.environment = environment.texture;
      scene.environmentIntensity = 0.32;
      room.dispose();
      pmrem.dispose();
      const rockRelief = createRockRelief();
      const camera = new THREE.OrthographicCamera(-7, 7, 6, -6, 0.1, 200);
      const viewDirection = new THREE.Vector3(11, 9, 14).normalize();
      const hemisphere = new THREE.HemisphereLight(0xf8ffff, 0x56604e, 1.7);
      scene.add(hemisphere);
      const sun = new THREE.DirectionalLight(0xfff4d9, 3.1);
      sun.castShadow = true;
      sun.shadow.mapSize.set(mobile ? 512 : 1024, mobile ? 512 : 1024);
      Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 0.5, far: 80 });
      sun.shadow.bias = -0.00012;
      sun.shadow.normalBias = 0.018;
      scene.add(sun, sun.target);

      const world = new THREE.Group();
      scene.add(world);
      const materials = new Map<string, THREE.Material>();
      const material = (color: string, glow = false) => {
        const key = `${color}${glow ? '!' : ''}`;
        if (!materials.has(key)) materials.set(key, glow ? new THREE.MeshBasicMaterial({ color }) : new THREE.MeshStandardMaterial({ color, roughness: 0.8 }));
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
      const windTrees: { object: THREE.Group; phase: number }[] = [];
      function tree(position: Vec, scale = 1, parent: THREE.Object3D = stage) {
        const item = group(position, parent, scale);
        const parts: THREE.BufferGeometry[] = [];
        function part(geometry: THREE.BufferGeometry, color: string, y: number) {
          const piece = geometry.toNonIndexed();
          geometry.dispose();
          piece.translate(0, y, 0);
          const tint = new THREE.Color(color);
          const colors = new Float32Array(piece.getAttribute('position').count * 3);
          for (let i = 0; i < colors.length; i += 3) tint.toArray(colors, i);
          piece.setAttribute('color', new THREE.BufferAttribute(colors, 3));
          parts.push(piece);
        }
        part(new THREE.CylinderGeometry(0.09, 0.13, 0.7, 6), '#75604a', 0.3);
        for (let layer = 0; layer < 3; layer++) part(createPineCrown(0.68 - layer * 0.13, 1.05), ['#426747', '#547955', '#6c8c60'][layer], 0.8 + layer * 0.38);
        if (!materials.has('swaying-pines')) materials.set('swaying-pines', new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88 }));
        const pine = new THREE.Mesh(mergeGeometries(parts), materials.get('swaying-pines'));
        parts.forEach(piece => piece.dispose());
        pine.castShadow = pine.receiveShadow = true;
        item.add(pine);
        windTrees.push({ object: item, phase: windTrees.length * 1.73 });
      }
      const cloudGeometry = createCloudGeometry();
      const cloudMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, envMapIntensity: 0.18 });
      materials.set('cloud-banks', cloudMaterial);
      const clouds: { group: THREE.Group; base: number; height: number; depth: number; speed: number; material: THREE.MeshStandardMaterial }[] = [];
      function cloud(position: Vec, scale = 1, speed = 1, castShadow = false) {
        const item = group(position, stage, scale);
        const bankMaterial = cloudMaterial.clone();
        bankMaterial.transparent = true;
        bankMaterial.depthWrite = false;
        materials.set(`cloud-drift-${clouds.length}`, bankMaterial);
        const bank = new THREE.Mesh(cloudGeometry, bankMaterial);
        bank.name = 'cloud-bank';
        bank.castShadow = castShadow;
        bank.receiveShadow = true;
        item.add(bank);
        clouds.push({ group: item, base: position[0], height: position[1], depth: position[2], speed, material: bankMaterial });
        return item;
      }
      function flag(position: Vec, color: string, height = 0.9, parent: THREE.Object3D = stage) {
        const item = group(position, parent);
        box([0.05, height, 0.05], '#5e655d', [0, height / 2, 0], item);
        const banner = box([0.5, 0.28, 0.03], color, [0.26, height - 0.16, 0], item);
        flags.push(banner);
        flagGroups.push(item);
        return item;
      }
      const flags: THREE.Mesh[] = [];
      const flagGroups: THREE.Object3D[] = [];
      const floaters: { object: THREE.Object3D; base: number; amplitude: number; phase: number }[] = [];
      const float = (object: THREE.Object3D, amplitude = 0.12, phase = 0) => floaters.push({ object, base: object.position.y, amplitude, phase });

      /* ---------- Chapter 1 · Ground: the island where the first line of code was written ---------- */
      // Broader foothill terrace supports the range and two farm plots without scaling the runner or cabin.
      const island = mesh(new THREE.CylinderGeometry(6.3, 4.5, 2.1, 48, 6), '#777260', [-1, -1.5, -1.3]);
      island.scale.set(1.2, 1, 1.12);
      island.rotation.y = 0.17;
      const islandBottom = mesh(new THREE.ConeGeometry(4.55, 2.2, 32), '#626859', [-1, -3.3, -1.3]);
      islandBottom.rotation.z = Math.PI;
      islandBottom.scale.set(1.2, 1, 1.12);
      const terrace = mesh(new THREE.CylinderGeometry(6.35, 6.2, 0.32, 48), '#a4b780', [-1, -0.3, -1.3]);
      const turf = mesh(new THREE.CylinderGeometry(6.22, 6.3, 0.16, 48), '#b8c693', [-1, -0.08, -1.3]);
      for (const layer of [terrace, turf]) { layer.rotation.y = 0.17; layer.scale.set(1.2, 1, 1.12); }
      // The connected river, banks and waterfall are built with mountain drainage below.
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
      const mountainRadius = 4.0;
      const facing = Math.atan2(14, 11); // camera-facing trail corridor
      const terrain: { surface: THREE.Mesh; base: Vec; height: number; radius: number; seed: number }[] = [];
      function detailedMountain(base: Vec, height: number, radius: number, color: string, seed: number) {
        const sectors = height > 12 ? 64 : 40;
        const levels = height > 12 ? 48 : 30;
        const positions: number[] = [];
        const indices: number[] = [];
        const uvs: number[] = [];
        for (let level = 0; level <= levels; level++) {
          for (let sector = 0; sector <= sectors; sector++) {
            const angle = sector / sectors * Math.PI * 2;
            const t = level / levels;
            const elevation = t + Math.sin(angle * 4 + seed + level * 1.3) * 0.007 * Math.sin(Math.PI * t);
            const erosion = ((noise3(Math.cos(angle) * 4 + seed, elevation * 12, Math.sin(angle) * 4) - 0.5) * 0.14
              + (noise3(Math.cos(angle) * 9 + seed, elevation * 26, Math.sin(angle) * 9) - 0.5) * 0.045) * Math.sin(Math.PI * t);
            const r = mountainRadiusAt(radius, elevation, angle, seed) * (1 + erosion);
            positions.push(Math.cos(angle) * r, elevation * height, Math.sin(angle) * r);
            uvs.push(sector / sectors * 5, t * 8);
            if (level === levels || sector === sectors) continue;
            const a = level * (sectors + 1) + sector;
            const b = a + sectors + 1;
            const c = a + 1;
            indices.push(a, b, c);
            if (level < levels - 1) indices.push(c, b, c + sectors + 1);
          }
        }
        const baseCenter = positions.length / 3;
        positions.push(0, 0, 0);
        uvs.push(0, 0);
        for (let sector = 0; sector < sectors; sector++) indices.push(baseCenter, sector, (sector + 1) % sectors);
        const indexed = new THREE.BufferGeometry();
        indexed.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        indexed.setIndex(indices);
        indexed.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        const geometry = indexed;
        geometry.computeVertexNormals();
        const vertices = geometry.getAttribute('position');
        const colors: number[] = [];
        const grassColor = new THREE.Color(color);
        const rockColor = new THREE.Color('#778084');
        const sedimentColor = new THREE.Color('#ad9c80');
        const mossColor = new THREE.Color('#526d4b');
        const snowColor = new THREE.Color('#e7edf0');
        const faceColor = new THREE.Color();
        const normals = geometry.getAttribute('normal');
        for (let vertex = 0; vertex < vertices.count; vertex++) {
          const x = vertices.getX(vertex), z = vertices.getZ(vertex);
          const t = vertices.getY(vertex) / height;
          const stone = noise3(x * 3 + seed, t * 20, z * 3);
          const slope = 1 - Math.max(0, normals.getY(vertex));
          const strata = 0.5 + 0.5 * Math.sin(t * 92 + noise3(x + seed, t * 8, z) * 4);
          const crevice = smooth((0.5 - stone) / 0.28) * Math.sin(Math.PI * clamp(t, 0, 1));
          faceColor.copy(grassColor).lerp(rockColor, smooth((t - 0.15) / 0.6) * 0.75 + slope * 0.18);
          faceColor.lerp(sedimentColor, smooth((strata - 0.68) / 0.32) * 0.22 * (1 - smooth((t - 0.72) / 0.1)));
          faceColor.lerp(mossColor, smooth((stone - 0.45) / 0.3) * (1 - smooth((t - 0.18) / 0.34)) * 0.65);
          const snow = smooth((t - mountainSnowline(Math.atan2(z, x), seed) + (stone - 0.5) * 0.035) / 0.045);
          faceColor.lerp(snowColor, snow).multiplyScalar(0.76 + stone * 0.28 - crevice * 0.17 * (1 - snow));
          colors.push(faceColor.r, faceColor.g, faceColor.b);
        }
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        const surfaceMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, bumpMap: rockRelief, bumpScale: 0.12 });
        materials.set(`mountain-terrain-${seed}`, surfaceMaterial);
        const surface = new THREE.Mesh(geometry, surfaceMaterial);
        surface.position.set(...base);
        surface.castShadow = surface.receiveShadow = true;
        surface.name = 'mountain-surface';
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
      const windPines: { mesh: THREE.InstancedMesh; offset: number }[] = [];
      const pineBend = new THREE.Quaternion();
      const pineYaw = new THREE.Quaternion();
      const pineUp = new THREE.Vector3(0, 1, 0);
      const pineWindAxis = new THREE.Vector3(0.24, 0, -1).normalize();
      const pineOffset = new THREE.Vector3();
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
        if (part !== 'rock') {
          instances.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
          windPines.push({ mesh: instances, offset: { trunk: 0.27, lower: 0.7, upper: 1.05 }[part] });
        }
        instances.instanceMatrix.needsUpdate = true;
        instances.computeBoundingSphere();
        if (part !== 'rock' && instances.boundingSphere) instances.boundingSphere.radius += 0.3;
        world.add(instances);
      }
      detailInstances(new THREE.DodecahedronGeometry(1, 0), '#858a78', rocks, 'rock');
      detailInstances(new THREE.CylinderGeometry(0.07, 0.1, 0.54, 5), '#76614c', pines, 'trunk');
      detailInstances(createPineCrown(0.46, 0.95), '#4b6c50', pines, 'lower');
      detailInstances(createPineCrown(0.34, 0.85), '#698258', pines, 'upper');

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
      const overcastColor = new THREE.Color('#cdd6e2');
      const weather = createWeather(world, mobile, pixelRatio, [...terrain.map(item => item.surface), turf], true);
      // Cloud banks passing over the slopes use the same accumulated wind travel as the precipitation.
      const mountainClouds = [cloud([-5.2, 5.4, -3.4], 0.65, 0.8), cloud([-1.8, 9.0, -4.5], 0.75, 1), cloud([2.3, 12.0, -3.1], 0.52, 1.2)];
      const cloudDayColor = new THREE.Color('#ffffff');
      const cloudStormColor = new THREE.Color('#8d9daa');
      const cloudSnowColor = new THREE.Color('#e3edf4');
      const rainSkyColor = new THREE.Color('#bdcbd3');
      const snowSkyColor = new THREE.Color('#dce7ef');
      let lastWeatherSky = '';
      const windInRunnerSpace = new THREE.Vector3();
      const runnerInverse = new THREE.Quaternion();
      // Two broad, rounded switchbacks on the camera-facing slope. All eight skill camps are spaced along
      // these same three traverses; adding camps no longer adds bends. The ribbon, steps, flags and runner
      // share one trail function so every element follows the new route from the base to the summit.
      const campBase = 1.4;
      const campSpacing = 1.15;
      const trailBase = 0.45;
      const trailTop = mountainHeight - 0.4;
      const trailAngle = (height: number) => mountainTrailAngle((height - trailBase) / (trailTop - trailBase), facing);
      const trailPoint = (height: number): Vec => {
        return slopePoint(mainMountain, height, trailAngle(height), 0.08);
      };
      const trailVertices: number[] = [];
      const trailIndices: number[] = [];
      for (let step = 0; step <= 88; step++) {
        const height = trailBase + step / 88 * (trailTop - trailBase);
        const angle = trailAngle(height);
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
        const point = trailPoint(height);
        const ahead = trailPoint(height + 0.03);
        const stone = box([0.3, 0.06, 0.22], Math.round(height / 0.2) % 2 ? '#d9c9a2' : '#e6dbbd', point);
        stone.rotation.y = Math.atan2(ahead[0] - point[0], ahead[2] - point[2]);
      }
      const milestones: [number, string][] = [[2.9, '#e8c46a'], [6.9, '#e2a27a'], [11.6, '#c7ed91']];
      const milestoneFlags = milestones.map(([height, color]) => ({ height, flag: flag(trailPoint(height), color, 0.95) }));
      // Base camp tent: the pause to learn before the next push.
      const camp = group(trailPoint(10.2));
      const tent = mesh(new THREE.ConeGeometry(0.42, 0.42, 4), '#d99a6c', [0, 0.21, 0], camp);
      tent.rotation.y = Math.PI / 4;
      mesh(new THREE.OctahedronGeometry(0.07), '#ffb26b', [0.35, 0.08, 0.2], camp, true);
      // Skill camps: a ledge and a signpost per category from data/skillCategories.ts. Their world positions are
      // projected every rendered frame to place the HTML skill cards (see updateSkillCards below).
      const campColors = ['#e8c46a', '#e2a27a', '#6caaa9', '#c7ed91', '#f9cd75', '#db9872', '#9fb8e8', '#e26d5a'];
      const campMarkers: THREE.Object3D[] = [];
      const campAnchors = skillCategories.map((_, index) => {
        const point = trailPoint(campBase + index * campSpacing);
        const ledge = group(point);
        mesh(new THREE.CylinderGeometry(0.36, 0.3, 0.1, 7), '#d9c9a2', [0, 0.03, 0], ledge);
        box([0.045, 0.62, 0.045], '#75604a', [0.14, 0.36, 0.06], ledge);
        // The board and its gem sit in their own group so they can spring up when the runner arrives.
        const marker = group([0.14, 0.44, 0.06], ledge);
        box([0.36, 0.2, 0.035], campColors[index % campColors.length], [0, 0.16, 0], marker);
        mesh(new THREE.OctahedronGeometry(0.06), '#fff6d6', [0, 0.34, 0], marker, true);
        campMarkers.push(marker);
        return new THREE.Vector3(point[0] + 0.14, point[1] + 0.9, point[2] + 0.06);
      });
      // Summit flag: the current chapter, planted at the top.
      const summitFlag = flag(summit, '#c7ed91', 1.15);
      cloud([-4.6, 6.4, -0.6], 0.75, 0.7, true);
      cloud([3.8, 9.2, -2.4], 0.65, 0.9, true);
      cloud([-2.8, 12.6, 1.6], 0.55, 1.1, true);
      // One low bank behind the ridge adds distance without filling the trail corridor.
      cloud([-4.4, 3.5, -4.7], 1, 0.35).scale.set(1.3, 0.28, 0.65);
      // Everything above the mountain lives in a group lifted by `lift`, so the sky and space keep their layout.
      const upper = group([0, lift, 0], world);
      stage = upper;

      /* ---------- Chapter 3 · Sky: experiments let loose above the clouds ---------- */
      const balloon = group([1.6, 16, 0.5], stage, 0.85);
      const envelope = mesh(new THREE.SphereGeometry(2, 40, 24), '#db9872', [0, 2.2, 0], balloon);
      envelope.scale.y = 1.15;
      const fabric = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 });
      materials.set('balloon-fabric', fabric);
      envelope.material = fabric;
      const fabricPosition = envelope.geometry.getAttribute('position');
      const fabricColors = new Float32Array(fabricPosition.count * 3);
      const fabricTint = new THREE.Color();
      for (let i = 0; i < fabricPosition.count; i++) {
        const angle = Math.atan2(fabricPosition.getZ(i), fabricPosition.getX(i));
        const panel = (Math.floor((angle + Math.PI) / (Math.PI * 2) * 12) + 12) % 12;
        fabricTint.set(panel % 3 === 0 ? '#e1d1af' : panel % 3 === 1 ? '#bb7855' : '#cb9970');
        fabricColors.set([fabricTint.r, fabricTint.g, fabricTint.b], i * 3);
      }
      envelope.geometry.setAttribute('color', new THREE.BufferAttribute(fabricColors, 3));
      mesh(new THREE.ConeGeometry(1.55, 1.8, 32), '#edc999', [0, 0.8, 0], balloon).rotation.z = Math.PI;
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
      const planetModel = createPlanet(materials);
      const planet = planetModel.root;
      planet.position.set(-1.4, 26.2, -0.5);
      stage.add(planet);
      const ring = planetModel.ring;
      mesh(new THREE.IcosahedronGeometry(0.5, 1), '#c0ac8f', [3.6, 24.4, -1.6]);
      const satellite = group([-3.9, 30.2, -0.8]);
      box([0.34, 0.34, 0.34], '#d8dcd0', [0, 0, 0], satellite);
      mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.4, 5), '#9aa397', [0, 0.35, 0], satellite);
      mesh(new THREE.OctahedronGeometry(0.07), '#c7ed91', [0, 0.58, 0], satellite, true);
      for (const side of [-1, 1]) box([0.85, 0.02, 0.36], '#5f7fb0', [side * 0.65, 0, 0], satellite);
      float(satellite, 0.1, 2.2);
      const starField = new THREE.InstancedMesh(new THREE.OctahedronGeometry(1), material('#ffffff', true), 108);
      const starTransform = new THREE.Object3D();
      const starTint = new THREE.Color();
      for (let star = 0; star < 108; star++) {
        const seed = star * 2.399;
        starTransform.position.set(Math.sin(seed) * 8.5, 18 + ((star * 0.911) % 18), -3.5 - ((star * 0.37) % 3));
        starTransform.scale.setScalar(star % 7 === 0 ? 0.05 : 0.025);
        starTransform.updateMatrix();
        starField.setMatrixAt(star, starTransform.matrix);
        starField.setColorAt(star, starTint.set(star % 7 === 0 ? '#fff6d6' : '#c9def5'));
      }
      starField.computeBoundingSphere();
      stage.add(starField);

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
      const cardAltitudes = [490, 630, 880, 1190];
      const pairCount = Math.ceil(skillCategories.length / 2);
      const pairKeys = Array.from({ length: pairCount }, (_, index) => cardAltitudes[Math.min(index, cardAltitudes.length - 1)] / altitudes[1]);
      const fadeWindow = 20 / altitudes[1];
      const runnerStep = 0.02;
      const campKeys: number[] = [];
      skillCategories.forEach((_, index) => campKeys.push(Math.max(pairKeys[Math.floor(index / 2)] + runnerStep, (campKeys[index - 1] ?? 0) + runnerStep)));
      const summitKey = 0.8;
      const climb: [number, number][] = [[0.5, 0.03], ...skillCategories.map((_, index): [number, number] => [campBase + index * campSpacing, campKeys[index]]), [mountainHeight - 0.4, summitKey]];
      // Trail height → runner key (piecewise linear over the climb table), so flags planted by height can pop
      // exactly as the runner passes them.
      const keyAtHeight = (height: number) => {
        let i = 0;
        while (i < climb.length - 2 && height > climb[i + 1][0]) i++;
        const [h0, k0] = climb[i]; const [h1, k1] = climb[i + 1];
        return k0 + ((height - h0) / Math.max(1e-6, h1 - h0)) * (k1 - k0);
      };
      // Reaching a camp: the signpost springs up and the runner does a little celebratory hop (a bigger one at
      // the summit). Nothing plays while motion is paused.
      const motion = createFlourishes();
      const skip = motion.createHop();
      const popAt = (target: THREE.Object3D, from?: number, hop = 0) => () => { if (pauseRef.current) return; motion.pop(target, from); if (hop > 0) skip.play(hop); };
      const firePops = createPopTriggers([
        ...campMarkers.map((marker, index) => ({ key: campKeys[index], fire: popAt(marker, undefined, 1) })),
        ...milestoneFlags.map(item => ({ key: keyAtHeight(item.height), fire: popAt(item.flag, 0.6) })),
        { key: summitKey, fire: popAt(summitFlag, 0.5, 1.6) },
      ]);
      const jump = motion.createJump();
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
      rest(summitKey + 0.01, flightStart, summit[0] + 0.3, summit[1] + 0.02, summit[2] + 0.1);
      const boardingPoint = route[route.length - 1];
      const flight = createSkyFlight(new THREE.Vector3(boardingPoint[1], boardingPoint[2], boardingPoint[3]), new THREE.Vector3(3.9, 19.05 + lift, -1.8), materials);
      world.add(flight.root);
      const flightPoint = new THREE.Vector3();
      const flightTangent = new THREE.Vector3();
      for (const fraction of [0.2, 0.45, 0.7, 0.9]) {
        const progress = flightStart + (flightEnd - flightStart) * fraction;
        flight.sample(progress, flightPoint, flightTangent);
        route.push([progress, flightPoint.x, flightPoint.y, flightPoint.z]);
      }
      rest(flightEnd, 2.35, 3.9, 19.05 + lift, -1.8);
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
      const traveler = createTraveler(materials);
      runner.add(traveler.root);
      const { body } = traveler;
      const [legL, legR] = traveler.legs;
      const [armL, armR] = traveler.arms;
      const travelerLighting = createTravelerLighting(scene);
      const runnerState = { progress: 0, previous: runner.position.clone(), speed: 0, stride: 0, amplitude: 0 };
      const runnerPoint = new THREE.Vector3();
      const runnerTangent = new THREE.Vector3();
      const runnerAhead = new THREE.Vector3();
      const runnerFacing = new THREE.Matrix4();
      const runnerOrientation = new THREE.Quaternion();
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
        // Clamp the preflight pose to the dock too: spline tangents must not lift the passenger before 10,000 M.
        if (progress >= flightRevealStart && progress <= flightEnd) flight.sample(progress, runnerPoint, runnerTangent);
        if (progress >= spaceBoardingStart) spaceFlight.sample(progress, runnerPoint, runnerTangent);
        const capsuleBoarding = spaceBoarding(progress);
        const boarding = Math.max(flightBoarding(progress), capsuleBoarding);
        // The same passenger boards each vehicle; the capsule keeps them seated through space.
        const hopWeight = smooth((progress - flightStart) / 0.08) * (1 - smooth((progress - 2.35) / 0.1)) * (1 - boarding);
        firePops(progress);
        // The jump's arc and the body's squash/stretch come from the scrubbed GSAP timeline (see Flourish.ts).
        const leap = segmentLength[index] > 0.2 ? hopWeight : 0;
        const pose = jump.seek(leap > 0 ? local : 0);
        const hop = pose.lift * 0.7 * leap + skip.pose.lift * skip.strength * 0.32 * (1 - boarding);
        const stretch = pose.stretch * leap + skip.pose.stretch * 0.7 * (1 - boarding);
        runner.scale.set(1 - stretch * 0.1, 1 + stretch * 0.16, 1 - stretch * 0.1);
        const dt = Math.max(1, deltaMs) / 1000;
        const distance = runnerPoint.distanceTo(runnerState.previous);
        runnerState.previous.copy(runnerPoint);
        // With motion paused (reduced-motion users) the figure simply stands at its place: no run cycle, no extra frames.
        const rawSpeed = pauseRef.current ? 0 : Math.min(distance / dt, 6);
        runnerState.speed += (rawSpeed - runnerState.speed) * (pauseRef.current ? 1 : Math.min(1, dt * 12));
        const targetAmplitude = clamp(runnerState.speed / 1.2, 0, 1) * (1 - boarding);
        runnerState.amplitude += (targetAmplitude - runnerState.amplitude) * (pauseRef.current ? 1 : Math.min(1, dt * 10));
        runnerState.stride = advanceRunStride(runnerState.stride, distance, dt, boarding, pauseRef.current);
        const bob = Math.abs(Math.sin(runnerState.stride)) * 0.045 * runnerState.amplitude * (1 - hopWeight);
        runner.position.set(runnerPoint.x, runnerPoint.y + hop + bob, runnerPoint.z);
        flight.update(progress, elapsed, pauseRef.current, runner.position);
        spaceFlight.update(progress, elapsed, pauseRef.current);
        // Face along the route (yaw only), easing through the trail's two turns.
        runnerTangent.y = 0;
        if (runnerTangent.lengthSq() > 1e-6) {
          runnerAhead.copy(runner.position).add(runnerTangent.normalize());
          runnerFacing.lookAt(runnerAhead, runner.position, yUp);
          runnerOrientation.setFromRotationMatrix(runnerFacing);
          runner.quaternion.slerp(runnerOrientation, pauseRef.current ? 1 : 1 - Math.exp(-dt * 12));
        }
        if (boarding > 0) runner.quaternion.slerp(capsuleBoarding > 0 ? spaceFlight.spacecraft.quaternion : flight.aircraft.quaternion, boarding);
        // Pose blending: walking and hopping ease into a seated passenger pose.
        const swing = Math.sin(runnerState.stride) * runnerState.amplitude;
        const airborne = leap * pose.lift;
        const k = pauseRef.current ? 1 : Math.min(1, dt * 14);
        legL.rotation.x = lerpAngle(legL.rotation.x, swing * 0.95 * (1 - airborne) + airborne * 0.75, k);
        legR.rotation.x = lerpAngle(legR.rotation.x, -swing * 0.95 * (1 - airborne) - airborne * 0.55, k);
        armL.rotation.x = lerpAngle(armL.rotation.x, -swing * 0.8 * (1 - airborne) - airborne * 1.6, k);
        armR.rotation.x = lerpAngle(armR.rotation.x, swing * 0.8 * (1 - airborne) - airborne * 1.6, k);
        armL.rotation.z = lerpAngle(armL.rotation.z, 0.1, k);
        armR.rotation.z = lerpAngle(armR.rotation.z, -0.1, k);
        // Transform the wind into the runner's heading so they lean upwind through both trail turns.
        runnerInverse.copy(runner.quaternion).invert();
        windInRunnerSpace.set(1, 0, 0.24).normalize().applyQuaternion(runnerInverse);
        body.rotation.x = lerpAngle(body.rotation.x, runnerState.amplitude * 0.18 * (1 - airborne) - airborne * 0.2 - windInRunnerSpace.z * weather.lean * 0.18, k);
        body.rotation.z = lerpAngle(body.rotation.z, windInRunnerSpace.x * weather.lean * 0.18, k);
        body.position.y = -0.08 * boarding;
        body.rotation.x *= 1 - boarding;
        body.rotation.z *= 1 - boarding;
        legL.rotation.x = lerpAngle(legL.rotation.x, -1.15, boarding);
        legR.rotation.x = lerpAngle(legR.rotation.x, -1.15, boarding);
        armL.rotation.x = lerpAngle(armL.rotation.x, -0.85, boarding);
        armR.rotation.x = lerpAngle(armR.rotation.x, -0.85, boarding);
        armL.rotation.z *= 1 - capsuleBoarding;
        armR.rotation.z *= 1 - capsuleBoarding;
        traveler.update(runnerState.stride, runnerState.amplitude, boarding, capsuleBoarding, altitudeAt(rawProgress));
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
      const cardHeights: number[] = new Array(skillCategories.length).fill(0);
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
          cardHeights[index] = node.offsetHeight;
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
      // Scroll decides what each card should be; these follow it with a short time constant (~180 ms) so a card
      // that pops in on a fast flick (its 20 M window can be a dozen pixels of scroll on a phone) still fades and
      // scales in smoothly, and the cards it pushes aside slide instead of jumping.
      const easedAlpha: number[] = new Array(skillCategories.length).fill(0);
      const easedReveal: number[] = new Array(skillCategories.length).fill(0);
      const updateSkillCards = (delta: number) => {
        const width = container.clientWidth;
        const height = container.clientHeight;
        if (!width || !height) return;
        const chapter = Math.min(3, Math.floor(progressNow));
        const live = chapter + travel(progressNow - chapter);
        // Cards fade out at the end of the climb, before the mountain chapter's intro (which floats over the scene
        // with no panel behind it) scrolls into view; this follows the raw scroll position so it is never late.
        const hideAll = 1 - smooth((progressNow - 0.88) / 0.06);
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
          const k = pauseRef.current ? 1 : 1 - Math.exp(-delta / 180);
          easedAlpha[index] += (alpha[index] - easedAlpha[index]) * k;
          if (Math.abs(alpha[index] - easedAlpha[index]) < 0.002) easedAlpha[index] = alpha[index];
          easedReveal[index] += (revealOf[index] - easedReveal[index]) * k;
          if (Math.abs(revealOf[index] - easedReveal[index]) < 0.002) easedReveal[index] = revealOf[index];
        }
        // Pass 2: place the newest visible cards first; older ones stack below them or give way.
        const gap = 14;
        // Extra breathing room between the left and right cards: each card is pushed a further `spread` px away
        // from the trail, up to 135 px on wide viewports and none on phones (where both cards must still fit).
        const spread = Math.min(135, Math.max(0, (width - 760) * 0.32));
        stacks[0][0] = stacks[0][1] = stacks[1][0] = stacks[1][1] = 8 - gap;
        for (let index = campAnchors.length - 1; index >= 0; index--) {
          const node = cards.current[index];
          if (!node) continue;
          const side = index % 2 === 0 ? -1 : 1;
          const stack = stacks[side < 0 ? 0 : 1];
          let placed = false;
          if (easedAlpha[index] > 0.002) {
            projected.copy(campAnchors[index]).applyMatrix4(world.matrixWorld).project(camera);
            const ownWidth = cardWidths[index];
            const sideWidth = sideWidths[side < 0 ? 0 : 1];
            const cardHeight = cardHeights[index] || node.offsetHeight;
            let x = ((projected.x + 1) / 2) * width;
            x = side < 0 ? Math.max(x, ownWidth + gap + spread + 8) : Math.min(x, width - ownWidth - gap - spread - 8);
            // Left and right cards never meet: each keeps to its own half of the viewport, so their inner edges
            // stay at least 2 × (gap + spread) apart even where two wide cards cannot fit side by side.
            x = side < 0 ? Math.min(x, width / 2) : Math.max(x, width / 2);
            const desired = ((1 - projected.y) / 2) * height - 6; // bottom edge of the card at its camp
            const bottomAt = (column: number) => Math.max(desired, stack[column] + gap + cardHeight);
            const fits = (column: number, margin: number) => bottomAt(column) <= height - 8 - margin;
            const outerX = x + side * (sideWidth + gap);
            const outerRoom = side < 0 ? outerX - ownWidth - gap - spread >= 8 : outerX + ownWidth + gap + spread <= width - 8;
            let column = columnOf[index];
            if (column === 1 && (!outerRoom || fits(0, 40))) column = 0;
            if (column === 0 && !fits(0, 0) && outerRoom && fits(1, 0)) column = 1;
            columnOf[index] = column;
            const y = bottomAt(column);
            // How far this card is pushed below the viewport decides how far it has faded out (never a hard cut).
            const exit = Math.max(0, Math.min(1, 1 - (y - (height - 8)) / 80));
            if (exit > 0.002) {
              // While a card is still faint it only claims part of its slot, so the cards below slide down with its
              // fade-in instead of jumping the moment it appears (fully claimed once it is as visible as a dimmed card).
              const claimed = Math.min(1, easedAlpha[index] / 0.4);
              stack[column] = y - (1 - claimed) * (cardHeight + gap);
              const cx = column === 1 ? outerX : x;
              node.style.visibility = 'visible';
              node.style.opacity = (easedAlpha[index] * exit).toFixed(3);
              node.style.transform = `translate3d(${(cx + side * (gap + spread)).toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(${side < 0 ? '-100%' : '0'}, -100%) scale(${(0.86 + 0.14 * easedReveal[index]).toFixed(3)})`;
              placed = true;
            }
          }
          if (!placed && node.style.visibility !== 'hidden') { node.style.visibility = 'hidden'; node.style.opacity = '0'; }
        }
      };

      // Give each material an appropriate response instead of one matte finish for every object.
      for (const color of ['#777260', '#626859', '#858a78', '#a0aa91']) {
        const rock = material(color) as THREE.MeshStandardMaterial;
        rock.bumpMap = rockRelief; rock.bumpScale = 0.055; rock.roughness = 0.96;
      }
      for (const color of ['#90ccd0', '#a3d8d9', '#6caaa9']) {
        const water = material(color) as THREE.MeshStandardMaterial;
        water.roughness = 0.2; water.metalness = 0.24;
      }
      batchStaticScene(world, new Set<THREE.Object3D>([
        runner, farm.root, flight.root, spaceFlight.root, planet, mountainSun, sunRays, weather.root,
        ...(weather.water ? [weather.water.root] : []), ...windTrees.map(item => item.object),
        ...clouds.map(item => item.group), ...floaters.map(item => item.object), ...flagGroups, ...campMarkers,
      ]));
      // GSAP loops bob the balloon/islands out of phase and flutter the flags.
      // Weather drives cloud advection and tree sway from the same frame clock.
      motion.drift(floaters);
      // Clouds are driven by weather.travel below so gusts never fight a separate tween.
      motion.flutter(flags);
      if (mobile) {
        // Only the mountains and the runner cast shadows on phones; trees, rocks, camps, farm, aircraft and the
        // batched scenery still receive them, which keeps the look while halving the shadow pass.
        const keep = new Set<THREE.Object3D>();
        runner.traverse(object => keep.add(object));
        world.traverse(object => { if (object.castShadow && object.name !== 'mountain-surface' && !keep.has(object)) object.castShadow = false; });
        travelerLighting.key.castShadow = false; // the runner's own key light would be a second shadow pass
      }
      if (diagnostics) { let casters = 0; scene.traverse(object => { if (object.castShadow && (object as THREE.Mesh).isMesh) casters++; }); Object.assign(diagnostics, { shadowCasters: casters, shadowMap: sun.shadow.mapSize.x, soft: renderer.shadowMap.type === THREE.PCFSoftShadowMap }); }

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

      let appliedProgress = -1;
      const applyProgress = (progress: number) => {
        progressNow = progress;
        if (diagnostics) diagnostics.progress = progress;
        const index = Math.min(Math.floor(progress), stations.length - 2);
        goal.lerpVectors(stations[index], stations[index + 1], travel(progress - index));
        // Keep the expanded terrace and gardener above the viewport edge, then return to the climb framing.
        goal.y -= 1.6 * (1 - smooth((progress - 0.65) / 0.25));
        goal.y += pauseRef.current ? 0 : pointer.y * 0.25;
        goal.x += pauseRef.current ? 0 : pointer.x * 0.35;
        if (progress === appliedProgress) return;
        appliedProgress = progress;
        colorAt(progress, bottomColor);
        colorAt(progress + 0.25, topColor);
        root.style.setProperty('--sky-bottom', `#${bottomColor.getHexString()}`);
        root.style.setProperty('--sky-top', `#${topColor.getHexString()}`);
        root.style.setProperty('--stars', smooth((progress - 2.55) / 0.4).toFixed(3));
        const nextChapter = clamp(Math.floor(progress + 0.15), 0, 3);
        if (nextChapter !== chapter) { chapter = nextChapter; chapterRef.current(chapter); }
        progressRef.current?.(progress);
      };

      // GSAP ScrollTrigger scrubs the journey timeline (chapter bounds → progress) and updates synchronously on
      // scroll events, so chapter/altimeter/backdrop stay in sync even when the WebGL frame loop is slow (low-end
      // GPUs, software rendering). Layout changes in the story rebuild the timeline as soon as they are observed.
      const scroll = motion.createScrollDriver(() => { applyProgress(scroll.progress); dirty = true; });
      const layoutObserver = new ResizeObserver(() => { scroll.refresh(); dirty = true; });
      for (const element of [document.body, ...document.querySelectorAll('#ground, #mountain, #sky, #space, main')]) layoutObserver.observe(element);

      let active = true;
      let lastRaf = 0;
      let slowFrames = 0;
      let qualityChangedAt = 0;
      let rafGap = 16; // smoothed interval between animation frames: grows when the device cannot keep 60 fps
      const animate = (timestamp: number) => {
        animation = requestAnimationFrame(animate);
        if (lastRaf) rafGap += (Math.min(timestamp - lastRaf, 100) - rafGap) * 0.1;
        lastRaf = timestamp;
        // Lower resolution gradually on sustained slow devices; never oscillate quality during a scroll.
        if (!hidden && !pauseRef.current && rafGap > 29) slowFrames++; else slowFrames = Math.max(0, slowFrames - 2);
        if (slowFrames > 90 && timestamp - qualityChangedAt > 5000 && pixelRatio > 1) {
          pixelRatio = Math.max(1, pixelRatio - 0.2);
          renderer.setPixelRatio(pixelRatio); weather.setPixelRatio(pixelRatio); slowFrames = 0; qualityChangedAt = timestamp; dirty = true;
        }
        // Full frame rate while the camera or runner is moving and the browser sustains it; otherwise ~30 fps.
        if (timestamp - lastFrame < (active && rafGap < 24 ? 15 : 32)) return;
        const delta = Math.min(timestamp - lastFrame, 50);
        lastFrame = timestamp;
        if (hidden) return;
        applyProgress(scroll.progress);
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
        if (!pauseRef.current) elapsed += delta / 1000;
        const mood = weather.update(runnerState.progress, elapsed, pauseRef.current);
        const runnerMoved = updateRunner(runnerState.progress, delta);
        if (runnerMoved) dirty = true;
        active = distance > 0.002 || runnerMoved;
        if (!pauseRef.current) {
          world.rotation.y += (pointer.x * 0.12 + Math.sin(elapsed * 0.15) * 0.03 - world.rotation.y) * (1 - Math.exp(-delta / 400));
          motion.tick(delta);
          planet.rotation.y = elapsed * 0.035;
          planetModel.clouds.rotation.y = elapsed * 0.014;
          ring.rotation.z = -0.3 + elapsed * 0.05;
          satellite.rotation.y = elapsed * 0.4;
          dirty = true;
        }
        if (!dirty) return;
        dirty = false;
        const renderStarted = diagnostics ? performance.now() : 0;
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
        sun.intensity = 3.1 + sunlight * 0.5;
        hemisphere.intensity = 1.4 - 0.55 * sunlight - 0.9 * smooth((progressNow - 2.4) / 0.8);
        sun.intensity *= 1 - mood.dim * 0.7;
        hemisphere.intensity *= 1 - mood.dim * 0.5;
        sun.color.lerp(overcastColor, mood.cool * 0.75);
        hemisphere.color.copy(cloudDayColor).lerp(cloudSnowColor, mood.cool);
        sunDiscMaterial.opacity *= 1 - mood.dim * 1.5;
        glowMaterial.opacity *= 1 - mood.dim * 1.8;
        rayMaterial.uniforms.strength.value *= 1 - Math.min(1, mood.dim * 2.4);
        for (const mountain of terrain) {
          const surface = mountain.surface.material as THREE.MeshStandardMaterial;
          surface.roughness = 0.96 - weather.state.wet * 0.38;
          surface.color.setScalar(1 - weather.state.wet * 0.12);
        }
        clouds.forEach((item, index) => {
          const storm = mountainClouds.includes(item.group);
          // Advection always follows +X/+Z. Fade at the edges before recycling a bank upstream.
          const phase = ((weather.travel * 0.032 * item.speed + 0.18 + index * 0.137) % 1 + 1) % 1;
          const drift = (phase - 0.5) * (storm ? 8 : 3.6);
          item.group.position.x = item.base + drift;
          item.group.position.z = item.depth + drift * 0.24;
          item.group.position.y = item.height + Math.sin(elapsed * 0.18 + index) * 0.065;
          const fade = smooth(phase / 0.13) * (1 - smooth((phase - 0.87) / 0.13));
          item.material.opacity = fade * (storm ? 0.65 * Math.max(weather.state.rain, weather.state.snow) : 1);
          item.material.color.copy(cloudDayColor).lerp(cloudStormColor, weather.state.rain * 0.65).lerp(cloudSnowColor, weather.state.snow * 0.7);
          item.group.visible = item.material.opacity > 0.01;
        });
        sunDiscMaterial.color.copy(mountainLightColor).lerp(cloudDayColor, mood.cool);
        glowMaterial.color.copy(cloudDayColor).lerp(cloudSnowColor, mood.cool);
        glowMaterial.opacity *= 1 - weather.state.snow * 0.62;
        const weatherSky = `${progressNow.toFixed(4)}/${weather.state.rain.toFixed(2)}/${weather.state.snow.toFixed(2)}`;
        if (weatherSky !== lastWeatherSky) {
          lastWeatherSky = weatherSky;
          colorAt(progressNow, bottomColor).lerp(rainSkyColor, weather.state.rain * 0.45).lerp(snowSkyColor, weather.state.snow * 0.65);
          colorAt(progressNow + 0.25, topColor).lerp(rainSkyColor, weather.state.rain * 0.6).lerp(snowSkyColor, weather.state.snow * 0.8);
          root.style.setProperty('--sky-bottom', `#${bottomColor.getHexString()}`);
          root.style.setProperty('--sky-top', `#${topColor.getHexString()}`);
        }
        windTrees.forEach(({ object, phase }) => {
          const bend = weather.lean * (0.065 + Math.sin(elapsed * 2.2 + phase) * 0.018 + Math.sin(elapsed * 4.7 + phase) * 0.008);
          object.rotation.z = -bend;
          object.rotation.x = bend * 0.24;
        });
        for (const { mesh: instances, offset } of windPines) {
          pines.forEach(({ position, size, seed }, index) => {
            const bend = weather.lean * (0.10 + Math.sin(elapsed * 2.4 + seed) * 0.025 + Math.sin(elapsed * 5.1 + seed) * 0.012);
            pineBend.setFromAxisAngle(pineWindAxis, bend);
            pineYaw.setFromAxisAngle(pineUp, terrainNoise(seed + 52) * Math.PI * 2);
            instanceTransform.quaternion.copy(pineBend).multiply(pineYaw);
            pineOffset.set(0, size * offset, 0).applyQuaternion(pineBend);
            instanceTransform.position.set(...position).add(pineOffset);
            instanceTransform.scale.setScalar(size);
            instanceTransform.updateMatrix();
            instances.setMatrixAt(index, instanceTransform.matrix);
          });
          instances.instanceMatrix.needsUpdate = true;
        }
        travelerLighting.update(runner, spaceBoarding(Math.min(3, Math.floor(runnerState.progress)) + travel(runnerState.progress % 1)));
        farm.update(elapsed, camera, pauseRef.current);
        const spaceChapter = Math.min(3, Math.floor(runnerState.progress));
        spaceEffects.update(spaceChapter + travel(runnerState.progress - spaceChapter), elapsed, pauseRef.current, camera, container.clientWidth);
        renderer.render(scene, camera);
        if (renderer.domElement.style.visibility === 'hidden') renderer.domElement.style.visibility = 'visible';
        updateSkillCards(delta);
        if (diagnostics) {
          diagnostics.calls = renderer.info.render.calls;
          diagnostics.triangles = renderer.info.render.triangles;
          diagnostics.pixelRatio = pixelRatio;
          Object.assign(diagnostics, { balloonY: floaters[0]?.object.position.y ?? 0, markerScale: Math.max(...campMarkers.map(marker => marker.scale.y)), flagYaw: flags[0]?.rotation.y ?? 0, runnerScaleY: runner.scale.y, travelerScale: traveler.root.scale.x, travelerStage: traveler.stage, travelerOutfit: traveler.root.userData.lifeStage, aircraftScale: flight.aircraft.scale.x, spacecraftScale: spaceFlight.spacecraft.scale.x, weather: { rain: weather.state.rain, wind: weather.state.wind, snow: weather.state.snow, gust: weather.state.gust, wet: weather.state.wet, travel: weather.travel, impacts: weather.impactCount, treeBend: windTrees[0]?.object.rotation.z ?? 0, cloudX: mountainClouds[0].position.x, runnerLean: body.rotation.z, water: weather.water ? { ...weather.water.state, channels: weather.water.paths.length } : null }, jumpLift: Math.max(jump.pose.lift, skip.pose.lift) });
          diagnostics.frames++;
          diagnostics.cpuMs = performance.now() - renderStarted;
          diagnostics.aircraftY = flight.aircraft.position.y;
          diagnostics.passengerY = runner.position.y;
        }
      };
      resize();
      // Chip wrapping depends on the web fonts, so re-measure the cards once they are in.
      document.fonts?.ready.then(() => { if (!disposed) { measureCards(); dirty = true; } });
      updateRunner(0, 16);
      let disposed = false;
      // Compile every chapter's materials before showing the canvas, including currently hidden vehicles.
      // Text/content stays usable while the GPU prepares programs in parallel.
      const compilation = renderer.compileAsync(scene, camera);
      compilation.then(() => {
        if (disposed) return;
        // Upload buffers/textures and prepare shadow variants while the canvas is still hidden.
        // A one-pixel viewport keeps raster work tiny; every later chapter then reuses these resources.
        const states: { object: THREE.Object3D; visible: boolean; culled: boolean }[] = [];
        scene.traverse(object => {
          states.push({ object, visible: object.visible, culled: object.frustumCulled });
          object.visible = true; object.frustumCulled = false;
        });
        const viewport = renderer.getViewport(new THREE.Vector4());
        try {
          renderer.setViewport(0, 0, 1, 1);
          renderer.render(scene, camera);
        } finally {
          renderer.setViewport(viewport);
          states.forEach(({ object, visible, culled }) => { object.visible = visible; object.frustumCulled = culled; });
        }
        animation = requestAnimationFrame(animate);
      }).catch(() => { if (!disposed) setFailed(true); });

      return () => {
        disposed = true;
        cancelAnimationFrame(animation);
        layoutObserver.disconnect();
        motion.dispose();
        weather.dispose();
        window.removeEventListener('resize', resize);
        window.removeEventListener('pointermove', move);
        document.removeEventListener('visibilitychange', visibility);
        renderer.domElement.removeEventListener('webglcontextlost', contextLost);
        renderer.domElement.remove();
        const release = () => {
          const geometries = new Set<THREE.BufferGeometry>();
          scene.traverse(object => {
            if (object instanceof THREE.Mesh) geometries.add(object.geometry);
            if (object instanceof THREE.InstancedMesh) object.dispose();
          });
          geometries.forEach(geometry => geometry.dispose());
          materials.forEach(item => item.dispose());
          glowTexture.dispose();
          rockRelief.dispose();
          planetModel.dispose();
          environment.dispose();
          sun.shadow.dispose();
          travelerLighting.dispose();
          traveler.dispose();
          renderer.dispose();
        };
        // compileAsync polls material programs: release them only after that polling has ended.
        void compilation.then(release, release);
      };
    };
    let release: (() => void) | undefined;
    const startup = requestAnimationFrame(() => { release = setup(); });
    return () => { cancelAnimationFrame(startup); release?.(); };
  }, []);

  return <>
    <div ref={host} className="journey-stage" role="img" aria-label="โลกสามมิติแบบต่อเนื่อง ฐานภูเขากว้างมีสวนผักและแปลงข้าว พร้อมชาวสวนสวมหมวกกำลังพรวนดิน มีตัวละครนักศึกษาออกจากกระท่อมบนพื้นดิน เปลี่ยนเป็นวัยทำงานที่ 1,120 เมตร และชุดสูทสุภาพที่ 5,510 เมตร วิ่งขึ้นภูเขาผ่านแคมป์ทักษะแต่ละหมวด มีภูเขาด้านหลังเพิ่มอีกสองลูก ดวงอาทิตย์ส่องแสงและทอดเงาบนไหล่เขา ตัวละครขึ้นเครื่องบินจากยอดเขา บินผ่านเมฆพร้อมนกห้าตัวไปยังเกาะลอย แล้วเดินขึ้นยานอวกาศและนั่งในห้องนักบินขณะยานลอยขึ้นผ่านดาวเคราะห์ มีดาวหางตกช้า ๆ บริเวณด้านข้าง แทนการเดินทางของการเป็นโปรแกรมเมอร์">
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
