/* Trace / Vault — procedural scene, Three.js (MIT). No remote assets or telemetry. */
import * as THREE from './vendor/three.module.js';

const TAU = Math.PI * 2;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = v => { v = clamp(v); return v * v * (3 - 2 * v); };
const phase = (p, a, b) => smooth((p - a) / (b - a));

/**
 * Creates the decorative Trace vault. Parent owns scrolling and semantic content.
 * Returns { setProgress(0..1), renderAt(0..1), destroy(), getStats() }.
 * Throws VaultWebGLError if WebGL cannot initialise so the parent can show its fallback.
 */
export function mountVault(canvas) {
  if (!(canvas instanceof HTMLCanvasElement)) throw new TypeError('mountVault expects a canvas');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
  } catch (cause) {
    const error = new Error('The Trace 3D vault requires WebGL.', { cause });
    error.name = 'VaultWebGLError';
    throw error;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.setClearColor(0xf5f8fd, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 50);
  const rig = new THREE.Group();
  scene.add(rig);
  const materials = [], geometries = [], textures = [];
  const material = opts => { const m = new THREE.MeshStandardMaterial(opts); materials.push(m); return m; };
  const geo = g => { geometries.push(g); return g; };
  const mesh = (g, m, parent = rig, x = 0, y = 0, z = 0) => {
    const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; parent.add(o); return o;
  };
  const box = (w, h, d, m, parent = rig, x = 0, y = 0, z = 0) => mesh(geo(new THREE.BoxGeometry(w, h, d)), m, parent, x, y, z);
  const cyl = (r, h, m, parent = rig, x = 0, y = 0, z = 0, n = 64) => {
    const o = mesh(geo(new THREE.CylinderGeometry(r, r, h, n)), m, parent, x, y, z);
    o.rotation.x = Math.PI / 2; return o;
  };
  const torus = (r, tube, m, parent = rig, x = 0, y = 0, z = 0, segments = 96) =>
    mesh(geo(new THREE.TorusGeometry(r, tube, 10, segments)), m, parent, x, y, z);

  // Stable, small brushed-metal roughness field. It is generated once, never per frame.
  const roughSize = 128;
  const roughBytes = new Uint8Array(roughSize * roughSize * 4);
  for (let y = 0; y < roughSize; y++) for (let x = 0; x < roughSize; x++) {
    const n = 177 + Math.sin(y * 7.17) * 5 + Math.sin(y * 1.31) * 3 + Math.sin(x * 8.41 + y * 7.39);
    const i = (y * roughSize + x) * 4; roughBytes[i] = roughBytes[i + 1] = roughBytes[i + 2] = n; roughBytes[i + 3] = 255;
  }
  const rough = new THREE.DataTexture(roughBytes, roughSize, roughSize, THREE.RGBAFormat);
  rough.wrapS = rough.wrapT = THREE.RepeatWrapping; rough.repeat.set(2, 10); rough.needsUpdate = true; textures.push(rough);
  const steel = material({ color: 0xb4c0cc, metalness: 0.94, roughness: 0.38, roughnessMap: rough });
  const rimSteel = material({ color: 0xe3ebf1, metalness: 0.98, roughness: 0.24 });
  const darkSteel = material({ color: 0x203b61, metalness: 0.88, roughness: 0.48, roughnessMap: rough });
  const bodySteel = material({ color: 0x8197ac, metalness: 0.92, roughness: 0.52, roughnessMap: rough });
  const frameSteel = material({ color: 0x123d78, metalness: 0.86, roughness: 0.43, roughnessMap: rough });
  const black = material({ color: 0x10223d, metalness: 0.35, roughness: 0.7 });
  const inner = material({ color: 0x5c4832, metalness: 0.7, roughness: 0.47 });
  const paper = material({ color: 0xebf4ff, metalness: 0.0, roughness: 0.9 });
  const folder = material({ color: 0x54779e, metalness: 0.16, roughness: 0.65 });
  const folder2 = material({ color: 0x94abc2, metalness: 0.08, roughness: 0.72 });
  const blue = material({ color: 0x1785ff, emissive: 0x0050dc, emissiveIntensity: 1.25, metalness: 0.35, roughness: 0.3 });
  const lamp = material({ color: 0xfff0ca, emissive: 0xffc260, emissiveIntensity: 2.2, roughness: 0.4 });
  const gold = material({ color: 0xe7ae38, metalness: 1, roughness: 0.19 });
  const floorMaterial = material({ color: 0xd5dfea, metalness: 0.35, roughness: 0.38 });
  const crystal = new THREE.MeshPhysicalMaterial({ color: 0xe0edff, metalness: 0.08, roughness: 0.055, transmission: 0.72, thickness: 0.35, ior: 2.1, clearcoat: 1, envMapIntensity: 1.9 });
  materials.push(crystal);

  // Reusable chamfered ingot, cut jewel and abstract paper-pack geometries.
  const ingotShape = new THREE.Shape();
  ingotShape.moveTo(-0.30, -0.155); ingotShape.lineTo(0.30, -0.155);
  ingotShape.lineTo(0.30, 0.155); ingotShape.lineTo(-0.30, 0.155); ingotShape.closePath();
  const ingotGeometry = geo(new THREE.ExtrudeGeometry(ingotShape, { depth: 0.18, steps: 1, bevelEnabled: true, bevelSegments: 1, bevelSize: 0.023, bevelThickness: 0.023 }));
  ingotGeometry.rotateX(-Math.PI / 2); ingotGeometry.translate(0, -0.09, 0);
  const ingotPos = ingotGeometry.getAttribute('position');
  for (let i = 0; i < ingotPos.count; i++) {
    const taper = 1 - clamp((ingotPos.getY(i) + 0.12) / 0.24) * 0.13;
    ingotPos.setX(i, ingotPos.getX(i) * taper); ingotPos.setZ(i, ingotPos.getZ(i) * taper);
  }
  ingotGeometry.computeVertexNormals();
  const gemPoints = [new THREE.Vector2(0.001, -0.27), new THREE.Vector2(0.215, 0.005), new THREE.Vector2(0.215, 0.05), new THREE.Vector2(0.105, 0.19), new THREE.Vector2(0, 0.19)];
  const crystalGeometry = geo(new THREE.LatheGeometry(gemPoints, 8).toNonIndexed());
  crystalGeometry.computeVertexNormals();
  const packGeometry = geo(new THREE.BoxGeometry(0.58, 0.125, 0.31));
  const bandGeometry = geo(new THREE.BoxGeometry(0.095, 0.142, 0.325));

  // Procedural softbox environment gives metal something real to reflect.
  const envScene = new THREE.Scene(); envScene.background = new THREE.Color(0x95a9bd);
  const envMaterials = [];
  const softbox = (w, h, color, intensity, x, y, z, rx = 0, ry = 0) => {
    const m = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide });
    m.color.multiplyScalar(intensity); envMaterials.push(m);
    const p = new THREE.Mesh(geo(new THREE.PlaneGeometry(w, h)), m);
    p.position.set(x, y, z); p.rotation.set(rx, ry, 0); envScene.add(p);
  };
  softbox(7, 4, 0xf0f7ff, 5.8, -4, 5, 3, Math.PI / 4, -Math.PI / 5);
  softbox(2.5, 7, 0xc9e4ff, 3.0, 4, 1, 2, 0, -Math.PI / 3);
  softbox(6, 2, 0xffffff, 3.8, 0, 1, 6, 0, Math.PI);
  softbox(6, 3, 0x9cb7d5, 1.5, -5, -2, 1, 0, Math.PI / 2);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTarget = pmrem.fromScene(envScene, 0.09, 0.1, 50); scene.environment = envTarget.texture;
  pmrem.dispose(); envMaterials.forEach(m => m.dispose());

  const hemi = new THREE.HemisphereLight(0xeaf1fa, 0x7f9ab8, 1.1); scene.add(hemi);
  const key = new THREE.DirectionalLight(0xf6faff, 3.8); key.position.set(-3, 5, 7); scene.add(key);
  key.castShadow = true; key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -7, right: 7, top: 6, bottom: -6, near: 0.5, far: 22 });
  key.shadow.bias = -0.0003; key.shadow.normalBias = 0.035;
  const edge = new THREE.DirectionalLight(0x98c9ff, 2.2); edge.position.set(4, 1, 1); scene.add(edge);
  const fill = new THREE.DirectionalLight(0xb4ccea, 1.2); fill.position.set(-5, -1, 3); scene.add(fill);

  // A genuinely open circular aperture extruded through a heavy rectangular facade.
  const frameShape = new THREE.Shape();
  const w = 2.27, h = 2.31, r = 0.16;
  frameShape.moveTo(-w + r, -h); frameShape.lineTo(w - r, -h); frameShape.quadraticCurveTo(w, -h, w, -h + r);
  frameShape.lineTo(w, h - r); frameShape.quadraticCurveTo(w, h, w - r, h);
  frameShape.lineTo(-w + r, h); frameShape.quadraticCurveTo(-w, h, -w, h - r);
  frameShape.lineTo(-w, -h + r); frameShape.quadraticCurveTo(-w, -h, -w + r, -h);
  const hole = new THREE.Path(); hole.absarc(0, 0, 1.67, 0, TAU, true); frameShape.holes.push(hole);
  const outer = mesh(geo(new THREE.ExtrudeGeometry(frameShape, { depth: 0.56, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: 0.045, bevelThickness: 0.045, curveSegments: 48 })), frameSteel);
  outer.position.z = -0.08;
  torus(1.704, 0.09, rimSteel, rig, 0, 0, 0.54);
  torus(1.81, 0.028, darkSteel, rig, 0, 0, 0.53);
  torus(1.68, 0.027, black, rig, 0, 0, 0.62);
  const tunnel = mesh(geo(new THREE.CylinderGeometry(1.655, 1.655, 0.77, 96, 1, true)), darkSteel, rig, 0, 0, 0.08);
  tunnel.rotation.x = Math.PI / 2;
  for (const x of [-2.02, 2.02]) for (const y of [-2.02, 2.02]) {
    cyl(0.085, 0.035, rimSteel, rig, x, y, 0.565, 6);
    box(0.068, 0.008, 0.007, black, rig, x, y, 0.588);
  }
  // Double engraved lines and foot bring scale to the structure without visual noise.
  for (const x of [-2.16, 2.16]) box(0.012, 3.62, 0.012, black, rig, x, 0, 0.53);
  box(4.76, 0.13, 1.05, darkSteel, rig, 0, -2.4, -0.04);

  // Hinge is on the right: it keeps the opening door away from the left-hand copy.
  const hinge = new THREE.Group(); hinge.position.set(1.75, 0, 0.52); rig.add(hinge);
  const door = new THREE.Group(); door.position.set(-1.75, 0, 0); hinge.add(door);
  cyl(1.595, 0.38, darkSteel, door, 0, 0, 0.02);
  cyl(1.565, 0.09, steel, door, 0, 0, 0.25);
  cyl(1.438, 0.06, bodySteel, door, 0, 0, 0.313);
  cyl(1.35, 0.025, steel, door, 0, 0, 0.36);
  torus(1.52, 0.027, rimSteel, door, 0, 0, 0.32);
  torus(1.38, 0.012, black, door, 0, 0, 0.385);
  torus(1.27, 0.008, darkSteel, door, 0, 0, 0.388);
  // Back face and lock carriage visible when the door swings open.
  cyl(1.47, 0.07, bodySteel, door, 0, 0, -0.21);
  torus(1.36, 0.025, rimSteel, door, 0, 0, -0.255);
  cyl(0.39, 0.18, darkSteel, door, 0, 0, -0.31);
  const bolts = [];
  for (let i = 0; i < 12; i++) {
    const a = i * TAU / 12;
    const assembly = new THREE.Group(); assembly.rotation.z = a; door.add(assembly);
    const bolt = cyl(0.068, 0.38, rimSteel, assembly, 1.51, 0, -0.015, 12);
    bolt.rotation.set(0, 0, Math.PI / 2); bolts.push(bolt);
    box(0.77, 0.055, 0.045, darkSteel, assembly, 0.88, 0, -0.285);
    cyl(0.038, 0.02, rimSteel, door, Math.cos(a) * 1.46, Math.sin(a) * 1.46, 0.357, 6);
  }
  // The central wheel has five solid spokes, bevel-like collars and a deep hub.
  const wheel = new THREE.Group(); wheel.position.set(0, -0.09, 0.49); door.add(wheel);
  cyl(0.235, 0.2, darkSteel, wheel, 0, 0, 0.03);
  cyl(0.157, 0.045, rimSteel, wheel, 0, 0, 0.155);
  torus(0.53, 0.043, darkSteel, wheel, 0, 0, 0.16, 72);
  for (let i = 0; i < 5; i++) {
    const spoke = new THREE.Group(); spoke.rotation.z = i * TAU / 5 + Math.PI / 2; wheel.add(spoke);
    const bar = box(0.43, 0.062, 0.074, darkSteel, spoke, 0.34, 0, 0.16); bar.rotation.z = 0.06;
    const cap = cyl(0.058, 0.078, darkSteel, spoke, 0.575, 0, 0.16, 16); cap.rotation.x = 0;
  }
  // Mechanical combination dial, tiny indices readable as detail rather than UI text.
  cyl(0.17, 0.065, darkSteel, door, 0, 0.82, 0.42);
  cyl(0.13, 0.025, rimSteel, door, 0, 0.82, 0.465);
  cyl(0.105, 0.016, black, door, 0, 0.82, 0.487);
  for (let i = 0; i < 24; i++) {
    const a = i * TAU / 24;
    const tick = box(i % 3 === 0 ? 0.026 : 0.017, 0.004, 0.003, paper, door, Math.cos(a) * 0.12, 0.82 + Math.sin(a) * 0.12, 0.484);
    tick.rotation.z = a;
  }
  box(0.02, 0.035, 0.012, blue, door, 0, 1.025, 0.422);
  // Hinges are fixed to the frame, not floating on the rotating leaf.
  for (const y of [-1.06, 1.06]) {
    box(0.49, 0.34, 0.23, darkSteel, rig, 1.84, y, 0.64);
    const joint = cyl(0.12, 0.52, steel, rig, 1.75, y, 0.63, 32); joint.rotation.x = 0;
    const topCap = cyl(0.14, 0.04, rimSteel, rig, 1.75, y + 0.27, 0.63, 32); topCap.rotation.x = 0;
  }

  // Warm interior; tangible assets are an editorial metaphor, never bank data.
  box(3.12, 3.2, 0.09, inner, rig, 0, 0, -2.64);
  box(0.085, 3.2, 2.66, inner, rig, -1.58, 0, -1.3);
  box(0.085, 3.2, 2.66, inner, rig, 1.58, 0, -1.3);
  box(3.2, 0.08, 2.8, inner, rig, 0, -1.62, -1.29);
  box(3.2, 0.08, 2.8, inner, rig, 0, 1.62, -1.29);
  for (const y of [-0.79, 0.12, 1.03]) {
    box(2.93, 0.07, 1.16, bodySteel, rig, 0, y, -1.89);
    box(2.95, 0.045, 0.045, rimSteel, rig, 0, y - 0.01, -1.29);
  }
  for (let row = 0; row < 1; row++) for (let i = 0; i < 5; i++) {
    const x = -1.25 + i * 0.235;
    const y = -0.745 + row * 0.91;
    const height = 0.63 + Math.sin(i * 2.4 + row) * 0.065;
    const f = new THREE.Group(); f.position.set(x, y, -1.91); f.rotation.z = i === 8 ? -0.055 : 0; rig.add(f);
    box(0.155, height, 0.64, i % 3 ? folder : folder2, f, 0, height / 2, 0);
    box(0.092, 0.18, 0.007, paper, f, 0, height * 0.66, 0.324);
    for (let line = 0; line < 3; line++) box(0.065 - line * 0.009, 0.009, 0.009, darkSteel, f, 0, height * 0.66 + 0.035 - line * 0.03, 0.33);
    cyl(0.019, 0.012, black, f, 0, 0.105, 0.334, 12);
  }
  for (let shelf = 0; shelf < 2; shelf++) for (let row = 0; row < 2; row++) for (let i = 0; i < 5; i++) {
    const bar = mesh(ingotGeometry, gold, rig, -1.06 + i * 0.49, 0.28 + shelf * 0.91 + row * 0.22, -1.93);
    bar.scale.set(0.72, 1, 1.35); bar.rotation.y = -0.035 + i * 0.016;
  }
  // Lower shelf: deliberate stacks of pale paper, with binding strips.
  for (let i = 0; i < 4; i++) {
    const x = -1.02 + i * 0.67;
    box(0.5, 0.21 + (i % 2) * 0.07, 0.7, paper, rig, x, -1.43, -1.9);
    box(0.055, 0.235 + (i % 2) * 0.07, 0.715, folder, rig, x + 0.11, -1.43, -1.9);
    for (let n = 0; n < 4; n++) box(0.49, 0.007, 0.008, folder2, rig, x, -1.5 + n * 0.037, -1.544);
  }
  for (const x of [-1.48, 1.48]) box(0.025, 0.025, 2.16, lamp, rig, x, 1.48, -1.4);
  box(2.8, 0.025, 0.035, lamp, rig, 0, 1.48, -2.48);
  const innerLight = new THREE.PointLight(0xffd08a, 10, 5, 2); innerLight.position.set(0, 1.0, -0.7); rig.add(innerLight);
  const deepLight = new THREE.PointLight(0xffad45, 4, 4, 2); deepLight.position.set(0, -0.4, -2.1); rig.add(deepLight);

  // Foundation and a subtle contact pool keep the product out of a floating void.
  box(6.3, 0.06, 8.1, floorMaterial, rig, 0, -2.51, 0.35);
  const poolGeo = geo(new THREE.PlaneGeometry(7.0, 7.5));
  const poolMaterial = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { opacity: { value: 0.42 } },
    vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: 'varying vec2 vUv; uniform float opacity; void main(){float r=length((vUv-.5)*vec2(1.,1.4));float a=(1.-smoothstep(.12,.5,r))*opacity;gl_FragColor=vec4(.05,.15,.3,a);}'
  }); materials.push(poolMaterial);
  const pool = mesh(poolGeo, poolMaterial, rig, 0, -2.465, 0.5); pool.rotation.x = -Math.PI / 2;

  // Bake static pieces by material: hundreds of binders/fasteners become ~30 calls.
  // Animated groups remain independent and keep their physically meaningful pivots.
  const batchStatic = (root, excluded) => {
    scene.updateMatrixWorld(true);
    const inverse = root.matrixWorld.clone().invert(), batches = new Map();
    const visit = node => {
      if (excluded.has(node)) return;
      if (node.isMesh && !Array.isArray(node.material)) {
        const list = batches.get(node.material) || [];
        list.push(node); batches.set(node.material, list);
      }
      [...node.children].forEach(visit);
    };
    [...root.children].forEach(visit);
    batches.forEach((items, mat) => {
      if (items.length < 2) return;
      const transformed = items.map(item => {
        const g = item.geometry.index ? item.geometry.toNonIndexed() : item.geometry.clone();
        g.applyMatrix4(inverse.clone().multiply(item.matrixWorld)); return g;
      });
      const merged = new THREE.BufferGeometry();
      for (const name of ['position', 'normal', 'uv']) {
        if (!transformed.every(g => g.getAttribute(name))) continue;
        const itemSize = transformed[0].getAttribute(name).itemSize;
        const length = transformed.reduce((n, g) => n + g.getAttribute(name).array.length, 0);
        const data = new Float32Array(length); let offset = 0;
        transformed.forEach(g => { const a = g.getAttribute(name).array; data.set(a, offset); offset += a.length; });
        merged.setAttribute(name, new THREE.BufferAttribute(data, itemSize));
      }
      merged.computeBoundingSphere(); transformed.forEach(g => g.dispose());
      items.forEach(item => item.removeFromParent()); mesh(geo(merged), mat, root);
    });
  };
  batchStatic(rig, new Set([hinge]));
  batchStatic(door, new Set([wheel, ...bolts]));
  batchStatic(wheel, new Set());

  // The cascade is a pure function of scroll progress. Each class shares geometry
  // and material in a single draw call; reversing the scroll rewinds every object.
  const instances = (g, m, count) => {
    const out = new THREE.InstancedMesh(g, m, count);
    out.instanceMatrix.setUsage(THREE.DynamicDrawUsage); out.frustumCulled = false;
    out.castShadow = m !== crystal; out.receiveShadow = true; rig.add(out); return out;
  };
  const goldFall = instances(ingotGeometry, gold, 28);
  const crystalFall = instances(crystalGeometry, crystal, 12);
  const paperFall = instances(packGeometry, paper, 8);
  const bandFall = instances(bandGeometry, darkSteel, 8);
  const seed = n => { const a = Math.sin(n * 78.233 + 12.147) * 43758.5453; return a - Math.floor(a); };
  const actors = [];
  for (let i = 0; i < 48; i++) {
    const kind = i < 28 ? 'gold' : i < 40 ? 'gem' : 'paper';
    const index = kind === 'gold' ? i : kind === 'gem' ? i - 28 : i - 40;
    const row = Math.floor(index / 7), col = index % 7;
    const endX = kind === 'gold' ? -1.42 + col * 0.43 + (seed(i + 21) - 0.5) * 0.15 : (seed(i + 17) - 0.5) * 3.5;
    const endZ = kind === 'gold' ? 1.05 + row * 0.53 + seed(i + 6) * 0.24 : 1.1 + seed(i + 26) * 2.45;
    actors.push({ kind, index, delay: 0.60 + seed(i + 1) * 0.16, duration: 0.17 + seed(i + 9) * 0.065,
      startX: (seed(i + 3) - 0.5) * 1.35, startY: -0.20 + seed(i + 7) * 1.05,
      endX, endZ, restY: -2.43 + (kind === 'gem' ? 0.13 : kind === 'paper' ? 0.035 : 0.09) + (kind === 'gold' && index > 20 ? 0.18 : 0),
      finalY: (seed(i + 13) - 0.5) * Math.PI * 1.6, finalZ: (seed(i + 12) - 0.5) * (kind === 'gem' ? 1.6 : 0.18),
      turns: 1.25 + seed(i + 18) * 2, scale: kind === 'gem' ? 0.8 + seed(i + 31) * 0.55 : 0.85 + seed(i + 32) * 0.23 });
  }
  const proxy = new THREE.Object3D();
  const updateWealth = p => {
    for (const actor of actors) {
      const t = clamp((p - actor.delay) / actor.duration);
      const flight = clamp(t / 0.74), landing = clamp((t - 0.74) / 0.26);
      const active = p >= actor.delay;
      const bounce = Math.abs(Math.sin(landing * Math.PI * 2)) * (1 - landing) * 0.14;
      const x = THREE.MathUtils.lerp(actor.startX, actor.endX, flight);
      const z = THREE.MathUtils.lerp(-0.42, actor.endZ, flight);
      const y = THREE.MathUtils.lerp(actor.startY, actor.restY, flight) + Math.sin(Math.PI * flight) * (0.6 + actor.scale * 0.2) + bounce;
      proxy.position.set(x, y, z);
      proxy.rotation.set((1 - flight) * actor.turns * Math.PI, actor.finalY + (1 - flight) * actor.turns * Math.PI, actor.finalZ + (1 - flight) * 2.2);
      proxy.scale.setScalar(active ? actor.scale : 0); proxy.updateMatrix();
      const batch = actor.kind === 'gold' ? goldFall : actor.kind === 'gem' ? crystalFall : paperFall;
      batch.setMatrixAt(actor.index, proxy.matrix);
      if (actor.kind === 'paper') bandFall.setMatrixAt(actor.index, proxy.matrix);
    }
    [goldFall, crystalFall, paperFall, bandFall].forEach(batch => { batch.instanceMatrix.needsUpdate = true; batch.visible = p >= 0.60; });
  };

  let width = 0, height = 0, progress = 0, target = 0, raf = 0, alive = true, visible = true;
  let last = 0;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const look = new THREE.Vector3();
  const apply = p => {
    const unlock = phase(p, 0.025, 0.30);
    const opening = phase(p, 0.30, 0.62);
    const enter = phase(p, 0.60, 1.0);
    wheel.rotation.z = -unlock * Math.PI * 3;
    bolts.forEach(b => { b.position.x = 1.51 - unlock * 0.21; });
    hinge.rotation.y = opening * 1.74;
    hinge.position.z = 0.52 + phase(p, 0.26, 0.38) * 0.08;
    innerLight.intensity = 1.5 + opening * 4.5;
    deepLight.intensity = 1 + opening * 2;
    updateWealth(p);
    const aspect = width / Math.max(1, height);
    const narrow = aspect < 0.9;
    const medium = aspect >= 0.9 && aspect < 1.4;
    // Wider canvases reserve the left ~42% for editorial copy.
    rig.scale.setScalar(narrow ? 0.84 - enter * 0.045 : 1);
    rig.position.set(narrow ? 0.05 - opening * 0.32 : medium ? 0.55 - opening * 0.24 : 1.4 - opening * 0.20, narrow ? -0.73 + enter * 0.28 : 0.02, 0);
    rig.rotation.y = narrow ? -0.075 : -0.16;
    const distance = narrow ? Math.max(13.5, 8.1 / aspect) + opening * 1.4 + enter * 0.8 : medium ? 12.2 + enter * 1.6 : 11.0 + enter * 2.2;
    camera.position.set(0.3 - enter * 0.08, 1.25 + enter * 1.15, distance);
    look.set(narrow ? 0 : medium ? -0.15 : -0.8, narrow ? 0.07 - enter * 0.2 : 0.1 - enter * 0.4, -0.25 + enter * 0.15);
    camera.lookAt(look);
  };
  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    width = Math.max(1, rect.width); height = Math.max(1, rect.height);
    renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix();
    requestRender();
  };
  const frame = now => {
    raf = 0; if (!alive || !visible || document.hidden) return;
    const dt = last ? Math.min((now - last) / 1000, 0.05) : 1 / 60; last = now;
    progress = reduced.matches ? target : progress + (target - progress) * (1 - Math.exp(-dt * 9));
    if (Math.abs(target - progress) < 0.00008) progress = target;
    apply(progress); renderer.render(scene, camera);
    if (progress !== target) raf = requestAnimationFrame(frame);
  };
  function requestRender() { if (alive && visible && !document.hidden && !raf) { last = 0; raf = requestAnimationFrame(frame); } }
  const observer = new ResizeObserver(resize); observer.observe(canvas);
  const intersection = new IntersectionObserver(entries => {
    visible = entries[0]?.isIntersecting ?? true;
    if (visible) requestRender(); else if (raf) { cancelAnimationFrame(raf); raf = 0; }
  }, { rootMargin: '80px' }); intersection.observe(canvas);
  const onVisibility = () => { if (!document.hidden) requestRender(); else if (raf) { cancelAnimationFrame(raf); raf = 0; } };
  document.addEventListener('visibilitychange', onVisibility);
  const onMotion = () => requestRender(); reduced.addEventListener('change', onMotion);
  const onContextLost = event => { event.preventDefault(); canvas.dataset.vaultError = 'context-lost'; };
  const onContextRestored = () => { delete canvas.dataset.vaultError; requestRender(); };
  canvas.addEventListener('webglcontextlost', onContextLost);
  canvas.addEventListener('webglcontextrestored', onContextRestored);
  resize();

  return {
    setProgress(p) { if (!alive) return; target = clamp(Number(p) || 0); requestRender(); },
    renderAt(p) { if (!alive) return; progress = target = clamp(Number(p) || 0); apply(progress); renderer.render(scene, camera); },
    getStats() { return { drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, pixelRatio: renderer.getPixelRatio(), progress }; },
    destroy() {
      if (!alive) return; alive = false; if (raf) cancelAnimationFrame(raf);
      observer.disconnect(); intersection.disconnect(); document.removeEventListener('visibilitychange', onVisibility);
      reduced.removeEventListener('change', onMotion); canvas.removeEventListener('webglcontextlost', onContextLost);
      canvas.removeEventListener('webglcontextrestored', onContextRestored);
      [goldFall, crystalFall, paperFall, bandFall].forEach(batch => batch.dispose());
      geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose());
      envTarget.dispose(); renderer.dispose();
    }
  };
}
