/* Video Edit studio — local Three.js, no build step or network dependencies. */
(() => {
  'use strict';
  const host = document.getElementById('studio-scene');
  const canvas = document.getElementById('studio-canvas');
  const fallback = document.getElementById('scene-fallback');
  if (!host || !canvas) return;
  canvas.setAttribute('aria-hidden', 'true');

  const noScene = () => {
    host.classList.add('scene-unavailable');
    host.classList.remove('scene-ready');
    canvas.style.display = 'none';
    if (fallback) { fallback.hidden = false; fallback.style.display = ''; }
  };
  if (!window.THREE) { noScene(); return; }
  const T = window.THREE;
  let renderer;
  try {
    renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch (_) { noScene(); return; }

  const palette = { ink: 0x173d5d, blue: 0x328ccc, lilac: 0x9fd8f3, coral: 0x59b6dc, cream: 0xffffff, silver: 0xdeeffb };
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(31, 1, 0.1, 60);
  const cameraTarget = new T.Vector3(-0.22, 0.79, 0);
  camera.position.set(5.4, 6.1, 10.9);
  camera.lookAt(cameraTarget);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.outputEncoding = T.sRGBEncoding;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.9;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.setClearColor(0x000000, 0);

  const stage = new T.Group();
  scene.add(stage);
  const resources = new Set();
  const own = resource => { resources.add(resource); return resource; };
  const material = (color, extra = {}) => {
    const mat = own(new T.MeshStandardMaterial({ color, roughness: 0.48, metalness: 0.05, envMapIntensity: 0.56, ...extra }));
    // r128 predates automatic ColorManagement: authoring colors are sRGB,
    // whereas PBR lighting expects linear colors. Explicit conversion retains
    // the fresh blue palette under the studio softboxes.
    mat.color.convertSRGBToLinear();
    return mat;
  };
  const cream = material(palette.cream, { roughness: 0.4 });
  const blue = material(palette.blue, { roughness: 0.34, metalness: 0.18 });
  const ink = material(palette.ink, { roughness: 0.48 });
  const coral = material(palette.coral, { roughness: 0.37 });
  const rubber = material(0x173d5d, { roughness: 0.86 });
  const lavender = material(0x9fd8f3, { roughness: 0.42, metalness: 0.1 });
  const silver = material(palette.silver, { roughness: 0.28, metalness: 0.7 });
  const brightSilver = material(0xf3f9ff, { roughness: 0.2, metalness: 0.78 });
  const darkSilver = material(0x456b87, { roughness: 0.4, metalness: 0.6 });
  const paper = material(0xffffff, { roughness: 0.95, side: T.DoubleSide });

  function mesh(geometry, mat, parent, position) {
    const m = new T.Mesh(geometry, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    if (position) m.position.set(...position);
    parent.add(m);
    return m;
  }
  const geometryCache = new Map();
  function roundedGeometry(w, h, d, radius = 0.06) {
    const key = [w, h, d, radius].join(':');
    if (geometryCache.has(key)) return geometryCache.get(key);
    const bevel = Math.min(radius * 0.46, d * 0.35, h * 0.12, w * 0.12);
    const x = -w / 2 + bevel, y = -h / 2 + bevel;
    const width = w - bevel * 2, height = h - bevel * 2;
    const r = Math.min(radius, width / 2 - 0.001, height / 2 - 0.001);
    const s = new T.Shape();
    s.moveTo(x + r, y);
    s.lineTo(x + width - r, y); s.quadraticCurveTo(x + width, y, x + width, y + r);
    s.lineTo(x + width, y + height - r); s.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    s.lineTo(x + r, y + height); s.quadraticCurveTo(x, y + height, x, y + height - r);
    s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
    const geo = own(new T.ExtrudeGeometry(s, { depth: Math.max(0.001, d - bevel * 2), bevelEnabled: true, bevelSegments: 3, steps: 1, bevelSize: bevel, bevelThickness: bevel, curveSegments: 8 }));
    geo.translate(0, 0, -d / 2 + bevel);
    geo.computeVertexNormals();
    geometryCache.set(key, geo);
    return geo;
  }
  function box(parent, w, h, d, mat, position = [0, 0, 0], radius = 0.06) {
    return mesh(roundedGeometry(w, h, d, radius), mat, parent, position);
  }
  function cylinder(parent, radius, height, mat, position, axis = 'y', radiusTop = radius, segments = 40) {
    const key = ['c', radius, height, radiusTop, segments].join(':');
    let geo = geometryCache.get(key);
    if (!geo) { geo = own(new T.CylinderGeometry(radiusTop, radius, height, segments)); geometryCache.set(key, geo); }
    const m = mesh(geo, mat, parent, position);
    if (axis === 'z') m.rotation.x = Math.PI / 2;
    if (axis === 'x') m.rotation.z = Math.PI / 2;
    return m;
  }
  function torus(parent, r, tube, mat, position) {
    return mesh(own(new T.TorusGeometry(r, tube, 10, 48)), mat, parent, position);
  }
  function textureFrom(draw, w = 1024, h = 512) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const tex = own(new T.CanvasTexture(c));
    tex.encoding = T.sRGBEncoding;
    tex.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
    return tex;
  }
  function label(parent, texture, w, h, position, extra = {}) {
    const mat = own(new T.MeshStandardMaterial({ map: texture, transparent: true, roughness: 0.72, metalness: 0, envMapIntensity: 0.4, ...extra }));
    const m = mesh(own(new T.PlaneGeometry(w, h)), mat, parent, position);
    m.castShadow = false;
    return m;
  }
  function screw(parent, x, y, z, mat = brightSilver) {
    cylinder(parent, 0.037, 0.015, mat, [x, y, z], 'z', 0.037, 16);
    const slot = box(parent, 0.038, 0.006, 0.004, darkSilver, [x, y, z + 0.009], 0.001);
    slot.rotation.z = 0.7;
  }

  // Procedural studio softboxes give the metal a reflected shape, without a remote HDRI.
  const environment = textureFrom((ctx, w, h) => {
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#9fd8f3'); sky.addColorStop(0.38, '#ffffff'); sky.addColorStop(0.58, '#deeffb'); sky.addColorStop(1, '#a5c4d9');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(w * 0.1, h * 0.16, w * 0.18, h * 0.23);
    ctx.fillStyle = '#f3f9ff'; ctx.fillRect(w * 0.65, h * 0.12, w * 0.22, h * 0.3);
    ctx.fillStyle = '#9fd8f3'; ctx.fillRect(w * 0.43, h * 0.35, w * 0.08, h * 0.2);
  }, 512, 256);
  environment.mapping = T.EquirectangularReflectionMapping;
  const pmrem = new T.PMREMGenerator(renderer);
  const environmentTarget = pmrem.fromEquirectangular(environment);
  scene.environment = environmentTarget.texture;
  pmrem.dispose();

  scene.add(new T.HemisphereLight(0xffffff, 0x8bbbd8, 0.52));
  const keyLight = new T.DirectionalLight(0xffffff, 1.25);
  keyLight.position.set(-3, 8, 7);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(1024, 1024);
  Object.assign(keyLight.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 0.1, far: 24 });
  keyLight.shadow.normalBias = 0.025;
  keyLight.shadow.bias = -0.0002;
  keyLight.shadow.radius = 4;
  scene.add(keyLight);
  const fillLight = new T.DirectionalLight(0xdeeffb, 0.48);
  fillLight.position.set(6, 3, -4); scene.add(fillLight);
  const rimLight = new T.PointLight(0x9fd8f3, 0.3, 20);
  rimLight.position.set(-5, 3, -3); scene.add(rimLight);
  const ground = mesh(own(new T.PlaneGeometry(200, 200)), own(new T.ShadowMaterial({ color: 0x173d5d, opacity: 0.11 })), scene, [0, -0.08, 0]);
  ground.rotation.x = -Math.PI / 2; ground.castShadow = false;

  const contactTexture = textureFrom((ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(23,61,93,.24)'); g.addColorStop(0.4, 'rgba(23,61,93,.14)'); g.addColorStop(1, 'rgba(23,61,93,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  }, 128, 128);
  function contact(x, z, w, d) {
    const m = mesh(own(new T.PlaneGeometry(w, d)), own(new T.MeshBasicMaterial({ map: contactTexture, transparent: true, depthWrite: false, opacity: 0.8 })), stage, [x, -0.065, z]);
    m.rotation.x = -Math.PI / 2; m.castShadow = false; m.receiveShadow = false;
  }

  const objects = [];
  function interactive(group, category, baseY) {
    group.userData.category = category;
    group.userData.baseY = baseY;
    group.userData.lift = 0;
    group.userData.velocity = 0;
    group.userData.baseRotation = group.rotation.clone();
    group.traverse(child => { if (child.isMesh) child.userData.category = category; });
    objects.push(group); stage.add(group);
  }

  // A tactile C-60 cassette: moulded shell, inset label, separate spools and screws.
  const cassette = new T.Group();
  box(cassette, 3.65, 2.24, 0.29, lavender, [0, 0, 0], 0.18);
  box(cassette, 3.52, 2.10, 0.035, blue, [0, 0, -0.16], 0.15);
  box(cassette, 3.31, 1.62, 0.027, lavender, [0, 0.16, 0.16], 0.13);
  const cassetteLabel = textureFrom((ctx, w, h) => {
    ctx.fillStyle = '#deeffb'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#328ccc'; ctx.fillRect(0, 0, w, 148);
    ctx.fillStyle = '#ffffff'; ctx.font = '900 68px Arial'; ctx.fillText('Video Edit', 40, 110);
    ctx.font = 'bold 27px monospace'; ctx.fillText('原创', 488, 68); ctx.fillText('STEREO · VOL.01', 488, 108);
    ctx.fillStyle = '#59b6dc'; ctx.fillRect(0, 150, w, 21);
    ctx.fillStyle = '#173d5d'; ctx.font = 'bold 30px monospace'; ctx.fillText('A', 41, 247);
    ctx.font = '20px monospace'; ctx.fillText('HIGH POSITION', 42, 438);
    ctx.font = 'bold 42px monospace'; ctx.fillText('60', w - 115, 445);
    ctx.fillStyle = '#59b6dc'; ctx.fillRect(40, 465, w - 80, 7);
    for (let i = 0; i < 9; i++) { ctx.fillStyle = i % 2 ? '#59b6dc' : '#328ccc'; ctx.fillRect(645 + i * 22, 405, 13, 30); }
  }, 1024, 512);
  label(cassette, cassetteLabel, 3.22, 1.55, [0, 0.16, 0.178]);
  box(cassette, 2.76, 0.65, 0.036, ink, [0, 0.01, 0.201], 0.3);
  box(cassette, 0.72, 0.38, 0.02, material(0x59b6dc, { roughness: 0.16, metalness: 0.25 }), [0, 0.01, 0.225], 0.04);
  box(cassette, 0.56, 0.08, 0.012, rubber, [0, 0.01, 0.241], 0.02);
  for (let i = 0; i < 6; i++) box(cassette, 0.009, 0.25, 0.01, lavender, [-0.23 + i * 0.092, 0.01, 0.243], 0.001);
  const reels = [];
  for (const x of [-0.91, 0.91]) {
    cylinder(cassette, 0.28, 0.018, rubber, [x, 0.01, 0.224], 'z');
    const reel = new T.Group(); reel.position.set(x, 0.01, 0.241); cassette.add(reel);
    torus(reel, 0.184, 0.035, cream, [0, 0, 0]);
    for (let k = 0; k < 6; k++) {
      const angle = k * Math.PI / 3;
      const tooth = box(reel, 0.09, 0.054, 0.025, cream, [Math.cos(angle) * 0.159, Math.sin(angle) * 0.159, 0.002], 0.006);
      tooth.rotation.z = angle;
    }
    reels.push(reel);
  }
  box(cassette, 2.22, 0.34, 0.035, lavender, [0, -0.84, 0.17], 0.08);
  for (const x of [-1.55, 1.55]) for (const y of [-0.91, 0.92]) screw(cassette, x, y, 0.167);
  for (const x of [-0.81, 0.81]) cylinder(cassette, 0.07, 0.025, ink, [x, -0.84, 0.195], 'z', 0.07, 20);
  for (const x of [-0.45, 0.45]) box(cassette, 0.19, 0.09, 0.025, ink, [x, -0.84, 0.194], 0.02);
  cassette.position.set(0.5, 1.05, 1.7);
  cassette.rotation.set(-0.52, -0.2, -0.15);
  interactive(cassette, 'original', 1.05);
  contact(0.5, 1.6, 4.5, 2.3);

  // An old mechanical typewriter, with a real keyboard deck and a paper carriage.
  const typewriter = new T.Group();
  const machineBase = material(0xdeeffb, { roughness: 0.42, metalness: 0.14 });
  box(typewriter, 2.95, 0.52, 2.12, machineBase, [0, 0.28, 0.03], 0.18);
  box(typewriter, 2.82, 0.16, 2.0, darkSilver, [0, 0.07, 0.03], 0.12);
  box(typewriter, 2.62, 0.16, 1.3, ink, [0, 0.58, 0.4], 0.13).rotation.x = -0.11;
  box(typewriter, 2.77, 0.6, 0.68, cream, [0, 0.73, -0.62], 0.18);
  const keyTop = material(0xffffff, { roughness: 0.32 });
  const keyLetters = textureFrom((ctx, w, h) => {
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#173d5d'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = 'bold 49px monospace';
    'QWERTYUIOPASDFGHJKLZXCVBNM'.split('').forEach((char, i) => ctx.fillText(char, (i % 10) * 64 + 32, Math.floor(i / 10) * 64 + 34));
  }, 640, 192);
  const keyMaterialCache = [];
  for (let row = 0; row < 3; row++) {
    const count = row === 0 ? 10 : row === 1 ? 9 : 7;
    for (let col = 0; col < count; col++) {
      const x = (col - (count - 1) / 2) * 0.246;
      const z = -0.05 + row * 0.29;
      const y = 0.73 - row * 0.032;
      cylinder(typewriter, 0.103, 0.075, brightSilver, [x, y, z], 'y', 0.097, 20);
      cylinder(typewriter, 0.079, 0.017, keyTop, [x, y + 0.046, z], 'y', 0.079, 20);
      // Atlas slices avoid generating a new canvas for every mechanical key.
      const index = (row === 0 ? 0 : row === 1 ? 10 : 19) + col;
      const keyTex = own(keyLetters.clone()); keyTex.needsUpdate = true;
      keyTex.repeat.set(0.1, 1 / 3); keyTex.offset.set((index % 10) / 10, 1 - (Math.floor(index / 10) + 1) / 3);
      const glyph = label(typewriter, keyTex, 0.101, 0.101, [x, y + 0.056, z]);
      glyph.rotation.x = -Math.PI / 2;
      keyMaterialCache.push(glyph.material);
    }
  }
  const spaceBar = box(typewriter, 1.43, 0.1, 0.17, coral, [0, 0.642, 0.94], 0.07);
  box(typewriter, 0.38, 0.075, 0.17, cream, [-1.04, 0.64, 0.94], 0.05);
  box(typewriter, 0.38, 0.075, 0.17, cream, [1.04, 0.64, 0.94], 0.05);
  cylinder(typewriter, 0.19, 2.95, rubber, [0, 1.04, -0.74], 'x');
  cylinder(typewriter, 0.045, 3.35, brightSilver, [0, 1.04, -0.74], 'x');
  for (const x of [-1.65, 1.65]) {
    cylinder(typewriter, 0.21, 0.14, ink, [x, 1.04, -0.74], 'x');
    cylinder(typewriter, 0.135, 0.151, cream, [x, 1.04, -0.74], 'x');
  }
  box(typewriter, 2.34, 0.045, 0.06, brightSilver, [0, 1.14, -0.63], 0.015);
  box(typewriter, 0.065, 0.28, 0.06, brightSilver, [-1.3, 1.22, -0.67], 0.015);
  box(typewriter, 0.64, 0.04, 0.08, brightSilver, [-1.57, 1.37, -0.67], 0.025);
  box(typewriter, 0.28, 0.095, 0.13, ink, [-1.82, 1.36, -0.67], 0.035);
  const sheet = new T.Group(); sheet.position.set(0, 1.65, -0.88); sheet.rotation.x = -0.14;
  typewriter.add(sheet);
  box(sheet, 1.98, 1.52, 0.016, paper, [0, 0, 0], 0.014);
  const pageTexture = textureFrom((ctx, w, h) => {
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#deeffb'; ctx.fillRect(62, 50, 2, h - 80);
    ctx.fillStyle = '#328ccc'; ctx.font = 'bold 58px monospace'; ctx.fillText('Video Edit', 89, 209);
    ctx.fillStyle = '#59b6dc'; ctx.fillRect(94, 243, 114, 6);
    ctx.fillStyle = '#173d5d'; ctx.font = '20px monospace'; ctx.fillText('PV · Motion · VJ', 94, 313);
    ctx.fillStyle = '#9fd8f3'; for (let i = 0; i < 3; i++) ctx.fillRect(94, 397 + i * 26, 290 - i * 40, 3);
  }, 512, 512);
  label(sheet, pageTexture, 1.95, 1.5, [0, 0, 0.012]);
  const brandTexture = textureFrom((ctx, w, h) => {
    ctx.fillStyle = '#328ccc'; ctx.font = 'bold 39px monospace'; ctx.textAlign = 'center'; ctx.fillText('Video Edit', w / 2, 67);
  }, 512, 100);
  label(typewriter, brandTexture, 1.44, 0.28, [0, 0.7, -0.266]);
  typewriter.position.set(-3.15, 0.03, -0.32);
  typewriter.rotation.y = 0.34;
  typewriter.scale.setScalar(0.9);
  interactive(typewriter, 'commission', 0.03);
  contact(-3.15, -0.3, 4.0, 3.0);

  // MiniDV camcorder: brushed body, multi-ring optics, flip-out LCD, strap and REC lamp.
  const dv = new T.Group();
  box(dv, 1.3, 1.02, 2.0, silver, [0, 0, 0], 0.23);
  box(dv, 1.34, 0.22, 1.72, darkSilver, [0, -0.42, -0.08], 0.09);
  box(dv, 1.15, 0.15, 1.58, brightSilver, [0, 0.53, -0.08], 0.08);
  box(dv, 0.42, 0.16, 0.86, rubber, [0, 0.66, -0.27], 0.08);
  box(dv, 0.21, 0.07, 0.42, darkSilver, [0.39, 0.65, -0.26], 0.04);
  cylinder(dv, 0.065, 0.036, coral, [0.39, 0.697, 0.06], 'y', 0.065, 24);
  box(dv, 0.7, 0.74, 0.26, rubber, [0.06, -0.02, -1.06], 0.12);
  box(dv, 0.45, 0.28, 0.55, darkSilver, [0.1, 0.5, -0.94], 0.1);
  box(dv, 0.42, 0.25, 0.1, rubber, [0.1, 0.5, -1.24], 0.08);
  for (let k = 0; k < 7; k++) box(dv, 0.008, 0.055, 0.74, darkSilver, [0.659, -0.12 + k * 0.055, 0.1], 0.003);
  const strap = box(dv, 0.09, 0.37, 1.29, rubber, [0.78, -0.02, -0.11], 0.11);
  strap.rotation.z = -0.12;
  for (const z of [-0.72, 0.5]) box(dv, 0.14, 0.42, 0.1, darkSilver, [0.69, -0.02, z], 0.025);
  cylinder(dv, 0.5, 0.53, darkSilver, [0, 0, 1.1], 'z');
  cylinder(dv, 0.51, 0.15, rubber, [0, 0, 1.35], 'z');
  for (let k = 0; k < 36; k++) {
    const a = k * Math.PI * 2 / 36;
    const rib = box(dv, 0.027, 0.056, 0.14, darkSilver, [Math.cos(a) * 0.501, Math.sin(a) * 0.501, 1.35], 0.005);
    rib.rotation.z = a;
  }
  cylinder(dv, 0.465, 0.055, brightSilver, [0, 0, 1.444], 'z');
  cylinder(dv, 0.416, 0.062, ink, [0, 0, 1.478], 'z');
  torus(dv, 0.354, 0.017, darkSilver, [0, 0, 1.512]);
  cylinder(dv, 0.319, 0.04, material(0x0d2336, { roughness: 0.08, metalness: 0.9 }), [0, 0, 1.51], 'z');
  torus(dv, 0.272, 0.015, material(0x328ccc, { metalness: 0.75, roughness: 0.1 }), [0, 0, 1.539]);
  cylinder(dv, 0.225, 0.02, material(0x132d42, { metalness: 0.83, roughness: 0.05 }), [0, 0, 1.542], 'z');
  const gleam = mesh(own(new T.SphereGeometry(0.07, 16, 12)), material(0xa4cadf, { emissive: 0x5d879a, emissiveIntensity: 0.4, roughness: 0.1 }), dv, [-0.1, 0.1, 1.56]);
  gleam.scale.set(1, 0.47, 0.13); gleam.rotation.z = -0.5;
  cylinder(dv, 0.043, 0.03, material(palette.coral, { emissive: palette.coral, emissiveIntensity: 0.65 }), [0.47, 0.35, 1.017], 'z', 0.043, 16);
  const dvBrand = textureFrom((ctx, w, h) => {
    ctx.fillStyle = '#173d5d'; ctx.font = 'bold 42px Arial'; ctx.fillText('Video Edit', 28, 66);
    ctx.font = '22px monospace'; ctx.fillText('DIGITAL HANDYCAM', 30, 105);
    ctx.fillStyle = '#328ccc'; ctx.font = 'bold 27px monospace'; ctx.fillText('MiniDV', 300, 67);
  }, 512, 128);
  const brand = label(dv, dvBrand, 1.52, 0.38, [0.662, 0.23, -0.05]);
  brand.rotation.y = Math.PI / 2;
  const screenHinge = new T.Group(); screenHinge.position.set(-0.68, 0.05, 0.13); screenHinge.rotation.y = -0.29;
  dv.add(screenHinge);
  box(screenHinge, 1.47, 1.04, 0.095, darkSilver, [-0.66, 0, 0], 0.1);
  box(screenHinge, 1.36, 0.93, 0.1, silver, [-0.66, 0, 0.025], 0.075);
  box(screenHinge, 1.22, 0.74, 0.012, ink, [-0.66, 0.045, 0.08], 0.015);
  const defaultScreen = textureFrom((ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#173d5d'); g.addColorStop(0.5, '#328ccc'); g.addColorStop(1, '#9fd8f3');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#ffffff'; ctx.font = 'bold 46px Arial'; ctx.textAlign = 'center'; ctx.fillText('Motion', w / 2, h / 2);
  }, 640, 360);
  const screenMaterial = own(new T.MeshBasicMaterial({ map: defaultScreen, toneMapped: false }));
  const screenPlane = mesh(own(new T.PlaneGeometry(1.14, 0.641)), screenMaterial, screenHinge, [-0.66, 0.045, 0.092]);
  screenPlane.castShadow = false;
  const screenOverlay = textureFrom((ctx, w, h) => {
    ctx.fillStyle = '#59b6dc'; ctx.beginPath(); ctx.arc(25, 23, 6, 0, Math.PI * 2); ctx.fill();
    ctx.font = 'bold 19px monospace'; ctx.fillStyle = '#ffffff'; ctx.fillText('REC', 40, 30);
    ctx.font = '16px monospace'; ctx.fillText('00:00:24', w - 122, 30); ctx.fillText('16:9', 18, h - 20);
    ctx.strokeStyle = 'rgba(255,255,255,.72)'; ctx.lineWidth = 2;
    const pad = 14, len = 20;
    [[pad,pad,1,1],[w-pad,pad,-1,1],[pad,h-pad,1,-1],[w-pad,h-pad,-1,-1]].forEach(([x,y,dx,dy]) => { ctx.beginPath();ctx.moveTo(x+dx*len,y);ctx.lineTo(x,y);ctx.lineTo(x,y+dy*len);ctx.stroke(); });
  }, 640, 360);
  label(screenHinge, screenOverlay, 1.14, 0.641, [-0.66, 0.045, 0.095], { emissive: 0xffffff, emissiveIntensity: 0.45 });
  for (let i = 0; i < 3; i++) cylinder(screenHinge, 0.026, 0.01, ink, [-0.88 + i * 0.22, -0.386, 0.083], 'z', 0.026, 12);
  dv.position.set(2.65, 1.04, -0.8);
  dv.rotation.set(0.03, -0.34, 0.045);
  dv.scale.setScalar(1.02);
  interactive(dv, 'commercial', 1.04);
  contact(2.45, -0.65, 3.4, 3.5);

  // A short, coiled camera cable visually connects the objects to the desktop.
  const cablePoints = [];
  for (let i = 0; i <= 70; i++) {
    const a = i / 70 * Math.PI * 1.7;
    cablePoints.push(new T.Vector3(1.9 + Math.cos(a) * 1.3, 0.018, -0.7 + Math.sin(a) * 0.8));
  }
  const cable = mesh(own(new T.TubeGeometry(new T.CatmullRomCurve3(cablePoints), 70, 0.018, 7, false)), rubber, stage);
  cable.castShadow = false;

  let coverTexture = null;
  let coverRequest = 0;
  function setCover(url) {
    if (!url) return;
    const request = ++coverRequest;
    // An Image avoids logging failed fetches for unsupported local-file textures.
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (disposed || request !== coverRequest) return;
      const texture = own(new T.Texture(img));
      texture.encoding = T.sRGBEncoding;
      texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 4);
      const aspect = img.width / img.height, frame = 16 / 9;
      if (aspect > frame) { texture.repeat.x = frame / aspect; texture.offset.x = (1 - texture.repeat.x) / 2; }
      else { texture.repeat.y = aspect / frame; texture.offset.y = (1 - texture.repeat.y) / 2; }
      texture.needsUpdate = true;
      if (coverTexture) { coverTexture.dispose(); resources.delete(coverTexture); }
      coverTexture = texture; screenMaterial.map = texture; screenMaterial.needsUpdate = true;
      renderOnce();
    };
    img.onerror = () => {};
    img.src = url;
  }

  const pointer = new T.Vector2();
  const pointerTarget = { x: 0, y: 0 };
  const pointerSmooth = { x: 0, y: 0, vx: 0, vy: 0 };
  const raycaster = new T.Raycaster();
  let hovered = null, selected = null, selectionUntil = 0;
  let focusStarted = -10000, focusCategory = null, baseZoom = 1;
  const focusTarget = new T.Vector3();
  const currentLookAt = new T.Vector3();
  let pressed = false, dragging = false, lastX = 0, lastY = 0, startX = 0, startY = 0;
  let dragYaw = 0, dragTarget = 0, dragVelocity = 0;
  let disposed = false, frameId = 0, lastTime = 0, elapsed = 0;
  let visible = true, hasViewport = false;
  const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  let motionEnabled = !mediaQuery.matches;
  let forcedMotion = null;
  const callbacks = [];
  const listen = (el, name, callback, options) => { el.addEventListener(name, callback, options); callbacks.push(() => el.removeEventListener(name, callback, options)); };
  function setHover(category) {
    if (hovered === category) return;
    hovered = category;
    canvas.style.cursor = pressed ? 'grabbing' : category ? 'pointer' : 'grab';
    host.dataset.hovered = category || '';
    host.dispatchEvent(new CustomEvent('studio-hover', { bubbles: true, detail: { category } }));
    if (!motionEnabled) renderOnce();
  }
  function hitAt(event) {
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    scene.updateMatrixWorld(true);
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(objects, true);
    return hits.length ? hits[0].object.userData.category : null;
  }
  function dispatchSelection(category) {
    if (!category) return;
    select(category);
    host.dispatchEvent(new CustomEvent('studio-select', { bubbles: true, detail: { category } }));
  }
  function select(category) {
    if (!['original', 'commission', 'commercial'].includes(category)) { selected = null; return; }
    selected = category; selectionUntil = performance.now() + 1500;
    focusStarted = performance.now(); focusCategory = category;
    if (!motionEnabled) renderOnce();
  }
  function move(event) {
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    pointerTarget.x = Math.max(-1, Math.min(1, (event.clientX - rect.left) / rect.width * 2 - 1));
    pointerTarget.y = Math.max(-1, Math.min(1, (event.clientY - rect.top) / rect.height * 2 - 1));
    if (pressed) {
      if (Math.hypot(event.clientX - startX, event.clientY - startY) > 7) dragging = true;
      if (dragging && motionEnabled) {
        const dx = (event.clientX - lastX) / Math.max(rect.width, 1);
        dragVelocity = dx * 2.7;
        dragTarget = Math.max(-0.5, Math.min(0.5, dragTarget + dragVelocity));
      }
    } else setHover(hitAt(event));
    lastX = event.clientX; lastY = event.clientY;
  }
  listen(canvas, 'pointermove', move);
  listen(canvas, 'pointerdown', event => {
    if (event.button !== 0) return;
    pressed = true; dragging = false;
    startX = lastX = event.clientX; startY = lastY = event.clientY;
    dragVelocity = 0;
    canvas.setPointerCapture(event.pointerId);
    canvas.style.cursor = 'grabbing';
  });
  listen(canvas, 'pointerup', event => {
    if (!pressed) return;
    pressed = false;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    if (!dragging) dispatchSelection(hitAt(event));
    dragging = false;
    setHover(hitAt(event));
    canvas.style.cursor = hovered ? 'pointer' : 'grab';
  });
  const resetPointer = () => { pressed = false; dragging = false; pointerTarget.x = 0; pointerTarget.y = 0; setHover(null); };
  listen(canvas, 'pointercancel', resetPointer);
  listen(canvas, 'pointerleave', () => { if (!pressed) resetPointer(); });
  canvas.style.touchAction = 'pan-y';
  canvas.style.cursor = 'grab';

  function resize() {
    if (disposed) return;
    const rect = host.getBoundingClientRect();
    const w = rect.width, h = rect.height;
    // The studio lives in an initially hidden page view. Preserve the last
    // valid camera/buffer until the view has a measurable viewport again.
    hasViewport = Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0;
    if (!hasViewport) { stop(); return; }
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Keep the whole still life inside narrow mobile canvases.
    baseZoom = Math.min(1.1, Math.max(0.5, camera.aspect * 0.78));
    camera.zoom = baseZoom;
    camera.updateProjectionMatrix();
    renderOnce();
    start();
  }
  let resizeObserver;
  if (window.ResizeObserver) { resizeObserver = new ResizeObserver(resize); resizeObserver.observe(host); }
  // Page navigation also dispatches resize explicitly after removing hidden.
  listen(window, 'resize', resize);

  function spring(value, velocity, target, dt, stiffness = 56, damping = 13) {
    velocity += ((target - value) * stiffness - velocity * damping) * dt;
    value += velocity * dt;
    return [value, velocity];
  }
  function renderOnce() {
    if (!disposed && visible && hasViewport && !document.hidden) renderer.render(scene, camera);
  }
  function tick(time) {
    frameId = 0;
    if (disposed || !visible || !hasViewport || document.hidden || !motionEnabled) return;
    const dt = Math.min((time - (lastTime || time)) / 1000, 0.04);
    lastTime = time; elapsed += dt;
    [pointerSmooth.x, pointerSmooth.vx] = spring(pointerSmooth.x, pointerSmooth.vx, pointerTarget.x, dt);
    [pointerSmooth.y, pointerSmooth.vy] = spring(pointerSmooth.y, pointerSmooth.vy, pointerTarget.y, dt);
    if (!pressed) {
      dragTarget = Math.max(-0.5, Math.min(0.5, dragTarget + dragVelocity * dt * 35));
      dragVelocity *= Math.exp(-7 * dt);
      dragTarget *= Math.exp(-0.35 * dt);
    }
    dragYaw += (dragTarget - dragYaw) * (1 - Math.exp(-7 * dt));
    stage.rotation.y = pointerSmooth.x * 0.11 + dragYaw;
    stage.rotation.x = pointerSmooth.y * 0.035;
    keyLight.position.x = -3 + pointerSmooth.x * 2.0;
    keyLight.position.z = 7 + pointerSmooth.y * 1.1;
    if (selected && time > selectionUntil) selected = null;
    for (const object of objects) {
      const active = hovered === object.userData.category || selected === object.userData.category;
      const targetLift = active ? 0.22 : 0;
      [object.userData.lift, object.userData.velocity] = spring(object.userData.lift, object.userData.velocity, targetLift, dt, 110, 14);
      object.position.y = object.userData.baseY + object.userData.lift;
      object.rotation.z = object.userData.baseRotation.z + object.userData.lift * 0.1;
    }
    if (hovered === 'original' || selected === 'original') reels.forEach(reel => { reel.rotation.z -= dt * 1.7; });
    spaceBar.position.y = 0.642 - (hovered === 'commission' ? (Math.sin(elapsed * 8) * 0.5 + 0.5) * 0.025 : 0);
    screenHinge.rotation.y += ((hovered === 'commercial' ? -0.06 : -0.29) - screenHinge.rotation.y) * (1 - Math.exp(-7 * dt));
    sheet.rotation.x += ((hovered === 'commission' ? -0.07 : -0.14) - sheet.rotation.x) * (1 - Math.exp(-5 * dt));
    // The first 650 ms draw the viewer toward the selected physical object.
    // The page can begin its section transition at that point; the camera then settles back.
    const focusTime = (time - focusStarted) / 1000;
    let focus = 0;
    if (focusTime >= 0 && focusTime < 0.65) focus = 1 - Math.pow(1 - focusTime / 0.65, 3);
    else if (focusTime >= 0.65 && focusTime < 1.7) focus = Math.pow(1 - (focusTime - 0.65) / 1.05, 3);
    const focusedObject = objects.find(object => object.userData.category === focusCategory);
    if (focusedObject && focus > 0) {
      focusedObject.getWorldPosition(focusTarget);
      focusTarget.y += focusCategory === 'commission' ? 0.9 : 0;
      currentLookAt.copy(cameraTarget).lerp(focusTarget, focus * 0.33);
    } else currentLookAt.copy(cameraTarget);
    camera.lookAt(currentLookAt);
    camera.zoom = baseZoom * (1 + focus * 0.15);
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
    frameId = requestAnimationFrame(tick);
  }
  function start() {
    if (disposed || frameId || !visible || !hasViewport || document.hidden) return;
    lastTime = 0;
    if (motionEnabled) frameId = requestAnimationFrame(tick);
    else renderOnce();
  }
  function stop() { if (frameId) cancelAnimationFrame(frameId); frameId = 0; lastTime = 0; }
  function setMotion(enabled) {
    forcedMotion = Boolean(enabled);
    applyMotion();
  }
  function applyMotion() {
    motionEnabled = forcedMotion === null ? !mediaQuery.matches : forcedMotion && !mediaQuery.matches;
    host.dataset.motion = motionEnabled ? 'on' : 'off';
    if (!motionEnabled) {
      stop(); stage.rotation.set(0, 0, 0); dragTarget = 0; dragYaw = 0;
      focusStarted = -10000; camera.zoom = baseZoom; camera.lookAt(cameraTarget); camera.updateProjectionMatrix();
      objects.forEach(object => { object.position.y = object.userData.baseY; object.rotation.copy(object.userData.baseRotation); object.userData.lift = 0; object.userData.velocity = 0; });
      renderOnce();
    } else start();
  }
  if (mediaQuery.addEventListener) listen(mediaQuery, 'change', applyMotion);
  else { mediaQuery.addListener(applyMotion); callbacks.push(() => mediaQuery.removeListener(applyMotion)); }
  listen(document, 'visibilitychange', () => { document.hidden ? stop() : start(); });
  let intersectionObserver;
  if (window.IntersectionObserver) {
    intersectionObserver = new IntersectionObserver(entries => {
      visible = entries[0].isIntersecting;
      if (visible) resize();
      else stop();
    }, { rootMargin: '80px' });
    intersectionObserver.observe(host);
  }
  listen(canvas, 'webglcontextlost', event => { event.preventDefault(); stop(); noScene(); });
  listen(canvas, 'webglcontextrestored', () => {
    canvas.style.display = ''; host.classList.add('scene-ready'); host.classList.remove('scene-unavailable');
    if (fallback) fallback.hidden = true;
    start();
  });
  function dispose() {
    if (disposed) return;
    disposed = true; stop();
    callbacks.forEach(remove => remove());
    if (resizeObserver) resizeObserver.disconnect();
    if (intersectionObserver) intersectionObserver.disconnect();
    resources.forEach(resource => resource.dispose());
    environmentTarget.dispose(); renderer.dispose();
  }
  listen(window, 'pagehide', event => { if (!event.persisted) dispose(); else stop(); });
  listen(window, 'pageshow', () => start());

  window.STUDIO = { select, setMotion, setCover, dispose, get ready() { return !disposed; } };
  host.classList.add('scene-ready');
  host.classList.remove('scene-unavailable');
  if (fallback) fallback.hidden = true;
  resize(); applyMotion();
  // Local file textures can be restricted by the browser; the built-in LCD graphic remains usable.
  if (location.protocol !== 'file:') setCover('assets/duplex-lens.jpg');
  host.dispatchEvent(new CustomEvent('studio-ready', { bubbles: true }));
})();
