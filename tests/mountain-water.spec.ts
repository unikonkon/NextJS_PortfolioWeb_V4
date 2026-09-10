import { test, expect } from '@playwright/test';
import * as THREE from 'three';
import { createMountainWater, createRiverCourse, createWaterSurface, runoffPulse } from '../src/MountainWater';

function fixture() {
  const world = new THREE.Group();
  const material = new THREE.MeshStandardMaterial();
  const slope = new THREE.Mesh(new THREE.ConeGeometry(4, 14, 48, 16), material);
  slope.position.set(-0.9, 6.6, -2.1);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(18, 18), material);
  ground.rotation.x = -Math.PI / 2; ground.position.z = -1;
  world.add(slope, ground); world.updateMatrixWorld(true);
  const surface = createWaterSurface([slope, ground]);
  const impacts = [];
  for (let i = 0; i < 220; i++) {
    const angle = 0.1 + (i % 17) / 17 * 1.35, radius = 0.7 + (i % 13) / 13 * 2.6;
    const sample = surface.sample(-0.9 + Math.cos(angle) * radius, -2.1 + Math.sin(angle) * radius);
    if (sample) impacts.push(sample);
  }
  return { world, slope, ground, surface, impacts, dispose() { slope.geometry.dispose(); ground.geometry.dispose(); material.dispose(); } };
}

test('water surface queries agree with triangle raycasts and the connected river descends through its outlet', () => {
  const { slope, ground, surface, dispose } = fixture();
  const ray = new THREE.Raycaster(); ray.ray.direction.set(0, -1, 0);
  for (let i = 0; i < 100; i++) {
    const x = -3 + i % 10 * 0.6, z = -4 + Math.floor(i / 10) * 0.65;
    ray.ray.origin.set(x, 20, z);
    const hit = ray.intersectObjects([slope, ground], false)[0];
    const sample = surface.sample(x, z)!;
    expect(sample.point.y).toBeCloseTo(hit.point.y, 5);
    expect(sample.normal.y).toBeGreaterThan(0);
  }
  for (const mobile of [true, false]) {
    const course = createRiverCourse(mobile);
    for (let i = 1; i < course.length; i++) {
      expect(course[i].y).toBeLessThanOrEqual(course[i - 1].y);
      expect(course[i].distanceTo(course[i - 1])).toBeLessThan(0.35);
    }
    expect(course.at(-1)!.y).toBeLessThan(-3);
  }
  dispose();
});

test('random rain-fed channels descend to the river and water animation uses fixed geometry while pausing', () => {
  const { world, slope, ground, impacts, dispose } = fixture();
  const water = createMountainWater(world, true, [slope, ground], impacts);
  expect(water.paths.length).toBeGreaterThanOrEqual(6);
  expect(water.paths.length).toBeLessThanOrEqual(12);
  for (const path of water.paths) {
    expect(path.points.at(-1)!.point.distanceTo(water.course[path.riverIndex])).toBeLessThan(0.001);
    for (let i = 1; i < path.points.length; i++) expect(path.points[i].point.y).toBeLessThanOrEqual(path.points[i - 1].point.y + 0.001);
    expect(path.points[0].point.y).toBeGreaterThan(0.65);
  }
  let triangles = 0, draws = 0;
  const geometries: THREE.BufferGeometry[] = [];
  water.root.traverse(object => { if (object instanceof THREE.Mesh) {
    geometries.push(object.geometry); draws++;
    triangles += (object.geometry.index?.count ?? object.geometry.getAttribute('position').count) / 3 * (object instanceof THREE.InstancedMesh ? object.count : 1);
  } });
  expect(triangles).toBeLessThan(15000);
  expect(draws).toBeLessThanOrEqual(5);
  const versions = geometries.map(geometry => (geometry.getAttribute('position') as THREE.BufferAttribute).version);
  water.update(0, 0, 0, false);
  const activity = new Set<number>();
  for (let i = 1; i <= 900; i++) { water.update(i / 30, 1, 0.6, false); activity.add(water.state.activeSources); }
  expect(activity.size).toBeGreaterThan(2);
  expect(water.state.flux).toBeGreaterThan(0.2);
  expect(water.state.flow).toBeGreaterThan(10);
  const flow = water.state.flow;
  const phase = water.state.rainAge;
  water.update(30, 1, 0.6, true);
  water.update(30, 1, 0.6, true);
  expect(water.state.flow).toBe(flow);
  expect(water.state.rainAge).toBe(phase);
  for (let i = 1; i <= 600; i++) water.update(30 + i / 30, 0, 0, false);
  expect(water.state.flux).toBeLessThan(0.02);
  expect(geometries.map(geometry => (geometry.getAttribute('position') as THREE.BufferAttribute).version)).toEqual(versions);
  water.dispose(); expect(world.children).toEqual([slope, ground]); dispose();
});

test('source pulses travel downstream with finite fronts and reach long-channel mouths before recycling', () => {
  const length = 18, seed = 0.6, speed = 1.2;
  let upstream = -1, downstream = -1;
  for (let time = 0; time < 32; time += 0.05) {
    if (upstream < 0 && runoffPulse(6, length, seed, speed, time) > 0.2) upstream = time;
    if (downstream < 0 && runoffPulse(length, length, seed, speed, time) > 0.2) downstream = time;
  }
  expect(upstream).toBeGreaterThan(0);
  expect(downstream - upstream).toBeCloseTo((length - 6) / speed, 1);
  expect(runoffPulse(length, length, seed, speed, 0)).toBe(0);
  expect(runoffPulse(length, length, seed, speed, downstream + 10)).toBe(0);
  expect(runoffPulse(6, length, seed, speed, upstream + 30.6, 10)).toBe(0);
});
