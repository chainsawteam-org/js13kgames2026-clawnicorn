import { createScene } from "./render/scene";
import {
  H, createSim, reset, step, beginDrop, beginGame,
  POINTS, MOUTH_X, MOUTH_Z, FLOOR,
  P_TITLE, P_AIM, P_RESULT,
  EV_LOWER, EV_CLOSE, EV_GRAB, EV_EMPTY, EV_SLIP, EV_WIN, EV_OVER
} from "./game/sim";

const $ = <T extends Element>(sel: string) => document.querySelector<T>(sel)!;
const canvas = $<HTMLCanvasElement>("#game");
const scoreEl = $("#score"), triesEl = $("#tries");
const message = $<HTMLElement>("#message"), sub = $<HTMLElement>("#sub");
const overlay = $<HTMLElement>(".overlay"), toast = $<HTMLElement>("#toast");
const muteEl = $<HTMLElement>("#mute");

const keys: Record<string, boolean> = {};
const sim = createSim();
let scene: ReturnType<typeof createScene>;
let acc = 0, last = performance.now(), muted = false;
let drag = false, pointerX = 0, pointerY = 0, camYaw = 25, camPitch = 14;
let sparkT = -1, sparkX = 0, sparkY = 0, sparkZ = 0;
let audio: AudioContext | undefined;
let shownScore = -1, shownTries = -1;

const clamp = (v: number, a: number, b: number) => v < a ? a : v > b ? b : v;

function resize() {
  const d = Math.min(devicePixelRatio, 2);
  canvas.width = innerWidth * d;
  canvas.height = innerHeight * d;
  scene?.resize(camYaw, camPitch);
}

function hud() {
  if (sim.score !== shownScore) { scoreEl.textContent = `SCORE ${sim.score}`; shownScore = sim.score; }
  if (sim.tries !== shownTries) {
    triesEl.innerHTML = `TRIES ${Array.from({ length: 5 }, (_, i) => `<i class="${i < sim.tries ? "on" : ""}"></i>`).join("")}`;
    shownTries = sim.tries;
  }
}

function tone(f: number, d = .12, type: OscillatorType = "sine", vol = .09) {
  if (muted) return;
  audio ||= new AudioContext();
  const o = audio.createOscillator(), g = audio.createGain(), t = audio.currentTime;
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  o.frequency.exponentialRampToValueAtTime(f * 1.35, t + d);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(.001, t + d);
  o.connect(g).connect(audio.destination);
  o.start(t); o.stop(t + d);
}

function newGame() {
  reset(sim, (Math.random() * 0xffffffff) >>> 0);
  sim.toys.forEach((p, i) => scene.movePrize(i, p));
  scene.hideSparks();
  sparkT = -1;
  toast.classList.remove("show");
  hud();
  message.textContent = "UNICORN CLAW";
  sub.textContent = "WASD / ARROWS: AIM  •  DRAG: LOOK  •  SPACE: START";
  overlay.classList.remove("hidden");
}

function fire() {
  if (sim.phase === P_RESULT) { newGame(); return; }
  if (sim.phase === P_TITLE) { beginGame(sim); overlay.classList.add("hidden"); tone(420); return; }
  beginDrop(sim);
}

function handleEvents() {
  for (const e of sim.events) {
    if (e === EV_LOWER) { toast.classList.remove("show"); tone(170, .25, "sawtooth"); }
    else if (e === EV_CLOSE) tone(95, .16, "square");
    else if (e === EV_GRAB) tone(330, .1, "triangle", .06);
    else if (e === EV_SLIP) { tone(140, .3, "sawtooth"); toast.textContent = "SLIPPED!"; toast.classList.add("show"); }
    else if (e === EV_WIN) {
      const r = sim.lastWin;
      toast.textContent = `+${POINTS[r]}`;
      toast.classList.add("show");
      sparkT = 0; sparkX = MOUTH_X; sparkY = FLOOR + .5; sparkZ = MOUTH_Z;
      tone(r > 2 ? 880 : 620, .4, "triangle");
    }
    else if (e === EV_EMPTY && sim.phase !== P_RESULT && !sim.won) {
      if (sim.phase === P_AIM) { toast.textContent = "MISSED!"; toast.classList.add("show"); }
    }
    else if (e === EV_OVER) {
      message.textContent = sim.score >= 5000 ? "JACKPOT!" : sim.score >= 1000 ? "GREAT HAUL!" : "GAME OVER";
      sub.textContent = `${sim.score} POINTS  •  SPACE / R TO PLAY AGAIN`;
      overlay.classList.remove("hidden");
      tone(sim.score >= 1000 ? 660 : 180, .5, "triangle");
    }
  }
  sim.events.length = 0;
}

function frame(now: number) {
  const dt = Math.min(.05, (now - last) / 1000);
  last = now;

  sim.inX = +!!(keys.ArrowRight || keys.KeyD) - +!!(keys.ArrowLeft || keys.KeyA);
  sim.inZ = +!!(keys.ArrowDown || keys.KeyS) - +!!(keys.ArrowUp || keys.KeyW);

  // Acumulador de paso fijo: el mundo avanza en pasos de H sea cual sea el
  // refresco del monitor. El tope evita la espiral de la muerte tras un parón.
  acc = Math.min(acc + dt, .2);
  while (acc >= H) { step(sim); acc -= H; }
  handleEvents();

  // El render ocurre UNA vez por frame, nunca dentro del bucle de física.
  for (let i = 0; i < sim.toys.length; i++) {
    const p = sim.toys[i]!;
    if (p.state === 2) scene.hidePrize(i); else scene.movePrize(i, p);
  }
  scene.moveClaw(sim.clawX, sim.clawY, sim.clawZ, sim.close);
  scene.moveReticle(sim.clawX, sim.clawZ, sim.phase === P_AIM);

  if (sparkT >= 0) {
    sparkT += dt * 1.5;
    if (sparkT > 1) { sparkT = -1; scene.hideSparks(); }
    else scene.celebrate(sparkX, sparkY, sparkZ, sparkT);
  }

  hud();
  requestAnimationFrame(frame);
}

addEventListener("keydown", e => {
  keys[e.code] = true;
  if (e.code === "Space" || e.code === "Enter") { e.preventDefault(); fire(); }
  if (e.code === "KeyR" && sim.phase === P_RESULT) newGame();
  if (e.code === "KeyM") { muted = !muted; muteEl.textContent = muted ? "🔇" : "♪"; }
});
addEventListener("keyup", e => { keys[e.code] = false; });

canvas.addEventListener("pointerdown", e => {
  drag = true; pointerX = e.clientX; pointerY = e.clientY;
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener("pointermove", e => {
  if (!drag) return;
  camYaw = clamp(camYaw + (e.clientX - pointerX) * .16, -55, 55);
  camPitch = clamp(camPitch + (e.clientY - pointerY) * .12, 4, 34);
  pointerX = e.clientX; pointerY = e.clientY;
  scene.moveCamera(camYaw, camPitch);
});
canvas.addEventListener("pointerup", () => { drag = false; });
canvas.addEventListener("pointercancel", () => { drag = false; });
addEventListener("resize", resize);

const d = Math.min(devicePixelRatio, 2);
canvas.width = innerWidth * d;
canvas.height = innerHeight * d;
reset(sim, (Math.random() * 0xffffffff) >>> 0);
scene = createScene(canvas, sim.toys);
scene.resize(camYaw, camPitch);
newGame();
requestAnimationFrame(frame);
