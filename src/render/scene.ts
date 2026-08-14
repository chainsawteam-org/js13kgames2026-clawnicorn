import { type Toy } from "../game/sim";
import { FLOOR, MOUTH_X, MOUTH_Z, MOUTH_R, PYRAMID, TERRACES } from "../game/shapes";

const PINK = "#b94d86", DARK = "#302849", WHITE = "#fff8ee", GOLD = "#ffd05d";
const body = [WHITE, "#ed8caf", "#f2c84f", WHITE];
const mane = ["#91dfe0", "#d85f99", "#e99a45", "#71c9d9"];
const SPARKS = 10;

// Extend W's tiny Lambert shader with a pastel rim and cabinet depth haze.
const stylize = (canvas: HTMLCanvasElement) => {
  const gl = canvas.getContext("webgl2")!;
  const source = gl.shaderSource.bind(gl);
  (gl as any).shaderSource = (shader: WebGLShader, code: string) => source(shader,
    code.includes("out vec4 c") ? `#version 300 es
precision highp float;in vec4 v_pos,v_col,v_uv,v_normal;uniform vec3 light;uniform vec4 o;uniform sampler2D sampler;out vec4 c;
void main(){c=mix(texture(sampler,v_uv.xy),v_col,o.w);if(o.y>0.){vec3 n=normalize(o.x>0.?v_normal.xyz:cross(dFdx(v_pos.xyz),dFdy(v_pos.xyz)));float d=max(0.,dot(light,-n)),r=pow(1.-abs(dot(n,normalize(vec3(0.,.2,1.)))),3.);c=vec4(c.rgb*(o.z+d*.75+max(0.,n.y)*.1)+vec3(.3,.14,.35)*r*.2,c.a);}c.rgb=mix(c.rgb,vec3(.33,.28,.55),(1.-smoothstep(-3.,2.,v_pos.z))*.16);}` : code);
  return () => (gl as any).shaderSource = source;
};

const cube = (n: string, g: string, x: number, y: number, z: number,
  w: number, h: number, d: number, b: string, extra: WSettings = {}) =>
  W.cube({ n, g, x, y, z, w, h, d, b, ...extra });

// La plataforma llena casi todo el interior del mueble. El montón mantiene sus
// límites físicos más compactos (X0…Z1) para conservar densidad y jugabilidad.
const TX0 = -4.25, TX1 = 4.25, TZ0 = -2.35, TZ1 = 2.25;
const BX = (TX0 + TX1) / 2, BZ = (TZ0 + TZ1) / 2;
const BW = TX1 - TX0, BD = TZ1 - TZ0, WALL = .25;

export function createScene(canvas: HTMLCanvasElement, toys: Toy[], shape: number) {
  const restoreShader = import.meta.env.PROD ? () => {} : stylize(canvas);
  W.reset(canvas);
  restoreShader();
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
  cube("underbase", "machine", 0, FLOOR - .96, 0, 10.4, .24, 6.8, DARK);
  cube("back", "machine", 0, .2, -3.25, 10.4, 7.1, .25, "#514d82");
  cube("backGlow", "machine", 0, .25, -3.08, 8.7, 5.5, .05, "#625d96");
  cube("roof", "machine", 0, 4.5, 0, 11, .8, 7.2, "#43345f");
  for (const x of [-5.2, 5.2]) for (const z of [-3.2, 3.2])
    cube(`post${x}${z}`, "machine", x, .35, z, .5, 8.1, .5, x < 0 ? "#8e4879" : PINK);
  for (const x of [-4.94, 4.94]) cube(`lamp${x}`, "machine", x, .25, 3.47, .13, 6.6, .08, "#ffd766");
  cube("front", "machine", 0, -4.05, 3.35, 10.8, 1.45, .7, "#6b3b69", { rx: -8 });

  // Rail, carriage and friendly decorations make the cabinet read at a glance.
  for (const z of [-1.65, 1.65]) cube(`rail${z}`, "machine", 0, 3.72, z, 9.7, .12, .14, "#d8d2dc");
  for (let i = 0; i < 9; i++) {
    const x = -3.7 + i * .92, y = 1.1 + (i % 3) * .75;
    cube(`starA${i}`, "machine", x, y, -2.9, .18, .18, .08, i % 2 ? "#d98cb1" : "#ffd066", { rz: 45 });
  }
  for (const x of [-2.8, 2.7]) {
    W.sphere({ n: `cloud${x}a`, g: "machine", x, y: 2.65, z: -2.93, w: 1.15, h: .42, d: .1, b: "#aaa9be" });
    W.sphere({ n: `cloud${x}b`, g: "machine", x: x + .45, y: 2.72, z: -2.92, w: .75, h: .55, d: .1, b: "#b8b7c8" });
  }

  // Bandeja de premios. Cuatro losas disjuntas rodean un hueco interior real;
  // ninguna cubre ni se solapa con otra. El pozo queda bastante por debajo.
  const GAP = MOUTH_R + .18;
  const HX0 = MOUTH_X - GAP, HX1 = MOUTH_X + GAP;
  const HZ0 = MOUTH_Z - GAP, HZ1 = MOUTH_Z + GAP;
  const SX0 = TX0 - WALL, SX1 = TX1 + WALL, SZ0 = TZ0 - WALL, SZ1 = TZ1 + WALL;
  const slab = (n: string, x0: number, x1: number, z0: number, z1: number) =>
    cube(n, "machine", (x0 + x1) / 2, FLOOR - .08, (z0 + z1) / 2,
      x1 - x0, .16, z1 - z0, "#c02a69");
  slab("trayBack", SX0, SX1, SZ0, HZ0);
  slab("trayFront", SX0, SX1, HZ1, SZ1);
  slab("trayLeft", SX0, HX0, HZ0, HZ1);
  slab("trayRight", HX1, SX1, HZ0, HZ1);

  const holeW = HX1 - HX0, holeD = HZ1 - HZ0, wellY = FLOOR - .42;
  cube("chuteBottom", "machine", MOUTH_X, FLOOR - .82, MOUTH_Z, holeW, .08, holeD, "#160714");
  cube("chuteL", "machine", HX0 + .06, wellY, MOUTH_Z, .12, .84, holeD, "#32102d");
  cube("chuteR", "machine", HX1 - .06, wellY, MOUTH_Z, .12, .84, holeD, "#32102d");
  cube("chuteBk", "machine", MOUTH_X, wellY, HZ0 + .06, holeW, .84, .12, "#260c24");
  cube("chuteFr", "machine", MOUTH_X, wellY, HZ1 - .06, holeW, .84, .12, "#44143b");

  // Un labio bajo enmarca la abertura sin ocultarla desde la cámara inicial.
  const lip = .1;
  cube("chuteLipL", "machine", HX0 - lip / 2, FLOOR + .07, MOUTH_Z, lip, .14, holeD + lip * 2, GOLD);
  cube("chuteLipR", "machine", HX1 + lip / 2, FLOOR + .07, MOUTH_Z, lip, .14, holeD + lip * 2, GOLD);
  cube("chuteLipBk", "machine", MOUTH_X, FLOOR + .07, HZ0 - lip / 2, holeW, .14, lip, GOLD);
  cube("chuteLipFr", "machine", MOUTH_X, FLOOR + .07, HZ1 + lip / 2, holeW, .14, lip, GOLD);

  // Se crean los dos relieves una sola vez y se alternan moviendo sus grupos.
  // Así cambiar de partida no reinicializa WebGL ni recompila los shaders.
  W.group({ n: "reliefP", g: "machine", y: shape === 1 ? 0 : -40 });
  const [px, pz, pw, pd, ph] = PYRAMID;
  W.pyramid({ n: "relief", g: "reliefP", x: px, y: FLOOR + ph / 2, z: pz, w: pw, h: ph, d: pd, b: "#8b5685" });
  W.group({ n: "reliefT", g: "machine", y: shape === 2 ? 0 : -40 });
  for (let i = 0; i < TERRACES.length - 2; i += 2) {
    const z0 = TERRACES[i]!, y0 = TERRACES[i + 1]!, z1 = TERRACES[i + 2]!, y1 = TERRACES[i + 3]!;
    const slope = (y1 - y0) / (z1 - z0), a = -Math.atan(slope), thick = .12;
    cube(`relief${i}`, "reliefT", BX, FLOOR + (y0 + y1) / 2 - thick / (2 * Math.cos(a)),
      (z0 + z1) / 2, BW, thick, (z1 - z0) / Math.cos(a), "#80547e", { rx: a * 57.3 });
  }

  cube("trayL", "machine", TX0 - WALL / 2, FLOOR + .3, BZ, WALL, .72, BD + WALL * 2, "#b45d91");
  cube("trayR", "machine", TX1 + WALL / 2, FLOOR + .3, BZ, WALL, .72, BD + WALL * 2, "#b45d91");
  cube("trayBk", "machine", BX, FLOOR + .3, TZ0 - WALL / 2, BW, .72, WALL, "#9a5787");
  cube("trayF", "machine", BX, FLOOR + .3, TZ1 + WALL / 2, BW, .72, WALL, "#d979a2");

  cube("shine1", "machine", -4.65, 1.4, 3.17, .12, 1.5, .06, WHITE, { rz: -28 });
  cube("shine2", "machine", 4.75, -.5, 3.17, .1, 1.1, .06, WHITE, { rz: -28 });

  toys.forEach((p, i) => makeUnicorn(i, p));

  W.group({ n: "cart", x: 0, z: 0 });
  cube("cartBody", "cart", 0, 3.68, 0, 1.25, .58, 1, "#a94e83");
  cube("cartTop", "cart", 0, 3.98, 0, .86, .18, .76, "#d177a1");
  cube("cartBadge", "cart", 0, 3.68, .52, .34, .34, .04, GOLD, { rz: 45 });
  W.group({ n: "claw", x: 0, y: 2.3, z: 0 });
  cube("clawCase", "claw", 0, .04, 0, .78, .7, .74, "#6e6072");
  cube("clawFace", "claw", 0, .04, .37, .28, .28, .04, PINK, { rz: 45 });
  W.sphere({ n: "clawHub", g: "claw", y: -.3, w: .68, h: .46, d: .68, b: "#b8adb6" });
  cube("plunger", "claw", 0, -.56, 0, .18, .4, .18, "#736674");
  for (let i = 0; i < 3; i++) {
    const j = `jaw${i}`;
    W.group({ n: j, g: "claw", ry: i * 120 + 90 });
    W.sphere({ n: `${j}s`, g: j, x: .04, y: -.14, size: .29, b: "#7a6475" });
    cube(`${j}a`, j, .25, -.4, 0, .22, .75, .22, "#d8d0d1");
    W.sphere({ n: `${j}e`, g: j, x: .5, y: -.72, size: .28, b: GOLD });
    cube(`${j}b`, j, .55, -.95, 0, .24, .9, .24, "#a79ca3");
    cube(`${j}c`, j, .68, -1.35, 0, .22, .4, .22, "#766a72");
    W.sphere({ n: `${j}t`, g: j, x: .7, y: -1.5, size: .25, b: "#564b54" });
  }
  for (let i = 0; i < 8; i++) cube(`cable${i}`, "machine", 0, 3, 0, .08, .35, .08, "#211f2b");

  W.group({ n: "reticle" });
  for (let i = 0; i < 4; i++)
    cube(`r${i}`, "reticle", i < 2 ? (i * 2 - 1) * .55 : 0, .1, i > 1 ? (i * 2 - 5) * .55 : 0,
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

function makeUnicorn(i: number, p: Toy) {
  const g = `u${i}`, b = body[p.rarity]!, m = mane[p.rarity]!;
  const cloud = p.rarity === 0, pink = p.rarity === 1;
  const gold = p.rarity === 2, rainbow = p.rarity === 3;
  const bw = cloud ? 1.48 : pink ? 1.08 : gold ? 1.3 : 1.24;
  const bh = cloud ? 1.25 : pink ? 1.08 : gold ? 1.02 : 1.18;
  const bd = cloud ? 1.08 : pink ? .78 : gold ? .9 : .94;
  W.group({ n: g, x: p.x, y: p.y, z: p.z, ry: p.yaw });
  W.sphere({ n: `${g}b`, g, w: bw, h: bh, d: bd, b });
  W.sphere({ n: `${g}h`, g, x: .62, y: pink ? .6 : .5,
    w: pink ? .68 : .8, h: pink ? .92 : .78, d: pink ? .62 : .72, b });
  W.sphere({ n: `${g}m`, g, x: .98, y: .33, w: .45, h: .34, d: .62, b: p.rarity === 1 ? "#ff9fc5" : WHITE });
  for (const z of [-.35, .35]) {
    cube(`${g}l${z}`, g, -.35, -.56, z, .32, .38, .3, b, { rz: 8 });
    cube(`${g}f${z}`, g, .38, -.55, z, .3, .36, .28, b, { rz: -8 });
  }
  W.pyramid({ n: `${g}horn`, g, x: .72, y: pink ? 1.24 : 1.13, z: 0,
    size: rainbow ? .42 : .34, h: rainbow ? .9 : .72, b: GOLD });
  for (const z of [-.3, .3]) W.pyramid({ n: `${g}ear${z}`, g, x: .5, y: pink ? 1.18 : .98, z,
    size: pink ? .38 : .25, h: pink ? .58 : .36, b });
  cube(`${g}eye1`, g, .99, .65, .29, .09, .12, .08, "#27131e");
  cube(`${g}eye2`, g, .99, .65, -.29, .09, .12, .08, "#27131e");
  for (let q = 0; q < 3; q++)
    W.sphere({
      n: `${g}mane${q}`, g, x: .15 - q * .23, y: .72 - q * .16, z: 0,
      size: .42, b: rainbow ? ["#55ddeb", "#ffc83d", "#9b65e6"][q]! : m
    });
  W.sphere({ n: `${g}tail`, g, x: -.75, y: .1, size: cloud ? .55 : .4, b: m });
  if (gold) for (const z of [-1, 1])
    W.pyramid({ n: `${g}wing${z}`, g, x: -.12, y: .18, z: z * .68,
      w: .78, h: .28, d: .8, rx: z * 32, rz: -18, b: "#fff3bd" });
  if (rainbow) {
    cube(`${g}crown`, g, .48, 1.16, 0, .72, .18, .58, GOLD);
    for (let q = -1; q < 2; q++)
      W.pyramid({ n: `${g}c${q}`, g, x: .48, y: 1.42, z: q * .22, size: .25, b: GOLD });
  }
}
