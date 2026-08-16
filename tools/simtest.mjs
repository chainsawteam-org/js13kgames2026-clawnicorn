// Herramienta de desarrollo. NO se empaqueta: comprueba la simulación pura de
// src/game/sim.ts sin navegador. `npm run simtest`.
import { build } from "esbuild";
import { mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const OUT = "node_modules/.cache/simtest.mjs";
await mkdir("node_modules/.cache", { recursive: true });
const bundled = await build({
  entryPoints: ["src/game/sim.ts"],
  bundle: true, write: false, format: "esm", target: "es2020"
});
await writeFile(OUT, bundled.outputFiles[0].text);
const S = await import(pathToFileURL(OUT).href + "?v=" + Date.now());

let failures = 0;
const check = (name, ok, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "  ok  " : "  FAIL"} ${name}${detail ? "  — " + detail : ""}`);
};

// Juega una partida completa apuntando a la posición pedida por `aim`.
// `fps` alimenta el acumulador de paso fijo igual que lo hace main.ts.
// El apuntado se fija de forma exacta a propósito: el movimiento del carro depende
// del muestreo del teclado por frame (input del jugador), y lo que aquí se quiere
// aislar es si las FÍSICAS cambian con el refresco.
function play(seed, aim, fps = 60) {
  const s = S.createSim();
  S.reset(s, seed);
  S.beginGame(s);
  let acc = 0, frames = 0, steps = 0;
  const dt = 1 / fps;
  const log = { grabs: 0, empty: 0, slips: 0, hooks: 0, wins: 0, maxHeld: 0, byRarity: {} };

  while (s.phase !== S.P_RESULT && frames < fps * 120) {
    frames++;
    acc = Math.min(acc + dt, .2);
    while (acc >= S.H) {
      // La entrada se emite en un instante de SIMULACIÓN fijo, no en el primer
      // frame que ve AIM. Si no, a cada refresco le tocaría un momento distinto
      // del asentado del montón y la comparación no mediría las físicas.
      if (s.phase === S.P_AIM && s.time >= .6) {
        const t = aim(s);
        s.clawX = t.x; s.clawZ = t.z; s.vx = s.vz = 0;
        S.beginDrop(s);
      }
      S.step(s); acc -= S.H; steps++;
      // Cuántos peluches viajan en la garra a la vez: el agarrado y, como mucho,
      // un enganchado. Se mira en cada paso, no al final, porque el enganche
      // sólo existe mientras dura la jugada.
      let riding = 0;
      for (const p of s.toys) if (p.state === 1) riding++;
      if (riding > log.maxHeld) log.maxHeld = riding;
    }

    for (const e of s.events) {
      if (e === S.EV_GRAB) log.grabs++;
      if (e === S.EV_EMPTY) log.empty++;
      if (e === S.EV_SLIP) log.slips++;
      if (e === S.EV_HOOK) log.hooks++;
      if (e >= S.EV_WIN) {
        const rarity = e - S.EV_WIN;
        log.wins++; log.byRarity[rarity] = (log.byRarity[rarity] || 0) + 1;
      }
    }
    s.events.length = 0;
  }
  return { s, frames, steps, log, finished: s.phase === S.P_RESULT };
}

// Un sim recién creado elige forma = semilla % SHAPE_COUNT, así que se puede
// pedir una forma concreta sin tocar la simulación.
const seedFor = (shape, i = 0) => (1234 + i * 7) * S.SHAPE_COUNT + shape;

const clampAim = p => ({
  x: Math.max(-S.AIM_X, Math.min(S.AIM_X, p.x)),
  z: Math.max(-S.AIM_Z, Math.min(S.AIM_Z, p.z))
});

// Ruido de apuntado determinista: un jugador bueno, no perfecto.
const makeJitter = (seedValue, spread) => {
  let n = seedValue >>> 0;
  return () => {
    n ^= n << 13; n ^= n >>> 17; n ^= n << 5;
    return ((n >>> 0) / 4294967296 - .5) * spread;
  };
};

// Codicioso: siempre el premio de mayor valor que quede.
const pickGreedy = s => {
  let best = null, bv = -Infinity;
  for (const p of s.toys) {
    if (p.state) continue;
    const v = S.POINTS[p.rarity] + p.y * 10;
    if (v > bv) { bv = v; best = p; }
  }
  return best;
};

// Conservador: el premio más despejado, ignorando su valor.
const pickSafe = s => {
  let best = null, bv = -Infinity;
  for (const p of s.toys) {
    if (p.state) continue;
    let crowd = 0;
    for (const q of s.toys) if (q !== p && !q.state && Math.hypot(q.x - p.x, q.z - p.z) < 1.3) crowd++;
    const v = p.y * 2 - crowd;
    if (v > bv) { bv = v; best = p; }
  }
  return best;
};

const strategy = (pick, jitter) => s => {
  const best = pick(s);
  if (!best) return { x: 0, z: 0 };
  const t = clampAim(best);
  return jitter ? { x: t.x + jitter(), z: t.z + jitter() } : t;
};

const greedy = strategy(pickGreedy, null);

console.log("\n— asentado inicial —");
{
  for (let shape = 0; shape < S.SHAPE_COUNT; shape++) {
    const s = S.createSim();
    S.reset(s, seedFor(shape));
    const low = s.toys.filter(p => p.y < S.surface(s.shape, p.x, p.z).y + S.FEET - .012);
    const inChute = s.toys.filter(p => Math.hypot(p.x - s.mx, p.z - s.mz) < S.MOUTH_R);
    const nan = s.toys.filter(p => !Number.isFinite(p.x + p.y + p.z + p.yaw));
    check(`forma ${shape}: 13 premios apoyados`, s.shape === shape && s.toys.length === 13 && !low.length,
      `${low.length} bajo el relieve`);
    check(`forma ${shape}: conducto libre y sin NaN`, !inChute.length && !nan.length && !s.score && s.toys.every(p => p.state === 0));
    check(`forma ${shape}: el montón queda dormido`, s.toys.every(p => p.sleep > 0));
    // El montón no puede vaciarse solo. El solver no llega nunca al reposo
    // absoluto —el montón tiembla a ~1 u/s indefinidamente— así que el criterio
    // es estadístico: esperar sin jugar no puede valer una tirada.
    let idle = 0;
    for (let g = 0; g < 4; g++) {
      const w = S.createSim();
      S.reset(w, seedFor(shape, g + 3));
      for (let i = 0; i < 600; i++) S.step(w);
      S.beginGame(w);
      for (let i = 0; i < 1800; i++) S.step(w);
      idle += w.score;
    }
    check(`forma ${shape}: esperar sin jugar casi no entrega premios`, idle <= 500,
      `${idle} pts en 4 partidas`);
  }
  const s = S.createSim();
  let repeated = 0, last = -1;
  for (let i = 0; i < 20; i++) { S.reset(s, 7000 + i * 97); if (s.shape === last) repeated++; last = s.shape; }
  check("20 reinicios no repiten forma", repeated === 0);
}

console.log("\n— geometría de las formas —");
{
  for (let shape = 0; shape < S.SHAPE_COUNT; shape++) {
    const d = S.SHAPES[shape];
    let bad = 0, raised = 0, maxSlope = 0, maxH = 0;
    for (let x = S.X0 - .6; x <= S.X1 + .6; x += .1) {
      for (let z = S.Z0 - .6; z <= S.Z1 + .6; z += .1) {
        const q = S.surface(shape, x, z);
        const unit = Math.abs(Math.hypot(q.nx, q.ny, q.nz) - 1) < 1e-9;
        if (!Number.isFinite(q.y) || q.y < S.FLOOR - 1e-9 || !unit || q.ny <= 0) bad++;
        maxH = Math.max(maxH, q.y - S.FLOOR);
        maxSlope = Math.max(maxSlope, Math.hypot(q.nx, q.nz) / q.ny);
        if (Math.hypot(x - d[0], z - d[1]) < S.MOUTH_R + .55 && q.y !== S.FLOOR) raised++;
      }
    }
    let ordered = !!d[2] || d[8] === d[10];
    for (let i = 7; i < d.length - 2; i += 2) if (d[i + 2] <= d[i]) ordered = false;
    check(`forma ${shape}: perfil ascendente y primer tramo plano`, ordered);
    check(`forma ${shape}: superficie sana`, !bad,
      `${bad} muestras · alto ${maxH.toFixed(2)} · pendiente ${maxSlope.toFixed(2)}`);
    check(`forma ${shape}: la boca cae sobre suelo plano`, !raised, `${raised} muestras elevadas`);
    // La boca tiene que estar dentro de la bandeja y lejos del centro: al
    // relanzar un premio colado durante el asentado se le refleja por el origen.
    check(`forma ${shape}: boca dentro de la bandeja y descentrada`,
      Math.abs(d[0]) <= S.X1 - .2 && Math.abs(d[1]) <= S.Z1 - .4 && Math.hypot(d[0], d[1]) > 2 * S.MOUTH_R,
      `${d[0]}, ${d[1]}`);
  }
}

console.log("\n— conducto físico —");
{
  const isolated = rarity => {
    const s = S.createSim(); S.reset(s, 2468);
    for (const p of s.toys) p.state = 2;
    const p = s.toys[0];
    p.state = 0; p.rarity = rarity; p.x = p.ox = s.mx; p.z = p.oz = s.mz;
    p.y = S.FLOOR + .35; p.oy = p.y + .03; p.sleep = 0;
    s.phase = S.P_AIM; s.score = 0; s.events.length = 0;
    return { s, p };
  };

  const pushed = isolated(2);
  S.step(pushed.s);
  check("un premio libre que entra en la boca empieza a caer", pushed.p.state === 3);
  let guard = 0;
  while (pushed.p.state !== 2 && guard++ < 500) S.step(pushed.s);
  check("la caída emergente puntúa una sola vez", pushed.p.state === 2 && pushed.s.score === S.POINTS[2]);
  for (let i = 0; i < 30; i++) S.step(pushed.s);
  check("un premio ganado no vuelve a puntuar", pushed.s.score === S.POINTS[2]);

  const lip = isolated(0);
  lip.p.x = lip.p.ox = lip.s.mx + S.MOUTH_R + .02;
  lip.p.y = lip.p.oy = S.FLOOR + S.FEET;
  S.step(lip.s);
  check("tocar el borde sin entrar no puntúa", lip.p.state === 0 && lip.s.score === 0);

  const blocked = isolated(1), obstacle = blocked.s.toys[1];
  blocked.p.x = blocked.p.ox = blocked.s.mx + .35;
  blocked.p.y = blocked.p.oy = S.FLOOR + S.FEET + 1;
  blocked.p.yaw = blocked.p.oyaw = 0;
  obstacle.state = 0; obstacle.x = obstacle.ox = blocked.p.x - .75;
  obstacle.y = obstacle.oy = blocked.p.y; obstacle.z = obstacle.oz = blocked.p.z;
  obstacle.yaw = obstacle.oyaw = 0; obstacle.sleep = 0;
  const oldObstacleX = obstacle.x;
  S.step(blocked.s);
  check("un premio soltado conserva colisiones sobre la boca",
    blocked.p.state === 0 && obstacle.x !== oldObstacleX);

  const multi = isolated(1);
  const second = multi.s.toys[1];
  multi.p.state = second.state = 3;
  multi.p.y = second.y = S.FLOOR - .1;
  multi.p.oy = second.oy = S.FLOOR;
  second.rarity = 2;
  multi.s.events.length = 0;
  S.step(multi.s);
  const wins = multi.s.events.filter(e => e >= S.EV_WIN).sort((a, b) => a - b);
  check("dos caídas simultáneas suman ambos premios",
    multi.s.score === S.POINTS[1] + S.POINTS[2] && wins.join() === [S.EV_WIN + 1, S.EV_WIN + 2].join());
}

console.log("\n— entrada analógica —");
{
  const velocity = (x, z) => {
    const s = S.createSim(); s.phase = S.P_AIM; s.inX = x; s.inZ = z; S.step(s);
    return [s.vx, s.vz];
  };
  const axis = velocity(1, 0), diagonal = velocity(1, 1), analog = velocity(.3, .4), over = velocity(3, 4), zero = velocity(0, 0);
  const unit = Math.hypot(...axis);
  check("diagonal digital conserva magnitud unitaria", Math.abs(Math.hypot(...diagonal) - unit) < 1e-12);
  check("(.3,.4) conserva su magnitud .5", Math.abs(Math.hypot(...analog) - unit * .5) < 1e-12);
  check("vector mayor que uno se limita a uno", Math.abs(Math.hypot(...over) - unit) < 1e-12);
  check("entrada cero permanece cero", zero[0] === 0 && zero[1] === 0);
}

console.log("\n— consumo de intentos —");
{
  const s = S.createSim(); S.reset(s, 1357); S.beginGame(s);
  check("el intento se descuenta al iniciar la bajada", S.beginDrop(s) && s.tries === 4);
  check("otro input durante la jugada no consume otro intento", !S.beginDrop(s) && s.tries === 4);
  let guard = 0;
  while (s.phase !== S.P_AIM && s.phase !== S.P_RESULT && guard++ < 4000) S.step(s);
  check("terminar la animación no vuelve a descontarlo", s.tries === 4);
}

console.log("\n— cierre con contacto y encaje pasivo —");
{
  const s = S.createSim(); S.reset(s, 22);
  for (const q of s.toys) q.state = 2;
  const p = s.toys[0];
  p.state = 0; p.rarity = 1; p.x = p.ox = .45; p.z = p.oz = 0;
  p.y = p.oy = S.FLOOR + S.FEET; p.yaw = p.oyaw = 0; p.sleep = 0;
  // Arranca directamente la fase mecánica: no hay candidato oficial, de modo
  // que cualquier movimiento posterior sólo puede venir del encaje entre patas.
  s.phase = S.P_CLOSE; s.time = 0; s.clawX = s.clawZ = 0;
  s.clawY = s.dropY = p.y + 1.3; s.close = 0; s.held = -1;
  s.vx = 0;
  const startY = p.y;
  let guard = 0;
  while (s.phase !== S.P_PAUSE && guard++ < 300) S.step(s);
  check("la garra se detiene antes de atravesar el premio",
    s.phase === S.P_PAUSE && s.close < .9, s.close.toFixed(2));

  let maxY = p.y;
  while (s.phase !== S.P_CARRY && guard++ < 800) { S.step(s); maxY = Math.max(maxY, p.y); }
  check("un premio no agarrado puede subir encajado entre las patas",
    s.held < 0 && p.state === 0 && maxY > startY + 1, `${(maxY - startY).toFixed(2)} u`);
}

console.log("\n— paredes laterales —");
{
  const cases = [
    ["derecha", 0, S.X1 - .6, 0, .05, 0],
    ["izquierda", 180, S.X0 + .6, 0, -.05, 0],
    ["frontal", -90, 0, S.Z1 - .6, 0, .05],
    ["trasera", 90, 0, S.Z0 + .6, 0, -.05]
  ];
  for (const [name, yaw, x, z, vx, vz] of cases) {
    const s = S.createSim(); S.reset(s, 8642);
    for (const q of s.toys) q.state = 2;
    const p = s.toys[0];
    p.state = 0; p.yaw = p.oyaw = yaw; p.x = x; p.ox = x - vx; p.z = z; p.oz = z - vz;
    p.y = p.oy = S.FLOOR + S.FEET + .5; p.sleep = 0; s.phase = S.P_AIM;
    S.step(s);
    const a = yaw * Math.PI / 180, hx = Math.cos(a) * .62, hz = -Math.sin(a) * .62;
    const inside = p.x - .55 >= S.X0 - 1e-9 && p.x + .55 <= S.X1 + 1e-9 &&
      p.z - .55 >= S.Z0 - 1e-9 && p.z + .55 <= S.Z1 + 1e-9 &&
      p.x + hx - .37 >= S.X0 - 1e-9 && p.x + hx + .37 <= S.X1 + 1e-9 &&
      p.z + hz - .37 >= S.Z0 - 1e-9 && p.z + hz + .37 <= S.Z1 + 1e-9;
    const bounced = vx ? Math.sign(p.x - p.ox) === -Math.sign(vx) : Math.sign(p.z - p.oz) === -Math.sign(vz);
    check(`${name}: cuerpo y cabeza rebotan dentro`, inside && bounced);
  }
  const s = S.createSim(); S.reset(s, 9753);
  for (const q of s.toys) q.state = 2;
  const p = s.toys[0];
  p.state = 0; p.x = p.ox = p.z = p.oz = 0;
  p.y = S.CEILING - .4; p.oy = p.y - .08; p.sleep = 0; s.phase = S.P_AIM;
  S.step(s);
  check("techo: cuerpo y cabeza rebotan hacia abajo",
    p.y + .5 + .37 <= S.CEILING + 1e-9 && p.y - p.oy < 0);
}

console.log("\n— independencia del refresco (el bug original) —");
{
  const rates = [30, 50, 60, 75, 90, 120, 144, 165, 240];
  const seeds = [101, 202, 303, 404, 505];
  // Vector de puntuaciones por semilla: comparar un solo número podría "aprobar"
  // por coincidencia si todas las partidas acabaran a cero.
  const vector = fps => seeds.map(sd => play(sd, greedy, fps).s.score);
  const ref = vector(60);
  let allSame = true;
  const detail = [];
  for (const fps of rates) {
    const v = vector(fps);
    if (v.join() !== ref.join()) allSame = false;
    detail.push(`${fps}Hz:${v.reduce((a, b) => a + b, 0)}`);
  }
  const total = ref.reduce((a, b) => a + b, 0);
  check("misma puntuación a 30…240 Hz", allSame, detail.join(" "));
  check("la comparación no es trivial (se puntúa algo)", total > 0, `${total} pts en ${seeds.length} semillas`);
}

console.log("\n— determinismo —");
{
  const a = play(4242, greedy), b = play(4242, greedy);
  check("misma semilla ⇒ misma puntuación", a.s.score === b.s.score, `${a.s.score} vs ${b.s.score}`);
  const posSame = a.s.toys.every((p, i) => Math.abs(p.x - b.s.toys[i].x) < 1e-12 && Math.abs(p.y - b.s.toys[i].y) < 1e-12);
  check("misma semilla ⇒ mismas posiciones finales", posSame);
  const c = play(9999, greedy);
  check("semillas distintas ⇒ partidas distintas", c.s.score !== a.s.score || c.s.toys[0].x !== a.s.toys[0].x);
}

console.log("\n— integridad tras 40 partidas (jugador sensato, puntería imperfecta) —");
{
  let bad = 0, lost = 0, nan = 0, out = 0, unfinished = 0, scoreless = 0;
  const rarities = { 0: 0, 1: 0, 2: 0, 3: 0 };
  const byShape = Array.from({ length: S.SHAPE_COUNT }, () => ({ games: 0, wins: 0, score: 0, zeros: 0 }));
  let totalWins = 0, totalGrabs = 0, totalEmpty = 0, totalSlips = 0, totalScore = 0;
  const sensible = strategy(pickSafe, makeJitter(987654321, .44));
  for (let i = 0; i < 40; i++) {
    const r = play(1000 + i * 37, sensible);
    if (!r.finished) unfinished++;
    if (r.s.toys.length !== 13) bad++;
    const won = r.s.toys.filter(p => p.state === 2).length;
    const pile = r.s.toys.filter(p => p.state === 0).length;
    if (won + pile !== 13) lost++;
    for (const p of r.s.toys) {
      if (!Number.isFinite(p.x + p.y + p.z + p.yaw + p.roll)) nan++;
      if (p.state !== 2 && (Math.abs(p.x) > S.X1 + 1.5 || Math.abs(p.z) > S.Z1 + .95 || p.y < S.FLOOR - .5)) out++;
    }
    if (r.s.score === 0) scoreless++;
    const form = byShape[r.s.shape]; form.games++; form.wins += r.log.wins; form.score += r.s.score; form.zeros += +(r.s.score === 0);
    totalWins += r.log.wins; totalGrabs += r.log.grabs; totalEmpty += r.log.empty;
    totalSlips += r.log.slips; totalScore += r.s.score;
    for (const k in r.log.byRarity) rarities[k] += r.log.byRarity[k];
  }
  check("todas las partidas terminan", unfinished === 0, `${unfinished} colgadas`);
  check("siempre 13 premios", bad === 0);
  check("premios ganados + montón = 13", lost === 0, `${lost} partidas pierden premios`);
  check("sin NaN", nan === 0);
  check("nadie sale de la cuba", out === 0, `${out} fuera`);
  // Un jugador sensato puede irse en blanco por mala suerte; que sea habitual, no.
  check("un jugador sensato rara vez se va en blanco", scoreless <= 4, `${scoreless}/40 sin puntuar`);
  console.log(`       agarres ${totalGrabs} · vacíos ${totalEmpty} · resbalones ${totalSlips} · entregados ${totalWins}`);
  console.log(`       media por partida: ${(totalScore / 40).toFixed(0)} pts, ${(totalWins / 40).toFixed(2)} premios`);
  console.log(`       por premio — star ${rarities[0]} rainbow ${rarities[1]} unicorn ${rarities[2]} king ${rarities[3]}`);
  console.log("       por forma — " + byShape.map((v, i) => `${i}: ${v.games ? (v.score / v.games).toFixed(0) : "-"} pts`).join(" · "));
}

console.log("\n— balance por forma (muestra igualada) —");
{
  const sensible = strategy(pickSafe, makeJitter(987654321, .44));
  const N = 24, rows = [];
  for (let shape = 0; shape < S.SHAPE_COUNT; shape++) {
    let total = 0, wins = 0, grabs = 0, zeros = 0, lost = 0;
    for (let i = 0; i < N; i++) {
      const r = play(seedFor(shape, i + 40), sensible);
      total += r.s.score; wins += r.log.wins; grabs += r.log.grabs;
      if (!r.s.score) zeros++;
      const won = r.s.toys.filter(p => p.state === 2).length;
      const pile = r.s.toys.filter(p => p.state === 0).length;
      if (won + pile !== 13 || r.s.shape !== shape) lost++;
    }
    rows.push({ avg: total / N, wins: wins / N, grabs: grabs / N, zeros, lost });
  }
  rows.forEach((r, i) => console.log(
    `       forma ${i}: ${r.avg.toFixed(0)} pts · ${r.wins.toFixed(2)} entregados · ${r.grabs.toFixed(2)} agarres · ${r.zeros}/${N} a cero`));
  const avgs = rows.map(r => Math.max(1, r.avg));
  const spread = Math.max(...avgs) / Math.min(...avgs);
  check("dispersión entre formas < 2,5×", spread < 2.5, `${spread.toFixed(2)}×`);
  check("ninguna forma se va a cero a menudo", rows.every(r => r.zeros <= 5), rows.map(r => r.zeros).join("/"));
  check("ninguna forma pierde premios", rows.every(r => !r.lost), rows.map(r => r.lost).join("/"));
}

console.log("\n— ¿hay decisión? codicioso contra conservador —");
{
  const greedyNoisy = strategy(pickGreedy, makeJitter(24680, .40));
  const safe = strategy(pickSafe, makeJitter(13579, .40));

  const runMany = strat => {
    let total = 0, zeros = 0, big = 0, prizes = 0;
    for (let i = 0; i < 60; i++) {
      const r = play(3000 + i * 53, strat);
      total += r.s.score; prizes += r.log.wins;
      if (r.s.score === 0) zeros++;
      if (r.s.score >= 5000) big++;
    }
    return { avg: total / 60, zeros, big, prizes: prizes / 60 };
  };
  const g = runMany(greedyNoisy), sf = runMany(safe);
  console.log(`       codicioso   media ${g.avg.toFixed(0)} pts · ${g.prizes.toFixed(2)} premios · ${g.zeros}/60 a cero · ${g.big}/60 con jackpot`);
  console.log(`       conservador media ${sf.avg.toFixed(0)} pts · ${sf.prizes.toFixed(2)} premios · ${sf.zeros}/60 a cero · ${sf.big}/60 con jackpot`);
  // Las dos deben ser jugables. La boca abierta premia además los empujones del
  // codicioso, así que el margen permitido es mayor que con el conducto protegido.
  const ratio = Math.max(g.avg, sf.avg) / Math.max(1, Math.min(g.avg, sf.avg));
  check("ambas estrategias conservan valor (menos de 3,5×)", ratio < 3.5, `${ratio.toFixed(2)}×`);
  check("el conservador rara vez se va a cero", sf.zeros <= 12, `${sf.zeros}/60`);
  check("el codicioso no es más seguro", g.zeros >= sf.zeros, `${g.zeros} vs ${sf.zeros} de 60`);
}

console.log("\n— dificultad por rareza —");
{
  // Agarre centrado y perfecto sobre un único premio de cada rareza.
  const rates = [];
  for (let rarity = 0; rarity < 4; rarity++) {
    let ok = 0, tries = 60;
    for (let i = 0; i < tries; i++) {
      const s = S.createSim();
      S.reset(s, 500 + i);
      const p = s.toys.find(t => t.rarity === rarity) || s.toys[0];
      p.rarity = rarity;
      S.beginGame(s);
      s.clawX = p.x; s.clawZ = p.z; s.vx = s.vz = 0;
      S.beginDrop(s);
      let guard = 0;
      while (s.phase !== S.P_AIM && s.phase !== S.P_RESULT && guard++ < 4000) S.step(s);
      if (p.state === 2) ok++;
      s.events.length = 0;
    }
    rates.push((ok / tries * 100).toFixed(0));
  }
  console.log(`       entrega con apuntado perfecto — star ${rates[0]}% rainbow ${rates[1]}% unicorn ${rates[2]}% king ${rates[3]}%`);
  check("la dificultad crece con la rareza", +rates[0] >= +rates[3], `${rates[0]}% vs ${rates[3]}%`);
  check("el unicorn king es alcanzable", +rates[3] > 5, `${rates[3]}%`);
  check("la star es fiable", +rates[0] > 55, `${rates[0]}%`);
}

console.log("\n— tolerancia de puntería por rareza —");
{
  // Lo que el jugador nota como "probabilidad de agarre" no es el tiro perfecto,
  // que casi siempre entra, sino cuánto perdona la puntería real. Se mide con
  // ruido de apuntado creciente contra un premio concreto de cada rareza.
  for (const spread of [.44, 1.1]) {
    const out = [];
    for (let rarity = 0; rarity < 4; rarity++) {
      const jitter = makeJitter(987654321, spread);
      let tries = 0, grabbed = 0;
      for (let i = 0; i < 120; i++) {
        const s = S.createSim();
        S.reset(s, 500 + i * 13);
        S.beginGame(s);
        const idx = s.toys.findIndex(t => t.rarity === rarity);
        if (idx < 0) continue;
        const p = s.toys[idx], t = clampAim({ x: p.x + jitter(), z: p.z + jitter() });
        s.clawX = t.x; s.clawZ = t.z; s.vx = s.vz = 0;
        S.beginDrop(s);
        tries++;
        let guard = 0, got = false;
        while (s.phase !== S.P_AIM && s.phase !== S.P_RESULT && guard++ < 4000) {
          S.step(s);
          if (s.held === idx) got = true;
        }
        if (got) grabbed++;
        s.events.length = 0;
      }
      out.push({ rarity, pct: grabbed / tries * 100 });
    }
    console.log(`       ruido ±${(spread / 2).toFixed(2)} — ` +
      out.map(o => `r${o.rarity} ${o.pct.toFixed(0)}%`).join(" · "));
    if (spread === .44) {
      // El King era inalcanzable en la práctica: 5 % con puntería humana. Tras
      // duplicar la tolerancia el suelo es del 10 %, y sigue siendo el más duro.
      check("el king se agarra con puntería humana", out[3].pct >= 10, `${out[3].pct.toFixed(0)}%`);
      check("el king sigue siendo el más difícil", out.every(o => o.rarity === 3 || o.pct > out[3].pct));
    }
  }
}

console.log("\n— enganche (doblete) —");
{
  const sensible = strategy(pickSafe, makeJitter(987654321, .44));
  let grabs = 0, hooks = 0, maxHeld = 0, leaked = 0;
  for (let i = 0; i < 60; i++) {
    const r = play(1000 + i * 37, sensible);
    grabs += r.log.grabs; hooks += r.log.hooks;
    maxHeld = Math.max(maxHeld, r.log.maxHeld);
    // Nadie puede quedarse pegado a la garra al acabar la partida.
    if (r.s.toys.some(p => p.state === 1) || r.s.held >= 0 || r.s.hook >= 0) leaked++;
  }
  const pct = hooks / grabs * 100;
  console.log(`       ${hooks} enganches en ${grabs} agarres (${pct.toFixed(1)} %)`);
  check("el enganche ocurre, pero es raro", pct > 3 && pct < 25, `${pct.toFixed(1)} %`);
  check("nunca viajan más de dos peluches en la garra", maxHeld <= 2, `máximo ${maxHeld}`);
  check("no queda nadie colgado al acabar", leaked === 0, `${leaked}/60 partidas`);

  // Un enganche forzado tiene que cobrarse DOBLE: los dos premios entran por la
  // boca en la misma jugada. Se monta la situación a mano para no depender del dado.
  // Se comprueban los dos peluches por índice, no la puntuación: el agarrado no
  // tiene por qué ser aquel al que se apuntó, así que sumar puntos esperados
  // mediría otra cosa.
  let doubles = 0, both = 0, primaries = 0;
  for (let i = 0; i < 40; i++) {
    const s = S.createSim();
    S.reset(s, 700 + i * 11);
    S.beginGame(s);
    const idx = s.toys.findIndex(t => t.rarity === 0);
    const p = s.toys[idx];
    s.clawX = p.x; s.clawZ = p.z; s.vx = s.vz = 0;
    S.beginDrop(s);
    let guard = 0, forced = -1, primary = -1;
    while (s.phase !== S.P_AIM && s.phase !== S.P_RESULT && guard++ < 4000) {
      S.step(s);
      // En cuanto hay agarrado, se engancha a mano el vecino más próximo.
      if (s.held >= 0 && s.hook < 0 && forced < 0) {
        const h = s.toys[s.held];
        let mate = -1, md = 1.5;
        for (let j = 0; j < s.toys.length; j++) {
          const q = s.toys[j];
          if (j === s.held || q.state) continue;
          const d = Math.hypot(q.x - h.x, (q.y - h.y) * .6, q.z - h.z);
          if (d < md) { md = d; mate = j; }
        }
        if (mate >= 0) { s.toys[mate].state = 1; s.hook = mate; forced = mate; primary = s.held; }
      }
    }
    if (forced < 0) continue;
    both++;
    if (s.toys[primary].state === 2) primaries++;
    if (s.toys[primary].state === 2 && s.toys[forced].state === 2) doubles++;
  }
  const rate = doubles / both * 100;
  console.log(`       de ${both} enganches forzados: el agarrado entra ${primaries}, los dos ${doubles} (${rate.toFixed(0)} %)`);
  check("el enganche paga doble la mayoría de las veces", rate > 55, `${rate.toFixed(0)} %`);
}

console.log(`\n${failures ? `${failures} comprobaciones fallan` : "todo correcto"}\n`);
process.exit(failures ? 1 : 0);
