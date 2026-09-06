import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { blend, clamp, measureProgress, smooth, travel } from './journeyMath';

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
const stations = [
  new THREE.Vector3(0.2, -0.2, 0.3),
  new THREE.Vector3(-0.6, 2.2, -1.6),
  new THREE.Vector3(0.9, 8.5, 0),
  new THREE.Vector3(0.4, 20.5, 0),
  new THREE.Vector3(0.4, 24.5, 0),
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
}

export default function Journey({ paused, onChapter, onProgress }: JourneyProps) {
  const host = useRef<HTMLDivElement>(null);
  const pauseRef = useRef(paused);
  const chapterRef = useRef(onChapter);
  const progressRef = useRef(onProgress);
  const [failed, setFailed] = useState(false);
  useEffect(() => { pauseRef.current = paused; }, [paused]);
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
    Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10, near: 1, far: 80 });
    sun.shadow.bias = -0.001;
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
    function mesh(geometry: THREE.BufferGeometry, color: string, position: Vec, parent: THREE.Object3D = world, glow = false) {
      const object = new THREE.Mesh(geometry, material(color, glow));
      object.position.set(...position);
      object.castShadow = !glow;
      object.receiveShadow = !glow;
      parent.add(object);
      return object;
    }
    const box = (size: Vec, color: string, position: Vec, parent: THREE.Object3D = world) => mesh(new THREE.BoxGeometry(...size), color, position, parent);
    function group(position: Vec, parent: THREE.Object3D = world, scale = 1) {
      const item = new THREE.Group();
      item.position.set(...position);
      item.scale.setScalar(scale);
      parent.add(item);
      return item;
    }
    function tree(position: Vec, scale = 1, parent: THREE.Object3D = world) {
      const item = group(position, parent, scale);
      mesh(new THREE.CylinderGeometry(0.09, 0.13, 0.7, 6), '#75604a', [0, 0.3, 0], item);
      for (let layer = 0; layer < 3; layer++) mesh(new THREE.ConeGeometry(0.62 - layer * 0.13, 1.05, 7), ['#426747', '#547955', '#6c8c60'][layer], [0, 0.8 + layer * 0.38, 0], item);
    }
    const clouds: { group: THREE.Group; base: number; speed: number }[] = [];
    function cloud(position: Vec, scale = 1, speed = 1) {
      const item = group(position, world, scale);
      for (let piece = 0; piece < 5; piece++) {
        const puff = mesh(new THREE.IcosahedronGeometry(0.6, 2), '#ffffff', [(piece - 2) * 0.48, Math.sin(piece * 2) * 0.17, Math.cos(piece) * 0.12], item);
        puff.scale.y = 0.65 + (piece % 2) * 0.4;
        puff.castShadow = false;
      }
      clouds.push({ group: item, base: position[0], speed });
    }
    function flag(position: Vec, color: string, height = 0.9, parent: THREE.Object3D = world) {
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
    const island = mesh(new THREE.CylinderGeometry(4.2, 2.3, 2.1, 9, 2), '#777260', [0, -1.5, 0]);
    island.rotation.y = 0.17;
    mesh(new THREE.ConeGeometry(2.35, 2.2, 7), '#626859', [0.1, -3.3, 0]).rotation.z = Math.PI;
    mesh(new THREE.CylinderGeometry(4.25, 4.1, 0.32, 9), '#a4b780', [0, -0.3, 0]).rotation.y = 0.17;
    mesh(new THREE.CylinderGeometry(3.9, 4.2, 0.16, 9), '#b8c693', [0, -0.08, 0]).rotation.y = 0.17;
    const river = box([0.7, 0.06, 3.5], '#90ccd0', [1.4, 0.04, 1.15]);
    river.rotation.y = -0.18;
    box([0.75, 3.4, 0.12], '#a3d8d9', [1.1, -1.68, 3.02]);
    for (let stream = 0; stream < 4; stream++) box([0.04, 2.8 - stream * 0.23, 0.03], '#d9efdf', [0.85 + stream * 0.15, -1.55, 3.1]);
    ([[-2.9, 0, 1.2], [-3.2, 0, 0.1], [-2.3, 0, 2.3], [2.6, 0, -0.9], [3.1, 0, 0.3], [2.7, 0, 1.9], [2.2, 0, 2.9], [-1.1, 0, 3]] as Vec[]).forEach((position, index) => tree(position, 0.6 + (index % 3) * 0.16));
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
    mesh(new THREE.OctahedronGeometry(0.11), '#ffd98a', [0.85, 0.88, 1.95], world, true);
    for (let rock = 0; rock < 9; rock++) {
      const angle = rock * 2.39;
      const stone = mesh(new THREE.DodecahedronGeometry(0.2 + (rock % 3) * 0.07), '#a0aa91', [Math.cos(angle) * 3.5, 0.1, Math.sin(angle) * 3.3]);
      stone.scale.y = 0.55;
    }
    cloud([-4.8, -2.4, 1.6], 0.7, 0.6);
    cloud([4.6, -1.6, 2.6], 0.6, 0.8);

    /* ---------- Chapter 2 · Mountain: the climb through each role, one flag per milestone ---------- */
    const peak: Vec = [-0.6, -0.4, -1.6];
    const mountainHeight = 10;
    const mountainRadius = 2.7;
    mesh(new THREE.ConeGeometry(mountainRadius, mountainHeight, 6), '#7b8b73', [peak[0], peak[1] + mountainHeight / 2, peak[2]]);
    mesh(new THREE.ConeGeometry(1.6, 4.2, 5), '#97a48a', [-2.6, 1.7, -0.4]);
    mesh(new THREE.ConeGeometry(1.25, 3.4, 5), '#8e9c83', [1.6, 1.3, -2.6]);
    mesh(new THREE.ConeGeometry(0.5, 1.2, 5), '#e2e9d5', [-2.6, 3.4, -0.4]);
    mesh(new THREE.ConeGeometry(0.85, 2.9, 6), '#edf0df', [peak[0], peak[1] + mountainHeight - 1.45, peak[2]]);
    const summit: Vec = [peak[0], peak[1] + mountainHeight, peak[2]];
    // Winding trail: stepping stones spiralling up the slope.
    const radiusAt = (height: number) => mountainRadius * (1 - height / mountainHeight);
    const trailPoint = (height: number): Vec => {
      const angle = 0.9 + height * 0.62;
      const radius = radiusAt(height) + 0.06;
      return [peak[0] + Math.cos(angle) * radius, peak[1] + height, peak[2] + Math.sin(angle) * radius];
    };
    for (let height = 0.5; height < mountainHeight - 1; height += 0.22) {
      const stone = box([0.26, 0.06, 0.26], height % 0.44 < 0.22 ? '#d9c9a2' : '#e6dbbd', trailPoint(height));
      stone.rotation.y = height;
    }
    const milestones: [number, string][] = [[2.5, '#e8c46a'], [5.1, '#e2a27a'], [7.6, '#c7ed91']];
    milestones.forEach(([height, color]) => flag(trailPoint(height), color, 0.95));
    // Base camp tent: the pause to learn before the next push.
    const camp = group(trailPoint(4.1));
    const tent = mesh(new THREE.ConeGeometry(0.42, 0.42, 4), '#d99a6c', [0, 0.21, 0], camp);
    tent.rotation.y = Math.PI / 4;
    mesh(new THREE.OctahedronGeometry(0.07), '#ffb26b', [0.35, 0.08, 0.2], camp, true);
    // Summit flag: the current chapter, planted at the top.
    flag(summit, '#c7ed91', 1.15);
    cloud([-4.4, 4.6, -0.6], 0.75, 0.7);
    cloud([3.6, 6.6, -2.4], 0.65, 0.9);
    cloud([-2.6, 9.2, 1.4], 0.55, 1.1);

    /* ---------- Chapter 3 · Sky: experiments let loose above the clouds ---------- */
    const balloon = group([1.6, 16, 0.5], world, 0.85);
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
      const item = group(position, world, scale);
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
    const rocket = group([2.6, 28.4, 0.7]);
    rocket.rotation.z = -0.35;
    mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.5, 12), '#f3eedb', [0, 0, 0], rocket);
    mesh(new THREE.ConeGeometry(0.42, 0.8, 12), '#d6926d', [0, 1.15, 0], rocket);
    mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.05, 16), '#6caaa9', [0, 0.25, 0.42], rocket).rotation.x = Math.PI / 2;
    for (const side of [-1, 1]) box([0.18, 0.65, 0.55], '#d6926d', [side * 0.5, -0.6, 0], rocket).rotation.z = side * -0.35;
    const exhaust = mesh(new THREE.ConeGeometry(0.28, 0.9, 8), '#f3c987', [0, -1.2, 0], rocket, true);
    exhaust.rotation.z = Math.PI;
    float(rocket, 0.16, 0.8);
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
      mesh(new THREE.OctahedronGeometry(bright ? 0.09 : 0.04), bright ? '#fff6d6' : '#e8eacf', [Math.sin(seed) * 8.5, 21 + ((star * 0.911) % 15), -3.5 - ((star * 0.37) % 3)], world, true);
    }
    for (let star = 0; star < 18; star++) mesh(new THREE.OctahedronGeometry(0.035), '#e8eacf', [Math.sin(star * 1.7) * 8, 18 + (star % 4) * 0.8, -4 - (star % 3)], world, true);

    /* ---------- The runner: one small figure that travels the whole journey as the visitor scrolls ---------- */
    // Route keyframes: [c, x, y, z] where c is the camera's eased progress (chapter index + travel(fraction)).
    // Keying the route to the camera's own easing keeps the runner inside the strip of scene that is visible
    // above the content cards (roughly 1–6 units above the camera target early in a travel gap, 6–11 units at
    // the end of it). Ground: cabin door → island loop. Mountain: the spiral trail — its back half is hidden
    // behind the peak, so that stretch is crossed quickly and the visible upper trail is climbed slowly.
    // Sky: hops between clouds and islands. Space: floating past the asteroid to the planet, rocket and satellite.
    const route: [number, number, number, number][] = [
      [0, -0.1, 0.03, 2.35], [0.008, -0.62, 0.03, 2.98], [0.016, 0.75, 0.03, 2.9], [0.024, 1.0, 0.03, 1.7],
    ];
    const rest = (from: number, until: number, x: number, y: number, z: number) => route.push([from, x, y, z], [until, x + 0.02, y, z + 0.02]);
    const climb: [number, number][] = [[0.5, 0.03], [2.5, 0.07], [7.6, 0.12], [8.2, 0.3], [9, 0.55], [9.5, 0.72]];
    const cForHeight = (height: number) => {
      for (let step = 0; step < climb.length - 1; step++) {
        const [h0, c0] = climb[step];
        const [h1, c1] = climb[step + 1];
        if (height <= h1) return c0 + ((c1 - c0) * (height - h0)) / (h1 - h0);
      }
      return climb[climb.length - 1][1];
    };
    for (let height = 0.5; height <= 9.5; height += 0.5) {
      const point = trailPoint(height);
      route.push([cForHeight(height), point[0], point[1] + 0.06, point[2]]);
    }
    rest(0.8, 1.45, summit[0] + 0.3, summit[1] + 0.02, summit[2] + 0.1);
    route.push([1.6, -2.6, 12.95, 0.8], [1.75, -3.2, 14.55, -1.0], [1.85, 1.2, 15.65, 2.2], [1.95, -0.6, 18.5, 1.2]);
    rest(2.02, 2.35, 3.9, 19.05, -1.8);
    route.push([2.45, -1.6, 20.15, -1.4], [2.6, 2.6, 21.15, 0.6], [2.8, 3.6, 25.0, -1.6]);
    rest(2.95, 3.05, -1.4, 28.3, -0.5);
    route.push([3.12, 2.3, 30.1, 0.9], [3.17, -0.9, 30.9, 0.1], [3.2, -3.2, 31.2, -0.6]);
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
      // Sky chapter: hop from cloud to island in little arcs; space: slow float instead of running.
      const hopWeight = smooth((progress - 1.45) / 0.08) * (1 - smooth((progress - 2.35) / 0.1));
      const floatWeight = smooth((progress - 2.35) / 0.15);
      const hop = segmentLength[index] > 0.2 ? Math.sin(Math.PI * local) * 0.7 * hopWeight : 0;
      const dt = Math.max(1, deltaMs) / 1000;
      const distance = runnerPoint.distanceTo(runnerState.previous);
      runnerState.previous.copy(runnerPoint);
      // With motion paused (reduced-motion users) the figure simply stands at its place: no run cycle, no extra frames.
      const rawSpeed = pauseRef.current ? 0 : Math.min(distance / dt, 6);
      runnerState.speed += (rawSpeed - runnerState.speed) * (pauseRef.current ? 1 : Math.min(1, dt * 12));
      const targetAmplitude = clamp(runnerState.speed / 1.2, 0, 1) * (1 - floatWeight);
      runnerState.amplitude += (targetAmplitude - runnerState.amplitude) * (pauseRef.current ? 1 : Math.min(1, dt * 10));
      runnerState.stride += distance * 9;
      const bob = Math.abs(Math.sin(runnerState.stride)) * 0.045 * runnerState.amplitude * (1 - hopWeight);
      const floatBob = Math.sin(elapsed * 1.3) * 0.12 * floatWeight;
      runner.position.set(runnerPoint.x, runnerPoint.y + hop + bob + floatBob, runnerPoint.z);
      // Face along the route (yaw only), so the figure runs "forwards" around the spiral.
      runnerTangent.y = 0;
      if (runnerTangent.lengthSq() > 1e-6) {
        runnerAhead.copy(runner.position).add(runnerTangent.normalize());
        runner.lookAt(runnerAhead);
      }
      // Pose blending: run cycle → hop pose → weightless drift.
      const swing = Math.sin(runnerState.stride) * runnerState.amplitude;
      const airborne = hopWeight * Math.sin(Math.PI * local);
      const drift = Math.sin(elapsed * 1.1) * 0.25;
      const k = pauseRef.current ? 1 : Math.min(1, dt * 14);
      legL.rotation.x = lerpAngle(legL.rotation.x, swing * 0.95 * (1 - airborne) + airborne * 0.75 + floatWeight * (-0.35 + drift * 0.3), k);
      legR.rotation.x = lerpAngle(legR.rotation.x, -swing * 0.95 * (1 - airborne) - airborne * 0.55 + floatWeight * (0.25 - drift * 0.3), k);
      armL.rotation.x = lerpAngle(armL.rotation.x, -swing * 0.8 * (1 - airborne) - airborne * 1.6 + floatWeight * (-0.9 + drift * 0.4), k);
      armR.rotation.x = lerpAngle(armR.rotation.x, swing * 0.8 * (1 - airborne) - airborne * 1.6 + floatWeight * (-0.9 - drift * 0.4), k);
      armL.rotation.z = lerpAngle(armL.rotation.z, 0.1 + floatWeight * 0.9, k);
      armR.rotation.z = lerpAngle(armR.rotation.z, -0.1 - floatWeight * 0.9, k);
      body.rotation.x = lerpAngle(body.rotation.x, runnerState.amplitude * 0.18 * (1 - airborne) - airborne * 0.2 + floatWeight * (-0.25 + Math.sin(elapsed * 0.7) * 0.15), k);
      body.rotation.z = lerpAngle(body.rotation.z, floatWeight * Math.sin(elapsed * 0.5) * 0.35, k);
      helmet.visible = floatWeight > 0.02;
      helmetMaterial.opacity = 0.32 * floatWeight;
      // Only real travel counts as "moving" (drives the 60 fps budget); the idle float/bob is ambient like the clouds.
      return distance > 1e-4 || runnerState.amplitude > 0.01;
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
        exhaust.scale.y = 0.85 + Math.sin(elapsed * 14) * 0.2;
        dirty = true;
      }
      if (!dirty) return;
      dirty = false;
      camera.position.copy(target).addScaledVector(viewDirection, 40);
      camera.lookAt(target);
      sun.position.set(target.x - 5, target.y + 12, target.z + 7);
      sun.target.position.copy(target);
      renderer.render(scene, camera);
    };
    resize();
    updateRunner(0, 16);
    animation = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animation);
      window.removeEventListener('resize', resize);
      window.removeEventListener('scroll', sync);
      window.removeEventListener('pointermove', move);
      document.removeEventListener('visibilitychange', visibility);
      renderer.domElement.removeEventListener('webglcontextlost', contextLost);
      scene.traverse(object => { if (object instanceof THREE.Mesh) object.geometry.dispose(); });
      materials.forEach(item => item.dispose());
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return <div ref={host} className="journey-stage" role="img" aria-label="โลกสามมิติแบบต่อเนื่อง มีนักวิ่งตัวเล็กออกจากกระท่อมบนพื้นดิน วิ่งขึ้นภูเขาที่มีธงตามทาง กระโดดข้ามเมฆและเกาะลอยบนท้องฟ้า แล้วลอยตัวสู่ดาวเคราะห์และจรวดในอวกาศ แทนการเดินทางของการเป็นโปรแกรมเมอร์">
    {failed && <div className="world-fallback"><span>△</span><p>โลกของการเรียนรู้ไม่มีที่สิ้นสุด</p><small>อุปกรณ์นี้แสดงฉากแบบเรียบง่าย</small></div>}
  </div>;
}
