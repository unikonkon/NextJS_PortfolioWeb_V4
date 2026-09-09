import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { smooth } from './journeyMath';

// Continuous deterministic noise: generated once on the CPU, never evaluated in the frame loop.
function hash(x: number, y: number, z: number) {
  let n = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 2147483647);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}
export function noise3(x: number, y: number, z: number) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const u = smooth(x - ix), v = smooth(y - iy), w = smooth(z - iz);
  const mix = THREE.MathUtils.lerp;
  return mix(mix(mix(hash(ix, iy, iz), hash(ix + 1, iy, iz), u), mix(hash(ix, iy + 1, iz), hash(ix + 1, iy + 1, iz), u), v),
    mix(mix(hash(ix, iy, iz + 1), hash(ix + 1, iy, iz + 1), u), mix(hash(ix, iy + 1, iz + 1), hash(ix + 1, iy + 1, iz + 1), u), v), w);
}

/** One shared 128 px relief texture for rock and soil, with no asset requests. */
export function createRockRelief() {
  const size = 128;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size * Math.PI * 2, v = y / size * Math.PI * 2;
    const stratum = Math.sin(v * 8 + Math.sin(u * 3) * 1.7);
    const grain = Math.sin(u * 31 + v * 17) * Math.cos(v * 29 - u * 13);
    const value = 128 + stratum * 26 + grain * 18;
    const i = (y * size + x) * 4;
    data[i] = data[i + 1] = data[i + 2] = value;
    data[i + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

export function createPlanet(materials: Map<string, THREE.Material>) {
  const root = new THREE.Group();
  root.name = 'ocean-planet';
  const size = 512;
  const color = new Uint8Array(size * size / 2 * 4);
  const relief = new Uint8Array(color.length);
  const vapor = new Uint8Array(color.length);
  const deep = new THREE.Color('#153c68'), shallow = new THREE.Color('#2c7f93');
  const land = new THREE.Color('#66784c'), desert = new THREE.Color('#b2a17c');
  const snow = new THREE.Color('#e0eaf0'), tint = new THREE.Color(), soil = new THREE.Color();
  for (let row = 0; row < size / 2; row++) for (let col = 0; col < size; col++) {
    const lat = row / (size / 2 - 1) * Math.PI;
    const lon = col / (size - 1) * Math.PI * 2;
    const x = Math.sin(lat) * Math.cos(lon), y = Math.cos(lat), z = Math.sin(lat) * Math.sin(lon);
    const n = noise3(x * 3 + 7, y * 3 + 4, z * 3 + 9) * 0.65 + noise3(x * 9 + 5, y * 9, z * 9) * 0.25 + noise3(x * 24, y * 24, z * 24) * 0.1;
    const continent = smooth((n - 0.5) / 0.045);
    tint.copy(deep).lerp(shallow, smooth((n - 0.35) / 0.18));
    const dry = noise3(x * 7 + 30, y * 7, z * 7);
    soil.copy(land).lerp(desert, smooth((dry - 0.4) / 0.25));
    tint.lerp(soil, continent).lerp(snow, smooth((Math.abs(y) + n * 0.15 - 0.94) / 0.07));
    // Store sRGB bytes so Three performs the correct decode before lighting.
    tint.convertLinearToSRGB();
    const i = (row * size + col) * 4;
    color[i] = tint.r * 255; color[i + 1] = tint.g * 255; color[i + 2] = tint.b * 255; color[i + 3] = 255;
    relief[i] = relief[i + 1] = relief[i + 2] = 75 + continent * 150; relief[i + 3] = 255;
    const clouds = noise3(x * 7 + 20, y * 10, z * 7 + 3) * 0.7 + noise3(x * 19, y * 19, z * 19) * 0.3;
    vapor[i] = vapor[i + 1] = vapor[i + 2] = 255; vapor[i + 3] = smooth((clouds - 0.53) / 0.23) * 190;
  }
  const textures = [color, relief, vapor].map((bytes, i) => {
    const texture = new THREE.DataTexture(bytes, size, size / 2);
    texture.colorSpace = i === 1 ? THREE.NoColorSpace : THREE.SRGBColorSpace;
    texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true; texture.needsUpdate = true;
    return texture;
  });
  const surface = new THREE.MeshStandardMaterial({ map: textures[0], roughnessMap: textures[1], roughness: 1, metalness: 0.08, bumpMap: textures[1], bumpScale: 0.025 });
  const cloudMaterial = new THREE.MeshStandardMaterial({ map: textures[2], transparent: true, depthWrite: false, roughness: 1, opacity: 0.75 });
  materials.set('planet-surface', surface); materials.set('planet-clouds', cloudMaterial);
  root.add(new THREE.Mesh(new THREE.SphereGeometry(2, 64, 32), surface));
  const clouds = new THREE.Mesh(new THREE.SphereGeometry(2.025, 40, 24), cloudMaterial);
  root.add(clouds);
  const atmosphereMaterial = new THREE.ShaderMaterial({
    vertexShader: `varying vec3 n; varying vec3 v;
      void main() { vec4 p = modelViewMatrix * vec4(position, 1.); n = normalize(normalMatrix * normal); v = normalize(-p.xyz); gl_Position = projectionMatrix * p; }`,
    fragmentShader: `varying vec3 n; varying vec3 v;
      void main() { float rim = pow(1. - max(0., dot(normalize(n), normalize(v))), 3.); gl_FragColor = vec4(.28, .62, 1., rim * .32); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  materials.set('planet-atmosphere', atmosphereMaterial);
  root.add(new THREE.Mesh(new THREE.SphereGeometry(2.09, 40, 24), atmosphereMaterial));
  const ringGeometry = new THREE.RingGeometry(2.55, 3.35, 96, 6);
  const vertices = ringGeometry.getAttribute('position');
  const colors = new Float32Array(vertices.count * 3);
  for (let i = 0; i < vertices.count; i++) {
    const radius = Math.hypot(vertices.getX(i), vertices.getY(i));
    tint.set('#bea98c').multiplyScalar(0.65 + Math.sin(radius * 47) * 0.15 + Math.sin(radius * 113) * 0.12);
    colors.set([tint.r, tint.g, tint.b], i * 3);
  }
  ringGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const ringMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: 0.7, roughness: 0.85 });
  materials.set('planet-rings', ringMaterial);
  const ring = new THREE.Mesh(ringGeometry, ringMaterial);
  ring.rotation.set(0.72, 0.25, -0.25); root.add(ring);
  return { root, ring, clouds, dispose: () => textures.forEach(texture => texture.dispose()) };
}

/** Merge only rigid opaque meshes, in height bands so distant chapters still cull independently. */
export function batchStaticScene(root: THREE.Object3D, animated: Set<THREE.Object3D>) {
  root.updateWorldMatrix(true, true);
  const inverse = root.matrixWorld.clone().invert();
  const matrix = new THREE.Matrix4();
  const batches = new Map<string, THREE.Mesh[]>();
  function visit(object: THREE.Object3D) {
    if (animated.has(object) || !object.visible || object instanceof THREE.InstancedMesh) return;
    if (object instanceof THREE.Mesh && object.material instanceof THREE.MeshStandardMaterial && !object.material.transparent) {
      const y = object.matrixWorld.elements[13];
      const key = `${object.material.uuid}/${object.castShadow}/${object.receiveShadow}/${Math.floor(y / 7)}/${Object.keys(object.geometry.attributes).sort().join(',')}`;
      const list = batches.get(key) ?? []; list.push(object); batches.set(key, list);
    }
    object.children.forEach(visit);
  }
  visit(root);
  const retired = new Set<THREE.BufferGeometry>();
  for (const objects of batches.values()) {
    if (objects.length < 2) continue;
    const pieces = objects.map(object => {
      const geometry = object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone();
      return geometry.applyMatrix4(matrix.multiplyMatrices(inverse, object.matrixWorld));
    });
    const geometry = mergeGeometries(pieces);
    pieces.forEach(piece => piece.dispose());
    const combined = new THREE.Mesh(geometry, objects[0].material);
    combined.name = 'static-scenery-batch';
    combined.castShadow = objects[0].castShadow; combined.receiveShadow = objects[0].receiveShadow;
    root.add(combined);
    objects.forEach(object => { retired.add(object.geometry); object.removeFromParent(); });
  }
  // A primitive may be shared by a retained animated/instanced mesh.
  root.traverse(object => { if (object instanceof THREE.Mesh) retired.delete(object.geometry); });
  retired.forEach(geometry => geometry.dispose());
}

/** Layered branch silhouette with irregular edges, shared by the instanced slope trees. */
export function createPineCrown(radius: number, height: number) {
  const profile = [[0, 0], [0.82, 0.05], [0.63, 0.18], [0.86, 0.22], [0.48, 0.38], [0.62, 0.42], [0.3, 0.62], [0.4, 0.66], [0.12, 0.85], [0, 1]];
  const geometry = new THREE.LatheGeometry(profile.map(([r, h]) => new THREE.Vector2(r * radius, (h - 0.5) * height)), 12);
  const points = geometry.getAttribute('position');
  for (let i = 0; i < points.count; i++) {
    const x = points.getX(i), y = points.getY(i), z = points.getZ(i);
    const edge = 1 + 0.11 * Math.sin(Math.atan2(z, x) * 7 + y * 9);
    points.setXYZ(i, x * edge, y, z * edge);
  }
  geometry.computeVertexNormals();
  return geometry;
}
