import { test, expect } from '@playwright/test';
import * as THREE from 'three';
import { createSkyFlight, flightBoarding, flightEnd, flightStart } from '../src/SkyFlight';

test('flight climbs continuously, uses five batches, and pauses its propeller and birds', () => {
  const materials = new Map<string, THREE.Material>();
  const start = new THREE.Vector3(-0.58, 13.62, -1.98);
  const end = new THREE.Vector3(3.9, 23.05, -1.8);
  const flight = createSkyFlight(start, end, materials);
  const point = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  let previousHeight = start.y;
  for (let sample = 0; sample <= 100; sample++) {
    flight.sample(flightStart + (flightEnd - flightStart) * sample / 100, point, tangent);
    expect(point.y).toBeGreaterThanOrEqual(previousHeight - 1e-8);
    expect(Number.isFinite(tangent.length())).toBe(true);
    previousHeight = point.y;
  }
  expect(point.distanceTo(end)).toBeLessThan(1e-8);
  flight.sample(flightStart, point, tangent);
  expect(point.distanceTo(start)).toBeLessThan(1e-8);
  expect(flightBoarding(1.2)).toBe(0);
  expect(flightBoarding(1.5)).toBe(1);
  expect(flightBoarding(2.25)).toBe(0);
  let draws = 0;
  let triangles = 0;
  flight.root.traverse(object => {
    if (object instanceof THREE.Mesh) {
      draws++;
      triangles += object.geometry.getAttribute('position').count / 3 * (object instanceof THREE.InstancedMesh ? object.count : 1);
    }
  });
  expect(draws).toBe(5);
  expect(triangles).toBeLessThan(1500);
  flight.sample(1.75, point, tangent);
  flight.update(1.75, 1, false, point);
  expect(flight.root.visible).toBe(true);
  const propeller = flight.root.getObjectByName('airplane-propeller')!;
  const wing = flight.root.getObjectByName('flying-birds')!.children[1] as THREE.InstancedMesh;
  const rotation = propeller.rotation.z;
  const matrices = Array.from(wing.instanceMatrix.array);
  flight.update(1.75, 2, true, point);
  expect(propeller.rotation.z).toBe(rotation);
  expect(Array.from(wing.instanceMatrix.array)).toEqual(matrices);
  flight.update(1.75, 2, false, point);
  expect(propeller.rotation.z).not.toBe(rotation);
  flight.update(3, 3, false, point);
  expect(flight.root.visible).toBe(false);
  flight.root.traverse(object => {
    if (object instanceof THREE.Mesh) object.geometry.dispose();
    if (object instanceof THREE.InstancedMesh) object.dispose();
  });
  materials.forEach(material => material.dispose());
});

test('sky travel grows 20 percent and the flight renders without errors', async ({ page }, testInfo) => {
  test.setTimeout(60000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && /THREE|WebGL|shader/.test(message.text())) errors.push(message.text()); });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('canvas')).toBeVisible({ timeout: 15000 });
  const ratio = await page.evaluate(() => {
    const sky = getComputedStyle(document.querySelector('.travel-to-sky')!);
    const space = getComputedStyle(document.querySelector('.travel-to-space')!);
    return parseFloat(sky.minHeight) / parseFloat(space.minHeight);
  });
  expect(ratio).toBeCloseTo(1.2, 2);
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => {
    const mountain = document.querySelector('#mountain')!.getBoundingClientRect();
    const sky = document.querySelector('#sky')!.getBoundingClientRect();
    scrollTo({ top: scrollY + mountain.bottom + (sky.top - mountain.bottom) * 0.62 - innerHeight * 0.38, behavior: 'instant' });
  });
  await expect(page.locator('.chapter-rail a[aria-current="location"]')).toHaveAttribute('href', '#sky');
  await page.screenshot({ path: `/tmp/sky-flight-${testInfo.project.name}.png` });
  await page.getByRole('button', { name: 'เปิดภาพเคลื่อนไหว' }).click();
  await expect(page.getByRole('button', { name: 'หยุดภาพเคลื่อนไหว' })).toHaveAttribute('aria-pressed', 'false');
  await page.screenshot({ path: `/tmp/sky-flight-moving-${testInfo.project.name}.png` });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
