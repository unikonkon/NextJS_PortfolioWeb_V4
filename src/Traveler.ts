import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clamp } from './journeyMath';
import { travelerScale, travelerStageAtAltitude, type TravelerStage } from './journey';

type Vec = [number, number, number];

/** A single articulated traveler, reused on the trail and in both cockpits. No downloaded model or animation mixer. */
export function createTraveler(materials: Map<string, THREE.Material>) {
  const root = new THREE.Group(); root.name = 'traveler'; root.scale.setScalar(travelerScale);
  const body = new THREE.Group(); body.name = 'traveler-body'; root.add(body);
  const surface = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.76 });
  const skin = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.57 });
  const pants = new THREE.MeshStandardMaterial({ color: '#354c62', roughness: 0.9 });
  const forearmMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.66 });
  const shirt = new THREE.MeshStandardMaterial({ vertexColors: true, color: '#ffffff', roughness: 0.91 });
  const packMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, color: '#ffffff', roughness: 0.83 });
  const sleeveMaterial = new THREE.MeshStandardMaterial({ color: '#f5f3e9', roughness: 0.82 });
  const shoeMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.44 });
  const visorMaterial = new THREE.MeshStandardMaterial({ color: '#bcdeeb', roughness: 0.1, metalness: 0.18, transparent: true, opacity: 0.13, depthWrite: false });
  for (const [key, material] of Object.entries({ surface, skin, shirt, pants, forearmMaterial, packMaterial, visorMaterial, sleeveMaterial, shoeMaterial })) materials.set(`traveler-${key}`, material);
  const sphere = (r: number, w = 10, h = 8) => new THREE.SphereGeometry(r, w, h);
  const rounded = (w: number, h: number, d: number, r = 0.015) => new RoundedBoxGeometry(w, h, d, 1, r);
  function batch(parent: THREE.Object3D, name: string, material: THREE.Material = surface) {
    const parts: THREE.BufferGeometry[] = [];
    const tint = new THREE.Color();
    function finishGeometry() {
      const geometry = mergeGeometries(parts);
      parts.forEach(part => part.dispose());
      return geometry;
    }
    return {
      geometry: finishGeometry,
      add(geometry: THREE.BufferGeometry, color: string, position: Vec, scale: Vec = [1, 1, 1]) {
        if (geometry.index) { const indexed = geometry; geometry = indexed.toNonIndexed(); indexed.dispose(); }
        geometry.scale(...scale).translate(...position);
        tint.set(color);
        const colors = new Float32Array(geometry.getAttribute('position').count * 3);
        for (let i = 0; i < colors.length; i += 3) { colors[i] = tint.r; colors[i + 1] = tint.g; colors[i + 2] = tint.b; }
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3)); parts.push(geometry);
      },
      finish() {
        const object = new THREE.Mesh(finishGeometry(), material);
        object.name = name; object.castShadow = object.receiveShadow = true; parent.add(object);
        return object;
      },
    };
  }
  type Outfit = TravelerStage | 'astronaut';
  const looks = {
    student: { jacket: '#f5f3e9', trousers: '#29323f', bag: '#344963', shoe: '#343739', tie: false },
    worker: { jacket: '#8eafc7', trousers: '#49535e', bag: '#526272', shoe: '#795945', tie: false },
    professional: { jacket: '#293d53', trousers: '#293d53', bag: '#38424d', shoe: '#343032', tie: true },
    astronaut: { jacket: '#dae1da', trousers: '#dae1da', bag: '#b7c8d0', shoe: '#d5dfdd', tie: false },
  } as const;
  const outfits = Object.keys(looks) as Outfit[];
  const cachedGeometries = new Set<THREE.BufferGeometry>();
  function variants(build: (outfit: Outfit) => THREE.BufferGeometry) {
    return Object.fromEntries(outfits.map(outfit => {
      const geometry = build(outfit); cachedGeometries.add(geometry); return [outfit, geometry];
    })) as Record<Outfit, THREE.BufferGeometry>;
  }
  function wardrobeMesh(parent: THREE.Object3D, name: string, geometry: THREE.BufferGeometry, material: THREE.Material) {
    const object = new THREE.Mesh(geometry, material);
    object.name = name; object.castShadow = object.receiveShadow = true; parent.add(object); return object;
  }
  const jackets = variants(outfit => {
    const look = looks[outfit], torso = batch(body, 'traveler-shirt');
    torso.add(rounded(0.27, 0.32, 0.18, 0.04), look.jacket, [0, 0.535, 0]);
    torso.add(new THREE.BoxGeometry(0.23, 0.026, 0.186), '#353a3e', [0, 0.392, 0]);
    torso.add(new THREE.BoxGeometry(0.03, 0.026, 0.012), '#b9b8aa', [0, 0.393, 0.103]);
    if (look.tie) {
      torso.add(new THREE.BoxGeometry(0.095, 0.22, 0.012), '#f2f2e9', [0, 0.575, 0.094]);
      torso.add(new THREE.BoxGeometry(0.021, 0.17, 0.012), '#496e76', [0, 0.565, 0.106]);
      torso.add(new THREE.OctahedronGeometry(0.019, 0), '#496e76', [0, 0.655, 0.11], [0.72, 0.9, 0.3]);
      for (const side of [-1, 1]) torso.add(new THREE.BoxGeometry(0.047, 0.16, 0.018).rotateZ(side * -0.32), '#3c5066', [side * 0.057, 0.59, 0.108]);
      torso.add(new THREE.BoxGeometry(0.043, 0.015, 0.014), '#eeeade', [-0.083, 0.606, 0.105]);
      for (const y of [0.485, 0.455]) torso.add(sphere(0.006, 6, 4), '#a9aea7', [0.014, y, 0.106]);
    } else {
      torso.add(new THREE.BoxGeometry(0.013, 0.23, 0.01), outfit === 'student' ? '#e0ded3' : '#afc7d6', [0, 0.55, 0.094]);
      for (const y of [0.62, 0.56, 0.5, 0.44]) torso.add(sphere(0.005, 6, 4), '#62707a', [0, y, 0.104]);
      torso.add(new THREE.BoxGeometry(0.05, 0.057, 0.012), look.jacket, [-0.075, 0.59, 0.098]);
      if (outfit !== 'astronaut') {
        for (const side of [-1, 1]) torso.add(new THREE.BoxGeometry(0.012, 0.14, 0.01).rotateZ(side * 0.26), outfit === 'student' ? '#3f586d' : '#4c6a7d', [side * 0.022, 0.595, 0.108]);
        torso.add(rounded(0.046, 0.064, 0.012, 0.005), '#f4f1df', [0, 0.502, 0.113]);
        torso.add(new THREE.BoxGeometry(0.028, 0.018, 0.006), outfit === 'student' ? '#537282' : '#7a9989', [0, 0.514, 0.122]);
        torso.add(new THREE.BoxGeometry(0.028, 0.006, 0.006), '#65747c', [0, 0.491, 0.122]);
      }
    }
    for (const side of [-1, 1]) torso.add(new THREE.BoxGeometry(0.047, 0.066, 0.014).rotateZ(side * 0.5), outfit === 'professional' ? '#f2f2e9' : look.jacket, [side * 0.031, 0.676, 0.09]);
    if (outfit === 'student') for (const side of [-1, 1]) torso.add(new THREE.BoxGeometry(0.027, 0.24, 0.015).rotateZ(side * -0.08), '#344963', [side * 0.112, 0.559, 0.085]);
    return torso.geometry();
  });
  const jacket = wardrobeMesh(body, 'traveler-jacket', jackets.student, shirt);
  const bags = variants(outfit => {
    const pack = batch(body, 'traveler-backpack'), student = outfit === 'student', orbit = outfit === 'astronaut';
    const depth = student || orbit ? 0.12 : 0.075;
    pack.add(rounded(0.185, 0.235, depth, student ? 0.035 : 0.02), looks[outfit].bag, [0, 0.545, -0.1 - depth / 2]);
    pack.add(rounded(0.125, 0.07, 0.018), student ? '#667c96' : looks[outfit].bag, [0, 0.5, -0.115 - depth]);
    if (!student && !orbit) pack.add(new THREE.TorusGeometry(0.03, 0.007, 4, 12, Math.PI), '#78848d', [0, 0.674, -0.13], [1, 0.65, 1]);
    return pack.geometry();
  });
  const backpack = wardrobeMesh(body, 'traveler-backpack', bags.student, packMaterial);

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
  face.finish();
  const haircuts = variants(outfit => {
    const hair = batch(head, 'traveler-hair');
    hair.add(new THREE.SphereGeometry(0.109, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.48), '#302923', [0, 0.055, -0.016], [0.97, 0.88, 1.06]);
    const student = outfit === 'student';
    for (let lock = 0; lock < 3; lock++) hair.add(sphere(0.043, 10, 6).rotateZ(student ? 0.2 - lock * 0.2 : -0.3), '#3c302b', [-0.041 + lock * 0.035, student ? 0.12 + (lock % 2) * 0.015 : 0.118, 0.035], [1.18, student ? 0.64 : 0.37, 0.85]);
    if (outfit === 'worker') {
      // Shoulder-length hair follows the head, with an open face and tapered side locks.
      // Merge into the cached haircut so longer hair adds no draw calls or animation work.
      hair.add(sphere(1, 12, 10), '#302923', [0, -0.022, -0.079], [0.108, 0.174, 0.048]);
      for (const side of [-1, 1]) {
        hair.add(sphere(1, 10, 8).rotateZ(side * -0.08), '#302923', [side * 0.094, -0.033, -0.026], [0.032, 0.15, 0.043]);
        hair.add(sphere(1, 8, 6), '#3c302b', [side * 0.108, -0.056, 0.003], [0.012, 0.12, 0.02]);
      }
    }
    return hair.geometry();
  });
  const hair = wardrobeMesh(head, 'traveler-hair', haircuts.student, surface);
  function pivot(parent: THREE.Object3D, name: string, position: Vec) {
    const joint = new THREE.Group(); joint.name = name; joint.position.set(...position); parent.add(joint); return joint;
  }
  const wardrobeLimbs: { mesh: THREE.Mesh; variants: Record<Outfit, THREE.BufferGeometry> }[] = [];
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
    const shoes = variants(outfit => {
      const shoe = batch(knee, `shoe-${side}`);
      shoe.add(rounded(0.1, 0.065, 0.17, 0.022), looks[outfit].shoe, [0, -0.155, 0.027]);
      shoe.add(new THREE.BoxGeometry(0.101, 0.014, 0.17), '#30373b', [0, -0.184, 0.027]);
      for (const z of [0.045, 0.065]) shoe.add(new THREE.BoxGeometry(0.046, 0.006, 0.006), outfit === 'worker' ? '#b19273' : '#707975', [0, -0.119, z]);
      return shoe.geometry();
    });
    wardrobeLimbs.push({ mesh: wardrobeMesh(knee, `shoe-${side}`, shoes.student, shoeMaterial), variants: shoes });
    const arm = pivot(body, `shoulder-${side}`, [side * 0.161, 0.67, 0]); arms.push(arm);
    const sleeve = batch(arm, `sleeve-${side}`, sleeveMaterial);
    sleeve.add(new THREE.CapsuleGeometry(0.042, 0.075, 3, 8), '#ffffff', [0, -0.075, 0]); sleeve.finish();
    const elbow = pivot(arm, `elbow-${side}`, [0, -0.15, 0]); elbows.push(elbow);
    const forearms = variants(outfit => {
      const forearm = batch(elbow, `forearm-and-hand-${side}`);
      const covered = outfit === 'professional' || outfit === 'astronaut';
      const armColor = covered ? looks[outfit].jacket : '#e0b08a';
      const handColor = outfit === 'astronaut' ? '#dae1da' : '#e6ba94';
      forearm.add(sphere(0.033, 10, 8), armColor, [0, 0, 0]);
      forearm.add(new THREE.CapsuleGeometry(0.03, 0.07, 3, 8), armColor, [0, -0.064, 0]);
      if (covered) forearm.add(new THREE.CylinderGeometry(0.031, 0.031, 0.022, 8), '#edf0e6', [0, -0.107, 0]);
      forearm.add(sphere(0.036, 8, 6), handColor, [0, -0.14, 0.01], [0.85, 1.14, 0.7]);
      forearm.add(sphere(0.014, 6, 4), handColor, [side * -0.026, -0.129, 0.024]);
      if (side === -1 && outfit !== 'student' && outfit !== 'astronaut') {
        forearm.add(new THREE.BoxGeometry(0.065, 0.014, 0.04), '#333e49', [0, -0.105, 0]);
        forearm.add(new THREE.BoxGeometry(0.031, 0.024, 0.008), '#bfcbd0', [0, -0.103, 0.025]);
      }
      return forearm.geometry();
    });
    wardrobeLimbs.push({ mesh: wardrobeMesh(elbow, `forearm-and-hand-${side}`, forearms.student, forearmMaterial), variants: forearms });
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
  equipment.visible = suit.visible = false;
  let outfit: Outfit | null = null;
  const traveler = {
    root, body, head, legs, knees, arms, elbows, stage: 'student' as TravelerStage,
    update(stride: number, amplitude: number, boarding: number, space: number, altitude = 0) {
      const seat = clamp(boarding, 0, 1), orbit = clamp(space, 0, 1);
      for (let i = 0; i < 2; i++) {
        const phase = stride + i * Math.PI;
        knees[i].rotation.x = (0.1 + Math.max(0, -Math.sin(phase)) * 0.95 * amplitude) * (1 - seat) + seat * 1.2;
        elbows[i].rotation.x = (-0.35 - amplitude * 0.55) * (1 - seat) - seat * 0.7;
      }
      head.rotation.x = -0.045 * seat;
      head.rotation.y = Math.sin(stride * 0.5) * amplitude * 0.045 * (1 - seat);
      traveler.stage = travelerStageAtAltitude(altitude);
      const next: Outfit = orbit > 0.5 ? 'astronaut' : traveler.stage;
      if (next !== outfit) {
        outfit = next;
        jacket.geometry = jackets[next]; backpack.geometry = bags[next]; hair.geometry = haircuts[next];
        wardrobeLimbs.forEach(part => { part.mesh.geometry = part.variants[next]; });
        pants.color.set(looks[next].trousers); sleeveMaterial.color.set(looks[next].jacket);
        root.userData.lifeStage = next;
      }
      backpack.visible = seat < 0.25 || orbit > 0.5;
      equipment.visible = seat > 0.05 && orbit < 0.8;
      equipment.scale.setScalar(Math.max(0.001, seat * (1 - orbit)));
      suit.visible = orbit > 0.01;
      suit.scale.setScalar(Math.max(0.001, orbit));
    },
    // Inactive wardrobe geometry is cached outside the scene; release it too on unmount.
    dispose() { cachedGeometries.forEach(geometry => geometry.dispose()); },
  };
  traveler.update(0, 0, 0, 0);
  return traveler;
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
      actor.getWorldPosition(focus); focus.y += 0.5 * travelerScale;
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
