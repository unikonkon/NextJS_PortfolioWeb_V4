import * as THREE from 'three';
import { travelerScale } from './journey';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { smooth } from './journeyMath';

export const spaceBoardingStart = 2.35;
export const spaceLaunch = 2.48;
export const spaceFlightEnd = 3.2;
export const spaceBoarding = (progress: number) => smooth((progress - spaceBoardingStart) / (spaceLaunch - spaceBoardingStart));
type Vec = [number, number, number];

/** Procedural passenger capsule; shares the journey's character, materials and frame loop. */
export function createSpaceFlight(start: THREE.Vector3, end: THREE.Vector3, materials: Map<string, THREE.Material>) {
  const root = new THREE.Group();
  root.name = 'space-flight';
  root.visible = false;
  const spacecraft = new THREE.Group();
  spacecraft.name = 'passenger-spacecraft';
  root.add(spacecraft);
  const surface = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.4 });
  const flameMaterial = new THREE.MeshBasicMaterial({ color: '#9ee9ff', transparent: true, opacity: 0.85, depthWrite: false });
  const canopyMaterial = new THREE.MeshStandardMaterial({ color: '#bdefff', transparent: true, opacity: 0.16, roughness: 0.12, metalness: 0.25, depthWrite: false });
  materials.set('spacecraft-surface', surface);
  materials.set('spacecraft-flame', flameMaterial);
  materials.set('spacecraft-canopy', canopyMaterial);
  function batch() {
    const pieces: THREE.BufferGeometry[] = [];
    const tint = new THREE.Color();
    return {
      add(geometry: THREE.BufferGeometry, color: string, position: Vec, scale: Vec = [1, 1, 1]) {
        if (geometry.index) { const original = geometry; geometry = original.toNonIndexed(); original.dispose(); }
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
  frame.add(new THREE.CylinderGeometry(0.48, 0.32, 0.75, 32), '#eeeada', [0, -0.27, -0.24]);
  frame.add(new THREE.CylinderGeometry(0.36, 0.46, 0.16, 32), '#6f9caa', [0, 1.07, -0.24]);
  frame.add(new THREE.ConeGeometry(0.36, 0.64, 32), '#db9872', [0, 1.47, -0.24]);
  frame.add(new THREE.BoxGeometry(0.65, 0.87, 0.12), '#446579', [0, 0.59, -0.59]);
  frame.add(new THREE.BoxGeometry(0.3, 0.07, 0.28), '#41556a', [0, 0.29, -0.06]);
  frame.add(new THREE.TorusGeometry(0.41, 0.035, 5, 24), '#eadab5', [0, 0.61, 0.07], [1, 1.12, 1]);
  for (const side of [-1, 1]) {
    frame.add(new THREE.BoxGeometry(0.1, 0.87, 0.32), '#eeeada', [side * 0.41, 0.61, -0.27]);
    frame.add(new THREE.BoxGeometry(0.13, 0.62, 0.54).rotateZ(side * -0.38), '#db9872', [side * 0.51, -0.44, -0.24]);
    frame.add(new THREE.CylinderGeometry(0.11, 0.15, 0.15, 8), '#41556a', [side * 0.25, -0.72, -0.24]);
  }
  // Panel seams and fasteners are part of the same merged hull, with no extra draw calls.
  for (let band = 0; band < 2; band++) frame.add(new THREE.TorusGeometry(0.42 - band * 0.045, 0.012, 4, 24).rotateX(Math.PI / 2), '#526777', [0, -0.2 - band * 0.24, -0.24]);
  for (const side of [-1, 1]) for (let rivet = 0; rivet < 4; rivet++) frame.add(new THREE.SphereGeometry(0.014, 6, 4), '#a0afb5', [side * 0.405, 0.26 + rivet * 0.21, -0.095]);
  frame.add(new THREE.BoxGeometry(0.2, 0.06, 0.065), '#354c58', [0, 0.38, 0.085]);
  frame.add(new THREE.BoxGeometry(0.085, 0.025, 0.006), '#89c5d1', [0, 0.398, 0.121]);
  for (const side of [-1, 1]) frame.add(new THREE.CylinderGeometry(0.012, 0.012, 0.12, 6).rotateX(-0.35), '#a9bdc4', [side * 0.09, 0.42, 0.13]);
  const hull = new THREE.Mesh(frame.finish(), surface);
  hull.castShadow = hull.receiveShadow = true;
  spacecraft.add(hull);
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), canopyMaterial);
  canopy.position.set(0, 0.61, -0.1);
  canopy.scale.set(0.44, 0.48, 0.34);
  spacecraft.add(canopy);
  const rampFrame = batch();
  for (let step = 0; step < 3; step++) rampFrame.add(new THREE.BoxGeometry(0.46, 0.08, 0.28), '#a9bcc0', [0, -0.05 - step * 0.1, 0.24 + step * 0.25]);
  const ramp = new THREE.Mesh(rampFrame.finish(), surface);
  ramp.name = 'boarding-steps';
  ramp.castShadow = ramp.receiveShadow = true;
  spacecraft.add(ramp);
  const exhaust = new THREE.Mesh(new THREE.ConeGeometry(0.23, 1.2, 8).rotateZ(Math.PI).translate(0, -0.6, 0), flameMaterial);
  exhaust.name = 'spacecraft-exhaust';
  exhaust.position.set(0, -0.8, -0.24);
  spacecraft.add(exhaust);

  const dock = start.clone().add(new THREE.Vector3(-0.5, 0.32, -0.85));
  const curve = new THREE.CubicBezierCurve3(dock, dock.clone().add(new THREE.Vector3(0.1, 3.2, 2)), end.clone().add(new THREE.Vector3(1.5, -3.2, 1)), end.clone());
  const craftPoint = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  let ambientTime = 0;
  function sample(progress: number, position: THREE.Vector3, direction: THREE.Vector3) {
    if (progress < spaceLaunch) {
      position.copy(start).lerp(dock, spaceBoarding(progress));
      direction.copy(dock).sub(start).normalize();
    } else {
      const t = smooth((progress - spaceLaunch) / (spaceFlightEnd - spaceLaunch));
      curve.getPoint(t, position);
      curve.getTangent(t, direction);
    }
  }
  return {
    root, spacecraft, sample,
    update(progress: number, time: number, paused: boolean) {
      const reveal = smooth((progress - 2.22) / 0.12);
      root.visible = reveal > 0.001;
      if (!root.visible) return;
      if (!paused) ambientTime = time;
      sample(Math.max(spaceLaunch, progress), craftPoint, tangent);
      spacecraft.position.copy(craftPoint);
      spacecraft.scale.setScalar(reveal * travelerScale);
      const launch = smooth((progress - spaceLaunch) / 0.12);
      spacecraft.rotation.set(0, 0.5, -0.1 * launch + Math.sin(ambientTime * 0.7) * 0.025 * launch);
      ramp.scale.setScalar(1 - spaceBoarding(progress));
      ramp.visible = progress < spaceLaunch;
      canopy.visible = progress >= spaceLaunch;
      exhaust.visible = launch > 0.001;
      exhaust.scale.y = launch * (0.92 + Math.sin(ambientTime * 5) * 0.08);
    },
  };
}

/** Camera-local side scenery. Three small comets, without lights or postprocessing. */
export function createSpaceEffects(materials: Map<string, THREE.Material>) {
  const root = new THREE.Group();
  root.name = 'space-side-effects';
  root.position.z = -30;
  root.visible = false;
  const cool = new THREE.MeshBasicMaterial({ color: '#c6edff', transparent: true, depthWrite: false });
  const tailMaterial = new THREE.MeshBasicMaterial({ color: '#8fc9e5', transparent: true, depthWrite: false });
  materials.set('comet-core', cool);
  materials.set('comet-tail', tailMaterial);
  const comets = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.075, 0), cool, 3);
  const tails = new THREE.InstancedMesh(new THREE.ConeGeometry(0.06, 0.9, 5).translate(0, 0.45, 0), tailMaterial, 3);
  comets.name = 'falling-comets';
  comets.frustumCulled = tails.frustumCulled = false;
  root.add(comets, tails);
  comets.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  tails.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const transform = new THREE.Object3D();
  let ambientTime = 0;
  return {
    root,
    update(progress: number, time: number, paused: boolean, camera: THREE.OrthographicCamera, width: number) {
      const reveal = smooth((progress - 2.43) / 0.35);
      root.visible = reveal > 0.001;
      if (!root.visible) return;
      if (!paused) ambientTime = time;
      const span = camera.right - camera.left;
      const height = camera.top - camera.bottom;
      cool.opacity = reveal;
      tailMaterial.opacity = reveal * 0.35;
      for (let i = 0; i < comets.count; i++) {
        const cycle = (ambientTime / (11 + i * 2) + i * 0.31) % 1;
        const side = i === 1 ? -1 : 1;
        transform.position.set(side * (span * 0.45 - cycle * span * 0.055), camera.top - height * (0.06 + cycle * 0.88), 1);
        transform.rotation.set(0, 0, -side * 0.22);
        transform.scale.setScalar(Math.sin(Math.PI * cycle) * reveal * (width > 800 ? 1 : 0.8));
        transform.updateMatrix();
        comets.setMatrixAt(i, transform.matrix);
        tails.setMatrixAt(i, transform.matrix);
      }
      comets.instanceMatrix.needsUpdate = tails.instanceMatrix.needsUpdate = true;
    },
  };
}
