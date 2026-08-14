import { createScene } from "./render/scene";
import {
  H, createSim, reset, step, beginDrop, beginGame,
  POINTS, MOUTH_X, MOUTH_Z, FLOOR,
  surface,
  P_TITLE, P_AIM, P_RESULT,
  EV_LOWER, EV_CLOSE, EV_GRAB, EV_EMPTY, EV_SLIP, EV_WIN, EV_OVER
} from "./game/sim";

const $ = <T extends Element>(sel: string) => document.querySelector<T>(sel)!;
const canvas = $<HTMLCanvasElement>("#game");
const scoreEl = $("#score"), triesEl = $("#tries");
const message = $<HTMLElement>("#message"), sub = $<HTMLElement>("#sub");
const overlay = $<HTMLElement>(".overlay"), toast = $<HTMLElement>("#toast");
const muteEl = $<HTMLElement>("#mute");
const grabEl = $<HTMLButtonElement>("#grab");
const stick = $<HTMLElement>("#stick");

const keys: Record<string, boolean> = {};
const sim = createSim();
let scene: ReturnType<typeof createScene>;
let acc = 0, last = performance.now(), muted = false;
let pointerX = 0, pointerY = 0, camYaw = 0, camPitch = 14;
let touchX = 0, touchZ = 0, stickPointer = -1, cameraPointer = -1;
let sparkT = -1, sparkX = 0, sparkY = 0, sparkZ = 0, toastT = 0;
let audio: AudioContext | undefined;
let shownScore = -1, shownTries = -1;

const clamp = (v: number, a: number, b: number) => v < a ? a : v > b ? b : v;

function moveStick(x: number, z: number) {
  const d = Math.max(1, Math.hypot(x, z)); x /= d; z /= d;
  stick.style.setProperty("--jx", `${x * 12}px`);
  stick.style.setProperty("--jy", `${z * 7}px`);
  stick.style.setProperty("--sx", `${x * 4}px`);
  stick.style.setProperty("--sy", `${z * 2}px`);
  stick.style.setProperty("--jr", `${x * 9}deg`);
}

function resize() {
  const d = Math.min(devicePixelRatio, 2);
  canvas.width = innerWidth * d;
  canvas.height = innerHeight * d;
  scene?.resize(camYaw, camPitch);
}

function hud() {
  if (sim.score !== shownScore) { scoreEl.textContent = sim.score.toLocaleString("es-ES"); shownScore = sim.score; }
  if (sim.tries !== shownTries) {
    triesEl.textContent = `${sim.tries} / 5`;
    grabEl.textContent = `${sim.tries}`;
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
  releaseStick(); releaseCamera();
  reset(sim, (Math.random() * 0xffffffff) >>> 0);
  if (!scene) {
    scene = createScene(canvas, sim.toys, sim.shape);
    scene.resize(camYaw, camPitch);
  } else scene.setShape(sim.shape);
  scene.hideSparks();
  sparkT = -1; toastT = 0; acc = 0; last = performance.now();
  toast.classList.remove("show");
  hud();
  message.textContent = "UNICORN CLAW";
  sub.textContent = "FIVE TRIES  •  AIM FOR THE CROWN";
  overlay.classList.remove("hidden");
}

function showToast(text: string, seconds = .8) {
  toast.textContent = text;
  toastT = seconds;
  toast.classList.add("show");
}

function fire() {
  if (sim.phase === P_RESULT) { newGame(); return; }
  if (sim.phase === P_TITLE) { beginGame(sim); overlay.classList.add("hidden"); tone(420); return; }
  if (beginDrop(sim)) hud();
}

function toggleMute() {
  muted = !muted;
  muteEl.textContent = muted ? "×" : "♪";
}

function handleEvents() {
  for (const e of sim.events) {
    if (e === EV_LOWER) { toastT = 0; toast.classList.remove("show"); tone(170, .25, "sawtooth"); }
    else if (e === EV_CLOSE) tone(95, .16, "square");
    else if (e === EV_GRAB) tone(330, .1, "triangle", .06);
    else if (e === EV_SLIP) { tone(140, .3, "sawtooth"); showToast("SLIPPED!"); }
    else if (e >= EV_WIN) {
      const r = e - EV_WIN;
      showToast(`+${POINTS[r]}`, .9);
      sparkT = 0; sparkX = MOUTH_X; sparkY = FLOOR + .5; sparkZ = MOUTH_Z;
      tone(r > 2 ? 880 : 620, .4, "triangle");
    }
    else if (e === EV_EMPTY && sim.phase !== P_RESULT && !sim.won) {
      if (sim.phase === P_AIM) showToast("MISSED!");
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

  const keyX = +!!(keys.ArrowRight || keys.KeyD) - +!!(keys.ArrowLeft || keys.KeyA);
  const keyZ = +!!(keys.ArrowDown || keys.KeyS) - +!!(keys.ArrowUp || keys.KeyW);
  sim.inX = keyX || touchX;
  sim.inZ = keyZ || touchZ;
  moveStick(sim.phase === P_AIM ? sim.inX : 0, sim.phase === P_AIM ? sim.inZ : 0);

  // Acumulador de paso fijo: el mundo avanza en pasos de H sea cual sea el
  // refresco del monitor. El tope evita la espiral de la muerte tras un parón.
  acc = Math.min(acc + dt, .2);
  while (acc >= H) { step(sim); acc -= H; }
  handleEvents();
  if (toastT > 0 && (toastT -= dt) <= 0) toast.classList.remove("show");

  // El render ocurre UNA vez por frame, nunca dentro del bucle de física.
  for (let i = 0; i < sim.toys.length; i++) {
    const p = sim.toys[i]!;
    if (p.state === 2) scene.hidePrize(i); else scene.movePrize(i, p);
  }
  scene.moveClaw(sim.clawX, sim.clawY, sim.clawZ, sim.close);
  scene.moveReticle(sim.clawX, surface(sim.shape, sim.clawX, sim.clawZ).y, sim.clawZ, sim.phase === P_AIM);

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
  if ((e.code === "Space" || e.code === "Enter") && !e.repeat) { e.preventDefault(); fire(); }
  if (e.code === "KeyR" && sim.phase === P_RESULT && !e.repeat) newGame();
  if (e.code === "KeyM" && !e.repeat) toggleMute();
});
addEventListener("keyup", e => { keys[e.code] = false; });

function updateStick(e: PointerEvent) {
  const r = stick.getBoundingClientRect(), radius = r.width * .36;
  let x = e.clientX - r.left - r.width / 2, z = e.clientY - r.top - r.height / 2;
  const d = Math.hypot(x, z), k = d > radius ? radius / d : 1;
  x *= k; z *= k;
  const power = Math.max(0, Math.min(1, d / radius) - .12) / .88;
  touchX = d ? x / Math.min(d, radius) * power : 0;
  touchZ = d ? z / Math.min(d, radius) * power : 0;
}

function releaseStick(id?: number) {
  if (id !== undefined && id !== stickPointer) return;
  const old = stickPointer; stickPointer = -1; touchX = touchZ = 0;
  if (old >= 0 && stick.hasPointerCapture(old)) stick.releasePointerCapture(old);
}

stick.addEventListener("pointerdown", e => {
  if (stickPointer >= 0) return;
  stickPointer = e.pointerId; stick.setPointerCapture(e.pointerId); updateStick(e);
  e.preventDefault(); e.stopPropagation();
});
stick.addEventListener("pointermove", e => { if (e.pointerId === stickPointer) updateStick(e); });
stick.addEventListener("pointerup", e => releaseStick(e.pointerId));
stick.addEventListener("pointercancel", e => releaseStick(e.pointerId));
stick.addEventListener("lostpointercapture", e => releaseStick(e.pointerId));

const press = (e: PointerEvent, action: () => void) => {
  e.preventDefault(); e.stopPropagation(); action();
};
grabEl.addEventListener("pointerdown", e => press(e, fire));
muteEl.addEventListener("pointerdown", e => press(e, toggleMute));

function releaseCamera(id?: number) {
  if (id !== undefined && id !== cameraPointer) return;
  const old = cameraPointer; cameraPointer = -1;
  if (old >= 0 && canvas.hasPointerCapture(old)) canvas.releasePointerCapture(old);
}

canvas.addEventListener("pointerdown", e => {
  if (cameraPointer >= 0) return;
  cameraPointer = e.pointerId; pointerX = e.clientX; pointerY = e.clientY;
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener("pointermove", e => {
  if (e.pointerId !== cameraPointer) return;
  camYaw = clamp(camYaw + (e.clientX - pointerX) * .16, -55, 55);
  camPitch = clamp(camPitch + (e.clientY - pointerY) * .12, 4, 34);
  pointerX = e.clientX; pointerY = e.clientY;
  scene.moveCamera(camYaw, camPitch);
});
canvas.addEventListener("pointerup", e => releaseCamera(e.pointerId));
canvas.addEventListener("pointercancel", e => releaseCamera(e.pointerId));
canvas.addEventListener("lostpointercapture", e => releaseCamera(e.pointerId));

function clearInput() {
  for (const k in keys) delete keys[k];
  sim.inX = sim.inZ = 0; releaseStick(); releaseCamera();
}
addEventListener("blur", clearInput);
document.addEventListener("visibilitychange", () => { if (document.hidden) clearInput(); });
addEventListener("resize", resize);

const d = Math.min(devicePixelRatio, 2);
canvas.width = innerWidth * d;
canvas.height = innerHeight * d;
newGame();
requestAnimationFrame(frame);
