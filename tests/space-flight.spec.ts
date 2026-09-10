import { test, expect } from '@playwright/test';
import * as THREE from 'three';
import { createSpaceEffects, createSpaceFlight, spaceBoardingStart, spaceLaunch, spaceFlightEnd } from '../src/SpaceFlight';

test('space passenger path is continuous and light effects stop when paused', () => {
  const materials = new Map<string, THREE.Material>();
  const start = new THREE.Vector3(3.92, 23.05, -1.78);
  const end = new THREE.Vector3(3.7, 34.8, 1.5);
  const flight = createSpaceFlight(start, end, materials);
  const effects = createSpaceEffects(materials);
  const point = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  let height = start.y;
  for (let i = 0; i <= 200; i++) {
    const progress = spaceBoardingStart + (spaceFlightEnd - spaceBoardingStart) * i / 200;
    flight.sample(progress, point, tangent);
    expect(point.y).toBeGreaterThanOrEqual(height - 1e-8);
    expect(Number.isFinite(tangent.length())).toBe(true);
    height = point.y;
    if (progress >= spaceLaunch) {
      flight.update(progress, 1, false);
      expect(flight.spacecraft.position.distanceTo(point)).toBeLessThan(1e-8);
    }
  }
  expect(point.distanceTo(end)).toBeLessThan(1e-8);
  flight.sample(spaceBoardingStart, point, tangent);
  expect(point.distanceTo(start)).toBeLessThan(1e-8);
  flight.sample(spaceLaunch - 1e-6, point, tangent);
  const boardingEnd = point.clone();
  flight.sample(spaceLaunch + 1e-6, point, tangent);
  expect(point.distanceTo(boardingEnd)).toBeLessThan(1e-7);
  const camera = new THREE.OrthographicCamera(-8, 8, 9, -3, 0.1, 200);
  effects.update(3, 1, false, camera, 1440);
  flight.update(3, 1, false);
  const comets = effects.root.getObjectByName('falling-comets') as THREE.InstancedMesh;
  const before = Array.from(comets.instanceMatrix.array);
  expect(flight.spacecraft.scale.x).toBe(1.5);
  const attitude = flight.spacecraft.quaternion.clone();
  const flame = flight.root.getObjectByName('spacecraft-exhaust')!;
  const flameScale = flame.scale.y;
  effects.update(3, 5, true, camera, 1440);
  flight.update(3, 5, true);
  expect(Array.from(comets.instanceMatrix.array)).toEqual(before);
  expect(flight.spacecraft.quaternion.equals(attitude)).toBe(true);
  expect(flame.scale.y).toBe(flameScale);
  effects.update(3, 5, false, camera, 1440);
  expect(Array.from(comets.instanceMatrix.array)).not.toEqual(before);
  let draws = 0;
  let triangles = 0;
  for (const root of [flight.root, effects.root]) root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    draws++;
    triangles += (object.geometry.index?.count ?? object.geometry.getAttribute('position').count) / 3 * (object instanceof THREE.InstancedMesh ? object.count : 1);
    object.geometry.dispose();
    if (object instanceof THREE.InstancedMesh) object.dispose();
  });
  expect(draws).toBeLessThanOrEqual(6);
  expect(triangles).toBeLessThan(3000);
  effects.update(2, 5, false, camera, 390);
  flight.update(2, 5, false);
  expect(effects.root.visible).toBe(false);
  expect(flight.root.visible).toBe(false);
  materials.forEach(material => material.dispose());
});

test('space boarding, ascent and side scenery render on desktop and mobile', async ({ page }, testInfo) => {
  test.setTimeout(60000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && /THREE|WebGL|shader/.test(message.text())) errors.push(message.text()); });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('canvas')).toBeVisible({ timeout: 15000 });
  await page.evaluate(() => document.fonts.ready);
  for (const [name, fraction] of [['boarding', 0.27], ['ascent', 0.67], ['space', 0.98]] as const) {
    await page.evaluate(fraction => {
      const sky = document.querySelector('#sky')!.getBoundingClientRect();
      const space = document.querySelector('#space')!.getBoundingClientRect();
      scrollTo({ top: scrollY + sky.bottom + (space.top - sky.bottom) * fraction - innerHeight * 0.38, behavior: 'instant' });
    }, fraction);
    // Let the scroll event, throttled journey frame and canvas presentation finish before capture.
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))));
    await page.screenshot({ path: `/tmp/space-${name}-${testInfo.project.name}.png` });
  }
  expect(await page.locator('#space').evaluate(node => getComputedStyle(node).backdropFilter)).toBe('none');
  await expect(page.locator('.journey-stage')).toHaveAttribute('aria-label', /ดาวหาง/);
  await page.getByRole('button', { name: 'เปิดภาพเคลื่อนไหว' }).click();
  await page.screenshot({ path: `/tmp/space-moving-${testInfo.project.name}.png` });
  await page.getByRole('button', { name: 'หยุดภาพเคลื่อนไหว' }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
