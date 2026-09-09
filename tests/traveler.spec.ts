import { test, expect } from '@playwright/test';
import * as THREE from 'three';
import { createTraveler, createTravelerLighting } from '../src/Traveler';
import { advanceRunStride } from '../src/journeyMath';

test('runner cadence remains readable on fast scrolls, at different frame rates, and when paused', () => {
  for (const fps of [30, 60, 120]) {
    let stride = 0;
    for (let frame = 0; frame < fps; frame++) stride = advanceRunStride(stride, 10 / fps, 1 / fps, 0, false);
    expect(stride).toBeCloseTo(Math.PI * 4);
  }
  expect(advanceRunStride(1, 0.01, 1 / 60, 0, false)).toBeCloseTo(1.09);
  expect(advanceRunStride(1, 0, 1 / 60, 0, false)).toBe(1);
  expect(advanceRunStride(1, 100, 1 / 60, 0, true)).toBe(1);
  expect(advanceRunStride(1, 100, 1 / 60, 1, false)).toBe(1);
});

test('one articulated traveler changes from runner to seated pilot and astronaut within a fixed budget', () => {
  const materials = new Map<string, THREE.Material>();
  const traveler = createTraveler(materials);
  let draws = 0, triangles = 0;
  traveler.root.traverse(object => {
    if (object instanceof THREE.Mesh) {
      draws++;
      triangles += (object.geometry.index?.count ?? object.geometry.getAttribute('position').count) / 3;
      if (object.name !== 'astronaut-visor') expect(object.castShadow && object.receiveShadow).toBe(true);
    }
  });
  expect(draws).toBeLessThanOrEqual(16);
  expect(triangles).toBeLessThan(7500);
  traveler.update(Math.PI / 2, 1, 0, 0);
  expect(traveler.knees[0].rotation.x).not.toBe(traveler.knees[1].rotation.x);
  expect(traveler.root.getObjectByName('flight-headset')!.visible).toBe(false);
  traveler.update(4, 0, 1, 0);
  expect(traveler.knees[0].rotation.x).toBeCloseTo(1.2);
  expect(traveler.elbows[0].rotation.x).toBeCloseTo(-0.7);
  expect(traveler.root.getObjectByName('flight-headset')!.visible).toBe(true);
  traveler.update(4, 0, 1, 1);
  expect(traveler.root.getObjectByName('astronaut-equipment')!.visible).toBe(true);
  expect(traveler.root.getObjectByName('flight-headset')!.visible).toBe(false);
  const pose = traveler.knees.map(knee => knee.rotation.x);
  traveler.update(4, 0, 1, 1);
  expect(traveler.knees.map(knee => knee.rotation.x)).toEqual(pose);
  traveler.update(4, 0, 0, 0);
  expect(traveler.root.getObjectByName('astronaut-equipment')!.visible).toBe(false);
  const scene = new THREE.Scene(); scene.add(traveler.root);
  traveler.root.position.set(3, 25, 1);
  const lighting = createTravelerLighting(scene); lighting.update(traveler.root, 1);
  expect(lighting.key.target.position.toArray()).toEqual([3, 25.5, 1]);
  expect(lighting.key.shadow.mapSize.toArray()).toEqual([512, 512]);
  expect(lighting.rim.castShadow).toBe(false);
  expect(lighting.key.position.distanceTo(lighting.key.target.position)).toBeLessThan(lighting.key.shadow.camera.far);
  lighting.dispose();
  traveler.root.traverse(object => { if (object instanceof THREE.Mesh) object.geometry.dispose(); });
  materials.forEach(material => material.dispose());
  console.log(`Traveler: ${draws} meshes, ${triangles} triangles`);
});

test('close-up preview shows face, joints, clothing and suit under the actual character lights', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'The real page composition is checked on both viewports in scene-quality.spec.ts.');
  test.setTimeout(60000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/__traveler-preview', route => route.fulfill({ contentType: 'text/html', body: '<html><body style="margin:0;background:#dce3df"></body></html>' }));
  await page.goto('/__traveler-preview');
  for (const mode of ['runner', 'pilot', 'astronaut']) {
    await page.evaluate(async mode => {
      const THREE = await import('/node_modules/.vite/deps/three.js');
      const { createTraveler, createTravelerLighting } = await import('/src/Traveler.ts');
      const scene = new THREE.Scene(); scene.background = new THREE.Color('#dce3df');
      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setSize(650, 650); renderer.setPixelRatio(1.5);
      renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.12;
      document.body.appendChild(renderer.domElement);
      const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 20);
      camera.position.set(1.35, 1.08, 2.4); camera.lookAt(0, 0.48, 0);
      const materials = new Map();
      const actor = createTraveler(materials); scene.add(actor.root);
      scene.add(new THREE.HemisphereLight('#f8ffff', '#56604e', 1.4));
      const sunlight = new THREE.DirectionalLight('#fff4d9', 3.1); sunlight.position.set(-5, 12, 7); scene.add(sunlight);
      const lights = createTravelerLighting(scene); lights.update(actor.root, mode === 'astronaut' ? 1 : 0);
      const seated = mode !== 'runner' ? 1 : 0;
      actor.update(1.1, seated ? 0 : 0.7, seated, mode === 'astronaut' ? 1 : 0);
      actor.legs[0].rotation.x = seated ? -1.15 : 0.52; actor.legs[1].rotation.x = seated ? -1.15 : -0.52;
      actor.arms[0].rotation.x = seated ? -0.85 : -0.48; actor.arms[1].rotation.x = seated ? -0.85 : 0.48;
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshStandardMaterial({ color: '#dce3df', roughness: 0.95 }));
      floor.rotation.x = -Math.PI / 2; floor.position.y = -0.015; floor.receiveShadow = true; scene.add(floor);
      await renderer.compileAsync(scene, camera); renderer.render(scene, camera);
      (window as unknown as { disposePreview: () => void }).disposePreview = () => {
        scene.traverse((object: THREE.Object3D) => { if (object instanceof THREE.Mesh) object.geometry.dispose(); });
        materials.forEach(material => material.dispose()); floor.material.dispose(); lights.dispose(); renderer.dispose(); renderer.domElement.remove();
      };
    }, mode);
    await page.locator('canvas').screenshot({ path: `/tmp/traveler-${mode}.png` });
    await page.evaluate(() => (window as unknown as { disposePreview: () => void }).disposePreview());
  }
  expect(errors).toEqual([]);
});
