import { test, expect } from '@playwright/test';
import * as THREE from 'three';
import { createMountainFarm } from '../src/MountainFarm';

test('farm stays within its geometry budget and pauses hidden or reduced motion work', () => {
  const materials = new Map<string, THREE.Material>();
  const farm = createMountainFarm(materials);
  let draws = 0;
  let triangles = 0;
  farm.root.traverse(object => {
    if (object instanceof THREE.Mesh) {
      draws++;
      triangles += object.geometry.getAttribute('position').count / 3 * (object instanceof THREE.InstancedMesh ? object.count : 1);
    }
  });
  expect(draws).toBe(6);
  expect(triangles).toBeLessThan(6000);
  expect((farm.root.getObjectByName('vegetable-crops') as THREE.InstancedMesh).count).toBe(15);
  expect((farm.root.getObjectByName('rice-crops') as THREE.InstancedMesh).count).toBe(30);
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
  camera.position.set(3, 5, 12);
  camera.lookAt(farm.root.position);
  const torso = farm.root.getObjectByName('gardener-torso')!;
  farm.update(0, camera, false);
  expect(farm.root.visible).toBe(true);
  const initial = torso.rotation.x;
  farm.update(1, camera, false);
  expect(torso.rotation.x).not.toBe(initial);
  const working = torso.rotation.x;
  farm.update(2, camera, true);
  expect(torso.rotation.x).toBe(working);
  camera.position.set(0, 40, 12);
  camera.lookAt(0, 40, 0);
  farm.update(3, camera, false);
  expect(farm.root.visible).toBe(false);
  expect(torso.rotation.x).toBe(working);
  farm.root.traverse(object => {
    if (object instanceof THREE.Mesh) object.geometry.dispose();
    if (object instanceof THREE.InstancedMesh) object.dispose();
  });
  materials.forEach(material => material.dispose());
});

test('farm scene renders on the ground without WebGL errors', async ({ page }, testInfo) => {
  test.setTimeout(60000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && /THREE|WebGL|shader/.test(message.text())) errors.push(message.text()); });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('canvas')).toBeVisible({ timeout: 15000 });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `/tmp/farm-page-${testInfo.project.name}.png` });
  // Inspect the model separately as well as its real page composition above.
  await page.addStyleTag({ content: 'main, .skill-overlay, .chapter-rail, .journey-status { visibility: hidden !important; }' });
  await page.screenshot({ path: `/tmp/farm-model-${testInfo.project.name}.png` });
  expect(errors).toEqual([]);
});
