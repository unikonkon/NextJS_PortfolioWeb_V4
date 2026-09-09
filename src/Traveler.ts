import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clamp } from './journeyMath';

type Vec = [number, number, number];

/** A single articulated traveler, reused on the trail and in both cockpits. No downloaded model or animation mixer. */
export function createTraveler(materials: Map<string, THREE.Material>) {
  const root = new THREE.Group(); root.name = 'traveler';
  const body = new THREE.Group(); body.name = 'traveler-body'; root.add(body);
  const surface = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.76 });
  const skin = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.57 });
  const pants = new THREE.MeshStandardMaterial({ color: '#354c62', roughness: 0.9 });
  const forearmMaterial = new THREE.MeshStandardMaterial({ color: '#e0b08a', roughness: 0.66 });
  const shirt = new THREE.MeshStandardMaterial({ vertexColors: true, color: '#bd604c', roughness: 0.91 });
  const packMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, color: '#a6bc85', roughness: 0.83 });
  const visorMaterial = new THREE.MeshStandardMaterial({ color: '#bcdeeb', roughness: 0.1, metalness: 0.18, transparent: true, opacity: 0.13, depthWrite: false });
  for (const [key, material] of Object.entries({ surface, skin, shirt, pants, forearmMaterial, packMaterial, visorMaterial })) materials.set(`traveler-${key}`, material);
  const sphere = (r: number, w = 10, h = 8) => new THREE.SphereGeometry(r, w, h);
  const rounded = (w: number, h: number, d: number, r = 0.015) => new RoundedBoxGeometry(w, h, d, 1, r);
  function batch(parent: THREE.Object3D, name: string, material: THREE.Material = surface) {
    const parts: THREE.BufferGeometry[] = [];
    const tint = new THREE.Color();
    return {
      add(geometry: THREE.BufferGeometry, color: string, position: Vec, scale: Vec = [1, 1, 1]) {
        if (geometry.index) { const indexed = geometry; geometry = indexed.toNonIndexed(); indexed.dispose(); }
        geometry.scale(...scale).translate(...position);
        tint.set(color);
        const colors = new Float32Array(geometry.getAttribute('position').count * 3);
        for (let i = 0; i < colors.length; i += 3) { colors[i] = tint.r; colors[i + 1] = tint.g; colors[i + 2] = tint.b; }
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3)); parts.push(geometry);
      },
      finish() {
        const object = new THREE.Mesh(mergeGeometries(parts), material);
        parts.forEach(part => part.dispose());
        object.name = name; object.castShadow = object.receiveShadow = true; parent.add(object);
        return object;
      },
    };
  }
  const torso = batch(body, 'traveler-jacket', shirt);
  torso.add(rounded(0.27, 0.32, 0.18, 0.05), '#ffffff', [0, 0.535, 0]);
  torso.add(new THREE.BoxGeometry(0.012, 0.26, 0.008), '#433a33', [0, 0.55, 0.093]);
  for (const side of [-1, 1]) {
    torso.add(rounded(0.07, 0.065, 0.014, 0.008), '#d5d3c9', [side * 0.075, 0.53, 0.098]);
    torso.add(new THREE.BoxGeometry(0.033, 0.245, 0.018).rotateZ(side * -0.08), '#404c48', [side * 0.105, 0.555, 0.083]);
  }
  torso.add(new THREE.BoxGeometry(0.235, 0.025, 0.185), '#494b43', [0, 0.4, 0]);
  torso.add(new THREE.BoxGeometry(0.035, 0.03, 0.012), '#e0d5b7', [0, 0.405, 0.102]);
  torso.finish();
  const pack = batch(body, 'traveler-backpack', packMaterial);
  pack.add(rounded(0.185, 0.235, 0.12, 0.035), '#ffffff', [0, 0.545, -0.135]);
  pack.add(rounded(0.135, 0.075, 0.025), '#b9c4b3', [0, 0.5, -0.203]);
  for (const side of [-1, 1]) pack.add(new THREE.BoxGeometry(0.015, 0.21, 0.012), '#4d5f50', [side * 0.065, 0.55, -0.2]);
  pack.finish();

  const head = new THREE.Group(); head.name = 'traveler-head'; head.position.y = 0.81; body.add(head);
  const face = batch(head, 'traveler-face', skin);
  face.add(sphere(0.105, 20, 14), '#e6ba94', [0, 0.018, 0], [0.91, 1.13, 0.96]);
  face.add(new THREE.CylinderGeometry(0.037, 0.043, 0.085, 10), '#ddb18b', [0, -0.105, 0]);
  face.add(sphere(0.024), '#d9a781', [0, 0.007, 0.097], [0.72, 0.88, 1.15]);
  for (const side of [-1, 1]) {
    face.add(sphere(0.023, 8, 6), '#d9a781', [side * 0.093, 0.012, -0.002], [0.65, 1, 0.6]);
    face.add(sphere(0.012, 8, 6), '#eee8db', [side * 0.039, 0.035, 0.088], [1.15, 0.65, 0.4]);
    face.add(sphere(0.006, 6, 4), '#302c28', [side * 0.039, 0.034, 0.094]);
    face.add(new THREE.BoxGeometry(0.031, 0.007, 0.008).rotateZ(side * 0.1), '#45352d', [side * 0.04, 0.057, 0.084]);
  }
  face.add(new THREE.BoxGeometry(0.035, 0.006, 0.006), '#986952', [0, -0.035, 0.091]);
  face.add(new THREE.SphereGeometry(0.109, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.48), '#3c302b', [0, 0.055, -0.016], [0.97, 0.92, 1.08]);
  face.finish();
  function pivot(parent: THREE.Object3D, name: string, position: Vec) {
    const joint = new THREE.Group(); joint.name = name; joint.position.set(...position); parent.add(joint); return joint;
  }
  const legs: THREE.Group[] = [], knees: THREE.Group[] = [], arms: THREE.Group[] = [], elbows: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const leg = pivot(body, `hip-${side}`, [side * 0.075, 0.37, 0]); legs.push(leg);
    const thigh = batch(leg, `thigh-${side}`, pants);
    thigh.add(new THREE.CapsuleGeometry(0.047, 0.075, 3, 8), '#354c62', [0, -0.085, 0]); thigh.finish();
    const knee = pivot(leg, `knee-${side}`, [0, -0.17, 0]); knees.push(knee);
    const shin = batch(knee, `shin-${side}`, pants);
    shin.add(sphere(0.044, 10, 8), '#405970', [0, 0, 0]);
    shin.add(new THREE.CapsuleGeometry(0.039, 0.075, 3, 8), '#405970', [0, -0.075, 0]);
    shin.finish();
    const shoe = batch(knee, `shoe-${side}`);
    shoe.add(rounded(0.1, 0.065, 0.17, 0.022), '#d5d8d1', [0, -0.155, 0.027]);
    shoe.add(new THREE.BoxGeometry(0.101, 0.014, 0.17), '#4c5656', [0, -0.184, 0.027]);
    shoe.add(new THREE.BoxGeometry(0.062, 0.007, 0.047), '#f1eadb', [0, -0.119, 0.065]); shoe.finish();
    const arm = pivot(body, `shoulder-${side}`, [side * 0.161, 0.67, 0]); arms.push(arm);
    const sleeve = batch(arm, `sleeve-${side}`, shirt);
    sleeve.add(new THREE.CapsuleGeometry(0.042, 0.075, 3, 8), '#ffffff', [0, -0.075, 0]); sleeve.finish();
    const elbow = pivot(arm, `elbow-${side}`, [0, -0.15, 0]); elbows.push(elbow);
    const forearm = batch(elbow, `forearm-and-hand-${side}`, forearmMaterial);
    forearm.add(sphere(0.033, 10, 8), '#e0b08a', [0, 0, 0]);
    forearm.add(new THREE.CapsuleGeometry(0.03, 0.07, 3, 8), '#e0b08a', [0, -0.064, 0]);
    forearm.add(sphere(0.036, 8, 6), '#e6ba94', [0, -0.14, 0.01], [0.85, 1.14, 0.7]);
    forearm.add(sphere(0.014, 6, 4), '#d9a781', [side * -0.026, -0.129, 0.024]); forearm.finish();
  }
  const equipment = new THREE.Group(); equipment.name = 'flight-headset'; head.add(equipment);
  const headset = batch(equipment, 'pilot-headset');
  headset.add(new THREE.TorusGeometry(0.118, 0.012, 4, 16, Math.PI).rotateY(Math.PI / 2), '#3c4547', [0, 0.035, 0]);
  for (const side of [-1, 1]) headset.add(sphere(0.029, 8, 6), '#405452', [side * 0.103, 0.017, 0], [0.45, 1.1, 1]);
  headset.add(new THREE.CylinderGeometry(0.005, 0.005, 0.09, 5).rotateX(-1.15), '#424a49', [0.08, -0.02, 0.055]);
  headset.add(sphere(0.012, 6, 4), '#343e3d', [0.075, -0.034, 0.096]); headset.finish();
  const suit = new THREE.Group(); suit.name = 'astronaut-equipment'; body.add(suit);
  const fittings = batch(suit, 'astronaut-collar-and-controls');
  fittings.add(new THREE.TorusGeometry(0.103, 0.023, 6, 20).rotateX(Math.PI / 2), '#d5dfe0', [0, 0.725, 0]);
  fittings.add(rounded(0.12, 0.095, 0.025, 0.012), '#cad7d9', [0, 0.55, 0.111]);
  fittings.add(new THREE.BoxGeometry(0.061, 0.028, 0.006), '#365b69', [0, 0.568, 0.127]);
  for (const side of [-1, 1]) fittings.add(sphere(0.012, 6, 4), side < 0 ? '#c58b56' : '#71b6bd', [side * 0.033, 0.53, 0.128]);
  fittings.add(new THREE.TorusGeometry(0.14, 0.014, 5, 24), '#dce3df', [0, 0.83, 0.021]); fittings.finish();
  const visor = new THREE.Mesh(new THREE.SphereGeometry(0.15, 20, 14), visorMaterial);
  visor.name = 'astronaut-visor'; visor.position.set(0, 0.83, 0.004); suit.add(visor);
  const trouserColor = new THREE.Color('#354c62'), handColor = new THREE.Color('#e0b08a');
  const jacketColor = new THREE.Color('#bd604c'), suitColor = new THREE.Color('#dae1da');
  const bagColor = new THREE.Color('#a6bc85'), oxygenColor = new THREE.Color('#b7c8d0');
  equipment.visible = suit.visible = false;
  return {
    root, body, head, legs, knees, arms, elbows,
    update(stride: number, amplitude: number, boarding: number, space: number) {
      const seat = clamp(boarding, 0, 1), orbit = clamp(space, 0, 1);
      for (let i = 0; i < 2; i++) {
        const phase = stride + i * Math.PI;
        knees[i].rotation.x = (0.1 + Math.max(0, -Math.sin(phase)) * 0.95 * amplitude) * (1 - seat) + seat * 1.2;
        elbows[i].rotation.x = (-0.35 - amplitude * 0.55) * (1 - seat) - seat * 0.7;
      }
      head.rotation.x = -0.045 * seat;
      head.rotation.y = Math.sin(stride * 0.5) * amplitude * 0.045 * (1 - seat);
      shirt.color.copy(jacketColor).lerp(suitColor, orbit);
      packMaterial.color.copy(bagColor).lerp(oxygenColor, orbit);
      pants.color.copy(trouserColor).lerp(suitColor, orbit);
      forearmMaterial.color.copy(handColor).lerp(suitColor, orbit);
      equipment.visible = seat > 0.05 && orbit < 0.8;
      equipment.scale.setScalar(Math.max(0.001, seat * (1 - orbit)));
      suit.visible = orbit > 0.01;
      suit.scale.setScalar(Math.max(0.001, orbit));
    },
  };
}

/** A small close shadow map resolves faces/cockpits; a shadow-free rim adds separation. */
export function createTravelerLighting(scene: THREE.Scene) {
  const key = new THREE.DirectionalLight('#ffe0bd', 0.85);
  key.name = 'traveler-key-light'; key.castShadow = true;
  key.shadow.mapSize.set(512, 512);
  Object.assign(key.shadow.camera, { left: -2.1, right: 2.1, top: 2.1, bottom: -2.1, near: 0.5, far: 12 });
  key.shadow.bias = -0.00008; key.shadow.normalBias = 0.006;
  key.position.set(-3, 5, 4);
  const rim = new THREE.DirectionalLight('#b7d9f2', 0.45);
  rim.name = 'traveler-rim-light';
  rim.position.set(3, 2, -4);
  scene.add(key, key.target, rim, rim.target);
  const focus = new THREE.Vector3();
  return {
    key, rim,
    update(actor: THREE.Object3D, space: number) {
      actor.getWorldPosition(focus); focus.y += 0.5;
      key.target.position.copy(focus); rim.target.position.copy(focus);
      key.position.copy(focus).addScaledVector(keyOffset, 1);
      rim.position.copy(focus).addScaledVector(rimOffset, 1);
      key.intensity = 0.85 + clamp(space, 0, 1) * 0.2;
      rim.intensity = 0.45 + clamp(space, 0, 1) * 0.25;
    },
    dispose() { key.shadow.dispose(); },
  };
}
const keyOffset = new THREE.Vector3(-3, 5, 4);
const rimOffset = new THREE.Vector3(3, 2, -4);
