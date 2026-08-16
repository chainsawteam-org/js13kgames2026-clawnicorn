import { readFile, mkdir, rm, writeFile } from "node:fs/promises";
import { build, transform } from "esbuild";
import { minify } from "terser";
import { zipSync, strToU8 } from "fflate";
import { Packer } from "roadroller";

const LIMIT = 13 * 1024;
const OUTPUT_DIR = "build";
const useRoadroller = !process.argv.includes("--no-roadroller");

// Recreate the submission directory on every build so it cannot contain stale files.
await rm(OUTPUT_DIR, { recursive: true, force: true });
await mkdir(OUTPUT_DIR, { recursive: true });

const result = await build({
  entryPoints: ["src/main.ts"],
  bundle: true,
  write: false,
  format: "esm",
  target: "es2022",
  define: { "import.meta.env.PROD": "true" },
  minify: true,
  legalComments: "none"
});

const app = new TextDecoder().decode(result.outputFiles[0].contents);
const mangledProperties = { regex: /^(toys|phase|time|score|tries|clawX|clawY|clawZ|close|dropY|fromX|fromZ|vx|vz|held|won|firstThrow|inX|inZ|events|rarity|state|sleep|slipAt|shape|mx|mz|yaw|roll|ox|oy|oz|oyaw|nx|ny|nz|resize|setShape|moveCamera|moveClaw|moveReticle|movePrize|hidePrize|celebrate|hideSparks|models|current|next|textures|program|clearColor|projection|setState|ambientLight|lastFrame|render|animation|lerp|dist|ambient|col|add|smooth|vertices|indices|normals|verticesBuffer|indicesBuffer|normalsBuffer|uvBuffer|customNormals|mix|mode|size)$/ };
const terserOptions = [
  { compress: { passes: 3, unsafe: true }, mangle: { properties: mangledProperties } },
  {
    compress: { passes: 5, unsafe: true, booleans_as_integers: true, unsafe_arrows: true, unsafe_methods: true },
    mangle: { toplevel: true, properties: mangledProperties },
    toplevel: true
  }
];

const selectorNames = [
  "game", "hud", "top", "tries", "score", "instructions", "deck", "stick", "values", "grab",
  "message", "sub", "toast", "mute", "meter", "attempts", "star", "marquee", "spark", "rainbow",
  "combo", "joystick", "unicorn", "rainbow-prize", "star-prize", "king", "overlay", "start-card",
  "hidden", "show"
];
const selectorMap = new Map(selectorNames.map((name, i) => [name, (i < 26 ? "abcdefghijklmnopqrstuvwxyz" : "ABCDEFGHIJKLMNOPQRSTUVWXYZ")[i % 26]]));
const shrinkCss = text => {
  for (const [name, short] of selectorMap)
    text = text.replace(new RegExp(`([.#])${name}(?![\\w-])`, "g"), `$1${short}`);
  return text;
};
const shrinkCode = text => {
  for (const [name, short] of selectorMap) {
    text = text.replace(new RegExp(`(["'])#${name}\\1`, "g"), `$1#${short}$1`);
    text = text.replace(new RegExp(`(["'])\\.${name}\\1`, "g"), `$1.${short}$1`);
    if (name === "hidden" || name === "show")
      text = text.replace(new RegExp(`(["'])${name}\\1`, "g"), `$1${short}$1`);
  }
  return text;
};
const shrinkMarkup = text => {
  for (const [name, short] of selectorMap)
    text = text.replace(new RegExp(`(?<![\\w-])${name}(?![\\w-])`, "g"), short);
  return text;
};

const cleanedCss = (await readFile("src/style.css", "utf8"))
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\s+/g, " ")
  .replace(/\s*([{}:;,])\s*/g, "$1")
  .replace(/#values \.(?:pink|gold)\{[^}]*\}|#values \.rainbow-prize\{background:linear-gradient\(135deg[^}]*\}|#values \.rainbow-prize:before\{top:-10px[^}]*\}/g, "")
  .replace(/cursor:grab|button\{font:inherit;color:inherit\}|\.star\{margin-right:5px\}|\.help b\{color:#e49e53;margin:6px\}|#values span:nth-child\(4\) b\{font-size:6px\}/g, "")
  .trim();
const css = shrinkCss((await transform(cleanedCss, { loader: "css", minify: true })).code.trim());

const pack = async (code) => {
  const packer = new Packer([{ data: code, type: "js", action: "eval" }], {
    allowFreeVars: true
  });
  const candidates = [];
  for (const level of [1, 2]) {
    await packer.optimize(level);
    const { firstLine, secondLine } = packer.makeDecoder();
    candidates.push({ code: firstLine + secondLine, level });
  }
  return candidates;
};

const htmlStart = `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>UNICORN CLAW</title><style>${css}</style>` + shrinkMarkup(
  `<canvas id=game></canvas><main id=hud><header id=top><section class="meter attempts"><small>ATTEMPTS</small><strong><span class=star>★</span><span id=tries></span></strong></section><div class=marquee><span class=spark>★</span><h1>UNICORN CLAW</h1><div class=rainbow><i></i><i></i><i></i></div></div><section class="meter score"><small>SCORE</small><strong id=score></strong></section></header><aside id=instructions><b>HOW TO PLAY</b><span><kbd class=combo>WASD / ARROWS</kbd><strong>MOVE</strong></span><span><kbd class=combo>CLICK + DRAG</kbd><strong>LOOK</strong></span><span><kbd class=combo>SPACE</kbd><strong>GRAB</strong></span></aside><section id=deck><div class=joystick id=stick><i></i></div><aside id=values><span><i class=star-prize>★</i><b>STAR</b><strong>250</strong></span><span><i class=rainbow-prize></i><b>RAINBOW</b><strong>500</strong></span><span><i class=unicorn></i><b>UNICORN</b><strong>1.000</strong></span><span><i class=king></i><b>KING</b><strong>5.000</strong></span></aside><button id=grab></button></section><div class=overlay><div class=start-card><small>STEP RIGHT UP</small><div id=message></div><p id=sub></p><span>PRESS SPACE</span></div></div><div id=toast></div><button id=mute>♪</button></main><script>`
);
const makeHtml = code => htmlStart + code + "</script>";

const makeZip = (html) => zipSync({ "index.html": strToU8(html) }, { level: 9 });
const tersedCandidates = await Promise.all(terserOptions.map(options => minify(app, { ...options, format: { comments: false } })));
const plainCandidates = tersedCandidates
  .map((result, i) => ({ code: shrinkCode(result.code || ""), mode: `terser-${i + 1}` }))
  .filter(candidate => candidate.code);
if (!plainCandidates.length) throw new Error("Terser produced no JavaScript");
let { code, mode } = plainCandidates.reduce((best, candidate) =>
  makeZip(makeHtml(candidate.code)).length < makeZip(makeHtml(best.code)).length ? candidate : best
);
let html = makeHtml(code);

if (useRoadroller) {
  for (const candidate of await pack(code)) {
    const rolledHtml = makeHtml(candidate.code);
    if (makeZip(rolledHtml).length < makeZip(html).length) {
      html = rolledHtml;
      mode = `roadroller-${candidate.level}`;
    }
  }
}

const zip = makeZip(html);
await writeFile(`${OUTPUT_DIR}/index.html`, html);
await writeFile(`${OUTPUT_DIR}/game.zip`, zip);

const remaining = LIMIT - zip.length;
console.log(`Build mode: ${mode}`);
console.log(`${OUTPUT_DIR}/index.html: ${Buffer.byteLength(html)} bytes`);
console.log(`${OUTPUT_DIR}/game.zip: ${zip.length} / ${LIMIT} bytes (${remaining} free)`);

if (remaining < 0) {
  throw new Error(`The submission exceeds the js13k limit by ${-remaining} bytes`);
}
