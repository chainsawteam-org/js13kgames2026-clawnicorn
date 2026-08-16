// Simulación pura: sin DOM, sin WebGL, sin reloj real, sin Math.random.
// Todo avanza en pasos fijos de H segundos, así que el resultado no depende
// del refresco del monitor. Ver docs/GAME_DESIGN.md §5 y §6.

import { FLOOR, X0, X1, Z0, Z1, MOUTH_R, FUNNEL_R, FUNNEL_D, RIM_H, RIM_W, SHAPE_COUNT, SHAPES, surface } from "./shapes";
export { FLOOR, X0, X1, Z0, Z1, MOUTH_R, FUNNEL_R, FUNNEL_D, RIM_H, RIM_W, SHAPE_COUNT, SHAPES, surface } from "./shapes";

export const H = 1 / 120;
export const CEILING = 4.1;

// Fases. El reloj de fase vive dentro del paso fijo, igual que las físicas.
export const P_TITLE = 0, P_AIM = 1, P_LOWER = 2, P_CLOSE = 3, P_PAUSE = 4,
  P_LIFT = 5, P_CARRY = 6, P_DROP = 7, P_RETURN = 8, P_SETTLE = 9, P_RESULT = 10;

const DUR = [0, 0, .85, .45, .18, 1.15, .9, 1.4, .9, .35, 0];

// Eventos que consume main.ts para audio y HUD. La simulación no toca nada externo.
export const EV_LOWER = 0, EV_CLOSE = 1, EV_GRAB = 2, EV_EMPTY = 3,
  EV_SLIP = 4, EV_HOOK = 5, EV_SETTLE = 6, EV_OVER = 7, EV_WIN = 8;

// Escalera de valor por rareza: Star (6 en el montón) < Rainbow (3) < Unicorn (2)
// < Unicorn King (2). El índice de rareza ordena a la vez cuántos hay, lo difícil
// que es agarrarlo y lo que paga, así que la decisión del jugador es siempre la
// misma pregunta: ¿cuánto riesgo por cuánto premio?
export const POINTS = [250, 500, 1000, 2000];
const DIFF = [.15, .25, .40, .70];
// Agarre mínimo por rareza. Tabla explícita en vez de fórmula: es el mando de
// balance más sensible del juego y conviene poder moverlo de uno en uno.
//
// ATENCIÓN al calibrar: `grip` NO se reparte por rareza. La fórmula es la misma
// para los cuatro y su distribución también —medida sobre 300 tiradas por rareza,
// idéntica dentro del ruido—, así que TODA la dificultad vive en esta tabla y en
// una franja estrechísima. Percentil 50 del grip alcanzable:
//
//   puntería perfecta   0,90     ruido ±0,11   0,82     ruido ±0,22   0,77
//
// De ahí que un umbral por encima de ~0,80 no produzca "difícil" sino un
// acantilado: cae en la parte vertical de la curva y la tirada pasa a depender de
// acertar al centímetro, no de jugar bien. El King estuvo en 0,865 y luego en
// 0,85, y en los dos casos era inaccesible con un mando: 10 % de agarres con ruido
// ±0,22 frente al 96-99 % del resto — de ahí el "nunca coge al King".
//
// 0,80 es el punto de equilibrio, y está elegido con la curva completa delante:
//
//   umbral   ±0,22   ±0,55   partidas con jackpot (estrategia codiciosa)
//   0,85      10 %     3 %     20/60   ← roto: lotería, no dificultad
//   0,80      27 %    12 %     45/60   ← elegido
//   0,78      37 %    13 %     56/60
//   0,75      58 %    23 %     58/60   ← el jackpot deja de ser jackpot
//
// Por debajo de 0,80 el premio del King se convierte en un trámite: ir siempre a
// por el King pasa a ser la jugada correcta el 93-97 % de las partidas y se lleva
// por delante el riesgo/recompensa sobre el que está construido el juego.
//
// Lo que protege al King ya no es la precisión imposible sino estar ENTERRADO,
// que era la intención original: con crowd ≥ 4 la exposición se anula y el grip
// se queda en ~0,72, por debajo del umbral incluso apuntando perfecto.
//
// (La nota anterior decía que un agarre perfecto "ronda 0,60" porque la garra
// desplaza al objetivo 0,35 u al bajar. Está medido que no: `beginDrop` para el
// carro SOBRE el montón, el agarre se evalúa antes de que los dedos se muevan y
// el centrado real llega a 0,999. Ese 0,60 fantasma es el origen del acantilado.)
const REQUIRED = [.24, .33, .44, .80];

// El peluche son dos esferas: torso en el origen local y cabeza desplazada según yaw.
const R_BODY = .55, R_HEAD = .37, HEAD_X = .62, HEAD_Y = .5;
// Radio del tapón que cierra la boca durante el asentado de `reset`: el cuerpo
// del premio más lejos de la abertura, y nunca menos que el pie exterior del
// caballón. El montón arranca apoyado en suelo llano, no encaramado al embudo.
const PLUG_R = Math.max(MOUTH_R + R_BODY, FUNNEL_R + RIM_W);
export const FEET = .75;                         // del centro del torso a las pezuñas

const GRAV = 15, DRAG = .9965, YSQUASH = 1.2, TORQUE = 22, SPIN_MAX = 4;
const MAX_PUSH = .18;                            // tope duro: ninguna corrección puede catapultar nada
const SLEEP_EPS = 2e-7, SLEEP_FRAMES = 12;

// Claw. CLAW_TOP no es una altura estética: es la que fija el BARRIDO, porque el
// premio cobrado cuelga HOLD_Y por debajo del carro y en P_CARRY cruza toda la
// bandeja a esta altura. Con 2,9 su torso queda a 1,65 y, contra un peluche
// subido a un escalón de dos pisos (torso 0,725 · cabeza 1,225), el solape es
//
//   cabeza  +0,41   lo engancha y, al ir descentrado, lo hace girar y volcar
//   torso   −0,01   no lo arrolla: pasa rozando por encima
//   un piso −1,51   ni lo toca; lo alto y lo altísimo se juegan distinto
//
// Y da alcance: bajar hasta un premio de dos pisos pide dropY 2,03 y el tope es
// CLAW_TOP−0,6 = 2,3. Mover esta constante recalibra las tres cosas a la vez.
const CLAW_TOP = 2.9, CLAW_BOTTOM = -1.15;
export const AIM_X = 3.2, AIM_Z = 1.6;          // el carro se mueve sobre el montón
const GRAB_R = 1.05, HOLD_Y = -1.25;             // el premio agarrado cuelga a HOLD_Y del carro

// Enganche: de vez en cuando un vecino se queda prendido de las pezuñas del premio
// agarrado y sube con él. Cuelga en la MISMA columna, no al lado: la boca sólo mide
// MOUTH_R de radio, así que un enganche lateral se quedaría en el borde y el doblete
// no llegaría a cobrarse nunca. Se busca vecino dentro de HOOK_R del agarrado.
// HOOK_Y no es un valor estético: la cabeza del de abajo cuelga a HEAD_X del eje,
// así que si el par va demasiado junto esa cabeza se solapa con el TORSO del de
// arriba y el empuje resultante es casi horizontal — los dos salen despedidos
// fuera de la boca. Separación mínima limpia: hypot(HEAD_X, YSQUASH·(HOOK_Y−HEAD_Y))
// ≥ R_BODY+R_HEAD, que da 1,07. Se deja 1,2 de margen.
const HOOK_CHANCE = .12, HOOK_R = 1.5, HOOK_Y = 1.2;

export type Toy = {
  x: number; y: number; z: number;
  ox: number; oy: number; oz: number;
  yaw: number; oyaw: number; roll: number;
  rarity: number;
  state: number;      // 0 montón, 1 agarrado, 2 ganado, 3 cayendo por el conducto
  sleep: number;
  slipAt: number;     // fracción de resbalón; -1 ninguno, -2 encajado sin agarre
};

export type Sim = ReturnType<typeof createSim>;

const clamp = (v: number, a: number, b: number) => v < a ? a : v > b ? b : v;
const ease = (t: number) => t * t * (3 - 2 * t);

// PRNG sembrado (xorshift32): misma semilla + mismos inputs = misma partida.
let seed = 1;
export const setSeed = (n: number) => { seed = n >>> 0 || 1; };
const rnd = () => {
  seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
  return (seed >>> 0) / 4294967296;
};

// Posiciones base del montón: [x, z, rareza]. Agrupadas hacia el centro para que
// al asentarse formen un montón con contacto real y no una sola capa dispersa.
// El rincón del conducto queda libre a propósito.
const LAYOUT: [number, number, number][] = [
  [-2.4, -1.05, 0], [-1.2, -1.05, 0], [0, -1.1, 0], [1.2, -1.05, 0],
  [2.4, -1.05, 0], [-2.2, -0.45, 0], [-1.2, 0.05, 1], [0.05, -0.05, 1],
  [1.25, 0, 1], [2.4, 0.05, 2], [0.2, 1.05, 2], [1.4, 1.1, 3],
  [2.5, 1.05, 3]
];

export function createSim() {
  return {
    toys: [] as Toy[],
    phase: P_TITLE, time: 0,
    score: 0, tries: 5,
    clawX: 0, clawY: CLAW_TOP, clawZ: 0, close: 0,
    dropY: CLAW_BOTTOM,
    vx: 0, vz: 0, fromX: 0, fromZ: 0,
    held: -1, hook: -1, won: false, firstThrow: true,
    shape: -1, mx: 0, mz: 0,       // boca de la forma activa
    inX: 0, inZ: 0,               // input normalizado que escribe main.ts
    events: [] as number[]
  };
}

const mkToy = (x: number, y: number, z: number, yaw: number, rarity: number): Toy =>
  ({ x, y, z, ox: x, oy: y, oz: z, yaw, oyaw: yaw, roll: 0, rarity, state: 0, sleep: 0, slipAt: -1 });

export function reset(s: Sim, gameSeed: number) {
  const oldShape = s.shape;
  s.shape = oldShape < 0 ? gameSeed % SHAPE_COUNT :
    (oldShape + 1 + ((gameSeed >>> 8) % (SHAPE_COUNT - 1))) % SHAPE_COUNT;
  // Cada relieve trae su propia boca: cambia la ruta del carro y qué premios
  // están "cerca del agujero", que es media personalidad de la forma.
  s.mx = SHAPES[s.shape]![0]!; s.mz = SHAPES[s.shape]![1]!;
  setSeed(gameSeed);
  s.score = 0; s.tries = 5; s.phase = P_TITLE; s.time = 0;
  s.clawX = s.clawZ = s.vx = s.vz = 0; s.clawY = CLAW_TOP; s.close = 0;
  s.held = -1; s.hook = -1; s.won = false; s.firstThrow = true; s.events.length = 0;

  // Cada índice conserva su rareza para poder reutilizar su modelo WebGL entre
  // partidas. Se barajan las posiciones, que produce la misma distribución sin
  // tener que reconstruir cientos de primitivas al reiniciar.
  const slots = LAYOUT.map(l => [l[0], l[1]]);
  for (let i = slots.length - 1; i > 0; i--) {
    const j = (rnd() * (i + 1)) | 0;
    const t = slots[i]!; slots[i] = slots[j]!; slots[j] = t;
  }
  s.toys = LAYOUT.map((l, i) => {
    const slot = slots[i]!;
    const x = slot[0]! + (rnd() - .5) * .35, lift = rnd(), z = slot[1]! + (rnd() - .5) * .3;
    // La altura de suelta es relativa al relieve, pero sobre un escalón de dos
    // pisos se sale por el techo: sin el tope, la caída empieza dentro del muro
    // y el primer paso ya la corrige de golpe.
    return mkToy(x, Math.min(surface(s.shape, x, z).y + FEET + .5 + lift * 2.4,
      CEILING - HEAD_Y - R_HEAD),
      z, rnd() * 360, l[2]);
  });

  // Asentado inicial en tres tiempos. Primero con la boca tapada, para que el
  // montón no se cuele por el conducto mientras cae. Después con ella abierta,
  // porque si no el montón se queda comprimido contra un cilindro invisible y
  // al empezar la partida se derrumba dentro regalando premios. Al que se cuela
  // en esa segunda fase se le vuelve a lanzar desde el lado opuesto.
  //
  // En esa segunda fase se relanza también al que se queda DENTRO del anillo,
  // no sólo al que ya ha caído, y eso no es celo: con el relieve medido en pisos
  // toda la cascada desemboca en el llano donde vive la boca, así que ahí se
  // acumula un apretón que antes no existía. El montón nunca llega al reposo
  // absoluto —tiembla indefinidamente—, de modo que un premio dormido a un palmo
  // del agujero acaba entrando solo aunque nadie juegue: medido, cuatro de las
  // seis formas regalaban entre 1.000 y 10.000 puntos por esperar. Despejar el
  // anillo lo lleva a cero y además cumple lo que el diseño ya decía, que el
  // rincón del conducto empieza libre. El radio va atado a PLUG_R y no es un
  // número suelto: por dentro del tapón no queda nadie a quien relanzar, así que
  // un anillo más estrecho que él no despeja nada. El margen de 0,15 es donde se
  // cierra la fuga; ensancharlo más no mejora y sólo vacía la esquina.
  //
  // El tercer tiempo es sólo relajación, para que el último relanzado no se
  // quede a medio caer, y sigue relanzando al que se cuela: dejar el agujero sin
  // vigilancia ni siquiera 300 pasos basta para empezar la partida con un premio
  // sentado dentro. Lo que ya no hace es despejar el anillo, que a esas alturas
  // sólo serviría para rebotar indefinidamente al mismo peluche.
  for (let i = 0; i < 260; i++) { integrate(s); constrain(s, false, true); }
  const relaunch = (p: Toy) => {
    p.state = 0; p.sleep = 0;
    p.x = p.ox = -p.x; p.z = p.oz = -p.z;
    p.y = p.oy = surface(s.shape, p.x, p.z).y + FEET + 1.5;
  };
  for (let i = 0; i < 500; i++) {
    integrate(s); constrain(s, false);
    for (const p of s.toys)
      if (p.state || Math.hypot(p.x - s.mx, p.z - s.mz) < PLUG_R + .15) relaunch(p);
  }
  for (let i = 0; i < 100; i++) {
    integrate(s); constrain(s, false);
    for (const p of s.toys) if (p.state) relaunch(p);
  }
  s.score = 0; s.events.length = 0;
  for (const p of s.toys) { p.sleep = SLEEP_FRAMES; }
}

// ---------------------------------------------------------------- integración

function integrate(s: Sim) {
  const g = GRAV * H * H;
  for (const p of s.toys) {
    // El premio agarrado TAMBIÉN se integra. Si no, la soldadura acumularía una
    // velocidad fantasma que se liberaría de golpe al soltarlo.
    if (p.state === 2 || (!p.state && p.sleep >= SLEEP_FRAMES)) continue;
    const px = p.x, py = p.y, pz = p.z, pw = p.yaw;
    p.x += (p.x - p.ox) * DRAG;
    p.y += (p.y - p.oy) * DRAG - g;
    p.z += (p.z - p.oz) * DRAG;
    p.yaw += (p.yaw - p.oyaw) * .96;
    p.ox = px; p.oy = py; p.oz = pz; p.oyaw = pw;
  }
}

// Corrige posición Y velocidad a la vez. `carry` dice cuánto de la corrección es
// "el obstáculo moviéndose" (1 = el premio acompaña sin recibir impulso) frente a
// "he chocado" (0 = impulso completo). Ninguna otra línea del solver toca p.x/y/z.
function push(p: Toy, dx: number, dy: number, dz: number, carry: number) {
  const m = Math.hypot(dx, dy, dz);
  if (m > MAX_PUSH) { const k = MAX_PUSH / m; dx *= k; dy *= k; dz *= k; }
  p.x += dx; p.y += dy; p.z += dz;
  p.ox += dx * carry; p.oy += dy * carry; p.oz += dz * carry;
  p.sleep = 0;
}

// Empuje aplicado en un punto desplazado del centro: además de trasladar, gira.
function pushAt(p: Toy, offX: number, offZ: number, dx: number, dy: number, dz: number, carry: number) {
  push(p, dx, dy, dz, carry);
  // Sin tocar oyaw: la diferencia se convierte en velocidad angular, acotada.
  p.yaw += clamp((offX * dz - offZ * dx) * TORQUE, -SPIN_MAX, SPIN_MAX);
}

// Proyecta pezuñas y velocidad Verlet sobre el relieve local. La componente
// tangencial conserva el deslizamiento de la gravedad; la entrante rebota poco.
function supportSolve(s: Sim, p: Toy) {
  const q = surface(s.shape, p.x, p.z);
  let d = (q.y + FEET - p.y) * q.ny;
  if (d <= 0) return;
  d = Math.min(d, MAX_PUSH);
  const vx = p.x - p.ox, vy = p.y - p.oy, vz = p.z - p.oz;
  p.x += q.nx * d; p.y += q.ny * d; p.z += q.nz * d;
  const vn = vx * q.nx + vy * q.ny + vz * q.nz;
  const bounce = vn < 0 ? -vn * .25 : vn;
  const tx = (vx - vn * q.nx) * .82, ty = (vy - vn * q.ny) * .82, tz = (vz - vn * q.nz) * .82;
  p.ox = p.x - tx - bounce * q.nx;
  p.oy = p.y - ty - bounce * q.ny;
  p.oz = p.z - tz - bounce * q.nz;
  p.oyaw = p.yaw - (p.yaw - p.oyaw) * .82;
}

const headX = (p: Toy) => Math.cos(p.yaw * Math.PI / 180) * HEAD_X;
const headZ = (p: Toy) => -Math.sin(p.yaw * Math.PI / 180) * HEAD_X;

// Cápsula contra el torso. Devuelve 1 si toca.
function capsule(p: Toy, ax: number, ay: number, az: number,
  bx: number, by: number, bz: number, r: number, apply: boolean) {
  const abx = bx - ax, aby = by - ay, abz = bz - az;
  const len = abx * abx + aby * aby + abz * abz;
  const q = clamp(((p.x - ax) * abx + (p.y - ay) * aby + (p.z - az) * abz) / len, 0, 1);
  const dx = p.x - (ax + abx * q), dy = p.y - (ay + aby * q), dz = p.z - (az + abz * q);
  const d = Math.hypot(dx, dy, dz) || H, hit = R_BODY + r - d;
  if (hit <= 0) return 0;
  // carry 1: el claw se mueve, el peluche lo acompaña; nunca inyecta impulso.
  if (apply) push(p, dx / d * hit, dy / d * hit, dz / d * hit, 1);
  return 1;
}

// Las seis cápsulas de las patas.
function clawSolve(s: Sim, p: Toy, apply: boolean) {
  const a = .85 - s.close * .4, c = a - .4;
  const ex = .75 * Math.sin(a), ey = -.75 * Math.cos(a);
  const tx = ex + .9 * Math.sin(c), ty = ey - .9 * Math.cos(c);
  const py = s.clawY - .12;
  let n = 0;
  for (let j = 0; j < 3; j++) {
    const ang = j * 2.0943951, ux = Math.cos(ang), uz = -Math.sin(ang);
    const bx = s.clawX + ux * ex, by = py + ey, bz = s.clawZ + uz * ex;
    n += capsule(p, s.clawX, py, s.clawZ, bx, by, bz, .1, apply);
    n += capsule(p, bx, by, bz, s.clawX + ux * tx, py + ty, s.clawZ + uz * tx, .12, apply);
  }
  return n;
}

// ------------------------------------------------------------------ contactos

function constrain(s: Sim, clawOn: boolean, loading = false) {
  const toys = s.toys;
  // El enganchado cuelga por DEBAJO de las puntas de las patas: proyectarlo contra
  // ellas lo escupiría de lado en cada paso y rompería el doblete.
  const hooked = s.hook >= 0 ? toys[s.hook]! : null;

  if (clawOn) {
    // Varios contactos pueden acuñar un premio aunque las reglas no hayan
    // concedido el agarre. Las formas más difíciles exigen más puntos de apoyo.
    for (const p of toys) if (!p.state) {
      if (p.slipAt === -2) {
        if (s.phase > P_CARRY) p.slipAt = -1;
        else push(p, s.clawX - p.x, s.clawY + HOLD_Y - p.y, s.clawZ - p.z, 1);
      }
    }
    // El premio oficial bloquea el cierre. Durante el transporte ya comparte
    // pose con la garra mediante el muelle; seguir proyectándolo contra las
    // patas lo expulsaría lateralmente en cada paso.
    for (const p of toys) if (p !== hooked && (!p.state || p.state === 1 && s.phase <= P_PAUSE)) {
      const contacts = clawSolve(s, p, false);
      if (s.close > .2 && contacts) s.vx = 1;
      if (!p.state && s.phase === P_CLOSE && contacts > p.rarity) p.slipAt = -2;
      clawSolve(s, p, true);
    }
  }

  // Premio agarrado: muelle al carro, no muro rígido. Cuelga, se retrasa y se
  // balancea durante la subida y el traslado; al soltarlo la velocidad es real.
  if (s.held >= 0) {
    const p = toys[s.held]!;
    push(p, (s.clawX - p.x) * .35, (s.clawY + HOLD_Y - p.y) * .35, (s.clawZ - p.z) * .35, .7);

  }

  // Muelle del enganchado, más blando: llega arrastrándose y se balancea un paso
  // por detrás. Cuelga del agarrado mientras lo haya y, cuando éste ya se ha
  // soltado sobre la boca, del propio carro: así se queda centrado sobre el
  // agujero esperando su turno. Su objetivo nunca baja del relieve, de modo que
  // con la garra abajo va rozando el montón en vez de hundirse en él.
  if (hooked) {
    const p = s.held >= 0 ? toys[s.held]! : null;
    const ax = p ? p.x : s.clawX, az = p ? p.z : s.clawZ;
    const ay = (p ? p.y : s.clawY + HOLD_Y) - HOOK_Y;
    const ty = Math.max(ay, surface(s.shape, hooked.x, hooked.z).y + FEET);
    push(hooked, (ax - hooked.x) * .28, (ty - hooked.y) * .28, (az - hooked.z) * .28, .7);
  }

  // Colisión premio-premio: dos esferas por peluche, dos iteraciones Gauss-Seidel.
  for (let it = 0; it < 2; it++) {
    for (let i = 0; i < toys.length; i++) {
      const a = toys[i]!; if (a.state >= 2) continue;      // ganado o ya en el conducto
      const ahx = headX(a), ahz = headZ(a);
      for (let j = i + 1; j < toys.length; j++) {
        const b = toys[j]!; if (b.state >= 2) continue;
        const bhx = headX(b), bhz = headZ(b);
        // El agarrado es masa infinita: el montón no puede arrancarlo del claw.
        const wa = a.state === 1 ? 0 : 1, wb = b.state === 1 ? 0 : 1;
        if (!wa && !wb) continue;
        const inv = 1 / (wa + wb);
        for (let sa = 0; sa < 2; sa++) {
          const ax = a.x + (sa ? ahx : 0), ay = a.y + (sa ? HEAD_Y : 0), az = a.z + (sa ? ahz : 0);
          const ra = sa ? R_HEAD : R_BODY;
          for (let sb = 0; sb < 2; sb++) {
            const bx = b.x + (sb ? bhx : 0), by = b.y + (sb ? HEAD_Y : 0), bz = b.z + (sb ? bhz : 0);
            const dx = bx - ax, dy = by - ay, dz = bz - az;
            // Y amplificado: los peluches se aplastan al apilarse en vez de rodar como canicas.
            const d = Math.hypot(dx, dy * YSQUASH, dz) || 1e-4;
            const over = ra + (sb ? R_HEAD : R_BODY) - d;
            if (over <= 0) continue;
            const k = over / d * inv;
            if (wa) pushAt(a, sa ? ahx : 0, sa ? ahz : 0, -dx * k * wa, -dy * k * wa, -dz * k * wa, .6);
            if (wb) pushAt(b, sb ? bhx : 0, sb ? bhz : 0, dx * k * wb, dy * k * wb, dz * k * wb, .6);
          }
        }
      }
    }
  }

  // Paredes, suelo y disparador de premio.
  for (let i = 0; i < toys.length; i++) {
    const p = toys[i]!;
    if (p.state === 2) continue;

    // Estado 3: el premio ya ha cruzado la boca. Cae por su columna sin paredes
    // ni suelo y puntúa al cruzar el plano del suelo.
    if (p.state === 3) {
      if (p.y < FLOOR) { win(s, i); continue; }
    } else if (!p.state) {
      // La boca es un agujero real: da igual si el premio llega en la garra, cae
      // por un derrumbe o lo empuja otro. En cuanto su centro entra en la abertura
      // deja de apoyarse en el suelo y cae por el conducto.
      const dx = p.x - s.mx, dz = p.z - s.mz, md = Math.hypot(dx, dz) || 1e-4;
      if (loading && md < PLUG_R) {
        // Sólo durante el asentado la boca se tapa, para que la partida no
        // empiece con premios ya cobrados. En juego el agujero está abierto: un
        // derrumbe o un empujón pueden colar un premio, y eso es deseable.
        // El tapón cubre el EMBUDO entero, no sólo la boca: dejar a alguien
        // asentado en la pendiente equivale a regalarle el premio en cuanto
        // arranca la partida.
        const q = PLUG_R - md;
        push(p, dx / md * q, 0, dz / md * q, .6);
        supportSolve(s, p);
      } else if (md < MOUTH_R) {
        // Sobre la boca sigue siendo un premio físico: puede golpear obstáculos,
        // ser desviado o empujar a otro. Sólo entra al conducto al cruzar el suelo.
        if (p.y < FLOOR + FEET) { p.state = 3; p.sleep = 0; }
      }
      else supportSolve(s, p);

      // Las paredes se resuelven al final para que ningún empuje del relieve pueda
      // sacar después el cuerpo o la cabeza. La velocidad saliente rebota corta.
      if (!p.state) {
        const hx = headX(p), hz = headZ(p);
        const lo = X0 + Math.max(R_BODY, R_HEAD - hx), hi = X1 - Math.max(R_BODY, R_HEAD + hx);
        const zlo = Z0 + Math.max(R_BODY, R_HEAD - hz), zhi = Z1 - Math.max(R_BODY, R_HEAD + hz);
        let v = clamp(p.x, lo, hi);
        if (v !== p.x) { p.ox = v + (p.x > hi ? 1 : -1) * Math.abs(p.x - p.ox) * .25; p.x = v; }
        v = clamp(p.z, zlo, zhi);
        if (v !== p.z) { p.oz = v + (p.z > zhi ? 1 : -1) * Math.abs(p.z - p.oz) * .25; p.z = v; }
        const top = CEILING - HEAD_Y - R_HEAD;
        if (p.y > top) { p.oy = top + Math.abs(p.y - p.oy) * .25; p.y = top; }
      }
    }

    // Red de seguridad: nada puede salir del mundo ni quedarse en NaN.
    if (!(p.x === p.x && p.y === p.y && p.z === p.z) || p.y < -9) {
      p.x = 0; p.z = 0; p.y = surface(s.shape, 0, 0).y + FEET + 2;
      p.ox = p.x; p.oy = p.y; p.oz = p.z;
    }

    // Balanceo visual amortiguado, en vez del salto instantáneo de antes.
    p.roll += (clamp((p.x - p.ox) * 90, -26, 26) - p.roll) * .12;

    const m = (p.x - p.ox) ** 2 + (p.y - p.oy) ** 2 + (p.z - p.oz) ** 2;
    p.sleep = p.state || m > SLEEP_EPS ? 0 : p.sleep + 1;
  }
}

// ---------------------------------------------------------------------- reglas

function win(s: Sim, i: number) {
  const p = s.toys[i]!;
  p.state = 2;
  s.won = true;
  s.score += POINTS[p.rarity]!;
  if (s.held === i) s.held = -1;
  if (s.hook === i) s.hook = -1;
  // EV_WIN ocupa un rango propio: la rareza viaja en el evento para que dos
  // premios que caigan en el mismo frame conserven su valor individual.
  s.events.push(EV_WIN + p.rarity);
}

// Se evalúa UNA vez, en el instante en que el carro toca fondo y ANTES de que los
// dedos empiecen a cerrarse. Si se hiciera después, los propios dedos ya habrían
// expulsado al peluche —una esfera no cabe en una pinza de tres puntas— y ningún
// agarre sería nunca válido. Los contactos se cuentan sobre la pose cerrada.
function resolveGrab(s: Sim) {
  let best = -1, bestGrip = 0;
  const open = s.close;
  s.close = 1;
  for (let i = 0; i < s.toys.length; i++) {
    const p = s.toys[i]!;
    if (p.state) continue;
    const hd = Math.hypot(p.x - s.clawX, p.z - s.clawZ);
    if (hd > GRAB_R || p.y > s.clawY - .55 || p.y < s.clawY - 2.15) continue;
    const centring = 1 - hd / GRAB_R;
    const contacts = clawSolve(s, p, false);
    // Exposición: un peluche rodeado de vecinos está aprisionado y agarra peor;
    // uno alto y suelto agarra mejor. Es lo que hace que enterrar al King importe.
    let crowd = 0;
    for (const q of s.toys) {
      if (q !== p && !q.state && Math.hypot(q.x - p.x, q.z - p.z) < 1.3) crowd++;
    }
    const rest = surface(s.shape, p.x, p.z).y + FEET;
    const exposure = clamp(1 - crowd / 4, 0, 1) * .6 + clamp((p.y - rest) / 1.1, 0, 1) * .4;
    // El apuntado pesa más que nada: es la única decisión real del jugador.
    const grip = .70 * centring + .12 * (contacts / 6) + .18 * exposure;
    // Sólo compiten los que superan su propio umbral. Si se eligiera primero por
    // agarre bruto, un King a medio agarrar bloquearía una captura fácil que sí
    // valía, y el jugador vería fallar tiradas que en realidad eran buenas.
    if (grip >= REQUIRED[p.rarity]! && grip > bestGrip) { bestGrip = grip; best = i; }
  }
  s.close = open;
  // Siempre se consumen los tres números para que el flujo del PRNG no dependa del resultado.
  const r1 = rnd(), r2 = rnd(), r3 = rnd();
  if (best < 0) return;

  const p = s.toys[best]!;
  p.state = 1; s.held = best;

  // Enganche: con poca frecuencia el vecino más pegado al agarrado se queda
  // prendido y sube con él, valiendo un doblete. Se elige el más cercano en vez
  // de uno al azar para que la jugada se lea: el que estaba encima es el que sube.
  if (r3 < HOOK_CHANCE) {
    let mate = -1, md = HOOK_R;
    for (let i = 0; i < s.toys.length; i++) {
      const q = s.toys[i]!;
      if (i === best || q.state) continue;
      const d = Math.hypot(q.x - p.x, (q.y - p.y) * .6, q.z - p.z);
      if (d < md) { md = d; mate = i; }
    }
    if (mate >= 0) {
      s.toys[mate]!.state = 1; s.toys[mate]!.sleep = 0; s.hook = mate;
      s.events.push(EV_HOOK);
    }
  }
  // Probabilidad de resbalón durante la subida. Calibrada para que se vea: con la
  // curva anterior (base .02, penalización .20 por agarre) salía negativa para las
  // rarezas bajas y la mecánica no llegaba a dispararse nunca.
  const slip = clamp(.05 + DIFF[p.rarity]! * .40 - bestGrip * .14, 0, .35);
  p.slipAt = !s.firstThrow && r1 < slip ? .35 + r2 * .45 : -1;
  s.events.push(EV_GRAB);
}

function releaseHook(s: Sim) {
  if (s.hook < 0) return;
  const q = s.toys[s.hook]!;
  q.state = 0; q.sleep = 0;
  s.hook = -1;
}

function release(s: Sim, slipped: boolean) {
  // Los dos se sueltan A LA VEZ, y eso NO es descuido: en caída libre la distancia
  // entre ellos se conserva, así que el par cae en columna sin tocarse. Escalonar
  // la suelta es justo lo que los rompe —el enganchado se queda quieto haciendo de
  // obstáculo y desvía al agarrado fuera del agujero—, y está medido: 18 % de
  // dobletes escalonando contra 39 % soltando a la vez.
  releaseHook(s);
  if (s.held < 0) return;
  const p = s.toys[s.held]!;
  // Siempre vuelve a ser físico al soltarse. La boca decide después si consigue
  // entrar; los premios que bloquean la caída pueden desviarlo o ser empujados.
  p.state = 0;
  p.sleep = 0;
  s.held = -1;
  if (slipped) s.events.push(EV_SLIP);
}

function goto(s: Sim, phase: number) { s.phase = phase; s.time = 0; }

// ------------------------------------------------------------------ máquina

function advance(s: Sim) {
  const { phase } = s;
  s.time += H;
  const t = DUR[phase] ? clamp(s.time / DUR[phase]!, 0, 1) : 0;

  if (phase === P_AIM) {
    let { inX, inZ } = s;
    const n = Math.hypot(inX, inZ);
    if (n > 1) { inX /= n; inZ /= n; }
    const f = Math.pow(.02, H);
    s.vx = (s.vx + inX * H * 8) * f;
    s.vz = (s.vz + inZ * H * 8) * f;
    s.clawX = clamp(s.clawX + s.vx * H, -AIM_X, AIM_X);
    s.clawZ = clamp(s.clawZ + s.vz * H, -AIM_Z, AIM_Z);
    return;
  }

  if (phase === P_LOWER) {
    s.clawY = CLAW_TOP - ease(t) * (CLAW_TOP - s.dropY);
    if (t >= 1) { s.events.push(EV_CLOSE); resolveGrab(s); goto(s, P_CLOSE); }
  } else if (phase === P_CLOSE) {
    if (!s.vx) s.close = ease(t);
    if (t >= 1) goto(s, P_PAUSE);
  } else if (phase === P_PAUSE) {
    if (t >= 1) goto(s, P_LIFT);
  } else if (phase === P_LIFT) {
    s.clawY = s.dropY + ease(t) * (CLAW_TOP - s.dropY);
    const p = s.held >= 0 ? s.toys[s.held]! : null;
    if (p && p.slipAt >= 0 && t >= p.slipAt) { p.slipAt = -1; release(s, true); }
    if (t >= 1) { s.fromX = s.clawX; s.fromZ = s.clawZ; goto(s, P_CARRY); }
  } else if (phase === P_CARRY) {
    const e = ease(t);
    s.clawX = s.fromX + (s.mx - s.fromX) * e;
    s.clawZ = s.fromZ + (s.mz - s.fromZ) * e;
    if (t >= 1) goto(s, P_DROP);
  } else if (phase === P_DROP) {
    // El fallo se anuncia al abrirse los dedos sobre la boca, que es cuando el
    // jugador ve que no cae nada. Al final del ciclo llegaba tarde, con la garra
    // ya de vuelta arriba. Sólo el primer paso de la fase: `close` no sirve de
    // disparador porque se queda congelado si el cierre chocó con un premio.
    if (s.held < 0 && s.time <= H) s.events.push(EV_EMPTY);
    s.close *= .9;
    if (s.close < .72) release(s, false);
    // Red de seguridad: en P_RETURN el carro se va, así que nadie puede seguir
    // colgando de él aunque no haya llegado a pasar por `release`.
    if (t >= 1) { releaseHook(s); s.fromX = s.clawX; s.fromZ = s.clawZ; goto(s, P_RETURN); }
  } else if (phase === P_RETURN) {
    const e = 1 - ease(t);
    s.clawX = s.fromX * e; s.clawZ = s.fromZ * e;
    if (t >= 1) goto(s, P_SETTLE);
  } else if (phase === P_SETTLE) {
    // Nada se cierra mientras quede un premio bajando por el conducto. Si no, la
    // última tirada puede aterrizar DESPUÉS del cartel de resultado y el jugador
    // lee una puntuación que ya no es la suya. La espera termina siempre: dentro
    // del conducto la caída es libre y siempre cruza el suelo.
    const falling = s.toys.some(p => p.state === 3);
    if (t >= 1 && !falling) {
      s.firstThrow = false;
      s.events.push(EV_SETTLE);
      if (s.tries <= 0) { goto(s, P_RESULT); s.events.push(EV_OVER); }
      else { goto(s, P_AIM); s.vx = s.vz = 0; }
    }
  }
}

export function step(s: Sim) {
  advance(s);
  integrate(s);
  // La boca sólo se tapa durante el asentado de `reset`. Si se siguiera tapando
  // en el título, el montón quedaría comprimido contra ella y se derrumbaría
  // dentro al empezar la partida.
  constrain(s, s.phase >= P_LOWER && s.phase <= P_DROP);
}

// -------------------------------------------------------------------- entradas

export function beginDrop(s: Sim) {
  if (s.phase !== P_AIM) return false;
  // El intento se consume al aceptar el input, no varios segundos después al
  // terminar la animación. Así HUD y reglas reflejan inmediatamente la jugada.
  s.tries--;
  // La garra se detiene sobre el montón, no baja siempre hasta el fondo. Si no,
  // el émbolo central arrollaría justo a los peluches que están más accesibles.
  let top = surface(s.shape, s.clawX, s.clawZ).y + FEET;
  for (const p of s.toys) {
    if (p.state) continue;
    if (Math.hypot(p.x - s.clawX, p.z - s.clawZ) < 1.1 && p.y > top) top = p.y;
  }
  s.dropY = clamp(top + 1.3, CLAW_BOTTOM, CLAW_TOP - .6);
  s.won = false; s.vx = s.vz = 0;
  goto(s, P_LOWER); s.events.push(EV_LOWER);
  return true;
}

export function beginGame(s: Sim) {
  if (s.phase !== P_TITLE) return false;
  goto(s, P_AIM);
  return true;
}
