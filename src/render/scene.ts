import { CEILING, type Toy } from "../game/sim";
import { FLOOR, MOUTH_R, FUNNEL_R, FUNNEL_D, RIM_H, RIM_W, SHAPES } from "../game/shapes";
import { W } from "./w";

const PINK = "#b94d86", DARK = "#302849", WHITE = "#fff8ee", GOLD = "#ffd05d";
const SPARKS = 10;

const cube = (n: string, g: string, x: number, y: number, z: number,
  w: number, h: number, d: number, b: string, extra: WSettings = {}) =>
  W.cube({ n, g, x, y, z, w, h, d, b, ...extra });

// La plataforma llena casi todo el interior del mueble. El montón mantiene sus
// límites físicos más compactos (X0…Z1) para conservar densidad y jugabilidad.
const TX0 = -4.85, TX1 = 4.85, TZ0 = -2.7, TZ1 = 2.6;
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
  // El pozo, el embudo y su caballón viven en un grupo propio porque la boca
  // cambia de sitio con la forma: se trasladan enteros y sólo las losas hay que
  // redimensionarlas. Lo que abren las losas ya no es la boca sino el pie del
  // caballón: dentro de ese cuadrado el suelo lo pone el embudo entero.
  const GAP = MOUTH_R + .18, OUT = FUNNEL_R + RIM_W;
  const SX0 = TX0 - WALL, SX1 = TX1 + WALL, SZ0 = TZ0 - WALL, SZ1 = TZ1 + WALL;
  const slab = (n: string, x0: number, x1: number, z0: number, z1: number) =>
    cube(n, "machine", (x0 + x1) / 2, FLOOR - .08, (z0 + z1) / 2,
      x1 - x0, .16, z1 - z0, "#c02a69");

  W.group({ n: "hole", g: "machine" });
  cube("", "hole", 0, FLOOR - .82, 0, GAP * 2, .08, GAP * 2, "#160714");

  // Embudo y caballón (ver shapes.ts). La física resuelve un cono liso; aquí se
  // escalona en marcos concéntricos, igual que las terrazas radiales del relieve.
  // Cuatro cajas por nivel y las cuatro a la MISMA altura: es lo que hace que las
  // esquinas casen. Con una rampa inclinada por lado no casan —la del eje X y la
  // del eje Z llegan a la esquina a cotas distintas y se abre un escalón de la
  // altura entera del cono—, y no hay forma de ingletar cajas.
  //
  // Cada marco se dibuja a la cota más ALTA de su tramo, la convención del
  // relieve: antes un premio medio hundido que un premio apoyado en el aire.
  const frame = (r0: number, r1: number, top: number, b: string) => {
    const y = FLOOR + top - .6, w = r1 - r0, m = (r0 + r1) / 2;
    cube("", "hole", m, y, 0, w, 1.2, r1 * 2, b);
    cube("", "hole", -m, y, 0, w, 1.2, r1 * 2, b);
    cube("", "hole", 0, y, m, r0 * 2, 1.2, w, b);
    cube("", "hole", 0, y, -m, r0 * 2, 1.2, w, b);
  };
  // La cota del cono a un radio, la MISMA fórmula que la física.
  const cone = (r: number) =>
    -FUNNEL_D + (r - MOUTH_R) * (RIM_H + FUNNEL_D) / (FUNNEL_R - MOUTH_R);
  const step = (FUNNEL_R - GAP) / 3;
  frame(GAP, GAP + step, cone(GAP + step), "#7c2c55");
  frame(GAP + step, FUNNEL_R - step, cone(FUNNEL_R - step), "#a33367");
  // El labio dorado se queda con la cresta entera: el último tramo del cono y el
  // primero del caballón están a la misma altura menos un dedo, y partirlo en dos
  // marcos sólo añadiría cuatro cajas para que no se note.
  frame(FUNNEL_R - step, FUNNEL_R + RIM_W / 2, RIM_H, GOLD);
  frame(FUNNEL_R + RIM_W / 2, OUT, RIM_H / 2, "#c02a69");

  const layoutHole = (mx: number, mz: number) => {
    // La boca vive pegada al borde de la bandeja y el caballón es ancho, así que
    // el hueco se recorta contra el contorno: sin esto una losa saldría con lado
    // negativo, que W dibuja del revés. Lo que quede fuera lo tapa el muro.
    const z0 = Math.max(mz - OUT, SZ0), z1 = Math.min(mz + OUT, SZ1);
    slab("f0", SX0, SX1, SZ0, z0);
    slab("f1", SX0, SX1, z1, SZ1);
    slab("f2", SX0, Math.max(mx - OUT, SX0), z0, z1);
    slab("f3", Math.min(mx + OUT, SX1), SX1, z0, z1);
    W.move({ n: "hole", x: mx, z: mz });
  };

  // Un grupo de relieve por forma, creados una sola vez y escondidos bajo el
  // mueble salvo el activo. Así cambiar de partida no reinicializa WebGL.
  // La geometría sale de la MISMA tabla que usa la física: no hay dos
  // descripciones que puedan desincronizarse.
  for (let f = 0; f < SHAPES.length; f++) {
    const t = SHAPES[f]!, g = `r${f}`, radial = t[2]!;
    // En modo 0 el grupo gira para que su eje Z local sea el del perfil.
    W.group({ n: g, g: "machine", y: f === shape ? 0 : -40,
      ry: radial ? 0 : Math.atan2(t[3]!, t[4]!) * 57.3 });
    // El eje del perfil manda: `cross` es el ancho perpendicular que hay que
    // cubrir y `tLo` el borde de la bandeja por el lado que la física extrapola.
    const axisZ = Math.abs(t[4]!) > Math.abs(t[3]!);
    const cross = (axisZ ? BW : BD) + .2, tLo = -((axisZ ? BD : BW) + .2) / 2;
    for (let i = 7; i < t.length - 2; i += 2) {
      let t0 = t[i]!, y0 = t[i + 1]!;
      const t1 = t[i + 2]!, y1 = t[i + 3]!;
      const b = i % 4 ? "#80547e" : "#8b5685";
      if (radial) {
        // Cada terraza es una caja hasta su borde exterior; sus paredes son los
        // frentes verticales. Un tramo que baja hasta el suelo desde el centro
        // es una pirámide de verdad y se dibuja como tal; los demás desniveles
        // se escalonan, porque si no la rampa que resuelve la física queda por
        // encima de la geometría y el premio se apoya en el aire.
        // El tope es la distancia del centro de la forma al borde MÁS lejano de
        // la bandeja, no BW/BD: la bandeja no está centrada y un tope centrado
        // deja una ranura contra la pared opuesta. Lo que sobre lo tapan los muros.
        const spanX = Math.max(TX1 - t[3]!, t[3]! - TX0) + .1;
        const spanZ = Math.max(TZ1 - t[4]!, t[4]! - TZ0) + .1;
        const size = (tt: number) =>
          [2 * Math.min(tt * t[5]!, spanX), 2 * Math.min(tt * t[6]!, spanZ)] as const;
        const ring = (tt: number, yy: number) => {
          const [w, d] = size(tt);
          if (yy > 0) cube("", g, t[3]!, FLOOR + yy / 2, t[4]!, w, yy, d, b);
        };
        if (y0 === y1) ring(t1, y0);
        else if (!y1 && !t0)
          W.pyramid({ n: "", g, x: t[3]!, y: FLOOR + y0 / 2, z: t[4]!, h: y0, b,
            w: size(t1)[0], d: size(t1)[1] });
        else for (let s = 1; s < 4; s++)
          ring(t0 + (t1 - t0) * s / 3, y0 + (y1 - y0) * s / 3);
      } else {
        // Por debajo del primer punto la física prolonga este tramo con su misma
        // pendiente, así que el relieve se estira hasta la pared: si no, el
        // montón se corta a media bandeja y deja una zanja contra el fondo.
        if (i === 7 && t0 > tLo) {
          y0 += (tLo - t0) * (y1 - y0) / (t1 - t0);
          t0 = tLo;
        }
        // Los llanos son bloque macizo hasta el suelo, como las terrazas
        // radiales; sólo las rampas necesitan una losa inclinada.
        if (y0 === y1) {
          if (y0) cube("", g, 0, FLOOR + y0 / 2, (t0 + t1) / 2, cross, y0, t1 - t0, b);
        } else if (y0 || y1) {
          const a = -Math.atan((y1 - y0) / (t1 - t0)), thick = .12;
          cube("", g, 0, FLOOR + (y0 + y1) / 2 - thick / (2 * Math.cos(a)),
            (t0 + t1) / 2, cross, thick, (t1 - t0) / Math.cos(a), b, { rx: a * 57.3 });
        }
      }
    }
  }
  layoutHole(SHAPES[shape]![0]!, SHAPES[shape]![1]!);

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
  W.group({ n: "claw", x: 0, y: 2.9, z: 0 });
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
      for (let f = 0; f < SHAPES.length; f++) W.move({ n: `r${f}`, y: f === next ? 0 : -40 });
      layoutHole(SHAPES[next]![0]!, SHAPES[next]![1]!);
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
  // Es el premio de entrada (rareza 0, seis en el montón, 250 pts).
  if (p.rarity === 0) {
    W.sphere({ n: "", g, w: 1.02, h: 1.02, d: .58, b: GOLD });
    for (let q = 0; q < 5; q++) {
      const a = 90 + q * 72, r = a * Math.PI / 180;
      W.pyramid({ n: "", g, x: Math.cos(r) * .48, y: Math.sin(r) * .48,
        w: .62, h: .9, d: .5, rz: a - 90, b: GOLD });
    }
    return;
  }

  // Los dos escalones altos son unicornios: el Unicorn y el Unicorn King.
  const unicorn = p.rarity === 2, king = p.rarity === 3;
  const b = unicorn ? WHITE : GOLD, m = unicorn ? "#91dfe0" : "#8151b5";
  W.sphere({ n: "", g, w: unicorn ? 1.48 : 1.24, h: unicorn ? 1.25 : 1.18, d: unicorn ? 1.08 : .94, b });
  W.sphere({ n: "", g, x: .62, y: unicorn ? .5 : .55, w: .8, h: .8, d: .72, b });
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
  W.sphere({ n: "", g, x: -.75, y: .1, size: unicorn ? .55 : .4, b: m });
  if (king) {
    cube("", g, .48, 1.16, 0, .72, .18, .58, GOLD);
    for (let q = -1; q < 2; q++)
      W.pyramid({ n: "", g, x: .48, y: 1.42, z: q * .22, size: .25, b: GOLD });
  }
}
