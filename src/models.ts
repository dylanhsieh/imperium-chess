import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Locally sculpted ancient armies. Every silhouette and detail is authored here. */
type Faction = 'w' | 'b';
type Mode = 'idle' | 'move' | 'attack' | 'fear' | 'relief';
type V3 = [number, number, number];
type Palette = Record<'armor' | 'gold' | 'dark' | 'cloth' | 'steel' | 'skin' | 'horse', THREE.MeshStandardMaterial>;
const palettes = new Map<Faction, Palette>();
const prototypes = new Map<string, THREE.Group>();
const ZERO: V3 = [0, 0, 0];

function palette(color: Faction): Palette {
  if (palettes.has(color)) return palettes.get(color)!;
  const light = color === 'w';
  const make = (name: string, value: number, metalness: number, roughness: number) => {
    const m = new THREE.MeshStandardMaterial({ color: value, metalness, roughness });
    m.name = `${color}-${name}`;
    return m;
  };
  const p = {
    armor: make('enamel-and-plate', light ? 0xf0dfb7 : 0x394755, .5, .41),
    gold: make('antique-trim', light ? 0xd8a74e : 0xbc704b, .85, .28),
    dark: make('leather-and-recesses', light ? 0x332d24 : 0x161b22, .22, .65),
    cloth: make('ceremonial-cloth', light ? 0xb1a687 : 0x761e32, .02, .87),
    steel: make('blade-edges', light ? 0xd8e1df : 0xa8b5bf, .92, .2),
    skin: make('skin', light ? 0xd2a07b : 0xbb8464, .01, .85),
    horse: make('warhorse', light ? 0x9c9483 : 0x3c3030, .07, .87),
  };
  palettes.set(color, p);
  return p;
}

/** A batch is one mesh per material, including all tiny rivets and ornaments. */
class Sculpt {
  parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  constructor(public group: THREE.Group, public p: Palette) {}
  add(g: THREE.BufferGeometry, material: THREE.Material, position: V3 = ZERO, rotation: V3 = ZERO, scale: V3 = [1, 1, 1]) {
    const matrix = new THREE.Matrix4().compose(new THREE.Vector3(...position), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)), new THREE.Vector3(...scale));
    g.applyMatrix4(matrix);
    const nonindexed = g.index ? g.toNonIndexed() : g;
    if (nonindexed !== g) g.dispose();
    if (!nonindexed.getAttribute('uv')) nonindexed.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(nonindexed.getAttribute('position').count * 2), 2));
    const list = this.parts.get(material) || [];
    list.push(nonindexed);
    this.parts.set(material, list);
    return this;
  }
  box(size: V3, at: V3, m: THREE.Material, rotation: V3 = ZERO, _bevel = .018) {
    return this.add(new THREE.BoxGeometry(...size), m, at, rotation);
  }
  // Voxel columns retain a fine 3–5 cm block silhouette at cinematic distance.
  ellipsoid(size: V3, at: V3, m: THREE.Material, rotation: V3 = ZERO, _segments = 12) {
    const max = Math.max(...size);
    const cell = max < .06 ? .022 : .044;
    const nx = Math.max(1, Math.ceil(size[0] * 2 / cell));
    const ny = Math.max(1, Math.ceil(size[1] * 2 / cell));
    const dx = size[0] * 2 / nx, dy = size[1] * 2 / ny;
    const transform = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...rotation));
    for (let iy = 0; iy < ny; iy++) for (let ix = 0; ix < nx; ix++) {
      const x = (ix + .5) * dx - size[0], y = (iy + .5) * dy - size[1];
      const radial = 1 - (x / size[0]) ** 2 - (y / size[1]) ** 2;
      if (radial <= .04) continue;
      const depth = Math.max(cell, Math.round(Math.sqrt(radial) * size[2] * 2 / cell) * cell);
      const local = new THREE.Vector3(x, y, 0).applyMatrix4(transform);
      this.box([dx * .987, dy * .987, depth], [at[0] + local.x, at[1] + local.y, at[2] + local.z], m, rotation);
    }
    return this;
  }
  cone(top: number, bottom: number, height: number, at: V3, m: THREE.Material, _segments = 10, rotation: V3 = ZERO) {
    const rows = Math.max(1, Math.ceil(height / .045));
    const transform = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...rotation));
    for (let i = 0; i < rows; i++) {
      const t = (i + .5) / rows, radius = bottom + (top - bottom) * t;
      const count = Math.max(1, Math.ceil(radius * 2 / .05));
      const step = radius * 2 / count;
      for (let j = 0; j < count; j++) {
        const x = (j + .5) * step - radius;
        const depth = Math.sqrt(Math.max(.01, 1 - (x / radius) ** 2)) * radius * 2;
        const local = new THREE.Vector3(x, (t - .5) * height, 0).applyMatrix4(transform);
        this.box([Math.max(.005, step), height / rows, Math.max(.006, Math.round(depth / .026) * .026)], [at[0] + local.x, at[1] + local.y, at[2] + local.z], m, rotation);
      }
    }
    return this;
  }
  rod(a: V3, b: V3, radius: number, m: THREE.Material, radius2 = radius, _sides = 8) {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b);
    const count = Math.max(1, Math.ceil(start.distanceTo(end) / .04));
    for (let i = 0; i <= count; i++) {
      const t = i / count, center = start.clone().lerp(end, t), r = radius + (radius2 - radius) * t;
      this.box([r * 2, Math.max(r * 2, .045), r * 2], center.toArray() as V3, m);
    }
    return this;
  }
  plate(points: number[][], depth: number, at: V3, m: THREE.Material, rotation: V3 = ZERO, _bevel = .009) {
    const bottom = Math.min(...points.map(p => p[1])), top = Math.max(...points.map(p => p[1]));
    const rows = Math.max(1, Math.ceil((top - bottom) / .032));
    const dy = (top - bottom) / rows;
    const transform = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...rotation));
    for (let row = 0; row < rows; row++) {
      const y = bottom + (row + .5) * dy;
      const hits: number[] = [];
      for (let i = 0; i < points.length; i++) {
        const a = points[i], b = points[(i + 1) % points.length];
        if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) hits.push(a[0] + (y - a[1]) / (b[1] - a[1]) * (b[0] - a[0]));
      }
      hits.sort((a, b) => a - b);
      for (let i = 0; i + 1 < hits.length; i += 2) {
        const width = Math.max(.008, Math.round((hits[i + 1] - hits[i]) / .014) * .014);
        const center = new THREE.Vector3((hits[i + 1] + hits[i]) * .5, y, 0).applyMatrix4(transform);
        this.box([width, dy, depth], [at[0] + center.x, at[1] + center.y, at[2] + center.z], m, rotation);
      }
    }
    return this;
  }
  curve(points: V3[], radius: number, m: THREE.Material, tubular = 16) {
    const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
    for (let i = 0; i < tubular; i++) this.rod(curve.getPoint(i / tubular).toArray() as V3, curve.getPoint((i + 1) / tubular).toArray() as V3, radius, m);
    return this;
  }
  ring(radius: number, thickness: number, at: V3, m: THREE.Material, rotation: V3 = ZERO) {
    const count = Math.ceil(radius * Math.PI * 2 / .038);
    const transform = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...rotation));
    for (let i = 0; i < count; i++) {
      const a = i / count * Math.PI * 2;
      const local = new THREE.Vector3(Math.round(Math.sin(a) * radius / .025) * .025, Math.round(Math.cos(a) * radius / .025) * .025, 0).applyMatrix4(transform);
      this.box([thickness * 2, thickness * 2, thickness * 2], [at[0] + local.x, at[1] + local.y, at[2] + local.z], m);
    }
    return this;
  }
  finish() {
    for (const [material, parts] of this.parts) {
      const geometry = mergeGeometries(parts, false)!;
      geometry.computeBoundingSphere();
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.name = `forged-${material.name}`;
      this.group.add(mesh);
      parts.forEach(g => g.dispose());
    }
    this.parts.clear();
  }
}

function joint(parent: THREE.Group, name: string, at: V3) {
  const g = new THREE.Group(); g.name = name; g.position.set(...at); parent.add(g); return g;
}

const chestShape = [[-.2, .12], [-.14, .21], [.14, .21], [.2, .12], [.15, -.11], [0, -.17], [-.15, -.11]];
const shieldShape = [[-.19, .2], [0, .27], [.19, .2], [.17, -.09], [0, -.3], [-.17, -.09]];
const wingShape = [[-.04, -.04], [.21, -.07], [.28, .06], [.2, .03], [.24, .14], [.14, .1], [.16, .23], [.04, .14]];

function emblem(s: Sculpt, at: V3, size = 1) {
  const [x, y, z] = at;
  s.plate([[0, -.05], [-.037, .015], [0, .083], [.037, .015]], .012, [x, y, z], s.p.gold, ZERO, .002);
  for (const sign of [-1, 1]) {
    s.plate([[0, .035], [sign * .14 * size, .092], [sign * .105 * size, .025], [sign * .07 * size, .018], [sign * .03 * size, -.025]], .009, [x, y, z], s.p.gold, ZERO, .002);
  }
}

function helmet(s: Sculpt, type: string, at: V3, scale = 1) {
  const [x, y, z] = at;
  const point = (dx: number, dy: number, dz: number): V3 => [x + dx * scale, y + dy * scale, z + dz * scale];
  const block = (size: V3, loc: V3, material: THREE.Material) => s.box(size.map(n => n * scale) as V3, point(...loc), material);
  // Large expressive faces follow the fine-voxel hero reference: sculpted jaw,
  // square eyes, stepped hair, and open-faced antique helmets.
  block([.28, .22, .215], [0, -.004, .027], s.p.skin);
  block([.24, .065, .196], [0, -.137, .027], s.p.skin);
  block([.19, .032, .17], [0, -.18, .018], s.p.skin);
  block([.039, .057, .052], [0, -.051, .153], s.p.skin);
  for (const side of [-1, 1]) {
    block([.063, .066, .016], [side * .077, .006, .143], s.p.dark);
    block([.022, .025, .019], [side * .077 - .012, .022, .155], s.p.armor);
    block([.075, .018, .02], [side * .077, .065, .15], s.p.dark);
    block([.036, .045, .086], [side * .155, -.04, .01], s.p.skin);
  }
  block([.063, .015, .01], [0, -.121, .131], s.p.dark);
  // Pixel-built helmet shell: no spheres or smoothly rounded head primitives.
  block([.34, .077, .27], [0, .113, 0], s.p.armor);
  block([.28, .052, .22], [0, .177, -.012], s.p.armor);
  block([.21, .026, .17], [0, .216, -.015], s.p.armor);
  block([.35, .023, .028], [0, .086, .145], s.p.gold);
  block([.035, .12, .045], [0, .173, .119], s.p.gold);
  for (const side of [-1, 1]) {
    block([.05, .19, .17], [side * .16, -.022, -.033], s.p.armor);
    block([.047, .036, .15], [side * .163, -.131, -.015], s.p.gold);
    block([.06, .04, .034], [side * .152, .057, .139], s.p.gold);
  }
  if (type === 'p' || type === 'n' || type === 'r') {
    for (let i = 0; i < 8; i++) {
      const dz = (i - 3.5) * .041;
      const rise = Math.round((.075 + Math.sin(i / 7 * Math.PI) * .07) / .023) * .023;
      block([.057, rise, .043], [0, .213 + rise / 2, dz - .016], s.p.cloth);
      block([.065, .02, .045], [0, .216, dz - .016], s.p.gold);
    }
  }
  if (type === 'k' || type === 'q') {
    block([.372, .054, .286], [0, .15, 0], s.p.gold);
    block([.275, .038, .2], [0, .169, 0], s.p.armor);
    for (const side of [-1, 1]) {
      block([.04, .115, .045], [side * .16, .224, .124], s.p.gold);
      block([.044, .086, .04], [side * .16, .21, -.124], s.p.gold);
    }
    block([.056, .13, .044], [0, .242, .124], s.p.gold);
    block([.028, .036, .01], [0, .217, .153], s.p.cloth);
    if (type === 'k') {
      // Three stepped beard tiers distinguish the broad commander.
      block([.21, .062, .052], [0, -.15, .114], s.p.dark);
      block([.146, .05, .04], [0, -.199, .119], s.p.dark);
      block([.081, .035, .031], [0, -.236, .119], s.p.dark);
    } else {
      // Individually stacked long hair locks, offset to create a sculpted block fall.
      for (const side of [-1, 1]) for (let i = 0; i < 7; i++) {
        block([.053 + i % 2 * .015, .063, .11], [side * (.163 + Math.floor(i / 3) * .016), .073 - i * .055, -.006 - i % 2 * .027], s.p.dark);
        block([.043, .035, .085], [side * (.191 + Math.floor(i / 3) * .013), .055 - i * .055, -.02], s.p.gold);
      }
    }
  }
  if (type === 'b') {
    for (let i = 0; i < 6; i++) {
      block([.3 - i * .038, .046, .18 - i * .018], [0, .15 + i * .041, -.006], s.p.armor);
      block([.025, .046, .021], [0, .15 + i * .041, .094 - i * .009], s.p.gold);
    }
    block([.134, .025, .022], [0, .222, .092], s.p.gold);
  }
}

function sword(s: Sculpt, at: V3, length: number, broad = false) {
  const [x, y, z] = at;
  const w = broad ? .065 : .044;
  s.rod([x, y - .085, z], [x, y + .07, z], .022, s.p.dark);
  s.cone(.03, .023, .036, [x, y - .096, z], s.p.gold, 8);
  s.box([broad ? .22 : .17, .035, .055], [x, y + .07, z], s.p.gold);
  s.plate([[-w, 0], [-w * .84, length * .76], [0, length], [w * .84, length * .76], [w, 0]], .025, [x, y + .088, z], s.p.steel, ZERO, .006);
  s.plate([[-.009, 0], [0, length * .92], [.009, 0]], .008, [x, y + .095, z + .022], s.p.gold, ZERO, .001);
}

function shield(s: Sculpt, at: V3, scale = 1) {
  const points = shieldShape.map(([x, y]) => [x * scale, y * scale]);
  s.plate(points, .038, at, s.p.gold, [0, -.13, 0], .015);
  s.plate(points.map(([x, y]) => [x * .88, y * .89]), .025, [at[0], at[1], at[2] + .027], s.p.armor, [0, -.13, 0]);
  s.box([.027, .34 * scale, .025], [at[0], at[1] - .01, at[2] + .05], s.p.gold);
  emblem(s, [at[0], at[1] + .025, at[2] + .07], .72 * scale);
  for (const side of [-1, 1]) for (const y of [-.02, .135]) s.ellipsoid([.01, .01, .01], [at[0] + side * .12 * scale, at[1] + y * scale, at[2] + .063], s.p.gold, ZERO, 6);
}

function cape(parent: THREE.Group, p: Palette, top: number, length: number, wide = .25) {
  const g = joint(parent, 'cape', [0, top, -.13]);
  const s = new Sculpt(g, p);
  const rows = Math.ceil(length / .066);
  for (let row = 0; row < rows; row++) {
    const t = row / rows, halfWidth = wide * (.6 + Math.floor(t * 4) * .13);
    const columns = Math.ceil(halfWidth * 2 / .063), cell = halfWidth * 2 / columns;
    for (let column = 0; column < columns; column++) {
      const x = -halfWidth + (column + .5) * cell;
      const z = -Math.floor(t * 5) * .026 + (column % 3 === 1 ? .025 : 0);
      s.box([cell, length / rows + .004, .035], [x, -(row + .5) * length / rows, z], p.cloth);
      if (column === 0 || column === columns - 1 || row === rows - 1) s.box([column === 0 || column === columns - 1 ? .019 : cell, row === rows - 1 ? .026 : length / rows, .009], [x, -(row + .5) * length / rows, z - .023], p.gold);
    }
  }
  s.finish(); return g;
}

function soldier(parent: THREE.Group, type: string, p: Palette, at: V3 = ZERO, size = 1, mounted = false) {
  const figure = joint(parent, 'figure', at); figure.scale.setScalar(size);
  const torso = joint(figure, 'torso', [0, .67, 0]);
  const body = joint(torso, 'body', [0, -.67, 0]); const s = new Sculpt(body, p);
  const royal = type === 'k' || type === 'q';
  // Breastplate, segmented abdominal armor, riveted belt and hanging leather pteruges.
  s.ellipsoid([.2, .24, .135], [0, .86, 0], p.dark);
  s.plate(chestShape, .115, [0, .9, .055], p.armor, ZERO, .025);
  s.plate(chestShape.map(([x, y]) => [x * .82, y * .82]), .045, [0, .912, .131], p.gold, ZERO, .012);
  s.ellipsoid([.145, .12, .042], [0, .96, .17], p.armor);
  emblem(s, [0, .945, .22], .85);
  for (let i = 0; i < 3; i++) s.box([.28 - i * .015, .058, .18], [0, .77 - i * .047, .015], i === 2 ? p.gold : p.armor, ZERO, .016);
  s.box([.068, .075, .024], [0, .68, .122], p.gold);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7 * 2 - 1) * Math.PI * .87;
    s.box([.054, .19, .033], [Math.sin(a) * .143, .558, Math.cos(a) * .105], p.dark, [0, a, -Math.sin(a) * .13]);
    s.box([.057, .05, .035], [Math.sin(a) * .156, .48, Math.cos(a) * .113], p.gold, [0, a, -Math.sin(a) * .13]);
  }
  s.cone(.085, .097, .1, [0, 1.13, 0], p.dark);
  const head = joint(torso, 'head', [0, 1.265 - .67, .006]);
  const hs = new Sculpt(head, p);
  helmet(hs, type, ZERO, royal ? 1.06 : 1);
  hs.finish();
  if (royal) {
    for (const side of [-1, 1]) {
      s.plate(wingShape.map(([x, y]) => [x * side, y * .68]), .055, [side * .22, 1.062, -.015], p.gold, [0, side * -.1, side * -.15]);
      for (let i = 0; i < 4; i++) s.ellipsoid([.033, .04, .032], [side * (.12 + i * .031), 1.116 - i * .008, -.078], p.armor, ZERO, 8);
    }
    s.curve([[-.13, 1.09, .09], [0, .99, .218], [.13, 1.09, .09]], .012, p.gold);
  }
  if (type === 'b' || type === 'q') {
    for (let i = 0; i < 9; i++) {
      const a = i / 9 * Math.PI * 2;
      s.plate([[-.048, 0], [-.065, -.38], [0, -.42], [.065, -.38], [.048, 0]], .025, [Math.sin(a) * .16, .63, Math.cos(a) * .12], p.cloth, [0, a, 0]);
    }
    for (const side of [-1, 1]) s.box([.028, .39, .03], [side * .09, .46, .153], p.gold, [0, 0, side * -.12]);
  }
  s.finish();
  // Pivoted greaves and sabatons have layered guards, not capsule placeholder legs.
  for (const side of [-1, 1]) {
    const leg = joint(figure, side < 0 ? 'leg-left' : 'leg-right', [side * .092, .59, 0]);
    const l = new Sculpt(leg, p);
    l.cone(.071, .063, .215, [0, -.11, 0], p.dark);
    l.ellipsoid([.083, .077, .061], [0, -.231, .024], p.gold);
    l.plate([[-.06, .115], [0, .14], [.06, .115], [.04, -.125], [-.04, -.125]], .058, [0, -.347, .016], p.armor, ZERO, .012);
    l.rod([0, -.245, .065], [0, -.439, .06], .013, p.gold);
    l.box([.14, .078, .225], [0, -.49, .038], p.dark, ZERO, .022);
    l.box([.135, .037, .15], [0, -.467, .085], p.armor, [-.09, 0, 0], .015);
    l.finish();
    if (mounted) { leg.rotation.z = side * .24; leg.rotation.x = -.26; }
  }
  for (const side of [-1, 1]) {
    const arm = joint(torso, side < 0 ? 'weapon-arm' : 'shield-arm', [side * .222, 1.025 - .67, .004]);
    const upper = new Sculpt(arm, p);
    upper.ellipsoid([.104, .088, .115], [side * .012, -.004, 0], p.gold);
    upper.ellipsoid([.107, .06, .098], [side * .022, .024, .008], p.armor);
    upper.cone(.061, .055, .175, [side * .019, -.143, .015], p.dark, 8, [0, 0, side * -.08]);
    upper.finish();
    const elbow = joint(arm, side < 0 ? 'weapon-elbow' : 'shield-elbow', [side * .025, -.222, .025]);
    const forearm = new Sculpt(elbow, p);
    forearm.ellipsoid([.068, .069, .07], ZERO, p.gold);
    forearm.box([.115, .17, .115], [side * .004, -.082, .032], p.armor, [-.32, 0, 0], .026);
    forearm.box([.118, .026, .122], [side * .004, -.038, .01], p.gold, [-.32, 0, 0]);
    forearm.finish();
    const wrist = joint(elbow, side < 0 ? 'weapon-wrist' : 'shield-wrist', [side * .004, -.156, .084]);
    const hand = new Sculpt(wrist, p);
    // A closed voxel gauntlet wraps the actual hilt. Hand and weapon share the
    // wrist transform; no animation can detach the grip from the fingers.
    hand.box([.078, .09, .032], [0, 0, -.027], p.dark);
    hand.box([.083, .029, .053], [0, .042, -.013], p.armor);
    for (let finger = 0; finger < 3; finger++) hand.box([.077, .021, .028], [0, -.027 + finger * .025, .025], p.armor);
    hand.box([.024, .051, .058], [side * -.041, .012, .002], p.gold);
    hand.finish();
    if (side < 0) {
      const held = joint(wrist, 'held-weapon', ZERO);
      const weapon = new Sculpt(held, p);
      if (type === 'b') {
        weapon.rod([0, -.512, 0], [0, .848, 0], .019, p.dark);
        weapon.rod([0, .628, 0], [0, .848, 0], .023, p.gold);
        weapon.ring(.108, .023, [0, .818, 0], p.gold);
        weapon.plate([[0, -.11], [-.055, 0], [0, .13], [.055, 0]], .035, [0, .818, 0], p.steel);
        weapon.box([.16, .025, .045], [0, .818, 0], p.gold);
        joint(held, 'blade-base', [0, .70, 0]);
        joint(held, 'blade-tip', [0, .948, 0]);
      } else if (type === 'n') {
        weapon.rod([0, -.312, 0], [0, 1.158, 0], .019, p.dark);
        weapon.plate([[-.045, 0], [0, .24], [.045, 0]], .028, [0, 1.158, 0], p.steel);
        weapon.plate([[0, 0], [.24, -.025], [.14, -.1], [.23, -.16], [0, -.145]], .012, [0, 1.088, .004], p.cloth, ZERO, .001);
        joint(held, 'blade-base', [0, 1.158, 0]);
        joint(held, 'blade-tip', [0, 1.398, 0]);
      } else {
        const length = type === 'k' ? .67 : type === 'q' ? .62 : .49;
        sword(weapon, ZERO, length, type === 'k');
        joint(held, 'blade-base', [0, .088, 0]);
        joint(held, 'blade-tip', [0, .088 + length, 0]);
      }
      weapon.finish();
    } else {
      const equipment = new Sculpt(wrist, p);
      if (type !== 'b' && type !== 'q') shield(equipment, [0, .158, .055], type === 'k' ? 1.05 : .88);
      else equipment.ellipsoid([.057, .071, .055], [.056, .078, .031], p.gold, ZERO, 8);
      equipment.finish();
    }
  }
  cape(torso, p, 1.085 - .67, royal ? .87 : type === 'b' ? .83 : .61, royal ? .31 : .24);
  return figure;
}

function warhorse(parent: THREE.Group, p: Palette) {
  const horse = joint(parent, 'horse', ZERO); const s = new Sculpt(horse, p);
  s.ellipsoid([.215, .235, .35], [0, .585, -.045], p.horse);
  s.ellipsoid([.2, .24, .21], [0, .615, .18], p.horse, [.12, 0, 0]);
  s.ellipsoid([.135, .29, .15], [0, .87, .25], p.horse, [.34, 0, 0]);
  s.ellipsoid([.117, .14, .205], [0, 1.08, .345], p.horse, [-.39, 0, 0]);
  s.ellipsoid([.108, .085, .116], [0, 1.02, .5], p.horse);
  for (const side of [-1, 1]) {
    s.cone(.009, .048, .14, [side * .077, 1.218, .307], p.horse, 5, [-.3, 0, side * -.18]);
    s.ellipsoid([.014, .012, .013], [side * .109, 1.106, .396], p.dark, ZERO, 8);
    // Layered lamellar barding with bright scalloped edges.
    for (let i = 0; i < 4; i++) {
      s.plate([[-.075, .095], [.073, .095], [.069, -.09], [0, -.126], [-.07, -.09]], .028, [side * .205, .67, .18 - i * .137], i % 2 ? p.armor : p.gold, [0, side * Math.PI / 2, 0]);
    }
    s.curve([[side * .107, 1.095, .49], [side * .17, .95, .19], [side * .19, .97, -.035]], .009, p.dark, 10);
    s.box([.033, .025, .26], [side * .107, 1.115, .37], p.gold, [-.4, 0, 0], .005);
  }
  s.box([.24, .032, .035], [0, 1.044, .495], p.gold, [-.4, 0, 0]);
  s.plate([[-.088, -.06], [0, .18], [.088, -.06], [0, -.17]], .028, [0, 1.124, .409], p.armor, [-.5, 0, 0]);
  for (let i = 0; i < 9; i++) s.plate([[-.05, 0], [0, .08], [.05, 0]], .05, [0, 1.07 - i * .038, .22 - i * .013], p.cloth, [0, Math.PI / 2, 0]);
  s.box([.29, .065, .22], [0, .816, -.08], p.dark, ZERO, .02);
  s.box([.34, .1, .075], [0, .863, .015], p.gold, ZERO, .018);
  s.curve([[0, .65, -.35], [.025, .48, -.45], [.015, .22, -.44]], .055, p.dark);
  s.finish();
  for (const side of [-1, 1]) for (const front of [-1, 1]) {
    const g = joint(horse, `horse-leg-${side}-${front}`, [side * .145, .575, front * .217 - .04]);
    const l = new Sculpt(g, p);
    l.rod([0, 0, 0], [0, -.25, front > 0 ? -.028 : .044], .065, p.horse, .045);
    l.ellipsoid([.056, .061, .059], [0, -.257, front > 0 ? -.028 : .044], p.gold);
    l.rod([0, -.27, front > 0 ? -.028 : .044], [0, -.46, .025], .03, p.horse, .034);
    l.box([.102, .068, .145], [0, -.495, .045], p.dark, ZERO, .02);
    l.box([.075, .09, .055], [0, -.31, .038], p.armor);
    l.finish();
  }
  const rider = soldier(horse, 'n', p, [0, .42, -.105], .73, true);
  rider.name = 'rider';
  return horse;
}

function chariot(parent: THREE.Group, p: Palette) {
  const vehicle = joint(parent, 'chariot', ZERO); const s = new Sculpt(vehicle, p);
  // A fortified ancient scythed war-carriage: axle, spoked wheels and riveted prow.
  s.box([.74, .13, .65], [0, .275, -.005], p.dark, ZERO, .045);
  s.box([.76, .05, .67], [0, .35, -.005], p.gold);
  s.rod([-.51, .28, -.08], [.51, .28, -.08], .041, p.dark);
  s.plate([[-.38, -.125], [-.36, .18], [-.22, .23], [0, .2], [.22, .23], [.36, .18], [.38, -.125]], .095, [0, .51, .285], p.gold, [-.12, 0, 0], .02);
  s.plate([[-.31, -.08], [-.3, .125], [0, .14], [.3, .125], [.31, -.08]], .035, [0, .51, .344], p.armor, [-.12, 0, 0]);
  emblem(s, [0, .535, .382], 1.45);
  for (const side of [-1, 1]) {
    s.box([.05, .3, .57], [side * .34, .48, -.026], p.armor, ZERO, .02);
    s.box([.066, .055, .58], [side * .34, .65, -.024], p.gold);
    for (const z of [-.26, -.075, .11]) s.box([.067, .06, .095], [side * .34, .702, z], p.gold);
    for (let i = 0; i < 4; i++) s.ellipsoid([.013, .012, .014], [side * (.14 + .051 * i), .6, .377], p.gold, ZERO, 6);
    s.plate([[-.05, -.02], [0, .2], [.05, -.02]], .022, [side * .39, .33, .38], p.steel, [Math.PI / 2, 0, 0]);
  }
  // Driver and tall command standard make the rook unmistakable from above.
  const driver = joint(vehicle, 'figure', ZERO);
  const driverBody = new Sculpt(driver, p);
  driverBody.ellipsoid([.125, .16, .08], [0, .79, -.08], p.armor);
  driverBody.box([.25, .05, .16], [0, .86, -.08], p.gold);
  driverBody.finish();
  const driverHead = joint(driver, 'head', [0, 1.035, -.063]);
  const driverHelmet = new Sculpt(driverHead, p);
  helmet(driverHelmet, 'r', ZERO, .8);
  driverHelmet.finish();
  for (const side of [-1, 1]) {
    const arm = joint(driver, side < 0 ? 'weapon-arm' : 'shield-arm', [side * .12, .855, -.065]);
    const driverArm = new Sculpt(arm, p);
    driverArm.rod(ZERO, [side * .05, -.185, .235], .044, p.armor);
    driverArm.box([.075, .045, .07], [side * .05, -.185, .235], p.gold);
    driverArm.finish();
  }
  s.rod([-.17, .67, .17], [.17, .67, .17], .015, p.dark);
  s.rod([.245, .33, -.22], [.245, 1.5, -.22], .016, p.gold);
  s.plate([[-.17, 0], [.17, 0], [.15, -.33], [0, -.39], [-.15, -.33]], .013, [.245, 1.42, -.225], p.cloth, ZERO, .002);
  s.box([.38, .025, .03], [.245, 1.445, -.218], p.gold);
  emblem(s, [.245, 1.25, -.207], .85);
  s.plate([[-.07, -.05], [0, .07], [.07, -.05]], .025, [.245, 1.515, -.22], p.gold);
  s.finish();
  for (const side of [-1, 1]) {
    const wheel = joint(vehicle, `wheel-${side}`, [side * .437, .28, -.08]); const w = new Sculpt(wheel, p);
    w.ring(.24, .032, ZERO, p.dark, [0, Math.PI / 2, 0]);
    w.ring(.237, .018, [side * .04, 0, 0], p.gold, [0, Math.PI / 2, 0]);
    for (let i = 0; i < 10; i++) {
      const a = i / 10 * Math.PI * 2;
      w.rod([0, 0, 0], [0, Math.cos(a) * .218, Math.sin(a) * .218], .015, p.gold);
      w.ellipsoid([.009, .011, .011], [side * .041, Math.cos(a) * .237, Math.sin(a) * .237], p.steel, ZERO, 5);
    }
    w.cone(.049, .064, .1, ZERO, p.gold, 10, [0, 0, Math.PI / 2]);
    w.cone(0, .047, .1, [side * .093, 0, 0], p.steel, 5, [0, 0, side * -Math.PI / 2]);
    w.finish();
  }
  return vehicle;
}

/** Bake the resting sculpture into 6–7 shared-material meshes, reserving the rig for action. */
function bakeRest(rig: THREE.Group, p: Palette) {
  rig.updateMatrixWorld(true);
  const resting = new THREE.Group(); resting.name = 'resting'; const s = new Sculpt(resting, p);
  rig.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const geometry = object.geometry.clone().applyMatrix4(object.matrixWorld);
    s.add(geometry, object.material as THREE.Material);
  });
  s.finish(); return resting;
}

export function createPiece(type: string, color: Faction): THREE.Group {
  const key = `${color}-${type}`;
  if (!prototypes.has(key)) {
    const root = new THREE.Group(); root.name = `legion-${key}`; root.userData = { type, color };
    const p = palette(color), rig = new THREE.Group(); rig.name = 'articulated';
    if (type === 'r') { const vehicle = chariot(rig, p); vehicle.scale.setScalar(.98); vehicle.position.y = .006; }
    else if (type === 'n') warhorse(rig, p).scale.setScalar(.95);
    else soldier(rig, type, p, [0, 0, 0], type === 'p' ? .9 : type === 'k' ? 1.055 : type === 'q' ? 1.015 : 1);
    // All archetypes have a tiny shared oval footplate, helping clicks and grounding.
    const base = new Sculpt(rig, p);
    base.cone(.43, .45, .048, [0, .026, 0], p.dark, 32);
    base.cone(.435, .435, .013, [0, .049, 0], p.gold, 32);
    base.finish();
    const rest = bakeRest(rig, p); root.add(rest, rig); rig.visible = false;
    root.userData.height = type === 'n' ? 1.82 : type === 'r' ? 1.56 : type === 'p' ? 1.46 : type === 'b' ? 1.65 : 1.7;
    prototypes.set(key, root);
  }
  const root = prototypes.get(key)!.clone(true);
  root.userData = { ...prototypes.get(key)!.userData };
  return root;
}

interface RigState {
  rest: THREE.Object3D; rig: THREE.Object3D; figure?: THREE.Object3D; cape?: THREE.Object3D;
  left?: THREE.Object3D; right?: THREE.Object3D; weapon?: THREE.Object3D; shield?: THREE.Object3D; head?: THREE.Object3D;
  torso?: THREE.Object3D; elbow?: THREE.Object3D; wrist?: THREE.Object3D; shieldElbow?: THREE.Object3D; shieldWrist?: THREE.Object3D;
  defaults: { object: THREE.Object3D; position: THREE.Vector3; rotation: THREE.Euler }[];
  horse?: THREE.Object3D; horseLegs: THREE.Object3D[]; chariot?: THREE.Object3D; wheels: THREE.Object3D[];
}
const stateCache = new WeakMap<THREE.Group, RigState>();

/** Actual cutting-edge sockets, never proxy points attached to the piece root. */
export function getWeaponPose(root: THREE.Group): { base: THREE.Vector3; tip: THREE.Vector3 } | null {
  const rig = root.getObjectByName('articulated');
  const base = rig?.getObjectByName('blade-base');
  const tip = rig?.getObjectByName('blade-tip');
  if (!base || !tip) return null;
  root.updateWorldMatrix(true, true);
  return { base: base.getWorldPosition(new THREE.Vector3()), tip: tip.getWorldPosition(new THREE.Vector3()) };
}

interface StrikePose { hand: V3; blade: V3; elbow: V3; torso: V3; roll: number }
const restStrike: StrikePose = {
  hand: [-.251, .647, .113], blade: [0, 1, 0], elbow: [-.247, .803, .029], torso: [0, 0, 0], roll: 0,
};

function blendPose(a: StrikePose, b: StrikePose, t: number): StrikePose {
  const mix = (x: V3, y: V3): V3 => x.map((v, i) => v + (y[i] - v) * t) as V3;
  return { hand: mix(a.hand, b.hand), blade: mix(a.blade, b.blade), elbow: mix(a.elbow, b.elbow), torso: mix(a.torso, b.torso), roll: a.roll + (b.roll - a.roll) * t };
}

/** Two rigid arm bones, solved without scaling or stretching any geometry. */
function poseWeaponArm(state: RigState, pose: StrikePose) {
  if (!state.weapon || !state.elbow || !state.wrist) return;
  const shoulder = state.weapon.position.clone();
  const upperRest = state.elbow.position.clone(), lowerRest = state.wrist.position.clone();
  const upperLength = upperRest.length(), lowerLength = lowerRest.length();
  const requested = new THREE.Vector3(...pose.hand); requested.y -= .67;
  const direction = requested.clone().sub(shoulder);
  const distance = THREE.MathUtils.clamp(direction.length(), Math.abs(upperLength - lowerLength) + .001, upperLength + lowerLength - .0001);
  direction.normalize();
  const hand = shoulder.clone().addScaledVector(direction, distance);
  const pole = new THREE.Vector3(...pose.elbow); pole.y -= .67;
  pole.sub(shoulder).addScaledVector(direction, -pole.dot(direction));
  if (pole.lengthSq() < .000001) pole.set(-1, 0, 0).addScaledVector(direction, direction.x);
  pole.normalize();
  const along = (upperLength ** 2 - lowerLength ** 2 + distance ** 2) / (2 * distance);
  const height = Math.sqrt(Math.max(0, upperLength ** 2 - along ** 2));
  const elbow = shoulder.clone().addScaledVector(direction, along).addScaledVector(pole, height);
  const upperRotation = new THREE.Quaternion().setFromUnitVectors(upperRest.normalize(), elbow.clone().sub(shoulder).normalize());
  state.weapon.quaternion.copy(upperRotation);
  const lowerDirection = hand.sub(elbow).normalize().applyQuaternion(upperRotation.clone().invert());
  const lowerRotation = new THREE.Quaternion().setFromUnitVectors(lowerRest.normalize(), lowerDirection);
  state.elbow.quaternion.copy(lowerRotation);
  // Orient the gripped weapon, with the entire hand following the wrist. The
  // weapon itself never slides or rotates within the fingers.
  const bladeRotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...pose.blade).normalize());
  bladeRotation.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), pose.roll));
  state.wrist.quaternion.copy(upperRotation.clone().multiply(lowerRotation).invert().multiply(bladeRotation));
}

function animateStrike(state: RigState, type: string, progress: number, time: number) {
  const p = THREE.MathUtils.clamp(progress, 0, 1);
  if (p === 0 || p === 1) return;
  if (type === 'r') {
    // The carriage attacks with its plated prow; its driver braces on the rail.
    const brace = Math.sin(Math.PI * p);
    if (state.chariot) state.chariot.rotation.x = -.06 * brace;
    if (state.head) state.head.rotation.x = .1 * brace;
    state.wheels.forEach(wheel => { wheel.rotation.x = p * Math.PI * 3; });
    return;
  }
  const queen = type === 'q', king = type === 'k', knight = type === 'n', bishop = type === 'b';
  let windup: StrikePose = {
    hand: [-.35, 1.285, -.06], blade: [-.28, .82, -.52], elbow: [-.44, 1.01, -.085], torso: [-.065, -.38, .045], roll: -.25,
  };
  let contact: StrikePose = {
    hand: [-.15, .99, .37], blade: [.16, .015, 1], elbow: [-.39, .85, .16], torso: [.085, .08, -.025], roll: .35,
  };
  let follow: StrikePose = {
    hand: [-.06, .765, .20], blade: [.78, -.40, .40], elbow: [-.32, .83, .04], torso: [.09, .42, -.06], roll: .65,
  };
  if (queen) {
    windup = { hand: [-.39, 1.24, -.045], blade: [-.59, .7, -.34], elbow: [-.44, .965, -.085], torso: [-.055, -.48, .08], roll: -.42 };
    contact = { hand: [-.13, 1.0, .35], blade: [.30, -.23, 1], elbow: [-.39, .88, .13], torso: [.075, .08, -.035], roll: .47 };
    follow = { hand: [-.04, .79, .185], blade: [.88, -.43, .24], elbow: [-.31, .85, .01], torso: [.075, .51, -.08], roll: .82 };
  } else if (king) {
    windup = { hand: [-.23, 1.335, -.025], blade: [-.08, .89, -.45], elbow: [-.405, 1.08, -.085], torso: [-.11, -.21, .02], roll: -.07 };
    contact = { hand: [-.13, .99, .368], blade: [.035, -.14, 1], elbow: [-.38, .85, .17], torso: [.12, .04, -.015], roll: .12 };
    follow = { hand: [-.095, .75, .225], blade: [.42, -.60, .67], elbow: [-.32, .81, .08], torso: [.14, .30, -.035], roll: .31 };
  } else if (knight) {
    windup = { hand: [-.34, .91, -.03], blade: [.08, .38, 1], elbow: [-.41, .83, -.06], torso: [-.04, -.24, .015], roll: .06 };
    contact = { hand: [-.12, 1.03, .365], blade: [.12, -.20, 1], elbow: [-.38, .86, .16], torso: [.065, .025, 0], roll: .03 };
    follow = { hand: [-.16, 1.0, .35], blade: [.13, -.23, 1], elbow: [-.39, .85, .14], torso: [.085, .09, -.01], roll: .08 };
  } else if (bishop) {
    windup = { hand: [-.36, 1.19, -.08], blade: [-.42, .74, -.43], elbow: [-.43, .95, -.08], torso: [-.055, -.42, .045], roll: -.18 };
    contact = { hand: [-.18, .995, .36], blade: [.12, .015, 1], elbow: [-.41, .86, .14], torso: [.08, .035, -.025], roll: .32 };
    follow = { hand: [-.075, .80, .20], blade: [.71, -.47, .53], elbow: [-.34, .85, .035], torso: [.095, .43, -.055], roll: .59 };
  }
  const smooth = (t: number) => t * t * (3 - 2 * t);
  let pose: StrikePose;
  if (p < .32) pose = blendPose(restStrike, windup, smooth(p / .32));
  else if (p < .5) pose = blendPose(windup, contact, ((p - .32) / .18) ** 2);
  else if (p < .72) pose = blendPose(contact, follow, 1 - (1 - (p - .5) / .22) ** 2);
  else pose = blendPose(follow, restStrike, smooth((p - .72) / .28));
  if (state.torso) state.torso.rotation.set(...pose.torso);
  poseWeaponArm(state, pose);
  const brace = Math.sin(Math.PI * p);
  if (state.shield) { state.shield.rotation.x = -.23 * brace; state.shield.rotation.z = .055 * brace; }
  if (state.shieldElbow) state.shieldElbow.rotation.x = -.43 * brace;
  if (state.shieldWrist) state.shieldWrist.rotation.y = -.13 * brace;
  if (state.head) { state.head.rotation.y = -pose.torso[1] * .55; state.head.rotation.x = -pose.torso[0] * .35; }
  if (state.cape) { state.cape.rotation.x = .12 * brace; state.cape.rotation.z = -.08 * Math.sin(p * Math.PI * 2) + Math.sin(time * 8) * .013 * brace; }
  // Feet and horse legs remain planted throughout the strike. Torso rotation
  // transfers the swing while the root is reserved for game-level approach.
}

export function animatePiece(root: THREE.Group, mode: Mode, progress: number, time: number): void {
  let state = stateCache.get(root);
  if (!state) {
    const rig = root.getObjectByName('articulated')!;
    state = {
      rest: root.getObjectByName('resting')!, rig, figure: rig.getObjectByName('figure') || rig.getObjectByName('rider'),
      cape: rig.getObjectByName('cape'), left: rig.getObjectByName('leg-left'), right: rig.getObjectByName('leg-right'),
      weapon: rig.getObjectByName('weapon-arm'), shield: rig.getObjectByName('shield-arm'), head: rig.getObjectByName('head'), defaults: [],
      torso: rig.getObjectByName('torso'), elbow: rig.getObjectByName('weapon-elbow'), wrist: rig.getObjectByName('weapon-wrist'),
      shieldElbow: rig.getObjectByName('shield-elbow'), shieldWrist: rig.getObjectByName('shield-wrist'),
      horse: rig.getObjectByName('horse'), chariot: rig.getObjectByName('chariot'),
      horseLegs: [-1, 1].flatMap(side => [-1, 1].map(front => rig.getObjectByName(`horse-leg-${side}-${front}`)!)).filter(Boolean),
      wheels: [-1, 1].map(side => rig.getObjectByName(`wheel-${side}`)!).filter(Boolean),
    };
    rig.traverse(object => { if (object instanceof THREE.Group) state!.defaults.push({ object, position: object.position.clone(), rotation: object.rotation.clone() }); });
    stateCache.set(root, state);
  }
  state.defaults.forEach(({ object, position, rotation }) => { object.position.copy(position); object.rotation.copy(rotation); });
  const active = mode !== 'idle'; state.rest.visible = !active; state.rig.visible = active;
  if (!active) {
    // Idle breathing is intentionally subtle; cached resting meshes keep the board fast.
    state.rest.position.y = Math.sin(time * 1.45 + root.position.x * .43) * .002;
    return;
  }
  if (mode === 'attack') {
    animateStrike(state, root.userData.type, progress, time);
    return;
  }
  if (mode === 'fear') {
    const fear = Math.max(.25, Math.min(1, progress)), shake = Math.sin(time * 43) * fear;
    state.rig.position.y = -.029 * fear + Math.abs(shake) * .011;
    state.rig.rotation.z = shake * .022;
    if (state.head) { state.head.rotation.z = .12 * fear + Math.sin(time * 27) * .045 * fear; state.head.rotation.x = -.1 * fear; }
    if (state.weapon) { state.weapon.rotation.z = -1.13 * fear; state.weapon.rotation.x = -.5 * fear + shake * .045; }
    if (state.shield) { state.shield.rotation.z = .8 * fear; state.shield.rotation.x = -.3 * fear; }
    if (state.left) state.left.rotation.x += .12 * fear + shake * .047;
    if (state.right) state.right.rotation.x += -.12 * fear - shake * .047;
    if (state.cape) state.cape.rotation.z = shake * .028;
    if (state.chariot) state.chariot.rotation.z = shake * .04;
    return;
  }
  if (mode === 'relief') {
    const p = Math.max(0, Math.min(1, progress));
    // The start matches fear; a chest pat, lowered shoulders and tilted-back
    // exhale make the release readable before returning exactly to the rest pose.
    const ease = (value: number) => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };
    const frightened = 1 - ease(p / .48);
    const gesture = Math.sin(Math.PI * Math.max(0, Math.min(1, (p - .12) / .76)));
    const shake = Math.sin(time * 43) * frightened;
    state.rig.position.y = -.029 * frightened + Math.abs(shake) * .011 - gesture * .009;
    state.rig.rotation.z = shake * .022;
    if (state.head) {
      state.head.rotation.z = .12 * frightened + Math.sin(time * 27) * .045 * frightened;
      state.head.rotation.x = -.1 * frightened - .21 * gesture;
      state.head.position.y += .018 * gesture;
    }
    if (state.weapon) {
      state.weapon.rotation.z = -1.13 * frightened + .63 * gesture;
      state.weapon.rotation.x = -.5 * frightened + shake * .045 - .32 * gesture;
      state.weapon.position.y -= .021 * gesture;
    }
    if (state.shield) {
      state.shield.rotation.z = .8 * frightened - .12 * gesture;
      state.shield.rotation.x = -.3 * frightened + .09 * gesture;
      state.shield.position.y -= .034 * gesture;
    }
    if (state.left) state.left.rotation.x += .12 * frightened + shake * .047;
    if (state.right) state.right.rotation.x += -.12 * frightened - shake * .047;
    if (state.figure) state.figure.rotation.x = .035 * gesture;
    if (state.cape) state.cape.rotation.z = shake * .028;
    if (state.chariot) { state.chariot.rotation.z = shake * .04; state.chariot.rotation.x = .025 * gesture; }
    return;
  }
  const p = Math.max(0, Math.min(1, progress)), envelope = Math.sin(Math.PI * p);
  const run = Math.sin(p * Math.PI * (root.userData.type === 'p' ? 9 : 7));
  state.rig.position.y = Math.abs(run) * .028 * envelope;
  state.rig.rotation.x = .075 * envelope;
  state.rig.rotation.z = run * .023 * envelope;
  if (state.left) state.left.rotation.x = root.userData.type === 'n' ? -.26 : run * .66 * envelope;
  if (state.right) state.right.rotation.x = root.userData.type === 'n' ? -.26 : -run * .66 * envelope;
  if (state.weapon) {
    state.weapon.rotation.x = -.2 * envelope - run * .2 * envelope;
    state.weapon.rotation.z = -.06 * envelope;
  }
  if (state.elbow) state.elbow.rotation.x = -.38 * envelope + run * .11 * envelope;
  if (state.wrist) state.wrist.rotation.x = .24 * envelope;
  if (state.shield) state.shield.rotation.x = run * .16 * envelope;
  if (state.cape) { state.cape.rotation.x = .35 * envelope + Math.sin(time * 9) * .06 * envelope; state.cape.rotation.z = run * .08 * envelope; }
  if (state.horse) {
    state.horse.position.y = Math.abs(run) * .045 * envelope;
    state.horse.rotation.x = run * .065 * envelope;
    state.horseLegs.forEach((leg, i) => { leg.rotation.x = Math.sin(p * Math.PI * 9 + (i === 0 || i === 3 ? 0 : Math.PI)) * .68 * envelope; });
  }
  if (state.chariot) {
    state.chariot.rotation.z = Math.sin(p * 45) * .018 * envelope;
    state.chariot.rotation.x = -Math.sin(p * Math.PI) * .06;
    state.wheels.forEach(wheel => { wheel.rotation.x = p * Math.PI * 11; });
  }
}
