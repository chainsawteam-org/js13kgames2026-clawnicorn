import { CEILING, type Toy } from "../game/sim";
import { FLOOR, MOUTH_X, MOUTH_Z, MOUTH_R, PYRAMID, TERRACES } from "../game/shapes";
import { W } from "./w";

const PINK = "#b94d86", DARK = "#302849", WHITE = "#fff8ee", GOLD = "#ffd05d";
const SPARKS = 10;

const cube = (n: string, g: string, x: number, y: number, z: number,
  w: number, h: number, d: number, b: string, extra: WSettings = {}) =>
  W.cube({ n, g, x, y, z, w, h, d, b, ...extra });

// La plataforma llena casi todo el interior del mueble. El montón mantiene sus
// límites físicos más compactos (X0…Z1) para conservar densidad y jugabilidad.
const TX0 = -4.25, TX1 = 4.25, TZ0 = -2.35, TZ1 = 2.25;
const BX = (TX0 + TX1) / 2, BZ = (TZ0 + TZ1) / 2;
const BW = TX1 - TX0, BD = TZ1 - TZ0, WALL = .25;

export function createScene(canvas: HTMLCanvasElement, toys: Toy[], shape: number) {
  W.reset(canvas);
  W.clearColor("#202541");
  let camDistance = 13;

  const applyCamera = (yaw: number, pitch: number) => {
    const a = yaw * Math.PI / 180, b = pitch * Math.PI / 180;
    W.camera({
      x: Math.sin(a) * camDistance, y: 1 + Math.sin(b) * camDistance,
      z: Math.cos(a) * camDistance, rx: -pitch, ry: yaw, fov: 30
    });
  };

  // W no llama nunca a gl.viewport y sólo rehace la proyección cuando se le pasa
  // fov, así que el reencuadre tiene que hacerse explícitamente en cada resize.
  const resize = (yaw: number, pitch: number) => {
    W.gl.viewport(0, 0, canvas.width, canvas.height);
    camDistance = canvas.width / canvas.height < 1.15 ? 16 : 12.5;
    applyCamera(yaw, pitch);
  };

  applyCamera(0, 10);
  W.light({ x: -.45, y: -.8, z: -.4 });
  W.ambient(.5);

  W.group({ n: "machine" });
  // Base estructural hundida: ya no comparte plano con la bandeja ni tapa el
  // agujero. La separación también da profundidad visible al conducto.
  cube("", "machine", 0, FLOOR - .96, 0, 10.4, .24, 6.8, DARK);
  cube("", "machine", 0, .2, -3.25, 10.4, 7.1, .25, "#514d82");
  cube("", "machine", 0, .25, -3.08, 8.7, 5.5, .05, "#625d96");
  cube("", "machine", 0, CEILING + .4, 0, 11, .8, 7.2, "#43345f");
  for (const x of [-5.2, 5.2]) for (const z of [-3.2, 3.2])
    cube("", "machine", x, .35, z, .5, 8.1, .5, x < 0 ? "#8e4879" : PINK);
  for (const x of [-4.94, 4.94]) cube("", "machine", x, .25, 3.47, .13, 6.6, .08, "#ffd766");
  cube("", "machine", 0, -4.05, 3.35, 10.8, 1.45, .7, "#6b3b69", { rx: -8 });

  // Rail, carriage and friendly decorations make the cabinet read at a glance.
  for (const z of [-1.65, 1.65]) cube("", "machine", 0, 3.72, z, 9.7, .12, .14, "#d8d2dc");
  for (let i = 0; i < 9; i++) {
    const x = -3.7 + i * .92, y = 1.1 + (i % 3) * .75;
    cube("", "machine", x, y, -2.9, .18, .18, .08, i % 2 ? "#d98cb1" : "#ffd066", { rz: 45 });
  }
  for (const x of [-2.8, 2.7]) {
    W.sphere({ n: "", g: "machine", x, y: 2.65, z: -2.93, w: 1.15, h: .42, d: .1, b: "#aaa9be" });
    W.sphere({ n: "", g: "machine", x: x + .45, y: 2.72, z: -2.92, w: .75, h: .55, d: .1, b: "#b8b7c8" });
  }

  // Bandeja de premios. Cuatro losas disjuntas rodean un hueco interior real;
  // ninguna cubre ni se solapa con otra. El pozo queda bastante por debajo.
  const GAP = MOUTH_R + .18;
  const HX0 = MOUTH_X - GAP, HX1 = MOUTH_X + GAP;
  const HZ0 = MOUTH_Z - GAP, HZ1 = MOUTH_Z + GAP;
  const SX0 = TX0 - WALL, SX1 = TX1 + WALL, SZ0 = TZ0 - WALL, SZ1 = TZ1 + WALL;
  const slab = (x0: number, x1: number, z0: number, z1: number) =>
    cube("", "machine", (x0 + x1) / 2, FLOOR - .08, (z0 + z1) / 2,
      x1 - x0, .16, z1 - z0, "#c02a69");
  slab(SX0, SX1, SZ0, HZ0);
  slab(SX0, SX1, HZ1, SZ1);
  slab(SX0, HX0, HZ0, HZ1);
  slab(HX1, SX1, HZ0, HZ1);

  const holeW = HX1 - HX0, holeD = HZ1 - HZ0, wellY = FLOOR - .42;
  cube("", "machine", MOUTH_X, FLOOR - .82, MOUTH_Z, holeW, .08, holeD, "#160714");
  cube("", "machine", HX0 + .06, wellY, MOUTH_Z, .12, .84, holeD, "#32102d");
  cube("", "machine", HX1 - .06, wellY, MOUTH_Z, .12, .84, holeD, "#32102d");
  cube("", "machine", MOUTH_X, wellY, HZ0 + .06, holeW, .84, .12, "#260c24");
  cube("", "machine", MOUTH_X, wellY, HZ1 - .06, holeW, .84, .12, "#44143b");

  // Un labio bajo enmarca la abertura sin ocultarla desde la cámara inicial.
  const lip = .1;
  cube("", "machine", HX0 - lip / 2, FLOOR + .07, MOUTH_Z, lip, .14, holeD + lip * 2, GOLD);
  cube("", "machine", HX1 + lip / 2, FLOOR + .07, MOUTH_Z, lip, .14, holeD + lip * 2, GOLD);
  cube("", "machine", MOUTH_X, FLOOR + .07, HZ0 - lip / 2, holeW, .14, lip, GOLD);
  cube("", "machine", MOUTH_X, FLOOR + .07, HZ1 + lip / 2, holeW, .14, lip, GOLD);

  // Se crean los dos relieves una sola vez y se alternan moviendo sus grupos.
  // Así cambiar de partida no reinicializa WebGL ni recompila los shaders.
  W.group({ n: "reliefP", g: "machine", y: shape === 1 ? 0 : -40 });
  const [px, pz, pw, pd, ph] = PYRAMID;
  W.pyramid({ n: "", g: "reliefP", x: px, y: FLOOR + ph / 2, z: pz, w: pw, h: ph, d: pd, b: "#8b5685" });
  W.group({ n: "reliefT", g: "machine", y: shape === 2 ? 0 : -40 });
  for (let i = 0; i < TERRACES.length - 2; i += 2) {
    const z0 = TERRACES[i]!, y0 = TERRACES[i + 1]!, z1 = TERRACES[i + 2]!, y1 = TERRACES[i + 3]!;
    const slope = (y1 - y0) / (z1 - z0), a = -Math.atan(slope), thick = .12;
    cube("", "reliefT", BX, FLOOR + (y0 + y1) / 2 - thick / (2 * Math.cos(a)),
      (z0 + z1) / 2, BW, thick, (z1 - z0) / Math.cos(a), "#80547e", { rx: a * 57.3 });
  }

  cube("", "machine", TX0 - WALL / 2, FLOOR + .3, BZ, WALL, .72, BD + WALL * 2, "#b45d91");
  cube("", "machine", TX1 + WALL / 2, FLOOR + .3, BZ, WALL, .72, BD + WALL * 2, "#b45d91");
  cube("", "machine", BX, FLOOR + .3, TZ0 - WALL / 2, BW, .72, WALL, "#9a5787");
  cube("", "machine", BX, FLOOR + .3, TZ1 + WALL / 2, BW, .72, WALL, "#d979a2");

  cube("", "machine", -4.65, 1.4, 3.17, .12, 1.5, .06, WHITE, { rz: -28 });
  cube("", "machine", 4.75, -.5, 3.17, .1, 1.1, .06, WHITE, { rz: -28 });

  toys.forEach((p, i) => makePrize(i, p));

  W.group({ n: "cart", x: 0, z: 0 });
  cube("", "cart", 0, 3.68, 0, 1.25, .58, 1, "#a94e83");
  cube("", "cart", 0, 3.98, 0, .86, .18, .76, "#d177a1");
  cube("", "cart", 0, 3.68, .52, .34, .34, .04, GOLD, { rz: 45 });
  W.group({ n: "claw", x: 0, y: 2.3, z: 0 });
  cube("", "claw", 0, .04, 0, .78, .7, .74, "#6e6072");
  cube("", "claw", 0, .04, .37, .28, .28, .04, PINK, { rz: 45 });
  W.sphere({ n: "", g: "claw", y: -.3, w: .68, h: .46, d: .68, b: "#b8adb6" });
  cube("", "claw", 0, -.56, 0, .18, .4, .18, "#736674");
  for (let i = 0; i < 3; i++) {
    const j = `jaw${i}`;
    W.group({ n: j, g: "claw", ry: i * 120 + 90 });
    W.sphere({ n: "", g: j, x: .04, y: -.14, size: .29, b: "#7a6475" });
    cube(`${j}a`, j, .25, -.4, 0, .22, .75, .22, "#d8d0d1");
    W.sphere({ n: `${j}e`, g: j, x: .5, y: -.72, size: .28, b: GOLD });
    cube(`${j}b`, j, .55, -.95, 0, .24, .9, .24, "#a79ca3");
    cube(`${j}c`, j, .68, -1.35, 0, .22, .4, .22, "#766a72");
    W.sphere({ n: `${j}t`, g: j, x: .7, y: -1.5, size: .25, b: "#564b54" });
  }
  for (let i = 0; i < 8; i++) cube(`cable${i}`, "machine", 0, 3, 0, .08, .35, .08, "#211f2b");

  W.group({ n: "reticle" });
  for (let i = 0; i < 4; i++)
    cube("", "reticle", i < 2 ? (i * 2 - 1) * .55 : 0, .1, i > 1 ? (i * 2 - 5) * .55 : 0,
      i < 2 ? .4 : .1, .04, i < 2 ? .1 : .4, WHITE);

  for (let i = 0; i < SPARKS; i++)
    W.cube({ n: `spark${i}`, x: 0, y: -20, z: 0, size: .12, b: ["#fff", "#55ddeb", "#ffc83d", "#ff75bd"][i % 4] });

  return {
    resize,
    setShape(next: number) {
      W.move({ n: "reliefP", y: next === 1 ? 0 : -40 });
      W.move({ n: "reliefT", y: next === 2 ? 0 : -40 });
    },
    moveCamera(yaw: number, pitch: number) { applyCamera(yaw, pitch); },

    moveClaw(x: number, y: number, z: number, close: number) {
      W.move({ n: "claw", x, y, z });
      W.move({ n: "cart", x, z });
      const nodeX = (i: number) => i % 8 ? x + (i % 2 ? -.11 : .11) : x;
      const nodeY = (i: number) => 3.72 + (y + .35 - 3.72) * i / 8;
      for (let i = 0; i < 8; i++) {
        const x0 = nodeX(i), x1 = nodeX(i + 1), y0 = nodeY(i), y1 = nodeY(i + 1);
        W.move({ n: `cable${i}`, x: (x0 + x1) / 2, y: (y0 + y1) / 2, z,
          h: Math.hypot(x1 - x0, y1 - y0), rz: -Math.atan2(x1 - x0, y1 - y0) * 57.3 });
      }
      const a = .85 - close * .4, c = a - .4;
      const ex = .75 * Math.sin(a), ey = -.12 - .75 * Math.cos(a);
      const tx = ex + .9 * Math.sin(c), ty = ey - .9 * Math.cos(c);
      const u = c - .7, hx = tx + .36 * Math.sin(u), hy = ty - .36 * Math.cos(u);
      for (let i = 0; i < 3; i++) {
        const j = `jaw${i}`;
        W.move({ n: `${j}a`, x: ex / 2, y: (ey - .12) / 2, rz: a * 57.3 });
        W.move({ n: `${j}b`, x: (ex + tx) / 2, y: (ey + ty) / 2, rz: c * 57.3 });
        W.move({ n: `${j}e`, x: ex, y: ey });
        W.move({ n: `${j}c`, x: (tx + hx) / 2, y: (ty + hy) / 2, rz: u * 57.3 });
        W.move({ n: `${j}t`, x: hx, y: hy });
      }
    },

    // La retícula sólo tiene sentido mientras se apunta.
    moveReticle(x: number, y: number, z: number, on: boolean) {
      W.move({ n: "reticle", x, y: on ? y : -40, z });
    },

    movePrize(i: number, p: Toy) {
      W.move({ n: `u${i}`, x: p.x, y: p.y, z: p.z, ry: p.yaw, rz: p.roll });
    },
    hidePrize(i: number) { W.move({ n: `u${i}`, y: -40 }); },

    // t va de 0 a 1: las chispas salen en arco y caen.
    celebrate(x: number, y: number, z: number, t: number) {
      for (let i = 0; i < SPARKS; i++) {
        const a = i * .628;
        W.move({
          n: `spark${i}`,
          x: x + Math.cos(a) * t * 2.2,
          y: y + Math.sin(a) * t * 2 - t * t * 3,
          z: z + (i % 3 - 1) * t * .8
        });
      }
    },
    hideSparks() { for (let i = 0; i < SPARKS; i++) W.move({ n: `spark${i}`, y: -40 }); }
  };
}

function makePrize(i: number, p: Toy) {
  const g = `u${i}`;
  W.group({ n: g, x: p.x, y: p.y, z: p.z, ry: p.yaw });

  // Arcoíris de peluche: cuatro bandas concéntricas y nubes en los extremos.
  if (p.rarity === 1) {
    const colors = ["#9b65e6", "#55ddeb", "#ffc83d", "#e85f91"];
    for (let band = 0; band < 4; band++) for (let q = 0; q < 5; q++) {
      const a = Math.PI - q * Math.PI / 4, r = .34 + band * .14;
      cube("", g, Math.cos(a) * r, -.3 + Math.sin(a) * r * 1.25,
        0, r * .78, .2, .58, colors[band]!, { rz: a * 180 / Math.PI - 90 });
    }
    for (const x of [-.8, .8])
      W.sphere({ n: "", g, x, y: -.43, w: .78, h: .6, d: .72, b: WHITE });
    return;
  }

  // Estrella acolchada: cinco puntas independientes para una silueta inequívoca.
  if (p.rarity === 2) {
    W.sphere({ n: "", g, w: 1.02, h: 1.02, d: .58, b: GOLD });
    for (let q = 0; q < 5; q++) {
      const a = 90 + q * 72, r = a * Math.PI / 180;
      W.pyramid({ n: "", g, x: Math.cos(r) * .48, y: Math.sin(r) * .48,
        w: .62, h: .9, d: .5, rz: a - 90, b: GOLD });
    }
    return;
  }

  // Los extremos de la escala sí son unicornios: Cloud y King.
  const cloud = p.rarity === 0, king = p.rarity === 3;
  const b = cloud ? WHITE : GOLD, m = cloud ? "#91dfe0" : "#8151b5";
  W.sphere({ n: "", g, w: cloud ? 1.48 : 1.24, h: cloud ? 1.25 : 1.18, d: cloud ? 1.08 : .94, b });
  W.sphere({ n: "", g, x: .62, y: cloud ? .5 : .55, w: .8, h: .8, d: .72, b });
  W.sphere({ n: "", g, x: .98, y: .33, w: .45, h: .34, d: .62, b: WHITE });
  for (const z of [-.35, .35]) {
    cube("", g, -.35, -.56, z, .32, .38, .3, b, { rz: 8 });
    cube("", g, .38, -.55, z, .3, .36, .28, b, { rz: -8 });
  }
  W.pyramid({ n: "", g, x: .72, y: king ? 1.2 : 1.13, z: 0,
    size: king ? .42 : .34, h: king ? .9 : .72, b: GOLD });
  for (const z of [-.3, .3]) W.pyramid({ n: "", g, x: .5, y: 1, z,
    size: .27, h: .38, b });
  cube("", g, .99, .65, .29, .09, .12, .08, "#27131e");
  cube("", g, .99, .65, -.29, .09, .12, .08, "#27131e");
  for (let q = 0; q < 3; q++)
    W.sphere({
      n: "", g, x: .15 - q * .23, y: .72 - q * .16, z: 0,
      size: .42, b: king && q === 1 ? GOLD : m
    });
  W.sphere({ n: "", g, x: -.75, y: .1, size: cloud ? .55 : .4, b: m });
  if (king) {
    cube("", g, .48, 1.16, 0, .72, .18, .58, GOLD);
    for (let q = -1; q < 2; q++)
      W.pyramid({ n: "", g, x: .48, y: 1.42, z: q * .22, size: .25, b: GOLD });
  }
}
