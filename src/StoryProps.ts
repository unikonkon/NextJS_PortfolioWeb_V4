import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { smooth } from './journeyMath';

type Vec = [number, number, number];

/**
 * Props that tie the scene to the page's content: sensor poles in the farm (the IoT project for farmers), one cairn
 * per work project on the mountain, an emblem for each project category on its floating island, a second moon for a
 * topic still being learned, and small balloons released when the visitor asks for every project.
 * Each prop is one mesh with vertex colours on a single shared material: no textures, one draw call apiece.
 */
export function createStoryProps(materials: Map<string, THREE.Material>) {
  const surface = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82 });
  materials.set('story-props', surface);

  function sculpt() {
    const pieces: THREE.BufferGeometry[] = [];
    const transform = new THREE.Object3D();
    const tint = new THREE.Color();
    function add(geometry: THREE.BufferGeometry, color: string, position: Vec, rotation: Vec = [0, 0, 0], scale: Vec = [1, 1, 1]) {
      if (geometry.index) { const indexed = geometry; geometry = indexed.toNonIndexed(); indexed.dispose(); }
      geometry.deleteAttribute('uv');
      transform.position.set(...position);
      transform.rotation.set(...rotation);
      transform.scale.set(...scale);
      transform.updateMatrix();
      geometry.applyMatrix4(transform.matrix);
      tint.set(color);
      const colors = new Float32Array(geometry.getAttribute('position').count * 3);
      for (let i = 0; i < colors.length; i += 3) tint.toArray(colors, i);
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      pieces.push(geometry);
    }
    return {
      add,
      box: (size: Vec, color: string, position: Vec, rotation?: Vec) => add(new THREE.BoxGeometry(...size), color, position, rotation),
      mesh(name: string, shadows = true) {
        const geometry = mergeGeometries(pieces);
        pieces.forEach(piece => piece.dispose());
        const object = new THREE.Mesh(geometry, surface);
        object.name = name;
        object.castShadow = object.receiveShadow = shadows;
        return object;
      },
    };
  }

  /** A toothed wheel standing upright, facing +z. */
  function gear(shape: ReturnType<typeof sculpt>, color: string, x: number, y: number, radius: number, teeth: number) {
    shape.add(new THREE.CylinderGeometry(radius, radius, 0.06, 14), color, [x, y, 0], [Math.PI / 2, 0, 0]);
    for (let tooth = 0; tooth < teeth; tooth++) {
      const angle = tooth / teeth * Math.PI * 2;
      shape.box([radius * 0.42, radius * 0.36, 0.06], color, [x + Math.cos(angle) * radius * 1.12, y + Math.sin(angle) * radius * 1.12, 0], [0, 0, angle]);
    }
    shape.add(new THREE.CylinderGeometry(radius * 0.32, radius * 0.32, 0.075, 10), '#fff6d6', [x, y, 0], [Math.PI / 2, 0, 0]);
  }

  return {
    /** Three soil sensors with a solar panel and a status light, in the farm's own coordinates. */
    sensors() {
      const shape = sculpt();
      for (const [x, z] of [[-1.78, 0.62], [-0.42, -0.66], [1.92, 0.6]]) {
        shape.box([0.035, 0.62, 0.035], '#8f948c', [x, 0.31, z]);
        shape.box([0.15, 0.1, 0.09], '#f1efe4', [x, 0.66, z]);
        shape.box([0.2, 0.015, 0.13], '#3d5d8a', [x, 0.76, z], [-0.5, 0, 0]);
        shape.box([0.03, 0.03, 0.02], '#63e06a', [x + 0.04, 0.66, z + 0.05]);
        shape.box([0.015, 0.3, 0.015], '#4f5a4a', [x + 0.09, 0.15, z + 0.04]);
      }
      return shape.mesh('farm-sensors');
    },

    /** A microcontroller board for the workbench, in the bench's coordinates. */
    board() {
      const shape = sculpt();
      shape.box([0.22, 0.016, 0.14], '#1f8a70', [-0.3, 0.4, 0.14]);
      shape.box([0.07, 0.022, 0.055], '#2b2f33', [-0.31, 0.416, 0.14]);
      shape.box([0.17, 0.02, 0.016], '#d8c46a', [-0.3, 0.418, 0.2]);
      shape.box([0.035, 0.03, 0.045], '#c9ced2', [-0.385, 0.42, 0.1]);
      return shape.mesh('bench-board');
    },

    /** Stacked stones with a small pennant: one per project delivered at work. */
    cairn(index: number) {
      const shape = sculpt();
      const stones: [number, number, string][] = [[0.21, 0.09, '#b9b3a2'], [0.155, 0.235, '#a39d8c'], [0.11, 0.345, '#cfc8b4']];
      stones.forEach(([radius, y, color], layer) => shape.add(new THREE.DodecahedronGeometry(radius), color, [layer === 1 ? 0.02 : 0, y, 0], [0, index + layer * 1.1, 0], [1, 0.62, 1]));
      shape.box([0.022, 0.34, 0.022], '#75604a', [0.15, 0.3, 0.02]);
      shape.box([0.14, 0.08, 0.016], index % 2 ? '#f5c98f' : '#e8843b', [0.22, 0.42, 0.02]);
      return shape.mesh(`work-cairn-${index}`);
    },

    /** The sign of a project category, standing on its floating island: a robot (AI), a browser window with a phone
     *  (web and mobile), meshing gears (API) and a painted canvas on an easel (portfolio and design). */
    emblem(kind: number) {
      const shape = sculpt();
      if (kind === 0) {
        shape.box([0.26, 0.24, 0.2], '#e3e9f0', [0, 0.2, 0]);
        shape.box([0.22, 0.18, 0.18], '#f5f8fc', [0, 0.43, 0]);
        for (const side of [-1, 1]) {
          shape.box([0.045, 0.045, 0.02], '#2a74b8', [side * 0.055, 0.44, 0.095]);
          shape.box([0.05, 0.16, 0.05], '#c9d3de', [side * 0.17, 0.2, 0]);
        }
        shape.box([0.02, 0.1, 0.02], '#8a96a3', [0, 0.57, 0]);
        shape.add(new THREE.OctahedronGeometry(0.038), '#e5683f', [0, 0.64, 0]);
      } else if (kind === 1) {
        shape.box([0.04, 0.16, 0.04], '#8a96a3', [-0.06, 0.08, 0]);
        shape.box([0.42, 0.3, 0.03], '#f5f8fc', [-0.06, 0.31, 0]);
        shape.box([0.42, 0.055, 0.034], '#e26d5a', [-0.06, 0.435, 0]);
        shape.box([0.3, 0.03, 0.034], '#c5d6e8', [-0.1, 0.33, 0]);
        shape.box([0.22, 0.03, 0.034], '#c5d6e8', [-0.14, 0.26, 0]);
        shape.box([0.14, 0.26, 0.03], '#2b3440', [0.22, 0.15, 0.12], [-0.12, 0, 0]);
        shape.box([0.11, 0.21, 0.034], '#8fd0ff', [0.22, 0.15, 0.122], [-0.12, 0, 0]);
      } else if (kind === 2) {
        gear(shape, '#f0b429', -0.09, 0.32, 0.15, 8);
        gear(shape, '#6caaa9', 0.165, 0.17, 0.1, 6);
        shape.box([0.04, 0.2, 0.04], '#8a96a3', [-0.09, 0.08, -0.05]);
      } else {
        for (const side of [-1, 1]) shape.box([0.03, 0.5, 0.03], '#8c704b', [side * 0.15, 0.24, 0.02], [0.14, 0, side * -0.1]);
        shape.box([0.03, 0.46, 0.03], '#8c704b', [0, 0.22, -0.14], [-0.3, 0, 0]);
        shape.box([0.38, 0.29, 0.025], '#fbfbf4', [0, 0.36, 0.04], [-0.14, 0, 0]);
        ([['#e26d5a', -0.1, 0.42], ['#5fa3e0', 0.07, 0.38], ['#f0b429', -0.02, 0.29]] as [string, number, number][]).forEach(([color, x, y]) => shape.box([0.1, 0.085, 0.03], color, [x, y, 0.05], [-0.14, 0, 0]));
      }
      return shape.mesh(`category-emblem-${kind}`);
    },

    /** A small ringed moon. */
    moon() {
      const shape = sculpt();
      shape.add(new THREE.IcosahedronGeometry(0.42, 2), '#7fb7b0', [0, 0, 0]);
      shape.add(new THREE.TorusGeometry(0.68, 0.03, 6, 40), '#e8d9a8', [0, 0, 0], [1.25, 0.2, 0]);
      return shape.mesh('ringed-moon', false);
    },

    /** Small balloons that rise once up both edges of the view each time `launch` is called; hidden the rest of the
     *  time. `base` is the point the camera looks at, `right` the view's right in world space and `reach` how far
     *  from the middle the two columns fly, so they pass beside the page content instead of behind it. */
    balloons(count: number) {
      const shape = sculpt();
      shape.add(new THREE.SphereGeometry(0.42, 12, 9), '#ffffff', [0, 0, 0], [0, 0, 0], [1, 1.15, 1]);
      shape.add(new THREE.ConeGeometry(0.22, 0.28, 8), '#f1e6d2', [0, -0.5, 0], [Math.PI, 0, 0]);
      shape.box([0.14, 0.11, 0.14], '#b98f66', [0, -0.78, 0]);
      const template = shape.mesh('released-balloon', false);
      const mesh = new THREE.InstancedMesh(template.geometry, surface, count);
      mesh.name = 'released-balloons';
      mesh.frustumCulled = false; // the instances travel well beyond the bounds of the first frame
      mesh.castShadow = mesh.receiveShadow = false;
      const tint = new THREE.Color();
      const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
      const pose = new THREE.Object3D();
      ['#db9872', '#e9c46a', '#e26d5a', '#a4d4a0', '#f5f8fc', '#f0a57a'].slice(0, count).forEach((color, index) => { mesh.setColorAt(index, tint.set(color)); mesh.setMatrixAt(index, hidden); });
      mesh.visible = false;
      const origin = new THREE.Vector3();
      const across = new THREE.Vector3();
      let started = -Infinity;
      let spread = 0;
      return {
        mesh,
        launch(time: number, base: THREE.Vector3, right: THREE.Vector3, reach: number) { started = time; origin.copy(base); across.copy(right); spread = reach; },
        update(time: number) {
          const elapsed = time - started;
          const flying = elapsed >= 0 && elapsed < 5.4 + count * 0.4;
          if (!flying) { mesh.visible = false; return false; }
          mesh.visible = true;
          for (let index = 0; index < count; index++) {
            const u = Math.min(1, Math.max(0, (elapsed - index * 0.4) / 5.4));
            const side = index % 2 ? 1 : -1;
            pose.position.copy(origin).addScaledVector(across, side * (spread + Math.sin(elapsed * 0.9 + index) * 0.12));
            pose.position.y += -4 + u * 16;
            pose.rotation.z = Math.sin(elapsed * 1.3 + index * 1.7) * 0.08;
            pose.scale.setScalar(smooth(u / 0.1) * (1 - smooth((u - 0.86) / 0.14)));
            pose.updateMatrix();
            mesh.setMatrixAt(index, pose.matrix);
          }
          mesh.instanceMatrix.needsUpdate = true;
          return true;
        },
      };
    },
  };
}
