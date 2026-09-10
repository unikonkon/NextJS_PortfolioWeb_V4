import { test, expect } from '@playwright/test';
import * as THREE from 'three';
import { altitudeAt } from '../src/journeyMath';
import { createWeather, weatherAtAltitude } from '../src/Weather';

function progressAtAltitude(metres: number) {
  let low = 0, high = 2;
  for (let i = 0; i < 40; i++) {
    const middle = (low + high) / 2;
    if (altitudeAt(middle) < metres) low = middle; else high = middle;
  }
  return (low + high) / 2;
}

test('weather uses displayed altitude across the summit and combines alpine snow with wind', () => {
  expect(weatherAtAltitude(200)).toEqual({ rain: 0, wind: 0, snow: 0 });
  expect(weatherAtAltitude(650)).toEqual({ rain: 1, wind: 1, snow: 0 });
  expect(weatherAtAltitude(1110).rain).toBeGreaterThan(0);
  expect(weatherAtAltitude(1120).rain).toBe(0);
  expect(weatherAtAltitude(1130).snow).toBeGreaterThan(0);
  for (const altitude of [1300, 2100, 2400, 2750]) expect(weatherAtAltitude(altitude)).toEqual({ rain: 0, wind: 1, snow: 1 });
  expect(weatherAtAltitude(2850).snow).toBeGreaterThan(0);
  expect(weatherAtAltitude(2950)).toEqual({ rain: 0, wind: 0, snow: 0 });
});

test('precipitation hits slope triangles, shares splash timing, and keeps a fixed terrain origin when scrolling', () => {
  const world = new THREE.Group();
  const slope = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.MeshStandardMaterial());
  slope.rotation.x = -Math.PI / 2 + 0.3;
  slope.position.set(1, 2, -1);
  world.add(slope);
  const weather = createWeather(world, true, 1, [slope], []);
  expect(weather.impactCount).toBe(480);
  const rain = weather.root.getObjectByName('terrain-rain') as THREE.LineSegments<THREE.BufferGeometry, THREE.ShaderMaterial>;
  const splashes = weather.root.getObjectByName('rain-splashes') as THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 0, 1).applyEuler(slope.rotation), slope.position);
  const position = rain.geometry.getAttribute('position');
  for (let i = 0; i < position.count; i += 2) {
    const point = new THREE.Vector3().fromBufferAttribute(position, i);
    expect(plane.distanceToPoint(point)).toBeCloseTo(0.018, 4);
  }
  const rainSeeds = rain.geometry.getAttribute('seed'), splashSeeds = splashes.geometry.getAttribute('seed');
  for (let i = 0; i < splashSeeds.count; i++) {
    const rainIndex = Math.floor(i / 3) * 3 * 2;
    expect(splashSeeds.getX(i)).toBe(rainSeeds.getX(rainIndex));
    expect(splashSeeds.getY(i)).toBe(rainSeeds.getY(rainIndex));
  }
  weather.update(progressAtAltitude(650), 0, true);
  expect(weather.state.rain).toBe(1);
  expect(weather.state.wet).toBe(1);
  weather.update(progressAtAltitude(2750), 0, true);
  expect(weather.state.snow).toBe(1);
  expect(weather.state.wind).toBe(1);
  expect(weather.root.position.toArray()).toEqual([0, 0, 0]);
  for (let i = 1; i <= 60; i++) weather.update(progressAtAltitude(2750), i / 30, false);
  const travel = weather.travel;
  expect(travel).toBeGreaterThan(0);
  weather.update(progressAtAltitude(2750), 2, true);
  expect(weather.travel).toBe(travel);
  weather.update(progressAtAltitude(650), 2, true);
  expect(weather.state.rain).toBe(1);
  expect(weather.state.snow).toBe(0);
  weather.update(progressAtAltitude(3000), 2, true);
  expect(weather.root.visible).toBe(false);
  weather.dispose();
  expect(world.children).toEqual([slope]);
  slope.geometry.dispose(); slope.material.dispose();
});

test('rain and alpine weather render on desktop and mobile, animate together, and pause cleanly', async ({ page }, testInfo) => {
  test.setTimeout(150000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && /THREE|WebGL|shader/.test(message.text())) errors.push(message.text()); });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('canvas')).toBeVisible({ timeout: 45000 });
  await page.evaluate(() => document.fonts.ready);
  const stats = () => page.locator('canvas').evaluate(canvas => (canvas as HTMLCanvasElement & { journeyDiagnostics: {
    calls: number; triangles: number; frames: number;
    weather: { rain: number; wind: number; snow: number; wet: number; gust: number; travel: number; treeBend: number; cloudX: number; runnerLean: number; impacts: number };
  } }).journeyDiagnostics);
  for (const altitude of [650, 1400, 2400, 2850, 3000, 650]) {
    await page.evaluate(progress => {
      const chapter = Math.floor(progress), fraction = progress - chapter;
      const ids = ['ground', 'mountain', 'sky'];
      const current = document.getElementById(ids[chapter])!.getBoundingClientRect();
      const next = document.getElementById(ids[chapter + 1])!.getBoundingClientRect();
      const anchor = fraction < 0.7 ? current.top + current.height * fraction / 0.7 : current.bottom + (next.top - current.bottom) * (fraction - 0.7) / 0.3;
      scrollTo({ top: scrollY + anchor - innerHeight * 0.38, behavior: 'instant' });
    }, progressAtAltitude(altitude));
    await expect.poll(async () => (await stats()).weather.rain, { timeout: 10000 }).toBeCloseTo(weatherAtAltitude(altitude).rain, 1);
    await expect.poll(async () => (await stats()).weather.snow).toBeCloseTo(weatherAtAltitude(altitude).snow, 1);
    const current = await stats();
    expect(current.weather.wind).toBeCloseTo(weatherAtAltitude(altitude).wind, 1);
    expect(current.weather.impacts).toBeGreaterThanOrEqual(480);
    expect(current.calls).toBeLessThan(220);
    expect(current.triangles).toBeLessThan(180000);
    if ([650, 1400, 2850].includes(altitude)) await page.screenshot({ path: `/tmp/weather-${altitude}-${testInfo.project.name}.png` });
  }
  const paused = await stats();
  await page.waitForTimeout(400);
  expect((await stats()).frames).toBe(paused.frames);
  await page.getByRole('button', { name: 'เปิดภาพเคลื่อนไหว' }).click();
  await expect.poll(async () => (await stats()).weather.travel).toBeGreaterThan(paused.weather.travel + 0.5);
  const moving = await stats();
  expect(moving.weather.treeBend).not.toBe(paused.weather.treeBend);
  expect(moving.weather.cloudX).not.toBe(paused.weather.cloudX);
  expect(Math.abs(moving.weather.runnerLean)).toBeGreaterThan(0.01);
  await page.screenshot({ path: `/tmp/weather-rain-moving-${testInfo.project.name}.png` });
  expect(errors).toEqual([]);
});
