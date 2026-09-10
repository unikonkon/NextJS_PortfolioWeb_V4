import { test, expect } from '@playwright/test';
import * as THREE from 'three';
import { createTraveler, createTravelerLighting } from '../src/Traveler';
import { advanceRunStride, altitudeAt } from '../src/journeyMath';
import { travelerScale, travelerStageAtAltitude } from '../src/journey';

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
  expect(draws).toBeLessThanOrEqual(18);
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
  expect(lighting.key.target.position.toArray()).toEqual([3, 25.75, 1]);
  expect(lighting.key.shadow.mapSize.toArray()).toEqual([512, 512]);
  expect(lighting.rim.castShadow).toBe(false);
  expect(lighting.key.position.distanceTo(lighting.key.target.position)).toBeLessThan(lighting.key.shadow.camera.far);
  lighting.dispose();
  traveler.root.traverse(object => { if (object instanceof THREE.Mesh) object.geometry.dispose(); });
  traveler.dispose();
  materials.forEach(material => material.dispose());
  console.log(`Traveler: ${draws} meshes, ${triangles} triangles`);
});

test('close-up preview shows face, joints, clothing and suit under the actual character lights', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'The real page composition is checked on both viewports in scene-quality.spec.ts.');
  test.setTimeout(60000);
  const errors: string[] = [];
  page.on('pageerror', error => { errors.push(error.message); console.error(error.message); });
  await page.route('**/__traveler-preview', route => route.fulfill({ contentType: 'text/html', body: '<html><body style="margin:0;background:#dce3df"></body></html>' }));
  await page.goto('/__traveler-preview');
  for (const mode of ['student', 'worker', 'professional', 'pilot', 'astronaut']) {
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
      camera.position.set(2.025, 1.62, 3.6); camera.lookAt(0, 0.72, 0);
      const materials = new Map();
      const actor = createTraveler(materials); scene.add(actor.root);
      scene.add(new THREE.HemisphereLight('#f8ffff', '#56604e', 1.4));
      const sunlight = new THREE.DirectionalLight('#fff4d9', 3.1); sunlight.position.set(-5, 12, 7); scene.add(sunlight);
      const lights = createTravelerLighting(scene); lights.update(actor.root, mode === 'astronaut' ? 1 : 0);
      const seated = mode === 'pilot' || mode === 'astronaut' ? 1 : 0;
      actor.update(1.1, seated ? 0 : 0.7, seated, mode === 'astronaut' ? 1 : 0, mode === 'student' ? 80 : mode === 'worker' ? 1120 : mode === 'professional' ? 5510 : 33640);
      actor.legs[0].rotation.x = seated ? -1.15 : 0.52; actor.legs[1].rotation.x = seated ? -1.15 : -0.52;
      actor.arms[0].rotation.x = seated ? -0.85 : -0.48; actor.arms[1].rotation.x = seated ? -0.85 : 0.48;
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshStandardMaterial({ color: '#dce3df', roughness: 0.95 }));
      floor.rotation.x = -Math.PI / 2; floor.position.y = -0.015; floor.receiveShadow = true; scene.add(floor);
      await renderer.compileAsync(scene, camera); renderer.render(scene, camera);
      (window as unknown as { disposePreview: () => void }).disposePreview = () => {
        scene.traverse((object: THREE.Object3D) => { if (object instanceof THREE.Mesh) object.geometry.dispose(); });
        actor.dispose(); materials.forEach(material => material.dispose()); floor.material.dispose(); lights.dispose(); renderer.dispose(); renderer.domElement.remove();
      };
    }, mode);
    await page.locator('canvas').screenshot({ path: `/tmp/traveler-${mode}.png` });
    await page.evaluate(() => (window as unknown as { disposePreview: () => void }).disposePreview());
  }
  expect(errors).toEqual([]);
});


test('life stages follow the displayed altitude, reuse outfits when scrolling back, and retain a 50 percent scale', () => {
  const materials = new Map<string, THREE.Material>();
  const actor = createTraveler(materials);
  const jacket = actor.root.getObjectByName('traveler-jacket') as THREE.Mesh;
  const geometries = new Map<string, THREE.BufferGeometry>();
  for (let pass = 0; pass < 20; pass++) for (const [altitude, expected] of [[80, 'student'], [1110, 'student'], [1120, 'worker'], [5500, 'worker'], [5510, 'professional'], [33640, 'professional'], [1120, 'worker'], [80, 'student']] as const) {
    actor.update(pass, 0.7, 0, 0, altitude);
    expect(actor.stage).toBe(expected);
    expect(travelerStageAtAltitude(altitude)).toBe(expected);
    expect(actor.root.scale.toArray()).toEqual([1.5, 1.5, 1.5]);
    if (geometries.has(expected)) expect(jacket.geometry).toBe(geometries.get(expected)); else geometries.set(expected, jacket.geometry);
  }
  expect(new Set(geometries.values()).size).toBe(3);
  actor.update(0, 0, 1, 0, 33640);
  expect(actor.root.userData.lifeStage).toBe('professional');
  actor.update(0, 0, 1, 1, 100000);
  expect(actor.root.userData.lifeStage).toBe('astronaut');
  expect(actor.root.scale.x).toBe(travelerScale);
  actor.root.traverse(object => { if (object instanceof THREE.Mesh) object.geometry.dispose(); });
  actor.dispose(); materials.forEach(material => material.dispose());
});

test('enlarged traveler changes outfits at milestones and the compact chapter controls fit desktop and mobile', async ({ page }, testInfo) => {
  test.setTimeout(150000);
  const errors: string[] = [];
  page.on('pageerror', error => { errors.push(error.message); console.error(error.message); });
  page.on('console', message => { if (message.type() === 'error' && /THREE|WebGL|shader/.test(message.text())) errors.push(message.text()); });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('canvas')).toBeVisible({ timeout: 45000 });
  await page.evaluate(() => document.fonts.ready);
  const stats = () => page.locator('canvas').evaluate(canvas => (canvas as HTMLCanvasElement & { journeyDiagnostics: { travelerScale: number; travelerStage: string; travelerOutfit: string; aircraftScale: number; calls: number; triangles: number } }).journeyDiagnostics);
  for (const [metres, stage] of [[80, 'student'], [1120, 'worker'], [5510, 'professional'], [33640, 'professional'], [1120, 'worker'], [80, 'student']] as const) {
    // Pixel-rounded scrolling cannot always land on an exact metre; exact boundaries are checked above.
    const targetAltitude = metres === 1120 || metres === 5510 ? metres + 30 : metres;
    let low = 0, high = 3;
    for (let i = 0; i < 40; i++) { const middle = (low + high) / 2; if (altitudeAt(middle) < targetAltitude) low = middle; else high = middle; }
    await page.evaluate(progress => {
      const ids = ['ground', 'mountain', 'sky', 'space'];
      const chapter = Math.floor(progress), fraction = progress - chapter;
      const current = document.getElementById(ids[chapter])!.getBoundingClientRect();
      const next = document.getElementById(ids[chapter + 1])!.getBoundingClientRect();
      const anchor = fraction < 0.7 ? current.top + current.height * fraction / 0.7 : current.bottom + (next.top - current.bottom) * (fraction - 0.7) / 0.3;
      scrollTo({ top: Math.ceil(scrollY + anchor - innerHeight * 0.38), behavior: 'instant' });
    }, (low + high) / 2);
    await expect.poll(async () => (await stats()).travelerStage, { timeout: 15000 }).toBe(stage);
    await expect(page.locator('.traveler-stage-label')).toHaveCount(0);
    const current = await stats();
    expect(current.travelerScale).toBe(1.5);
    expect(current.calls).toBeLessThan(220); expect(current.triangles).toBeLessThan(180000);
    const hud = await page.locator('.journey-status').boundingBox();
    expect(hud!.x).toBeGreaterThanOrEqual(0);
    expect(hud!.x + hud!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    const button = await page.locator('.motion-toggle').boundingBox();
    expect(button!.width).toBe(24); expect(button!.height).toBe(24);
    await page.screenshot({ path: `/tmp/traveler-${metres}-${testInfo.project.name}.png` });
  }
  await page.getByRole('button', { name: 'เปิดภาพเคลื่อนไหว' }).click();
  await expect(page.getByRole('button', { name: 'หยุดภาพเคลื่อนไหว' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
