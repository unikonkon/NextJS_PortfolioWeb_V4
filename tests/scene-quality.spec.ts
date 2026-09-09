import { test, expect } from '@playwright/test';
import * as THREE from 'three';
import { batchStaticScene, createPlanet, createRockRelief } from '../src/SceneAssets';
import { measureProgress } from '../src/journeyMath';

test('static batching preserves placement, animation roots and chapter culling', () => {
  const root = new THREE.Group();
  root.position.set(2, 3, 1);
  const material = new THREE.MeshStandardMaterial();
  const animated = new THREE.Group(); root.add(animated);
  const protectedMesh = new THREE.Mesh(new THREE.BoxGeometry(), material); animated.add(protectedMesh);
  for (let i = 0; i < 4; i++) {
    const group = new THREE.Group(); group.position.set(i * 2, i < 2 ? 0 : 20, 0); root.add(group);
    group.add(new THREE.Mesh(new THREE.BoxGeometry(), material));
  }
  batchStaticScene(root, new Set([animated]));
  expect(protectedMesh.parent).toBe(animated);
  const batches = root.children.filter(child => child.name === 'static-scenery-batch') as THREE.Mesh[];
  expect(batches).toHaveLength(2);
  const boxes = batches.map(mesh => { mesh.geometry.computeBoundingBox(); return mesh.geometry.boundingBox!; });
  expect(boxes[0].min.toArray()).toEqual([-0.5, -0.5, -0.5]);
  expect(boxes[0].max.toArray()).toEqual([2.5, 0.5, 0.5]);
  expect(boxes[1].min.y).toBe(19.5);
  root.traverse(object => { if (object instanceof THREE.Mesh) object.geometry.dispose(); }); material.dispose();
});

test('procedural surface textures stay small and cached scroll measurements follow resized sections', () => {
  const materials = new Map<string, THREE.Material>();
  const planet = createPlanet(materials);
  const rock = createRockRelief();
  expect(rock.image.width).toBe(128);
  const surface = materials.get('planet-surface') as THREE.MeshStandardMaterial;
  expect(surface.map!.image.width).toBe(512);
  expect(surface.map!.image.height).toBe(256);
  expect(surface.map!.colorSpace).toBe(THREE.SRGBColorSpace);
  const bounds = [{ top: 0, bottom: 1000 }, { top: 1400, bottom: 2000 }];
  expect(measureProgress(bounds, 1200)).toBeCloseTo(0.85);
  bounds[0].bottom = 1200;
  expect(measureProgress(bounds, 1200)).toBeCloseTo(0.7);
  planet.dispose(); rock.dispose(); materials.forEach(material => material.dispose());
  planet.root.traverse(object => { if (object instanceof THREE.Mesh) object.geometry.dispose(); });
});

test('detailed scenery stays within a draw budget and stops rendering when paused', async ({ page }, testInfo) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && /THREE|WebGL|shader/.test(message.text())) errors.push(message.text()); });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('canvas')).toBeVisible({ timeout: 20000 });
  await page.evaluate(() => document.fonts.ready);
  const results = [];
  for (const [name, previous, next, fraction] of [['ground', 'ground', 'mountain', 0], ['mountain', 'ground', 'mountain', 0.86], ['sky', 'mountain', 'sky', 0.63], ['space', 'sky', 'space', 0.98]] as const) {
    await page.evaluate(({ previous, next, fraction, name }) => {
      const a = document.getElementById(previous)!.getBoundingClientRect();
      const b = document.getElementById(next)!.getBoundingClientRect();
      scrollTo({ top: name === 'ground' ? 0 : scrollY + a.bottom + (b.top - a.bottom) * fraction - innerHeight * 0.38, behavior: 'instant' });
    }, { previous, next, fraction, name });
    await page.waitForTimeout(350);
    const stats = await page.locator('canvas').evaluate(canvas => (canvas as HTMLCanvasElement & { journeyDiagnostics: { calls: number; triangles: number; frames: number; pixelRatio: number; cpuMs: number } }).journeyDiagnostics);
    expect(stats.calls).toBeLessThan(220);
    expect(stats.triangles).toBeLessThan(180000);
    results.push({ chapter: name, ...stats });
    await page.screenshot({ path: `/tmp/realistic-${name}-${testInfo.project.name}.png` });
  }
  await page.waitForTimeout(400);
  const frames = () => page.locator('canvas').evaluate(canvas => (canvas as HTMLCanvasElement & { journeyDiagnostics: { frames: number } }).journeyDiagnostics.frames);
  const stopped = await frames();
  await page.waitForTimeout(400);
  expect(await frames()).toBe(stopped);
  await page.getByRole('button', { name: 'เปิดภาพเคลื่อนไหว' }).click();
  await expect.poll(frames).toBeGreaterThan(stopped);
  expect(errors).toEqual([]);
  await testInfo.attach('scene-render-budget', { body: JSON.stringify(results, null, 2), contentType: 'application/json' });
  console.log(`${testInfo.project.name} render budgets: ${JSON.stringify(results)}`);
});
