import * as THREE from '../vendor/three.module.js';

// Every room connects to the central aisle. Distances are in metres.
export function createMuseum(scene, artworks = []) {
  const rooms = [
    { id: 'library', name: 'Большая библиотека', subtitle: 'Архитектура тишины', bounds: { minX: -6.5, maxX: 6.5, minZ: -19, maxZ: 19 } },
    { id: 'west', name: 'Западная галерея', subtitle: 'Природа и движение', bounds: { minX: -22, maxX: -6.5, minZ: -8, maxZ: 8 } },
    { id: 'east', name: 'Восточная галерея', subtitle: 'Стихия и чувство', bounds: { minX: 6.5, maxX: 22, minZ: -8, maxZ: 8 } },
    { id: 'north', name: 'Северный кабинет', subtitle: 'Ритмы абстракции', bounds: { minX: -9, maxX: 9, minZ: -33, maxZ: -19 } },
  ];
  const walkable = rooms.map(({ bounds }) => ({ ...bounds }));
  const obstacles = [];
  const exhibits = [];
  const texturePromises = [];
  const building = new THREE.Group();
  building.name = 'The imagined library museum';
  scene.add(building);
  const batches = new Map();
  const transform = new THREE.Object3D();
  const materials = {
    stone: new THREE.MeshStandardMaterial({ color: '#d2c4a6', roughness: .86 }),
    pale: new THREE.MeshStandardMaterial({ color: '#e8dfcb', roughness: .83 }),
    ceiling: new THREE.MeshStandardMaterial({ color: '#d6cbb6', roughness: .94, side: THREE.DoubleSide }),
    wood: new THREE.MeshStandardMaterial({ color: '#442b20', roughness: .56 }),
    woodLight: new THREE.MeshStandardMaterial({ color: '#765038', roughness: .5 }),
    dark: new THREE.MeshStandardMaterial({ color: '#241d18', roughness: .76 }),
    green: new THREE.MeshStandardMaterial({ color: '#40594b', roughness: .95 }),
    red: new THREE.MeshStandardMaterial({ color: '#805347', roughness: .95 }),
    blue: new THREE.MeshStandardMaterial({ color: '#354650', roughness: .95 }),
    brass: new THREE.MeshStandardMaterial({ color: '#ae8850', roughness: .35, metalness: .75 }),
    bronze: new THREE.MeshStandardMaterial({ color: '#6d6250', roughness: .44, metalness: .68 }),
    leather: new THREE.MeshStandardMaterial({ color: '#435048', roughness: .79 }),
    light: new THREE.MeshStandardMaterial({ color: '#fff0c9', emissive: '#ffd789', emissiveIntensity: 2.2, roughness: .3 }),
    glass: new THREE.MeshStandardMaterial({ color: '#d9e7e2', emissive: '#aec9d1', emissiveIntensity: .58, roughness: .9 }),
    black: new THREE.MeshStandardMaterial({ color: '#0d1110', roughness: .85 }),
  };
  const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
  const cylinderGeometry = new THREE.CylinderGeometry(1, 1, 1, 16);
  const sphereGeometry = new THREE.SphereGeometry(1, 12, 8);

  function batch(geometry, material, x, y, z, sx, sy, sz, ry = 0, rz = 0) {
    const key = `${geometry.uuid}:${material.uuid}`;
    if (!batches.has(key)) batches.set(key, { geometry, material, matrices: [] });
    transform.position.set(x, y, z);
    transform.rotation.set(0, ry, rz);
    transform.scale.set(sx, sy, sz);
    transform.updateMatrix();
    batches.get(key).matrices.push(transform.matrix.clone());
  }
  function box(mat, x, y, z, w, h, d, ry = 0) { batch(boxGeometry, mat, x, y, z, w, h, d, ry); }
  function cylinder(mat, x, y, z, radius, height, ry = 0) { batch(cylinderGeometry, mat, x, y, z, radius, height, radius, ry); }
  function sphere(mat, x, y, z, radius) { batch(sphereGeometry, mat, x, y, z, radius, radius, radius); }
  function obstacle(x, z, w, d) { obstacles.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 }); }
  function wall(mat, x, z, w, d, height = 5.6) {
    box(mat, x, height / 2, z, w, height, d);
    box(materials.wood, x, .14, z, w + .035, .28, d + .035);
    box(materials.pale, x, height - .15, z, w + .1, .22, d + .1);
    obstacle(x, z, w, d);
  }

  // A single shared material gives all of the parquet a continuous grain.
  const floorTexture = createParquetTexture();
  const floorMaterial = new THREE.MeshStandardMaterial({ map: floorTexture, roughness: .58, color: '#b39a77' });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(46, 56), floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, -.015, -7);
  floor.receiveShadow = true;
  building.add(floor);

  // Main reading room: the lower walls support a long, ribbed barrel vault.
  [-1, 1].forEach((side) => {
    wall(materials.stone, side * 6.57, -10.8, .26, 16.4, 6.1);
    wall(materials.stone, side * 6.57, 10.8, .26, 16.4, 6.1);
    box(materials.stone, side * 6.57, 5.49, 0, .28, 1.22, 5.2);
  });
  wall(materials.stone, -4.55, -19.05, 4.1, .26, 6.1);
  wall(materials.stone, 4.55, -19.05, 4.1, .26, 6.1);
  box(materials.stone, 0, 5.49, -19.05, 5, 1.22, .28);
  wall(materials.stone, 0, 19.05, 13.4, .26, 10.2);
  const vault = new THREE.Mesh(vaultGeometry(6.5, 4.25, 6.05, -19, 19), materials.ceiling);
  vault.receiveShadow = true;
  building.add(vault);
  const ribGeometry = archBandGeometry(6.52, 4.27, .13, 6.045, .13);
  [-18.8, -12.5, -6.25, 0, 6.25, 12.5, 18.8].forEach((z) => {
    const rib = new THREE.Mesh(ribGeometry, materials.pale);
    rib.position.z = z;
    rib.castShadow = true;
    building.add(rib);
    [-1, 1].forEach((side) => {
      box(materials.pale, side * 6.13, 3.025, z, .34, 6.05, .35);
      box(materials.stone, side * 6.1, .22, z, .52, .44, .55);
      box(materials.pale, side * 6.1, 5.81, z, .54, .35, .55);
    });
  });
  // High clerestory windows put daylight above the shelves.
  [-1, 1].forEach((side) => {
    [-15.6, -9.4, 9.4, 15.6].forEach((z) => {
      box(materials.wood, side * 6.36, 4.88, z, .15, 1.65, 3.7);
      box(materials.glass, side * 6.265, 4.88, z, .06, 1.48, 3.5);
      for (let i = -1; i <= 1; i++) box(materials.pale, side * 6.2, 4.88, z + i * 1.15, .085, 1.55, .045);
      box(materials.pale, side * 6.2, 4.9, z, .085, .045, 3.52);
    });
  });
  // The southern window remains behind the visitor on arrival.
  box(materials.wood, 0, 5.75, 18.87, 5.9, 6.35, .12);
  box(materials.glass, 0, 5.75, 18.78, 5.64, 6.12, .06);
  [-1.85, 0, 1.85].forEach((x) => box(materials.pale, x, 5.75, 18.71, .095, 6.2, .08));
  [3.7, 5.75, 7.8].forEach((y) => box(materials.pale, 0, y, 18.71, 5.73, .095, .08));

  // Green and terracotta galleries, connected through generous stone portals.
  [-1, 1].forEach((side) => {
    const mat = side < 0 ? materials.green : materials.red;
    const cx = side * 14.25;
    wall(mat, side * 22.05, 0, .28, 16.3);
    wall(mat, cx, -8.05, 15.55, .28);
    wall(mat, cx, 8.05, 15.55, .28);
    wall(mat, side * 6.64, -5.3, .15, 5.4);
    wall(mat, side * 6.64, 5.3, .15, 5.4);
    box(mat, side * 6.64, 5.24, 0, .18, .72, 5.2);
    galleryCeiling(cx, 0, 15.5, 16, materials.pale);
    [-1, 1].forEach((end) => {
      box(materials.wood, cx, 4.65, end * 7.88, 10.3, .9, .12);
      box(materials.glass, cx, 4.65, end * 7.79, 10, .69, .055);
      for (let i = -4; i <= 4; i++) box(materials.pale, cx + i * 1.14, 4.65, end * 7.73, .045, .77, .06);
    });
    portal(side * 6.37, 0, side < 0 ? Math.PI / 2 : -Math.PI / 2, side < 0 ? 'ЗАПАДНАЯ ГАЛЕРЕЯ' : 'ВОСТОЧНАЯ ГАЛЕРЕЯ');
    galleryBench(side * 14.7, 0, Math.PI / 2);
    chandelier(cx, 0, 5.15, .95);
  });

  // The more intimate blue cabinet closes the northern perspective.
  wall(materials.blue, -9.05, -26, .28, 14.3);
  wall(materials.blue, 9.05, -26, .28, 14.3);
  wall(materials.blue, 0, -33.05, 18.3, .28);
  wall(materials.blue, -5.78, -19.08, 6.55, .15);
  wall(materials.blue, 5.78, -19.08, 6.55, .15);
  box(materials.blue, 0, 5.24, -19.08, 5, .72, .18);
  galleryCeiling(0, -26, 18, 14, materials.pale);
  portal(0, -18.84, 0, 'СЕВЕРНЫЙ КАБИНЕТ');
  galleryBench(0, -26, 0);
  chandelier(0, -26, 5.15, 1.05);
  // Shallow inset panels keep the galleries architectural at eye level.
  [-1, 1].forEach((side) => {
    for (let z = -30.5; z <= -21; z += 3.2) {
      box(materials.wood, side * 8.87, .59, z, .055, .84, 2.9);
      box(materials.blue, side * 8.82, .59, z, .035, .71, 2.76);
    }
  });

  // Library shelves are instanced, including the individual book spines.
  const bookMaterials = ['#74654b', '#4c5b52', '#6b342e', '#313f45', '#9c8359', '#454128', '#5f4c43', '#8b6f4a']
    .map((color) => new THREE.MeshStandardMaterial({ color, roughness: .9 }));
  let randomState = 918237;
  function random() { randomState = (Math.imul(randomState, 1664525) + 1013904223) | 0; return (randomState >>> 0) / 4294967296; }
  [-1, 1].forEach((side) => {
    [-15.6, -9.4, -4.65, 4.65, 9.4, 15.6].forEach((z) => {
      const width = Math.abs(z) < 6 ? 2.3 : 5.35;
      bookshelf(side, z, width);
    });
  });

  function bookshelf(side, z, width) {
    const x = side * 5.94;
    box(materials.dark, x, 1.95, z, .62, 3.9, width);
    box(materials.wood, x - side * .04, .14, z, .76, .28, width + .14);
    box(materials.wood, x - side * .04, 3.83, z, .8, .23, width + .17);
    [-1, 1].forEach((end) => box(materials.woodLight, x - side * .04, 1.94, z + end * (width / 2 - .055), .72, 3.75, .11));
    for (let shelf = 0; shelf <= 5; shelf++) {
      const y = .38 + shelf * .64;
      box(materials.woodLight, x - side * .04, y, z, .73, .065, width);
      if (shelf === 5) continue;
      let cursor = -width / 2 + .13;
      while (cursor < width / 2 - .15) {
        const spine = .052 + random() * .072;
        const height = .33 + random() * .205;
        const bookMat = bookMaterials[Math.floor(random() * bookMaterials.length)];
        box(bookMat, x - side * .15, y + height / 2 + .04, z + cursor + spine / 2, .34 + random() * .08, height, spine);
        if (random() > .65) box(materials.brass, x - side * .368, y + height * .78, z + cursor + spine / 2, .008, .012, spine * .78);
        cursor += spine + .013 + random() * .016;
      }
    }
    obstacle(x, z, .84, width + .14);
    contactShadow(x - side * .08, z, 1.25, width + .5, .2);
  }

  // Four study tables leave the centre axis open from the entrance to the cabinet.
  [-1, 1].forEach((side) => {
    [-9.2, 9.2].forEach((z) => readingTable(side * 3.0, z));
  });
  [-12.5, 0, 12.5].forEach((z) => chandelier(0, z, 7.5, 1.45));

  // Two invented abstract sculptures are architectural decoration, not catalogue works.
  sculpture(-4.35, -16.6, .85);
  sculpture(4.35, 16.2, .72);
  signPlane('BIBLIOTHECA', 'МУЗЕЙ ИСКУССТВА И ТИХИХ ОТКРЫТИЙ', 0, 5.61, -18.78, 0, 4.65, .68, '#d9c8a7');
  signPlane('02', 'ЗАПАДНАЯ ГАЛЕРЕЯ', -6.24, 2.12, 3.17, Math.PI / 2, .86, .76, '#e1d5bc');
  signPlane('03', 'ВОСТОЧНАЯ ГАЛЕРЕЯ', 6.24, 2.12, 3.17, -Math.PI / 2, .86, .76, '#e1d5bc');

  const slots = {
    library: [
      { x: -4.6, z: -18.78, rotation: 0, width: 2.3, height: 2.8 },
      { x: 4.6, z: -18.78, rotation: 0, width: 2.3, height: 2.8 },
    ],
    west: [
      { x: -21.81, z: -3.85, rotation: Math.PI / 2, width: 3.8, height: 2.65 },
      { x: -21.81, z: 3.85, rotation: Math.PI / 2, width: 3.8, height: 2.65 },
      { x: -14.25, z: -7.81, rotation: 0, width: 4.6, height: 2.65 },
      { x: -14.25, z: 7.81, rotation: Math.PI, width: 4.6, height: 2.65 },
    ],
    east: [
      { x: 21.81, z: -3.85, rotation: -Math.PI / 2, width: 3.8, height: 2.65 },
      { x: 21.81, z: 3.85, rotation: -Math.PI / 2, width: 3.8, height: 2.65 },
      { x: 14.25, z: -7.81, rotation: 0, width: 4.6, height: 2.65 },
      { x: 14.25, z: 7.81, rotation: Math.PI, width: 4.6, height: 2.65 },
    ],
    north: [
      { x: -4.5, z: -32.81, rotation: 0, width: 4.4, height: 2.65 },
      { x: 4.5, z: -32.81, rotation: 0, width: 4.4, height: 2.65 },
      { x: -8.81, z: -26, rotation: Math.PI / 2, width: 4.7, height: 2.65 },
      { x: 8.81, z: -26, rotation: -Math.PI / 2, width: 4.7, height: 2.65 },
    ],
  };
  const slotCounts = { library: 0, west: 0, east: 0, north: 0 };
  artworks.forEach((artwork, index) => {
    let roomId = slots[artwork.room] ? artwork.room : ['west', 'east', 'north'][index % 3];
    if (slotCounts[roomId] >= slots[roomId].length) roomId = Object.keys(slots).find((id) => slotCounts[id] < slots[id].length);
    if (!roomId) return;
    const slot = slots[roomId][slotCounts[roomId]++];
    const room = rooms.find(({ id }) => id === roomId);
    mountArtwork(artwork, slot, room);
  });

  function mountArtwork(artwork, slot, room) {
    const group = new THREE.Group();
    group.position.set(slot.x, 2.35, slot.z);
    group.rotation.y = slot.rotation;
    building.add(group);
    const provisionalAspect = artwork.aspect || 1.35;
    const aspectSize = (aspect) => {
      const width = Math.min(slot.width, slot.height * aspect);
      return { width, height: width / aspect };
    };
    let { width, height } = aspectSize(provisionalAspect);
    const frameGroup = new THREE.Group();
    group.add(frameGroup);
    const paintMat = new THREE.MeshStandardMaterial({ color: '#d0b791', roughness: .95 });
    const image = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), paintMat);
    image.position.z = .062;
    group.add(image);
    const name = artwork.title || artwork.name || 'Произведение искусства';
    const date = artwork.year || artwork.date || '';
    const label = labelTexture(artwork.artist || '', name, date);
    const labelMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.3, .34), new THREE.MeshBasicMaterial({ map: label, toneMapped: false }));
    labelMesh.position.z = .08;
    group.add(labelMesh);
    function resizeFrame() {
      image.scale.set(width, height, 1);
      const t = .07;
      if (!frameGroup.children.length) {
        const back = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), materials.dark);
        back.name = 'Frame backing';
        frameGroup.add(back);
        for (let i = 0; i < 4; i++) {
          const rail = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), materials.brass);
          rail.castShadow = true;
          frameGroup.add(rail);
        }
      }
      frameGroup.children[0].scale.set(width + .14, height + .14, .08);
      frameGroup.children[0].position.z = -.006;
      const [top, bottom, left, right] = frameGroup.children.slice(1);
      top.scale.set(width + .18, t, .12); top.position.set(0, height / 2 + t / 2, .035);
      bottom.scale.set(width + .18, t, .12); bottom.position.set(0, -height / 2 - t / 2, .035);
      left.scale.set(t, height + .18, .12); left.position.set(-width / 2 - t / 2, 0, .035);
      right.scale.set(t, height + .18, .12); right.position.set(width / 2 + t / 2, 0, .035);
      labelMesh.position.y = -height / 2 - .36;
    }
    resizeFrame();
    const normal = new THREE.Vector3(Math.sin(slot.rotation), 0, Math.cos(slot.rotation));
    const position = new THREE.Vector3(slot.x, 2.2, slot.z).addScaledVector(normal, .1);
    exhibits.push({ ...artwork, title: name, room: room.id, roomTitle: room.name, position, viewPosition: {
      x: slot.x + normal.x * 3.25,
      z: slot.z + normal.z * 3.25,
      yaw: Math.atan2(-normal.x, -normal.z),
    } });
    if (artwork.image) {
      texturePromises.push(new Promise((resolve) => {
        new THREE.TextureLoader().load(artwork.image, (texture) => {
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.anisotropy = 8;
          texture.minFilter = THREE.LinearMipmapLinearFilter;
          const img = texture.image;
          ({ width, height } = aspectSize((img.naturalWidth || img.width) / (img.naturalHeight || img.height)));
          paintMat.map = texture;
          paintMat.color.set('#ffffff');
          paintMat.needsUpdate = true;
          resizeFrame();
          resolve({ id: artwork.id, loaded: true });
        }, undefined, () => resolve({ id: artwork.id, loaded: false }));
      }));
    }
    // A warm wash and its discreet brass wall fitting.
    const lampPosition = new THREE.Vector3(slot.x, 4.04, slot.z).addScaledVector(normal, .23);
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(.035, .035, Math.min(width + .18, 1.25), 12), materials.brass);
    lamp.rotation.z = Math.PI / 2;
    lamp.rotation.y = slot.rotation;
    lamp.position.copy(lampPosition);
    building.add(lamp);
    const wash = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(width + .1, 1.1), .035), materials.light);
    wash.position.copy(lampPosition).add(new THREE.Vector3(0, -.045, 0));
    wash.rotation.set(Math.PI / 2, 0, -slot.rotation);
    building.add(wash);
  }

  function galleryCeiling(x, z, w, d, material) {
    box(material, x, 5.66, z, w, .17, d);
    // Broad plaster coffers and narrow timber borders.
    for (let ix = -1; ix <= 1; ix++) {
      for (let iz = -1; iz <= 1; iz++) {
        box(materials.stone, x + ix * w / 3, 5.51, z + iz * d / 3, w / 3 - .25, .12, d / 3 - .25);
      }
    }
    for (let i = -1; i <= 1; i++) {
      box(materials.wood, x + (i + .5) * w / 3, 5.45, z, .08, .075, d);
      box(materials.wood, x, 5.45, z + (i + .5) * d / 3, w, .075, .08);
    }
    [-1, 1].forEach((side) => {
      box(materials.pale, x + side * (w / 2 - .12), 5.33, z, .23, .18, d);
      box(materials.pale, x, 5.33, z + side * (d / 2 - .12), w, .18, .23);
    });
  }

  function portal(x, z, rotation, title) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.rotation.y = rotation;
    building.add(group);
    [-1, 1].forEach((side) => {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(.24, 2.76, .22), materials.pale);
      pillar.position.set(side * 2.49, 1.38, 0);
      group.add(pillar);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(.39, .35, .37), materials.stone);
      foot.position.set(side * 2.49, .175, 0);
      group.add(foot);
    });
    const arch = new THREE.Mesh(archBandGeometry(2.61, 2.2, .22, 2.68, .22), materials.pale);
    group.add(arch);
    const cap = new THREE.Shape();
    cap.moveTo(-2.7, 5.6);
    cap.lineTo(2.7, 5.6);
    cap.lineTo(2.7, 2.68);
    for (let i = 0; i <= 48; i++) {
      const angle = i / 48 * Math.PI;
      cap.lineTo(Math.cos(angle) * 2.4, 2.68 + Math.sin(angle) * 1.99);
    }
    cap.lineTo(-2.7, 2.68);
    cap.closePath();
    const spandrel = new THREE.Mesh(new THREE.ExtrudeGeometry(cap, { depth: .12, bevelEnabled: false }), materials.stone);
    spandrel.position.z = -.16;
    group.add(spandrel);
    const label = new THREE.Mesh(new THREE.PlaneGeometry(3.6, .3), new THREE.MeshBasicMaterial({ map: textTexture(title, '', '#c3aa7b'), transparent: true, toneMapped: false, side: THREE.DoubleSide }));
    label.position.set(0, 4.91, .14);
    group.add(label);
  }

  function readingTable(x, z) {
    box(materials.woodLight, x, .81, z, 1.72, .14, 4.2);
    box(materials.wood, x, .7, z, 1.5, .14, 3.92);
    [-1, 1].forEach((sx) => [-1, 1].forEach((sz) => {
      box(materials.wood, x + sx * .66, .35, z + sz * 1.73, .12, .7, .12);
    }));
    [-1.16, 1.16].forEach((dz) => {
      // Banker lamps, with an emissive underside and a green metal shade.
      cylinder(materials.brass, x, .916, z + dz, .17, .035);
      cylinder(materials.brass, x, 1.1, z + dz, .024, .37);
      box(materials.green, x, 1.31, z + dz, .53, .14, .29);
      box(materials.light, x, 1.235, z + dz, .44, .022, .23);
    });
    [-1, 1].forEach((side) => {
      [-1.2, 1.2].forEach((dz) => chair(x + side * 1.23, z + dz, side < 0 ? Math.PI / 2 : -Math.PI / 2));
    });
    // A closed folio and a cream reading sheet, with no invented catalogue attribution.
    box(materials.red, x + .15, .905, z, .46, .052, .64, -.13);
    box(materials.pale, x - .24, .89, z + .45, .4, .012, .56, .08);
    obstacle(x, z, 3.25, 4.6);
    contactShadow(x, z, 3.7, 4.9, .25);
  }
  function chair(x, z, rotation) {
    const c = Math.cos(rotation), s = Math.sin(rotation);
    function local(mat, px, y, pz, w, h, d) { box(mat, x + c * px + s * pz, y, z - s * px + c * pz, w, h, d, rotation); }
    local(materials.wood, 0, .45, 0, .58, .08, .59);
    local(materials.leather, 0, .507, 0, .51, .065, .5);
    local(materials.wood, 0, .85, .25, .57, .52, .075);
    local(materials.leather, 0, .87, .2, .44, .35, .04);
    [-1, 1].forEach((sx) => [-1, 1].forEach((sz) => local(materials.wood, sx * .22, .22, sz * .22, .055, .44, .055)));
  }
  function galleryBench(x, z, rotation) {
    box(materials.wood, x, .43, z, 3.25, .15, .89, rotation);
    box(materials.leather, x, .54, z, 3.1, .1, .78, rotation);
    const s = Math.sin(rotation), c = Math.cos(rotation);
    [-1.15, 1.15].forEach((dx) => box(materials.brass, x + c * dx, .2, z - s * dx, .09, .4, .68, rotation));
    obstacle(x, z, rotation ? 1.1 : 3.45, rotation ? 3.45 : 1.1);
    contactShadow(x, z, rotation ? 1.45 : 3.7, rotation ? 3.7 : 1.45, .28);
  }
  function chandelier(x, z, y, radius) {
    cylinder(materials.brass, x, y + .9, z, .024, 1.8);
    cylinder(materials.brass, x, y + .04, z, .16, .09);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, .033, 6, 48), materials.brass);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(x, y, z);
    building.add(ring);
    for (let i = 0; i < 8; i++) {
      const angle = i * Math.PI / 4;
      const lx = x + Math.cos(angle) * radius;
      const lz = z + Math.sin(angle) * radius;
      cylinder(materials.brass, lx, y + .17, lz, .017, .34);
      sphere(materials.light, lx, y + .36, lz, .115);
    }
    const light = new THREE.PointLight('#ffe1b0', 22, 19, 2);
    light.position.set(x, y - .5, z);
    building.add(light);
  }
  function sculpture(x, z, scale) {
    box(materials.pale, x, .55, z, .95 * scale, 1.1, .95 * scale);
    box(materials.stone, x, 1.13, z, 1.03 * scale, .09, 1.03 * scale);
    const form = new THREE.Mesh(new THREE.TorusKnotGeometry(.32 * scale, .095 * scale, 72, 10, 2, 3), materials.bronze);
    form.position.set(x, 1.73, z);
    form.rotation.set(.22, .5, .12);
    form.castShadow = true;
    building.add(form);
    obstacle(x, z, 1.1, 1.1);
    contactShadow(x, z, 1.6, 1.6, .33);
  }
  function signPlane(main, sub, x, y, z, rotation, w, h, color) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: textTexture(main, sub, color), transparent: true, toneMapped: false }));
    mesh.position.set(x, y, z);
    mesh.rotation.y = rotation;
    building.add(mesh);
  }
  // contactShadow is called during construction; lazily initialized texture is shared.
  function contactShadow(x, z, w, d, opacity) {
    if (!contactShadow.texture) contactShadow.texture = createShadowTexture();
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ map: contactShadow.texture, transparent: true, opacity, depthWrite: false, color: '#1c120b' }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, .008, z);
    mesh.renderOrder = 1;
    building.add(mesh);
  }
  // Consolidate thousands of books and architectural pieces into a few draw calls.
  for (const { geometry, material, matrices } of batches.values()) {
    const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
    matrices.forEach((matrix, index) => mesh.setMatrixAt(index, matrix));
    mesh.castShadow = material !== materials.glass && material !== materials.light;
    mesh.receiveShadow = true;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    building.add(mesh);
  }
  const hemisphere = new THREE.HemisphereLight('#e1ecf0', '#8b7054', 2.05);
  scene.add(hemisphere);
  const sun = new THREE.DirectionalLight('#fff0d3', 3.0);
  sun.position.set(-9, 18, 11);
  sun.target.position.set(0, 0, -7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -29;
  sun.shadow.camera.right = 29;
  sun.shadow.camera.top = 30;
  sun.shadow.camera.bottom = -30;
  sun.shadow.camera.near = .5;
  sun.shadow.camera.far = 70;
  sun.shadow.bias = -.0003;
  sun.shadow.normalBias = .035;
  scene.add(sun, sun.target);

  return { spawn: { x: 0, z: 15, yaw: Math.PI }, rooms, walkable, obstacles, exhibits, texturePromises };
}

function vaultGeometry(radiusX, radiusY, baseY, minZ, maxZ) {
  const positions = [], uv = [], indices = [];
  const segments = 64;
  for (let i = 0; i <= segments; i++) {
    const angle = i / segments * Math.PI;
    const x = Math.cos(angle) * radiusX;
    const y = baseY + Math.sin(angle) * radiusY;
    positions.push(x, y, minZ, x, y, maxZ);
    uv.push(i / segments, 0, i / segments, 1);
    if (i < segments) {
      const a = i * 2;
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function archBandGeometry(radiusX, radiusY, thickness, baseY, depth) {
  const shape = new THREE.Shape();
  const segments = 48;
  for (let i = 0; i <= segments; i++) {
    const angle = i / segments * Math.PI;
    const x = Math.cos(angle) * radiusX, y = baseY + Math.sin(angle) * radiusY;
    if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
  }
  for (let i = segments; i >= 0; i--) {
    const angle = i / segments * Math.PI;
    shape.lineTo(Math.cos(angle) * (radiusX - thickness), baseY + Math.sin(angle) * (radiusY - thickness));
  }
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 48 });
  geometry.translate(0, 0, -depth / 2);
  return geometry;
}

function createParquetTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1024;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#6e4b31';
  ctx.fillRect(0, 0, 1024, 1024);
  const random = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
  // Classic two-by-one herringbone tile; each block gets restrained wood grain.
  const unit = 64;
  const length = 4;
  for (let row = -length; row < 20; row++) {
    for (let col = -length; col < 20; col++) {
      if (((row + col) % (length * 2) + length * 2) % (length * 2) !== 0) continue;
      const x = col * unit, y = row * unit;
      plank(x, y, length * unit, unit, col * 31 + row * 17, false);
      plank(x + length * unit, y, unit, length * unit, col * 43 + row * 29, true);
    }
  }
  function plank(x, y, w, h, seed, vertical) {
    const v = random(seed), base = 92 + v * 31;
    ctx.fillStyle = `rgb(${base + 45},${base + 14},${base - 12})`;
    ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
    for (let i = 0; i < 15; i++) {
      const p = random(seed + i * 18.3);
      ctx.strokeStyle = `rgba(58,30,12,${.025 + random(seed + i) * .07})`;
      ctx.lineWidth = .7 + random(seed + i * 3) * 1.8;
      ctx.beginPath();
      if (vertical) {
        ctx.moveTo(x + p * w, y + 3);
        ctx.bezierCurveTo(x + p * w + 7, y + h / 3, x + p * w - 6, y + h * .7, x + p * w + 2, y + h - 3);
      } else {
        ctx.moveTo(x + 3, y + p * h);
        ctx.bezierCurveTo(x + w / 3, y + p * h + 7, x + w * .7, y + p * h - 6, x + w - 3, y + p * h + 2);
      }
      ctx.stroke();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(46 / 6.4, 56 / 6.4);
  texture.anisotropy = 8;
  return texture;
}

function createShadowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(32, 32, 3, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255,255,255,.86)');
  gradient.addColorStop(.5, 'rgba(255,255,255,.38)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

function textTexture(main, sub, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 1536;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.textAlign = 'center';
  ctx.fillStyle = color;
  ctx.font = '56px Georgia, serif';
  ctx.fillText(main, 768, sub ? 115 : 151, 1460);
  if (sub) {
    ctx.font = '19px sans-serif';
    ctx.fillText(sub, 768, 180, 1460);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function labelTexture(artist, title, year) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#e4ddc9';
  ctx.fillRect(0, 0, 1024, 256);
  ctx.fillStyle = '#302b23';
  ctx.font = '27px sans-serif';
  ctx.fillText(String(artist), 44, 68, 936);
  ctx.font = 'italic 34px Georgia, serif';
  ctx.fillText(String(title), 44, 125, 936);
  ctx.fillStyle = '#736c5e';
  ctx.font = '25px sans-serif';
  ctx.fillText(String(year), 44, 186, 936);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}
