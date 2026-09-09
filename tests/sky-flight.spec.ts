import { test, expect } from '@playwright/test';
import * as THREE from 'three';
import { createSkyFlight, flightBoarding, flightEnd, flightStart, flightTakeoffAltitude } from '../src/SkyFlight';
import { altitudeAt, altitudes } from '../src/journeyMath';

test('flight climbs continuously, uses six batches, and pauses its propeller and birds', () => {
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
  expect(flightBoarding(flightStart)).toBe(1);
  expect(flightBoarding(2.35)).toBe(0);
  expect(altitudes[1] + (flightStart - 1) * (altitudes[2] - altitudes[1])).toBeCloseTo(flightTakeoffAltitude, 7);
  for (const metres of [8000, 9000, 9999, 10000]) {
    const progress = 1 + (metres - altitudes[1]) / (altitudes[2] - altitudes[1]);
    flight.sample(progress, point, tangent);
    expect(point.distanceTo(start)).toBeLessThan(1e-8);
    flight.update(progress, 0, true, point);
    expect(flight.aircraft.position.distanceTo(start)).toBeLessThan(1e-8);
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(flight.aircraft.quaternion);
    expect(forward.y).toBeCloseTo(0);
  }
  flight.sample(flightStart + 1e-5, point, tangent);
  expect(point.y).toBeGreaterThan(start.y);
  expect(point.distanceTo(start)).toBeLessThan(1e-5);
  let draws = 0;
  let triangles = 0;
  flight.root.traverse(object => {
    if (object instanceof THREE.Mesh) {
      draws++;
      triangles += (object.geometry.index?.count ?? object.geometry.getAttribute('position').count) / 3 * (object instanceof THREE.InstancedMesh ? object.count : 1);
    }
  });
  expect(draws).toBe(6);
  expect(triangles).toBeLessThan(1800);
  const cruising = (flightStart + flightEnd) / 2;
  flight.sample(cruising, point, tangent);
  flight.update(cruising, 1, false, point);
  expect(flight.root.visible).toBe(true);
  const propeller = flight.root.getObjectByName('airplane-propeller')!;
  const wing = flight.root.getObjectByName('flying-birds')!.children[1] as THREE.InstancedMesh;
  const rotation = propeller.rotation.z;
  const matrices = Array.from(wing.instanceMatrix.array);
  flight.update(cruising, 2, true, point);
  expect(propeller.rotation.z).toBe(rotation);
  expect(Array.from(wing.instanceMatrix.array)).toEqual(matrices);
  flight.update(cruising, 2, false, point);
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
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && /THREE|WebGL|shader/.test(message.text())) errors.push(message.text()); });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('canvas')).toBeVisible({ timeout: 45000 });
  const ratio = await page.evaluate(() => {
    const sky = getComputedStyle(document.querySelector('.travel-to-sky')!);
    const space = getComputedStyle(document.querySelector('.travel-to-space')!);
    return parseFloat(sky.minHeight) / parseFloat(space.minHeight);
  });
  expect(ratio).toBeCloseTo(1.2, 2);
  await page.evaluate(() => document.fonts.ready);
  const sampleHeight = () => page.locator('canvas').evaluate(canvas =>
    (canvas as HTMLCanvasElement & { journeyDiagnostics: { aircraftY: number; passengerY: number } }).journeyDiagnostics);
  for (const metres of [9900, 10300, 20000]) {
    let low = 1.7, high = 2.7;
    for (let step = 0; step < 40; step++) {
      const mid = (low + high) / 2;
      if (altitudeAt(mid) < metres) low = mid; else high = mid;
    }
    await page.evaluate(progress => {
      const mountain = document.getElementById('mountain')!.getBoundingClientRect();
      const sky = document.getElementById('sky')!.getBoundingClientRect();
      const anchor = progress < 2
        ? mountain.bottom + (sky.top - mountain.bottom) * (progress - 1.7) / 0.3
        : sky.top + sky.height * (progress - 2) / 0.7;
      scrollTo({ top: scrollY + anchor - innerHeight * 0.38, behavior: 'instant' });
    }, (low + high) / 2);
    await expect(page.locator('.journey-status')).toContainText('THE EXPLORATION');
    await expect.poll(async () => {
      const text = await page.locator('.altimeter').innerText();
      return Math.abs(Number(text.replace(/[^0-9]/g, '')) - metres);
    }).toBeLessThan(40);
    if (metres < 10000) await expect.poll(async () => (await sampleHeight()).aircraftY).toBeCloseTo(13.62, 4);
    else await expect.poll(async () => (await sampleHeight()).aircraftY).toBeGreaterThan(metres > 12000 ? 17 : 13.63);
    const sample = await sampleHeight();
    expect(Math.abs(sample.aircraftY - sample.passengerY)).toBeLessThan(0.01);
    await page.screenshot({ path: `/tmp/sky-flight-${metres}-${testInfo.project.name}.png` });
  }
  await page.getByRole('button', { name: 'เปิดภาพเคลื่อนไหว' }).click();
  await expect(page.getByRole('button', { name: 'หยุดภาพเคลื่อนไหว' })).toHaveAttribute('aria-pressed', 'false');
  await page.screenshot({ path: `/tmp/sky-flight-moving-${testInfo.project.name}.png` });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
