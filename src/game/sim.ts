// Simulación pura: sin DOM, sin WebGL, sin reloj real, sin Math.random.
// Todo avanza en pasos fijos de H segundos, así que el resultado no depende
// del refresco del monitor. Ver docs/GAME_DESIGN.md §5 y §6.

export const H = 1 / 120;

// Fases. El reloj de fase vive dentro del paso fijo, igual que las físicas.
export const P_TITLE = 0, P_AIM = 1, P_LOWER = 2, P_CLOSE = 3, P_PAUSE = 4,
  P_LIFT = 5, P_CARRY = 6, P_DROP = 7, P_RETURN = 8, P_SETTLE = 9, P_RESULT = 10;

const DUR = [0, 0, .85, .45, .18, 1.15, .9, 1.4, .9, .35, 0];

// Eventos que consume main.ts para audio y HUD. La simulación no toca nada externo.
export const EV_LOWER = 0, EV_CLOSE = 1, EV_GRAB = 2, EV_EMPTY = 3,
  EV_SLIP = 4, EV_WIN = 5, EV_SETTLE = 6, EV_OVER = 7;

export const POINTS = [100, 200, 500, 1000, 5000];
const DIFF = [.15, .25, .40, .55, .70];
// Agarre mínimo por rareza. Tabla explícita en vez de fórmula: es el mando de
// balance más sensible del juego y conviene poder moverlo de uno en uno.
// El King exige puntería perfecta Y que esté despejado; enterrarlo lo protege.
// Calibrada contra tools/simtest.mjs: la garra al bajar ya desplaza al objetivo
// unas 0,35 u, así que un agarre "perfecto" ronda 0,60 y no 1,0.
const REQUIRED = [.33, .45, .57, .78, .865];

// Geometría de la cuba, en unidades de mundo (coincide con render/scene.ts).
export const FLOOR = -3.225;                     // cara superior del suelo
// Bandeja de premios: más pequeña que el mueble, como en una máquina real. Que sea
// ajustada es lo que hace que 13 peluches formen montón en vez de una capa dispersa.
export const X0 = -3.1, X1 = 3.1, Z0 = -1.75, Z1 = 1.75;
export const MOUTH_X = -2.35, MOUTH_Z = 1.05, MOUTH_R = .7;
const RIM_TOP = FLOOR + 1.9;                     // labio que aísla el conducto del montón

// El peluche son dos esferas: torso en el origen local y cabeza desplazada según yaw.
const R_BODY = .55, R_HEAD = .37, HEAD_X = .62, HEAD_Y = .5;
const FEET = .75;                                // del centro del torso a las pezuñas
const REST = FLOOR + FEET;                       // y de reposo sobre el suelo

const GRAV = 15, DRAG = .9965, YSQUASH = 1.2, TORQUE = 22, SPIN_MAX = 4;
const MAX_PUSH = .18;                            // tope duro: ninguna corrección puede catapultar nada
const SLEEP_EPS = 2e-7, SLEEP_FRAMES = 12;

// Claw
const CLAW_TOP = 2.3, CLAW_BOTTOM = -1.15;
export const AIM_X = 2.7, AIM_Z = 1.35;          // el carro se mueve sobre la bandeja
const GRAB_R = 1.05, HOLD_Y = -1.25;             // el premio agarrado cuelga a HOLD_Y del carro

export type Toy = {
  x: number; y: number; z: number;
  ox: number; oy: number; oz: number;
  yaw: number; oyaw: number; roll: number;
  rarity: number;
  state: number;      // 0 montón, 1 agarrado, 2 ganado, 3 cayendo por el conducto
  sleep: number;
  slipAt: number;     // fracción de la subida en la que resbala, -1 si no resbala
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
  [2.4, -1.05, 0], [-2.2, -.45, 0], [-1.2, .05, 1], [.05, -.05, 1],
  [1.25, 0, 1], [2.4, .05, 2], [.2, 1.05, 2], [1.4, 1.1, 3],
  [2.5, 1.05, 4]
];

export function createSim() {
  return {
    toys: [] as Toy[],
    phase: P_TITLE, time: 0,
    score: 0, tries: 5,
    clawX: 0, clawY: CLAW_TOP, clawZ: 0, close: 0, dropY: CLAW_BOTTOM,
    vx: 0, vz: 0, fromX: 0, fromZ: 0,
    held: -1, won: false, firstThrow: true,
    inX: 0, inZ: 0,               // input normalizado que escribe main.ts
    events: [] as number[],
    lastWin: 0                    // rareza del último premio ganado
  };
}

const mkToy = (x: number, y: number, z: number, yaw: number, rarity: number): Toy =>
  ({ x, y, z, ox: x, oy: y, oz: z, yaw, oyaw: yaw, roll: 0, rarity, state: 0, sleep: 0, slipAt: -1 });

export function reset(s: Sim, gameSeed: number) {
  setSeed(gameSeed);
  s.score = 0; s.tries = 5; s.phase = P_TITLE; s.time = 0;
  s.clawX = s.clawZ = s.vx = s.vz = 0; s.clawY = CLAW_TOP; s.close = 0;
  s.held = -1; s.won = false; s.firstThrow = true; s.events.length = 0;

  // Baraja las rarezas sobre las posiciones base (Fisher-Yates con el PRNG sembrado).
  const rar = LAYOUT.map(l => l[2]);
  for (let i = rar.length - 1; i > 0; i--) {
    const j = (rnd() * (i + 1)) | 0;
    const t = rar[i]!; rar[i] = rar[j]!; rar[j] = t;
  }
  s.toys = LAYOUT.map((l, i) => mkToy(
    l[0] + (rnd() - .5) * .35,
    REST + .5 + rnd() * 2.4,         // alturas escalonadas: caen unos sobre otros
    l[1] + (rnd() - .5) * .3,
    rnd() * 360,
    rar[i]!
  ));

  // Asentado inicial: el montón descansa de verdad antes del primer frame.
  for (let i = 0; i < 260; i++) { integrate(s); constrain(s, false); }
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

const headX = (p: Toy) => Math.cos(p.yaw * Math.PI / 180) * HEAD_X;
const headZ = (p: Toy) => -Math.sin(p.yaw * Math.PI / 180) * HEAD_X;

// Cápsula contra el torso. Devuelve 1 si toca. `apply` permite contar sin mover.
function capsule(p: Toy, ax: number, ay: number, az: number,
  bx: number, by: number, bz: number, r: number, apply: boolean) {
  const abx = bx - ax, aby = by - ay, abz = bz - az;
  const len = abx * abx + aby * aby + abz * abz;
  const q = len > 1e-9 ? clamp(((p.x - ax) * abx + (p.y - ay) * aby + (p.z - az) * abz) / len, 0, 1) : 0;
  const dx = p.x - (ax + abx * q), dy = p.y - (ay + aby * q), dz = p.z - (az + abz * q);
  const d = Math.hypot(dx, dy, dz) || 1e-4;
  const hit = R_BODY + r - d;
  if (hit <= 0) return 0;
  // carry 1: el claw se mueve, el peluche lo acompaña; nunca inyecta impulso.
  if (apply) push(p, dx / d * hit, dy / d * hit, dz / d * hit, 1);
  return 1;
}

// Las seis cápsulas de los dedos más el émbolo central.
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
  capsule(p, s.clawX, s.clawY - .72, s.clawZ, s.clawX, s.clawY - .38, s.clawZ, .11, apply);
  return n;
}

// ------------------------------------------------------------------ contactos

function constrain(s: Sim, clawOn: boolean) {
  const toys = s.toys;

  if (clawOn) for (const p of toys) if (!p.state) clawSolve(s, p, true);

  // Premio agarrado: muelle al carro, no muro rígido. Cuelga, se retrasa y se
  // balancea durante la subida y el traslado; al soltarlo la velocidad es real.
  if (s.held >= 0) {
    const p = toys[s.held]!;
    push(p, (s.clawX - p.x) * .35, (s.clawY + HOLD_Y - p.y) * .35, (s.clawZ - p.z) * .35, .7);
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

  // Paredes, suelo, labio del conducto y disparador de premio.
  for (let i = 0; i < toys.length; i++) {
    const p = toys[i]!;
    if (p.state === 2) continue;

    // Estado 3: el premio que la garra ha soltado sobre el conducto. Cae por su
    // columna sin paredes ni suelo y puntúa al cruzar el plano del suelo.
    if (p.state === 3) {
      if (p.y < FLOOR) { win(s, i); continue; }
    } else if (!p.state) {
      // Paredes de la cuba. La velocidad se reconstruye a partir de la que traía:
      // nunca se deduce de un salto de posición, que es lo que catapultaba antes.
      const lo = X0 + R_BODY, hi = X1 - R_BODY, zlo = Z0 + R_BODY, zhi = Z1 - R_BODY;
      if (p.x < lo) { const v = p.x - p.ox; p.x = lo; p.ox = lo - (v < 0 ? -v * .25 : v); }
      if (p.x > hi) { const v = p.x - p.ox; p.x = hi; p.ox = hi - (v > 0 ? -v * .25 : v); }
      if (p.z < zlo) { const v = p.z - p.oz; p.z = zlo; p.oz = zlo - (v < 0 ? -v * .25 : v); }
      if (p.z > zhi) { const v = p.z - p.oz; p.z = zhi; p.oz = zhi - (v > 0 ? -v * .25 : v); }

      // Labio del conducto: mientras esté por debajo del borde de la cuba, un premio
      // del montón siempre es expulsado. El conducto sólo acepta lo que entrega la
      // garra, así que no hay forma de que la puntuación ocurra por accidente.
      const dx = p.x - MOUTH_X, dz = p.z - MOUTH_Z, md = Math.hypot(dx, dz) || 1e-4;
      if (p.y < RIM_TOP && md < MOUTH_R + R_BODY) {
        const q = MOUTH_R + R_BODY - md;
        push(p, dx / md * q, 0, dz / md * q, .6);
      }

      if (p.y < REST) {
        const v = p.y - p.oy;
        p.y = REST; p.oy = REST + v * .25;                 // rebote corto
        p.ox = p.x - (p.x - p.ox) * .82;                   // rozamiento
        p.oz = p.z - (p.z - p.oz) * .82;
        p.oyaw = p.yaw - (p.yaw - p.oyaw) * .82;
      }
    }

    // Red de seguridad: nada puede salir del mundo ni quedarse en NaN.
    if (!(p.x === p.x && p.y === p.y && p.z === p.z) || p.y < -9) {
      p.x = 0; p.y = REST + 2; p.z = 0; p.ox = p.x; p.oy = p.y; p.oz = p.z;
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
  s.lastWin = p.rarity;
  s.score += POINTS[p.rarity]!;
  if (s.held === i) s.held = -1;
  s.events.push(EV_WIN);
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
    const exposure = clamp(1 - crowd / 4, 0, 1) * .6 + clamp((p.y - REST) / 1.1, 0, 1) * .4;
    // El apuntado pesa más que nada: es la única decisión real del jugador.
    const grip = .70 * centring + .12 * (contacts / 6) + .18 * exposure;
    // Sólo compiten los que superan su propio umbral. Si se eligiera primero por
    // agarre bruto, un King a medio agarrar bloquearía una captura fácil que sí
    // valía, y el jugador vería fallar tiradas que en realidad eran buenas.
    if (grip >= REQUIRED[p.rarity]! && grip > bestGrip) { bestGrip = grip; best = i; }
  }
  s.close = open;
  // Siempre se consumen los dos números para que el flujo del PRNG no dependa del resultado.
  const r1 = rnd(), r2 = rnd();
  if (best < 0) { s.events.push(EV_EMPTY); return; }

  const p = s.toys[best]!;
  p.state = 1; s.held = best;
  // Probabilidad de resbalón durante la subida. Calibrada para que se vea: con la
  // curva anterior (base .02, penalización .20 por agarre) salía negativa para las
  // rarezas bajas y la mecánica no llegaba a dispararse nunca.
  const slip = clamp(.05 + DIFF[p.rarity]! * .40 - bestGrip * .14, 0, .35);
  p.slipAt = !s.firstThrow && r1 < slip ? .35 + r2 * .45 : -1;
  s.events.push(EV_GRAB);
}

function release(s: Sim, slipped: boolean) {
  if (s.held < 0) return;
  const p = s.toys[s.held]!;
  // Si se suelta sobre el conducto pasa a "cayendo por el conducto"; si resbala
  // antes de llegar, vuelve al montón como un peluche más.
  const overChute = Math.hypot(s.clawX - MOUTH_X, s.clawZ - MOUTH_Z) < MOUTH_R;
  p.state = !slipped && overChute ? 3 : 0;
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
    if (inX && inZ) { inX *= .707; inZ *= .707; }
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
    s.close = ease(t);
    if (t >= 1) { s.close = 1; goto(s, P_PAUSE); }
  } else if (phase === P_PAUSE) {
    if (t >= 1) goto(s, P_LIFT);
  } else if (phase === P_LIFT) {
    s.clawY = s.dropY + ease(t) * (CLAW_TOP - s.dropY);
    const p = s.held >= 0 ? s.toys[s.held]! : null;
    if (p && p.slipAt >= 0 && t >= p.slipAt) { p.slipAt = -1; release(s, true); }
    if (t >= 1) { s.fromX = s.clawX; s.fromZ = s.clawZ; goto(s, P_CARRY); }
  } else if (phase === P_CARRY) {
    const e = ease(t);
    s.clawX = s.fromX + (MOUTH_X - s.fromX) * e;
    s.clawZ = s.fromZ + (MOUTH_Z - s.fromZ) * e;
    if (t >= 1) goto(s, P_DROP);
  } else if (phase === P_DROP) {
    s.close = 1 - ease(clamp(s.time / .25, 0, 1));
    if (s.close < .72) release(s, false);
    if (t >= 1) { s.fromX = s.clawX; s.fromZ = s.clawZ; goto(s, P_RETURN); }
  } else if (phase === P_RETURN) {
    const e = 1 - ease(t);
    s.clawX = s.fromX * e; s.clawZ = s.fromZ * e;
    s.close = 0;
    if (t >= 1) goto(s, P_SETTLE);
  } else if (phase === P_SETTLE) {
    if (t >= 1) {
      s.tries--; s.firstThrow = false;
      s.events.push(s.won ? EV_SETTLE : EV_EMPTY);
      if (s.tries <= 0) { goto(s, P_RESULT); s.events.push(EV_OVER); }
      else { goto(s, P_AIM); s.vx = s.vz = 0; }
    }
  }
}

export function step(s: Sim) {
  advance(s);
  integrate(s);
  constrain(s, s.phase >= P_LOWER && s.phase <= P_DROP);
}

// -------------------------------------------------------------------- entradas

export function beginDrop(s: Sim) {
  if (s.phase !== P_AIM) return false;
  // La garra se detiene sobre el montón, no baja siempre hasta el fondo. Si no,
  // el émbolo central arrollaría justo a los peluches que están más accesibles.
  let top = REST;
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
