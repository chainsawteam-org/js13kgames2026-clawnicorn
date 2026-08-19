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
  EV_SLIP = 4, EV_HOOK = 5, EV_OVER = 6, EV_WIN = 7;

// EV_WIN abre un rango propio y empaquetado: los dos bits bajos son la rareza y
// los altos el escalón de combo con el que se cobró. Va en el evento y no en el
// estado porque main.ts los consume EN LOTE al final del frame, cuando `s.combo`
// ya puede haber avanzado; así dos premios que caen en el mismo paso conservan
// cada uno su valor. El decodificador vive aquí, al lado del que lo codifica.
export const winRarity = (e: number) => (e - EV_WIN) & 3;
export const winMult = (e: number) => comboMult((e - EV_WIN) >> 2);

// Escalera de valor por rareza: Star (8 en el montón) < Rainbow (4) < Unicorn (3)
// < Unicorn King (3). El índice de rareza ordena a la vez cuántos hay, lo difícil
// que es agarrarlo y lo que paga, así que la decisión del jugador es siempre la
// misma pregunta: ¿cuánto riesgo por cuánto premio?
export const POINTS = [250, 500, 1000, 2000];

// Combo: dentro de UNA tirada, cada premio que entra después del primero vale el
// doble que el anterior (x1, x2, x4, x8...). El contador es el número de premios
// ya cobrados en la tirada, así que el multiplicador del siguiente es 1 << combo.
// El techo existe sólo como red: el montón tiene 18 peluches y un derrumbe puede
// colarlos casi todos, de modo que sin tope una sola tirada afortunada valdría más
// que cualquier partida jugada bien. Con x32 el doblete y el triplete —que es lo
// que la mecánica quiere premiar— siguen intactos.
export const COMBO_MAX = 5;
export const comboMult = (n: number) => 1 << (n < COMBO_MAX ? n : COMBO_MAX);
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
// La curva completa, medida con el relieve actual:
//
//   umbral   ±0,22   ±0,55   partidas con jackpot (estrategia codiciosa)
//   0,85      10 %     3 %     20/60   ← roto: lotería, no dificultad
//   0,80      27 %     8 %     42/60
//   0,76      44 %    16 %
//   0,745     53 %    20 %             ← elegido
//   0,75      58 %    23 %     58/60
//
// El King estuvo en 0,80 y seguía leyendo como inalcanzable con un mando: una de
// cada cuatro tiradas con puntería humana es, en cinco intentos por partida, un
// premio que el jugador ve fallar cuatro veces seguidas. 0,745 lo pone en algo más
// de una de cada dos, el DOBLE que antes, que es lo pedido explícitamente.
//
// El precio está medido y hay que conocerlo: la estrategia codiciosa —ir siempre a
// por el King— sube sus partidas con jackpot, y cuanto más se baje este número más
// se acerca el King a ser un trámite en vez de la apuesta arriesgada sobre la que
// está construido el juego. La válvula de escape si eso llega a molestar NO es
// volver a subir el umbral —ahí está el acantilado— sino enterrar más al King:
// bastan crowd ≥ 4 vecinos para anular su exposición.
//
// Lo que protege al King ya no es la precisión imposible sino estar ENTERRADO,
// que era la intención original: con crowd ≥ 4 la exposición se anula y el grip
// se queda en ~0,72, por debajo del umbral incluso apuntando perfecto.
//
// (La nota anterior decía que un agarre perfecto "ronda 0,60" porque la garra
// desplaza al objetivo 0,35 u al bajar. Está medido que no: `beginDrop` para el
// carro SOBRE el montón, el agarre se evalúa antes de que los dedos se muevan y
// el centrado real llega a 0,999. Ese 0,60 fantasma es el origen del acantilado.)
const REQUIRED = [.24, .33, .44, .745];

// El peluche son dos esferas: torso en el origen local y cabeza desplazada según yaw.
const R_BODY = .55, R_HEAD = .37, HEAD_X = .62, HEAD_Y = .5;
// Radio del tapón que cierra la boca durante el asentado de `reset`: el cuerpo
// del premio más lejos de la abertura, y nunca menos que el pie exterior del
// caballón. El montón arranca apoyado en suelo llano, no encaramado al embudo.
const PLUG_R = Math.max(MOUTH_R + R_BODY, FUNNEL_R + RIM_W);
export const FEET = .75;                         // del centro del torso a las pezuñas

const GRAV = 15, DRAG = .9965, YSQUASH = 1.2, TORQUE = 22, SPIN_MAX = 4;
// Radio de descarte previo para el par premio-premio. Una esfera se aleja del
// centro de su peluche como mucho hypot(HEAD_X, HEAD_Y), y dos cuerpos suman
// 2·R_BODY de radio, así que por encima de esa suma NINGUNA de las cuatro
// parejas puede tocarse. Es una cota superior y el test real amplifica la Y con
// YSQUASH (que sólo aleja), de modo que saltarse el par no cambia un solo bit:
// es velocidad, no una aproximación.
const BROAD_R2 = (2 * Math.hypot(HEAD_X, HEAD_Y) + 2 * R_BODY) ** 2;
const MAX_PUSH = .18;                            // tope duro: ninguna corrección puede catapultar nada
const SLEEP_EPS = 2e-7, SLEEP_FRAMES = 12;

// Atracción de la boca. El caballón resuelve el montado en reposo —empuja hacia
// fuera, así que el montón no se escurre solo— pero deja un caso feo: lo que
// llega rodando o cayendo al borde del embudo se queda encallado a dos dedos del
// premio. Esto lo perdona con un tirón radial hacia el centro.
//
// La clave de que NO reabra la fuga que cerró el caballón es la puerta de
// velocidad: sólo tira de lo que YA se mueve. Medido sobre las seis formas y
// 13.000 muestras, el montón en reposo tiembla a 2e-4 u/paso de mediana y no
// pasa de 4,5e-3 en el entorno del embudo; una caída real ronda 3e-2. PULL_V0
// queda por encima del techo del temblor y PULL_V1 en velocidad de caída, de
// modo que un premio dormido en la falda no recibe absolutamente nada por mucho
// que se espere, y uno que llega por el aire sí.
//
// MOUTH_PULL está en u/s², como GRAV: es el 40 % de la gravedad, y sólo al
// alcance cero. Se desvanece linealmente hasta PULL_R, que es justo el pie
// exterior del caballón: fuera de la boca y su reborde no existe.
const MOUTH_PULL = 6, PULL_R = FUNNEL_R + RIM_W, PULL_V0 = .008, PULL_V1 = .02;

// Derrumbes. El solver duerme a un premio quieto y los dormidos no se integran,
// así que no les cae la gravedad: cuando el de debajo se va —lo sube la garra, lo
// empuja un vecino— el de encima se queda flotando sobre el hueco. WAKE_EPS es el
// desplazamiento al cuadrado por paso a partir del cual un premio se considera
// "en movimiento de verdad" y despierta a sus vecinos, y va deliberadamente por
// encima del percentil 99 del temblor del montón (5,2e-3 u/paso → 2,7e-5): más
// bajo despertaría al montón entero indefinidamente y el temblor perpetuo lo
// acabaría escurriendo por la boca.
//
// COLLAPSE_* es el otro lado: arrancar un peluche del montón no puede dejar a los
// de alrededor congelados en su sitio como si nada hubiera pasado. Al conceder el
// agarre, los vecinos se despiertan y reciben un empujón HORIZONTAL hacia la
// columna del que se va —la vertical la pone la gravedad—, así que primero se
// apoyan contra él (masa infinita: rebotan y se bambolean) y, en cuanto sube, ya
// están inclinados hacia el hueco y se derrumban dentro.
const WAKE_EPS = 4e-5, WAKE_R = 1.5;
const COLLAPSE_R = 1.7, COLLAPSE_PUSH = .022;

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
  [-2.6, -1.15, 0], [-1.55, -1.1, 0], [-0.5, -1.15, 0], [0.55, -1.1, 0],
  [1.6, -1.15, 0], [2.65, -1.1, 0], [-2.0, -0.5, 0], [2.0, -0.45, 0],
  [-1.85, 0.15, 1], [-0.6, 0.2, 1], [0.6, 0.15, 1], [1.85, 0.2, 1],
  [-1.1, 0.75, 2], [0, 0.8, 2], [1.1, 0.75, 2],
  [-1.2, 1.05, 3], [0, 1.1, 3], [1.2, 1.05, 3]
];

export function createSim() {
  return {
    toys: [] as Toy[],
    phase: P_TITLE, time: 0,
    score: 0, tries: 5, combo: 0,
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
  s.score = 0; s.tries = 5; s.combo = 0; s.phase = P_TITLE; s.time = 0;
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
  // El asentado deja caer premios por la boca en su segunda y tercera fase, y
  // eso pasa por `win`: hay que borrar también el combo, o la partida empezaría
  // con el multiplicador ya subido.
  s.score = 0; s.combo = 0; s.events.length = 0;
  // Aquí se dormía a TODO el montón de golpe para que no derivase durante el
  // título. Ya no: un peluche dormido no se integra, así que al que le tocaba el
  // reparto con los pies en el aire —el último relanzado, o cualquiera que un
  // empujón acabara de lanzar hacia arriba— se quedaba flotando sobre el montón
  // hasta que un vecino lo despertase. Se deja que `constrain` reparta el sueño
  // como en cualquier otro paso: el que está apoyado se duerme solo en doce pasos
  // y el que sigue en el aire termina su caída. Y no hacía falta para nada más:
  // medido, la fuga por esperar sin jugar se queda igual, en 250 puntos contra un
  // listón de 1.250, porque quien la cierra es el caballón y no esta línea.
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
      // DOS pasadas a propósito: la primera cuenta apoyos sobre la pose intacta,
      // porque la segunda va moviendo al premio y cada cápsula vería una postura
      // distinta de la anterior. El recuento es un mando de balance (`contacts >
      // p.rarity` decide el acuñado), así que tiene que ser estable.
      const contacts = clawSolve(s, p, false);
      // s.vx hace DOBLE OFICIO: en P_AIM es la velocidad del carro y aquí, con la
      // garra abajo, la bandera de \"el cierre ha chocado\" que congela `close` en
      // `advance`. No se pisan porque `beginDrop` y la vuelta a P_AIM la ponen a
      // cero, pero cualquier uso nuevo de s.vx tiene que contar con esto.
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
        const cdx = b.x - a.x, cdy = b.y - a.y, cdz = b.z - a.z;
        if (cdx * cdx + cdy * cdy + cdz * cdz > BROAD_R2) continue;   // ver BROAD_R2
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
      else {
        supportSolve(s, p);
        // Tirón de la boca, DESPUÉS del relieve para que el caballón no lo anule:
        // sólo sobre lo que ya viene con velocidad, y desvaneciéndose con la
        // distancia. Ver MOUTH_PULL. carry 0 porque es una aceleración real, no
        // una corrección geométrica: tiene que acumular velocidad como GRAV.
        if (!loading && md < PULL_R) {
          const v = Math.hypot(p.x - p.ox, p.y - p.oy, p.z - p.oz);
          const k = clamp((v - PULL_V0) / (PULL_V1 - PULL_V0), 0, 1)
            * (1 - md / PULL_R) * MOUTH_PULL * H * H;
          if (k > 0) push(p, -dx / md * k, 0, -dz / md * k, 0);
        }
      }

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

  // Contagio del movimiento. Va en una pasada aparte y no dentro del bucle
  // anterior porque `sleep` se acaba de recalcular ahí: hacerlo antes despertaría
  // usando el estado del paso pasado. Lo que se mueve de verdad —WAKE_EPS, muy
  // por encima del temblor de fondo— devuelve a la vida a sus vecinos dormidos,
  // que es lo que convierte un empujón aislado en un derrumbe y lo que impide que
  // nadie se quede flotando cuando el de abajo desaparece.
  for (const a of toys) {
    if (a.state === 2) continue;
    const m = (a.x - a.ox) ** 2 + (a.y - a.oy) ** 2 + (a.z - a.oz) ** 2;
    if (m < WAKE_EPS) continue;
    for (const b of toys) {
      if (b === a || b.state || b.sleep < SLEEP_FRAMES) continue;
      const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
      if (dx * dx + dy * dy + dz * dz < WAKE_R * WAKE_R) b.sleep = 0;
    }
  }
}

// ---------------------------------------------------------------------- reglas

function win(s: Sim, i: number) {
  const p = s.toys[i]!;
  p.state = 2;
  s.won = true;
  // El escalón se lee ANTES de subirlo: el primer premio de la tirada cobra x1 y
  // es el segundo el que ya vale el doble. El combo no distingue cómo entró el
  // premio —garra, enganche o derrumbe—, sólo que cayó dentro de la misma tirada,
  // que es lo que convierte un buen tiro sobre el montón en una jugada grande.
  s.score += POINTS[p.rarity]! * comboMult(s.combo);
  s.events.push(EV_WIN + p.rarity + s.combo * 4);
  s.combo++;
  if (s.held === i) s.held = -1;
  if (s.hook === i) s.hook = -1;
}

// Sacudida del vecindario cuando un peluche es arrancado del montón. Ver
// COLLAPSE_R. El empujón es HORIZONTAL hacia la columna del que se va —la
// vertical ya la pone la gravedad en cuanto queda hueco— y se aplica descentrado,
// a la altura de la cabeza, para que además los haga girar: sin ese par el
// derrumbe se ve como una traslación de un centímetro y no se lee.
function collapse(s: Sim, p: Toy, k0: number) {
  for (const q of s.toys) {
    if (q === p || q.state) continue;
    const dx = p.x - q.x, dy = p.y - q.y, dz = p.z - q.z;
    const d = Math.hypot(dx, dy, dz);
    if (d > COLLAPSE_R) continue;
    q.sleep = 0;
    const k = k0 * (1 - d / COLLAPSE_R) / (d || 1);
    pushAt(q, headX(q) * .5, headZ(q) * .5, dx * k, 0, dz * k, 0);
  }
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

  collapse(s, p, COLLAPSE_PUSH);

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
    // Segunda sacudida, la que de verdad derrumba: la del agarre se gasta contra
    // el propio agarrado, que todavía está en su sitio y es masa infinita, así
    // que rebota. Ésta llega cuando el hueco está abriéndose.
    if (p && s.time <= H) collapse(s, p, COLLAPSE_PUSH);
    if (p && p.slipAt >= 0 && t >= p.slipAt) { p.slipAt = -1; release(s, true); }
    if (t >= 1) { s.fromX = s.clawX; s.fromZ = s.clawZ; goto(s, P_CARRY); }
  } else if (phase === P_CARRY) {
    const e = ease(t);
    s.clawX = s.fromX + (s.mx - s.fromX) * e;
    s.clawZ = s.fromZ + (s.mz - s.fromZ) * e;
    if (t >= 1) {
      // El fallo se anuncia al llegar a la boca, que es cuando el jugador ve que
      // los dedos se abren sin nada dentro. Un premio acuñado entre las patas
      // viaja sin agarre oficial y puede acabar entrando, así que con uno a bordo
      // no hay fallo que anunciar: si no, sale "MISSED!" y detrás "+250".
      if (s.held < 0 && !s.toys.some(p => p.slipAt === -2)) s.events.push(EV_EMPTY);
      goto(s, P_DROP);
    }
  } else if (phase === P_DROP) {
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
  // El combo se reinicia aquí y no al terminar la tirada anterior: entre medias
  // el montón sigue temblando y lo que se cuele todavía pertenece a esa tirada.
  s.combo = 0;
  s.won = false; s.vx = s.vz = 0;
  goto(s, P_LOWER); s.events.push(EV_LOWER);
  return true;
}

export function beginGame(s: Sim) {
  if (s.phase !== P_TITLE) return false;
  // La boca está ABIERTA durante el título —taparla dejaría el montón comprimido
  // contra ella— así que mientras se lee el cartel puede colarse un premio. Esos
  // puntos no son del jugador: la partida empieza siempre a cero.
  s.score = 0; s.combo = 0; s.events.length = 0;
  goto(s, P_AIM);
  return true;
}
