import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { altitudes, clamp, smooth } from './journeyMath';

export const flightTakeoffAltitude = 10000;
// This module uses world progress (chapter + travel(fraction)), the same scale as the altimeter.
export const flightStart = 1 + (flightTakeoffAltitude - altitudes[1]) / (altitudes[2] - altitudes[1]);
export const flightEnd = 2.2;
export const flightRevealStart = flightStart - 0.24;
export const flightBoarding = (progress: number) => smooth((progress - (flightStart - 0.12)) / 0.11) * (1 - smooth((progress - (flightEnd + 0.02)) / 0.12));
type Vec = [number, number, number];

/** One airframe, one windscreen, one propeller and three instanced bird parts; no external assets or animation loop. */
export function createSkyFlight(start: THREE.Vector3, end: THREE.Vector3, materials: Map<string, THREE.Material>) {
  const root = new THREE.Group();
  root.name = 'sky-flight';
  root.visible = false;
  const aircraft = new THREE.Group();
  aircraft.name = 'passenger-airplane';
  root.add(aircraft);
  const surface = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.36, metalness: 0.25, side: THREE.DoubleSide });
  materials.set('sky-flight-surfaces', surface);
  function batch() {
    const pieces: THREE.BufferGeometry[] = [];
    const tint = new THREE.Color();
    return {
      add(geometry: THREE.BufferGeometry, color: string, position: Vec, scale: Vec = [1, 1, 1]) {
        if (geometry.index) { const indexed = geometry; geometry = indexed.toNonIndexed(); indexed.dispose(); }
        geometry.scale(...scale).translate(...position);
        tint.set(color);
        const colors = new Float32Array(geometry.getAttribute('position').count * 3);
        for (let i = 0; i < colors.length; i += 3) { colors[i] = tint.r; colors[i + 1] = tint.g; colors[i + 2] = tint.b; }
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        pieces.push(geometry);
      },
      finish() { const geometry = mergeGeometries(pieces); pieces.forEach(piece => piece.dispose()); return geometry; },
    };
  }
  const frame = batch();
  frame.add(new THREE.SphereGeometry(1, 24, 12), '#efcf83', [0, 0.32, 0.05], [0.29, 0.22, 1.05]);
  frame.add(new THREE.SphereGeometry(1, 12, 6), '#f4edcf', [0, 0.31, 0.12], [1.375, 0.045, 0.24]);
  for (const side of [-1, 1]) frame.add(new THREE.BoxGeometry(0.22, 0.07, 0.48), '#749a88', [side * 1.25, 0.315, 0.12]);
  frame.add(new THREE.BoxGeometry(0.92, 0.055, 0.3), '#749a88', [0, 0.36, -0.78]);
  frame.add(new THREE.BoxGeometry(0.065, 0.43, 0.34), '#f4edcf', [0, 0.53, -0.82]);
  frame.add(new THREE.BoxGeometry(0.33, 0.045, 0.38), '#526e69', [0, 0.52, -0.08]);
  frame.add(new THREE.BoxGeometry(0.3, 0.025, 0.045), '#749a88', [0, 0.5, 0.24]);
  frame.add(new THREE.SphereGeometry(0.15, 8, 6), '#749a88', [0, 0.33, 1.04]);
  frame.add(new THREE.BoxGeometry(0.16, 0.055, 0.05), '#35494d', [0, 0.54, 0.16]);
  frame.add(new THREE.BoxGeometry(0.05, 0.025, 0.006), '#badbce', [0, 0.552, 0.131]);
  const airframe = new THREE.Mesh(frame.finish(), surface);
  airframe.castShadow = airframe.receiveShadow = true;
  aircraft.add(airframe);
  const glassMaterial = new THREE.MeshStandardMaterial({ color: '#bfdee3', roughness: 0.12, metalness: 0.12, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide });
  materials.set('aircraft-windscreen', glassMaterial);
  const windscreen = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8, 0, Math.PI, 0, Math.PI / 2), glassMaterial);
  windscreen.name = 'aircraft-windscreen';
  windscreen.position.set(0, 0.5, 0.2); windscreen.scale.set(0.83, 0.8, 0.55);
  aircraft.add(windscreen);
  const propeller = new THREE.Group();
  propeller.name = 'airplane-propeller';
  propeller.position.set(0, 0.33, 1.17);
  const blades = batch();
  blades.add(new THREE.BoxGeometry(0.065, 0.76, 0.035), '#59645e', [0, 0, 0]);
  propeller.add(new THREE.Mesh(blades.finish(), surface));
  aircraft.add(propeller);

  const flock = new THREE.Group();
  flock.name = 'flying-birds';
  root.add(flock);
  const bird = batch();
  bird.add(new THREE.SphereGeometry(1, 8, 6), '#f4f2df', [0, 0, 0], [0.065, 0.07, 0.16]);
  bird.add(new THREE.ConeGeometry(0.035, 0.09, 4).rotateX(Math.PI / 2), '#d7ae62', [0, 0, 0.19]);
  const wing = batch();
  const wingShape = new THREE.BufferGeometry();
  wingShape.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.07, 0.47, 0, -0.08, 0.22, 0, -0.17], 3));
  wingShape.computeVertexNormals();
  wing.add(wingShape, '#e0e6d7', [0, 0, 0]);
  const wingGeometry = wing.finish();
  const parts = [bird.finish(), wingGeometry.clone().scale(-1, 1, 1), wingGeometry].map(geometry => {
    const instances = new THREE.InstancedMesh(geometry, surface, 5);
    // The flock follows the plane; these tiny moving batches use the flight interval as their visibility bound.
    instances.frustumCulled = false;
    flock.add(instances);
    return instances;
  });
  const offsets: Vec[] = [[-1.9, 0.7, -1.4], [-1.25, 1.05, -2.1], [1.75, 0.85, -1.25], [2.25, 1.3, -2], [0.6, 1.6, -2.6]];
  // Fly in front of the balloon, leaving the pilot and wings visible throughout the ascent.
  const curve = new THREE.CubicBezierCurve3(start.clone(), new THREE.Vector3(start.x - 4, start.y + 1.8, start.z + 4.5), new THREE.Vector3(end.x - 0.5, end.y - 1.6, end.z + 6), end.clone());
  const direction = new THREE.Vector3();
  const origin = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const heading = new THREE.Matrix4();
  const birdTransform = new THREE.Object3D();
  const wingTransform = new THREE.Object3D();
  const birdMatrix = new THREE.Matrix4();
  let ambientTime = 0;
  function sample(progress: number, position: THREE.Vector3, tangent: THREE.Vector3) {
    const t = smooth((progress - flightStart) / (flightEnd - flightStart));
    curve.getPoint(t, position);
    curve.getTangent(t, tangent);
  }
  return {
    root, aircraft, sample,
    update(progress: number, time: number, paused: boolean, position: THREE.Vector3) {
      const reveal = smooth((progress - flightRevealStart) / 0.12) * (1 - smooth((progress - 2.28) / 0.07));
      root.visible = reveal > 0.001;
      if (!root.visible) return;
      if (!paused) ambientTime = time;
      const t = clamp((progress - flightStart) / (flightEnd - flightStart), 0, 1);
      curve.getTangent(smooth(t), direction);
      // Keep a readable aircraft attitude while the story's vertical route climbs more steeply.
      const airborne = smooth(t / 0.18) * (1 - smooth((t - 0.82) / 0.18));
      direction.y = Math.min(direction.y, Math.hypot(direction.x, direction.z) * 0.35) * airborne;
      direction.normalize();
      aircraft.position.copy(progress <= flightStart ? start : position);
      aircraft.scale.setScalar(reveal);
      aircraft.quaternion.setFromRotationMatrix(heading.lookAt(direction, origin, up));
      aircraft.rotateZ(Math.sin(t * Math.PI * 2) * 0.12);
      propeller.rotation.z = ambientTime * 18;
      for (let index = 0; index < offsets.length; index++) {
        const [x, y, z] = offsets[index];
        const phase = ambientTime * 4.2 + index * 1.4;
        birdTransform.position.set(position.x + x + Math.sin(ambientTime * 0.5 + index) * 0.2, position.y + y + Math.sin(phase * 0.5) * 0.07, position.z + z);
        birdTransform.quaternion.copy(aircraft.quaternion);
        birdTransform.scale.setScalar(reveal * (0.85 + index * 0.035));
        birdTransform.updateMatrix();
        parts[0].setMatrixAt(index, birdTransform.matrix);
        for (let side = 1; side <= 2; side++) {
          wingTransform.rotation.z = Math.sin(phase) * 0.55 * (side === 1 ? -1 : 1);
          wingTransform.updateMatrix();
          parts[side].setMatrixAt(index, birdMatrix.multiplyMatrices(birdTransform.matrix, wingTransform.matrix));
        }
      }
      parts.forEach(part => { part.instanceMatrix.needsUpdate = true; });
    },
  };
}
