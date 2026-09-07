import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { terrainNoise } from './journeyMath';

type Vec = [number, number, number];

/** Six draw calls, shared crop geometry, and no textures, model downloads or separate animation loop. */
export function createMountainFarm(materials: Map<string, THREE.Material>) {
  const root = new THREE.Group();
  root.name = 'mountain-farm';
  root.position.set(2.7, 0.035, 3);
  root.rotation.y = Math.atan2(11, 14);
  const surface = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true });
  materials.set('farm-surfaces', surface);

  function batch() {
    const pieces: THREE.BufferGeometry[] = [];
    const transform = new THREE.Object3D();
    const tint = new THREE.Color();
    function add(geometry: THREE.BufferGeometry, color: string, position: Vec, scale: Vec = [1, 1, 1], rotation: Vec = [0, 0, 0]) {
      if (geometry.index) {
        const indexed = geometry;
        geometry = indexed.toNonIndexed();
        indexed.dispose();
      }
      transform.position.set(...position);
      transform.scale.set(...scale);
      transform.rotation.set(...rotation);
      transform.updateMatrix();
      geometry.applyMatrix4(transform.matrix);
      tint.set(color);
      const colors = new Float32Array(geometry.getAttribute('position').count * 3);
      for (let i = 0; i < colors.length; i += 3) { colors[i] = tint.r; colors[i + 1] = tint.g; colors[i + 2] = tint.b; }
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      pieces.push(geometry);
    }
    return {
      add,
      box: (size: Vec, color: string, position: Vec, rotation: Vec = [0, 0, 0]) => add(new THREE.BoxGeometry(...size), color, position, [1, 1, 1], rotation),
      finish: () => {
        const geometry = mergeGeometries(pieces);
        pieces.forEach(piece => piece.dispose());
        return geometry;
      },
    };
  }
  function solid(geometry: THREE.BufferGeometry, parent: THREE.Object3D, name: string) {
    const object = new THREE.Mesh(geometry, surface);
    object.name = name;
    object.castShadow = object.receiveShadow = true;
    parent.add(object);
    return object;
  }

  const garden = batch();
  // Two distinct beds: dark raised vegetable rows and a shallow rice paddy with earthen bunds.
  garden.box([1.7, 0.12, 1.65], '#70543d', [-1.12, 0.05, 0]);
  garden.box([1.7, 0.1, 1.65], '#7c6847', [1.12, 0.04, 0]);
  garden.box([1.48, 0.025, 1.43], '#8bb9a0', [1.12, 0.105, 0]);
  garden.box([0.48, 0.025, 2.05], '#cebb8f', [0, 0.015, 0.1]);
  garden.box([4.18, 0.025, 0.32], '#cebb8f', [0, 0.015, 1]);
  for (let row = 0; row < 3; row++) garden.box([1.48, 0.065, 0.25], '#896344', [-1.12, 0.13, (row - 1) * 0.48]);
  for (const center of [-1.12, 1.12]) {
    for (const side of [-1, 1]) {
      garden.box([1.84, 0.13, 0.09], '#a68d61', [center, 0.1, side * 0.86]);
      garden.box([0.09, 0.13, 1.64], '#a68d61', [center + side * 0.9, 0.1, 0]);
    }
  }
  // A low rear fence and tools keep the foreground open to the camera.
  for (let post = 0; post < 6; post++) garden.box([0.055, 0.48, 0.055], '#93764f', [-2 + post * 0.8, 0.24, -1.03]);
  garden.box([4.08, 0.045, 0.04], '#bc9b68', [0, 0.34, -1.03]);
  garden.box([4.08, 0.045, 0.04], '#bc9b68', [0, 0.17, -1.03]);
  garden.add(new THREE.CylinderGeometry(0.16, 0.12, 0.23, 8), '#bb8b52', [-0.1, 0.13, -0.68]);
  garden.add(new THREE.SphereGeometry(0.12, 6, 4), '#83a957', [-0.1, 0.25, -0.68], [1, 0.6, 1]);
  solid(garden.finish(), root, 'farm-beds-and-paths');

  function crops(geometry: THREE.BufferGeometry, rows: number, columns: number, center: number, name: string) {
    const instances = new THREE.InstancedMesh(geometry, surface, rows * columns);
    instances.name = name;
    // Small plants receive light/shadows; only the larger props and farmer cast shadows.
    instances.receiveShadow = true;
    const transform = new THREE.Object3D();
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        const index = row * columns + column;
        transform.position.set(center + (column / (columns - 1) - 0.5) * 1.22, center < 0 ? 0.16 : 0.12, (row / (rows - 1) - 0.5) * (center < 0 ? 0.96 : 1.18));
        transform.rotation.y = terrainNoise(index + center * 90) * 0.6;
        transform.scale.setScalar(0.9 + terrainNoise(index + 37) * 0.2);
        transform.updateMatrix();
        instances.setMatrixAt(index, transform.matrix);
      }
    }
    instances.instanceMatrix.needsUpdate = true;
    instances.computeBoundingSphere();
    root.add(instances);
  }
  const cabbage = batch();
  cabbage.add(new THREE.IcosahedronGeometry(1, 0), '#527847', [-0.055, 0.075, 0], [0.13, 0.075, 0.12]);
  cabbage.add(new THREE.IcosahedronGeometry(1, 0), '#73a453', [0.055, 0.09, 0], [0.12, 0.08, 0.13]);
  cabbage.add(new THREE.IcosahedronGeometry(1, 0), '#a6c76d', [0, 0.135, 0], [0.1, 0.105, 0.1]);
  crops(cabbage.finish(), 3, 5, -1.12, 'vegetable-crops');
  const rice = batch();
  for (let stalk = 0; stalk < 3; stalk++) {
    const x = (stalk - 1) * 0.04;
    rice.add(new THREE.ConeGeometry(0.027, 0.4, 4), '#809a45', [x, 0.2, 0], [1, 1, 1], [0, 0, (stalk - 1) * -0.14]);
    rice.add(new THREE.OctahedronGeometry(0.045, 0), '#d9bd62', [x * 1.5, 0.37, 0], [0.6, 1.65, 0.6], [0, 0, -0.3]);
  }
  crops(rice.finish(), 5, 6, 1.12, 'rice-crops');

  const farmer = new THREE.Group();
  farmer.name = 'gardener';
  farmer.position.set(-0.1, 0.035, 0.72);
  farmer.rotation.y = -Math.PI / 2;
  farmer.scale.setScalar(1.08);
  root.add(farmer);
  const legs = batch();
  for (const side of [-1, 1]) {
    legs.box([0.13, 0.32, 0.14], '#455d66', [side * 0.1, 0.24, 0]);
    legs.box([0.15, 0.12, 0.23], '#665440', [side * 0.1, 0.075, 0.035]);
  }
  solid(legs.finish(), farmer, 'gardener-legs');
  const torso = new THREE.Group();
  torso.name = 'gardener-torso';
  torso.position.y = 0.4;
  farmer.add(torso);
  const upper = batch();
  upper.box([0.34, 0.34, 0.21], '#659087', [0, 0.17, 0]);
  upper.add(new THREE.SphereGeometry(0.13, 8, 6), '#dfb58b', [0, 0.45, 0.015]);
  upper.add(new THREE.CylinderGeometry(0.26, 0.26, 0.035, 10), '#d9b879', [0, 0.555, 0]);
  upper.add(new THREE.ConeGeometry(0.19, 0.14, 10), '#e9cc8b', [0, 0.635, 0]);
  solid(upper.finish(), torso, 'gardener-shirt-and-hat');
  const arms = new THREE.Group();
  arms.name = 'gardener-arms';
  arms.position.set(0, 0.29, 0.02);
  torso.add(arms);
  const hands = batch();
  for (const side of [-1, 1]) {
    hands.box([0.09, 0.29, 0.09], '#659087', [side * 0.2, -0.11, 0.1], [-0.75, 0, 0]);
    hands.box([0.075, 0.23, 0.075], '#dfb58b', [side * 0.16, -0.26, 0.25], [-0.9, 0, side * -0.2]);
  }
  hands.add(new THREE.CylinderGeometry(0.022, 0.022, 1.03, 5), '#a68251', [0, -0.36, 0.38], [1, 1, 1], [-0.42, 0, 0]);
  hands.box([0.29, 0.035, 0.14], '#66716b', [0, -0.83, 0.59]);
  solid(hands.finish(), arms, 'gardener-hands-and-hoe');

  const frustum = new THREE.Frustum();
  const projection = new THREE.Matrix4();
  const bounds = new THREE.Sphere(new THREE.Vector3(), 2.7);
  function pose(time: number) {
    const cycle = (1 - Math.cos(time * 1.8)) * 0.5;
    torso.rotation.x = 0.12 + cycle * 0.22;
    arms.rotation.x = -0.65 + cycle * 0.6;
  }
  pose(0);
  return {
    root,
    update(time: number, camera: THREE.Camera, paused: boolean) {
      camera.updateMatrixWorld();
      root.updateWorldMatrix(true, false);
      bounds.center.set(0, 0.45, 0).applyMatrix4(root.matrixWorld);
      frustum.setFromProjectionMatrix(projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
      root.visible = frustum.intersectsSphere(bounds);
      if (root.visible && !paused) pose(time);
    },
  };
}
