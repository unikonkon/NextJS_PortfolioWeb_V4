import * as THREE from 'three';
import { smooth } from './journeyMath';

type Vec = [number, number, number];

interface Flyer {
  color: string;
  size: number;
  /** Wing stroke in radians and beats per second: wide and fast for a butterfly, a slow shallow stroke for an eagle. */
  stroke: number;
  beat: number;
  phase: number;
  /** 0–1 for the camera progress: each animal belongs to one chapter and fades out of the others. */
  shown: (progress: number) => number;
  /** World position at a time in seconds. */
  place: (time: number, out: THREE.Vector3) => THREE.Vector3;
}

/**
 * Small animals that belong to one chapter each: butterflies over the garden, two eagles circling below the summit
 * and a flock of gulls crossing the sky. Every wing is an instance of one four-triangle shape, so the whole module is
 * a single draw call; nothing here casts or receives shadows and there are no textures.
 */
export function createWildlife(garden: Vec, summit: Vec, skyHeight: number, mobile: boolean, materials: Map<string, THREE.Material>) {
  const flyers: Flyer[] = [];

  const butterflies = ['#f0b429', '#e5683f', '#5fa3e0'].slice(0, mobile ? 2 : 3);
  butterflies.forEach((color, index) => {
    const radius = 0.55 + index * 0.22;
    const speed = 0.75 + index * 0.13;
    flyers.push({
      color, size: 0.34, stroke: 1.15, beat: 4, phase: index * 2.1,
      shown: progress => 1 - smooth((progress - 0.28) / 0.2),
      place: (time, out) => out.set(
        garden[0] - 0.4 + index * 0.5 + Math.cos(time * speed + index * 2) * radius,
        garden[1] + 0.8 + Math.sin(time * speed * 2.3 + index) * 0.22,
        garden[2] + 0.6 + Math.sin(time * speed * 1.3 + index * 2) * radius * 0.8,
      ),
    });
  });

  ([[2.7, -3.4, '#4d4238'], [3.7, -2.1, '#5c4e42']] as [number, number, string][]).forEach(([radius, drop, color], index) => {
    const direction = index ? -1 : 1;
    flyers.push({
      color, size: 0.95, stroke: 0.2, beat: 0.4, phase: index * 1.4,
      shown: progress => smooth((progress - 0.55) / 0.2) * (1 - smooth((progress - 1.9) / 0.2)),
      place: (time, out) => out.set(
        summit[0] + Math.cos(time * 0.3 * direction + index * 2.6) * radius,
        summit[1] + drop + Math.sin(time * 0.17 + index) * 0.35,
        summit[2] + Math.sin(time * 0.3 * direction + index * 2.6) * radius * 0.8,
      ),
    });
  });

  // The gulls fly one path in a V: each bird trails the leader by its row and keeps to its own side.
  const centre = (time: number, out: THREE.Vector3) => out.set(
    Math.cos(time * 0.2) * 6.2,
    skyHeight + Math.sin(time * 0.1 + 1) * 1.7,
    0.6 + Math.sin(time * 0.2) * 2.6,
  );
  const ahead = new THREE.Vector3();
  for (let index = 0; index < (mobile ? 5 : 7); index++) {
    const row = Math.ceil(index / 2);
    const side = index % 2 ? 1 : -1;
    flyers.push({
      color: index % 3 ? '#fbfcfd' : '#e7edf3', size: 0.55, stroke: 0.7, beat: 1.05 + (index % 3) * 0.06, phase: index * 0.9,
      shown: progress => smooth((progress - 1.78) / 0.2) * (1 - smooth((progress - 2.85) / 0.15)),
      place: (time, out) => {
        const behind = time - row * 0.42;
        centre(behind, out);
        centre(behind + 0.05, ahead).sub(out).setY(0).normalize();
        // Step sideways across the heading, and a little up and down so the V is not perfectly flat.
        out.x += ahead.z * side * row * 0.5;
        out.z -= ahead.x * side * row * 0.5;
        out.y += Math.sin(time * 0.9 + index) * 0.08;
        return out;
      },
    });
  }

  // Half a bird seen from above, in x/z with the nose towards +z: a swept wing and half of the tail. The other half
  // is the same shape mirrored, so one bird is two instances.
  const outline = [[0, 0.17], [0.3, 0.12], [0.62, -0.06], [0.3, -0.04], [0, -0.11], [0.09, -0.3], [0, -0.3]];
  const corners = [0, 1, 4, 1, 3, 4, 1, 2, 3, 4, 5, 6].flatMap(corner => [outline[corner][0], 0, outline[corner][1]]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(corners, 3));
  geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.9 });
  materials.set('wildlife', material);
  const wings = new THREE.InstancedMesh(geometry, material, flyers.length * 2);
  wings.name = 'wildlife';
  wings.frustumCulled = false; // the instances move across the whole column; three would cull by the first frame's bounds
  wings.castShadow = wings.receiveShadow = false;
  const tint = new THREE.Color();
  flyers.forEach((flyer, index) => { tint.set(flyer.color); wings.setColorAt(index * 2, tint); wings.setColorAt(index * 2 + 1, tint); });
  const root = new THREE.Group();
  root.name = 'wildlife';
  root.add(wings);

  const body = new THREE.Object3D();
  const wing = new THREE.Object3D();
  body.add(wing);
  const position = new THREE.Vector3();
  const next = new THREE.Vector3();
  const hidden = new THREE.Matrix4().makeScale(0, 0, 0);

  return {
    root,
    /** `time` is the scene clock, which stops while motion is paused; the birds then hold their pose. */
    update(progress: number, time: number) {
      flyers.forEach((flyer, index) => {
        const shown = flyer.shown(progress);
        if (shown < 0.01) {
          wings.setMatrixAt(index * 2, hidden);
          wings.setMatrixAt(index * 2 + 1, hidden);
          return;
        }
        flyer.place(time, position);
        flyer.place(time + 0.05, next).sub(position);
        body.position.copy(position);
        body.rotation.set(-Math.atan2(next.y, Math.hypot(next.x, next.z)) * 0.6, Math.atan2(next.x, next.z), 0, 'YXZ');
        body.scale.setScalar(flyer.size * shown);
        body.updateMatrix();
        // Wings beat around a slightly raised rest position.
        const lift = 0.12 + Math.sin(time * flyer.beat * Math.PI * 2 + flyer.phase) * flyer.stroke;
        for (const side of [1, -1]) {
          wing.scale.set(side, 1, 1);
          wing.rotation.z = lift * side;
          wing.updateMatrix();
          wings.setMatrixAt(index * 2 + (side > 0 ? 0 : 1), wing.matrix.premultiply(body.matrix));
        }
      });
      wings.instanceMatrix.needsUpdate = true;
    },
  };
}
