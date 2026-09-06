import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

export type WorldKind = 'ground' | 'mountain' | 'sky' | 'space';

export default function World({ kind, paused }: { kind: WorldKind; paused: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const pauseRef = useRef(paused);
  const [failed, setFailed] = useState(false);
  useEffect(() => { pauseRef.current = paused; }, [paused]);

  useEffect(() => {
    const container = host.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    } catch {
      setFailed(true);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-7, 7, 6, -6, 0.1, 100);
    camera.position.set(11, 9, 14);
    camera.lookAt(0, 0.6, 0);
    scene.add(new THREE.HemisphereLight(0xf8ffff, 0x65704a, 2.8));
    const sun = new THREE.DirectionalLight(0xfff4d9, 4);
    sun.position.set(-5, 12, 7);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8 });
    sun.shadow.bias = -0.001;
    scene.add(sun);
    const world = new THREE.Group();
    scene.add(world);
    const materials = new Map<string, THREE.MeshStandardMaterial>();
    const material = (color: string) => {
      if (!materials.has(color)) materials.set(color, new THREE.MeshStandardMaterial({ color, roughness: 0.86, flatShading: true }));
      return materials.get(color)!;
    };
    function mesh(geometry: THREE.BufferGeometry, color: string, position: number[], parent: THREE.Object3D = world) {
      const object = new THREE.Mesh(geometry, material(color));
      object.position.set(position[0], position[1], position[2]);
      object.castShadow = true;
      object.receiveShadow = true;
      parent.add(object);
      return object;
    }
    function box(size: number[], color: string, position: number[], parent: THREE.Object3D = world) {
      return mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), color, position, parent);
    }
    function tree(position: number[], scale = 1) {
      const treeGroup = new THREE.Group();
      treeGroup.position.set(...position as [number, number, number]);
      treeGroup.scale.setScalar(scale);
      world.add(treeGroup);
      mesh(new THREE.CylinderGeometry(0.09, 0.13, 0.7, 6), '#75604a', [0, 0.3, 0], treeGroup);
      for (let layer = 0; layer < 3; layer++) {
        mesh(new THREE.ConeGeometry(0.62 - layer * 0.13, 1.05, 7), ['#426747', '#547955', '#6c8c60'][layer], [0, 0.8 + layer * 0.38, 0], treeGroup);
      }
    }
    const clouds: THREE.Group[] = [];
    function cloud(position: number[], scale = 1) {
      const group = new THREE.Group();
      group.position.set(...position as [number, number, number]);
      group.scale.setScalar(scale);
      for (let piece = 0; piece < 5; piece++) {
        const puff = mesh(new THREE.IcosahedronGeometry(0.6, 2), '#ffffff', [(piece - 2) * 0.48, Math.sin(piece * 2) * 0.17, Math.cos(piece) * 0.12], group);
        puff.scale.y = 0.65 + (piece % 2) * 0.4;
        puff.castShadow = false;
      }
      world.add(group);
      clouds.push(group);
    }
    if (kind === 'ground' || kind === 'mountain') {
      const island = mesh(new THREE.CylinderGeometry(4.2, 2.3, 2.1, 9, 2), '#777260', [0, -1.5, 0]);
      island.rotation.y = 0.17;
      mesh(new THREE.ConeGeometry(2.35, 2.2, 7), '#626859', [0.1, -3.3, 0]).rotation.z = Math.PI;
      mesh(new THREE.CylinderGeometry(4.25, 4.1, 0.32, 9), '#a4b780', [0, -0.3, 0]).rotation.y = 0.17;
      mesh(new THREE.CylinderGeometry(3.9, 4.2, 0.16, 9), '#b8c693', [0, -0.08, 0]).rotation.y = 0.17;
      const peakHeight = kind === 'mountain' ? 4.5 : 3.4;
      mesh(new THREE.ConeGeometry(1.9, peakHeight, 5), '#7b8b73', [-0.2, peakHeight / 2 - 0.04, -1.4]);
      mesh(new THREE.ConeGeometry(1.4, 2.7, 5), '#97a48a', [-1.8, 1.25, -1.25]);
      mesh(new THREE.ConeGeometry(0.65, peakHeight * 0.35, 5), '#edf0df', [-0.2, peakHeight * 0.83, -1.4]);
      mesh(new THREE.ConeGeometry(0.45, 0.85, 5), '#e2e9d5', [-1.8, 2.22, -1.25]);
      const river = box([0.7, 0.06, 3.5], '#90ccd0', [1, 0.04, 1.15]);
      river.rotation.y = -0.18;
      box([0.75, 3.4, 0.12], '#a3d8d9', [0.7, -1.68, 3.02]);
      for (let stream = 0; stream < 4; stream++) box([0.04, 2.8 - stream * 0.23, 0.03], '#d9efdf', [0.45 + stream * 0.15, -1.55, 3.1]);
      [[-2.6, 0, 0.1], [-3, 0, -0.9], [-2.6, 0, 1.65], [-1.6, 0, 2.5], [2.3, 0, -1.4], [2.8, 0, -0.4], [2.5, 0, 1.8], [0.7, 0, -2.8]].forEach((position, index) => tree(position, 0.65 + (index % 3) * 0.17));
      const cabin = new THREE.Group();
      cabin.position.set(-0.7, 0.02, 1.2);
      world.add(cabin);
      box([1.25, 0.95, 1], '#e8d8b4', [0, 0.48, 0], cabin);
      const roof = mesh(new THREE.ConeGeometry(1.03, 0.75, 4), '#6a7564', [0, 1.24, 0], cabin);
      roof.rotation.y = Math.PI / 4;
      roof.scale.z = 0.92;
      box([0.3, 0.55, 0.035], '#626c51', [0, 0.28, 0.52], cabin);
      box([0.28, 0.28, 0.04], '#f9cd75', [0.4, 0.6, 0.52], cabin);
      box([0.2, 0.6, 0.2], '#a6a08a', [0.35, 1.4, -0.2], cabin);
      for (let step = 0; step < 4; step++) box([0.34, 0.055, 0.22], '#e1d9ba', [-0.7 - step * 0.16, 0.03, 1.85 + step * 0.3]);
      box([0.95, 0.06, 0.52], '#aa825d', [1.05, 0.14, 1.3]);
      for (const side of [-1, 1]) box([0.06, 0.23, 0.05], '#8c704b', [1.05 + side * 0.38, 0.24, 1.48]);
      for (let rock = 0; rock < 9; rock++) {
        const angle = rock * 2.39;
        const stone = mesh(new THREE.DodecahedronGeometry(0.2 + (rock % 3) * 0.07), '#a0aa91', [Math.cos(angle) * 3.5, 0.1, Math.sin(angle) * 3.3]);
        stone.scale.y = 0.55;
      }
      if (kind === 'mountain') {
        box([0.055, 1.1, 0.055], '#5e655d', [-0.2, peakHeight + 0.35, -1.4]);
        box([0.7, 0.38, 0.035], '#c7ed91', [0.17, peakHeight + 0.65, -1.4]);
      }
      cloud([-4, 1.5, -1.2], 0.8);
      cloud([3.4, 2.9, -2.1], 0.7);
      cloud([1.7, -2.7, 3.8], 0.65);
    } else if (kind === 'sky') {
      const balloon = new THREE.Group();
      world.add(balloon);
      const envelope = mesh(new THREE.SphereGeometry(2, 12, 10), '#db9872', [0, 2.2, 0], balloon);
      envelope.scale.y = 1.15;
      mesh(new THREE.ConeGeometry(1.55, 1.8, 12), '#edc999', [0, 0.8, 0], balloon).rotation.z = Math.PI;
      box([0.9, 0.6, 0.8], '#9a7756', [0, -1.2, 0], balloon);
      for (const side of [-1, 1]) {
        box([0.04, 1.5, 0.04], '#7b6e5c', [side * 0.4, -0.3, 0.3], balloon);
        box([0.04, 1.5, 0.04], '#7b6e5c', [side * 0.4, -0.3, -0.3], balloon);
      }
      cloud([-2.8, -1.3, 0.6], 1.2);
      cloud([3.3, 1, -1.4], 0.85);
      cloud([1.3, -2.9, 2], 1.4);
      cloud([-3.5, 3.2, -2], 0.6);
    } else {
      mesh(new THREE.IcosahedronGeometry(2, 3), '#9aab90', [-0.8, -0.6, 0]);
      const ring = mesh(new THREE.TorusGeometry(3.1, 0.07, 6, 100), '#d6c9a9', [-0.8, -0.6, 0]);
      ring.rotation.set(1.2, 0.3, -0.3);
      const rocket = new THREE.Group();
      rocket.position.set(2.2, 2.3, 0.7);
      rocket.rotation.z = -0.35;
      world.add(rocket);
      mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.5, 12), '#f3eedb', [0, 0, 0], rocket);
      mesh(new THREE.ConeGeometry(0.42, 0.8, 12), '#d6926d', [0, 1.15, 0], rocket);
      const windowMesh = mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.05, 16), '#6caaa9', [0, 0.25, 0.42], rocket);
      windowMesh.rotation.x = Math.PI / 2;
      for (const side of [-1, 1]) {
        const fin = box([0.18, 0.65, 0.55], '#d6926d', [side * 0.5, -0.6, 0], rocket);
        fin.rotation.z = side * -0.35;
      }
      mesh(new THREE.ConeGeometry(0.28, 0.9, 8), '#f3c987', [0, -1.2, 0], rocket).rotation.z = Math.PI;
      for (let star = 0; star < 42; star++) {
        const angle = star * 2.399;
        const radius = 3.5 + Math.sin(star * 1.9) * 1.6;
        mesh(new THREE.OctahedronGeometry(star % 5 === 0 ? 0.09 : 0.035), '#e8eacf', [Math.cos(angle) * radius, Math.sin(angle) * radius, -2 - Math.sin(star) * 2]);
      }
      mesh(new THREE.IcosahedronGeometry(0.45, 1), '#c0ac8f', [-3, 2.7, 0]);
    }
    const pointer = { x: 0, y: 0 };
    const move = (event: PointerEvent) => {
      const bounds = container.getBoundingClientRect();
      pointer.x = (event.clientX - bounds.left) / bounds.width - 0.5;
      pointer.y = (event.clientY - bounds.top) / bounds.height - 0.5;
    };
    const leave = () => { pointer.x = 0; pointer.y = 0; };
    container.addEventListener('pointermove', move);
    container.addEventListener('pointerleave', leave);
    const contextLost = (event: Event) => { event.preventDefault(); setFailed(true); };
    renderer.domElement.addEventListener('webglcontextlost', contextLost);
    const resize = () => {
      const { width, height } = container.getBoundingClientRect();
      if (!width || !height) return;
      const aspect = width / height;
      const vertical = Math.max(5.8, 5.8 / aspect);
      camera.left = -vertical * aspect;
      camera.right = vertical * aspect;
      camera.top = vertical;
      camera.bottom = -vertical;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
      renderer.render(scene, camera);
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    let visible = true;
    const intersection = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; });
    intersection.observe(container);
    let animation = 0;
    let lastFrame = 0;
    let elapsed = 0;
    const animate = (timestamp: number) => {
      animation = requestAnimationFrame(animate);
      if (timestamp - lastFrame < 32) return;
      const delta = Math.min(timestamp - lastFrame, 50);
      lastFrame = timestamp;
      if (!visible || document.hidden) return;
      if (!pauseRef.current) {
        elapsed += delta / 1000;
        world.rotation.y += (pointer.x * 0.25 + Math.sin(elapsed * 0.15) * 0.055 - world.rotation.y) * 0.04;
        world.rotation.x += (pointer.y * 0.07 - world.rotation.x) * 0.04;
        world.position.y = Math.sin(elapsed * 0.6) * 0.09;
        clouds.forEach((group, index) => { group.position.x += Math.sin(elapsed * 0.5 + index) * 0.0018; });
      }
      renderer.render(scene, camera);
    };
    animation = requestAnimationFrame(animate);
    resize();
    return () => {
      cancelAnimationFrame(animation);
      resizeObserver.disconnect();
      intersection.disconnect();
      container.removeEventListener('pointermove', move);
      container.removeEventListener('pointerleave', leave);
      renderer.domElement.removeEventListener('webglcontextlost', contextLost);
      scene.traverse(object => { if (object instanceof THREE.Mesh) object.geometry.dispose(); });
      materials.forEach(item => item.dispose());
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [kind]);

  return <div ref={host} className={`world world-${kind}`} role="img" aria-label={{ ground: 'เกาะลอยสามมิติ มีภูเขา บ้าน ต้นสน และน้ำตก', mountain: 'ภูเขาสามมิติและธงบนยอด แทนการเติบโตในการทำงาน', sky: 'บอลลูนสามมิติลอยเหนือเมฆ แทนการทดลองสร้างโปรเจกต์', space: 'ดาวเคราะห์และจรวดสามมิติ แทนการเรียนรู้สิ่งใหม่' }[kind]}>{failed && <div className="world-fallback"><span>{kind === 'space' ? '✦' : '△'}</span><p>โลกของการเรียนรู้ไม่มีที่สิ้นสุด</p><small>อุปกรณ์นี้แสดงฉากแบบเรียบง่าย</small></div>}</div>;
}
