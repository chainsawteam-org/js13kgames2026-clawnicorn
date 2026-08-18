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
const mangledProperties = { regex: /^(toys|phase|time|score|tries|clawX|clawY|clawZ|close|dropY|fromX|fromZ|vx|vz|held|won|firstThrow|inX|inZ|events|rarity|state|sleep|slipAt|shape|mx|mz|yaw|roll|ox|oy|oz|oyaw|nx|ny|nz|resize|setShape|moveCamera|moveClaw|moveReticle|movePrize|hidePrize|celebrate|hideSparks|models|current|next|program|clearColor|projection|setState|render|dist|ambient|col|add|vertices|indices|verticesBuffer|indicesBuffer|mode|size)$/ };
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
  "combo", "combox", "joystick", "unicorn", "rainbow-prize", "star-prize", "king", "overlay", "start-card",
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

// El markup de producción se DERIVA de index.html: es la misma página sin los
// envoltorios que el bundle no necesita. Tenerlo duplicado a mano aquí costó ya
// una desincronización — el KING anunciaba 5.000 mientras el juego pagaba 2.000 —
// y no había nada que pudiera detectarla.
const devHtml = await readFile("index.html", "utf8");
const markup = devHtml.slice(devHtml.indexOf("<body>") + 6, devHtml.indexOf("</body>"))
  // el módulo de desarrollo no viaja: el bundle va en línea y la etiqueta que lo
  // abre la pone htmlStart, NO el markup (ver abajo)
  .replace(new RegExp("<script[^>]*></script>"), "")
  // no hay lector de pantalla que recorra un canvas WebGL
  .replace(/ aria-label="[^"]*"/g, "")
  // comillas sólo donde el valor lleva espacios
  .replace(/="([^" ]*)"/g, "=$1")
  // los huecos que el HUD rellena al arrancar viajan vacíos
  .replace(/(<(?:span|strong|button) id=(?:tries|score|combox|grab)>)[^<]*/g, "$1");

// El CSS y el markup NO se pegan al HTML como texto plano, donde sólo los vería
// DEFLATE: los inyecta el propio JS, de modo que entran en el payload que
// comprime roadroller — mezcla de contextos, bastante más fuerte que DEFLATE.
// Medido sobre este juego: 13.081 -> 11.971 bytes. Unos 1.100 de ganancia sin
// quitar una sola regla de CSS ni un solo elemento del HUD, que es lo que
// costaría sacarlos de cualquier otro sitio: la escena 3D entera comprime a casi
// nada (toda la decoración del mueble son 70 bytes) y los bytes de verdad están
// en estos dos.
//
// El precio es que la página está en blanco hasta que corre el JS. En un juego
// que es un canvas WebGL eso no cambia nada: sin JS tampoco había juego.
//
// DOS órdenes que hay que respetar o el build sale roto sin avisar, porque pesa
// prácticamente lo mismo de las dos maneras:
//
//   1. `chrome` va ANTES del bundle, para que el markup exista cuando main.ts
//      busca sus elementos.
//   2. la etiqueta <script> que abre el bloque vive en htmlStart y no dentro del
//      markup. Si se cuela ahí, el HTML se queda sin abrir el script y el payload
//      acaba pintado como texto en el body.
const chrome = `document.head.insertAdjacentHTML("beforeend",${JSON.stringify(`<style>${css}</style>`)});document.body.innerHTML=${JSON.stringify(shrinkMarkup(markup))};`;
const htmlStart = `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>UNICORN CLAW</title><body><script>`;
const makeHtml = code => htmlStart + code + "</script>";

const makeZip = (html) => zipSync({ "index.html": strToU8(html) }, { level: 9 });
const tersedCandidates = await Promise.all(terserOptions.map(options => minify(chrome + app, { ...options, format: { comments: false } })));
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
const remaining = LIMIT - zip.length;
console.log(`Build mode: ${mode}`);
console.log(`${OUTPUT_DIR}/index.html: ${Buffer.byteLength(html)} bytes`);
console.log(`${OUTPUT_DIR}/game.zip: ${zip.length} / ${LIMIT} bytes (${remaining} free)`);

// Se comprueba ANTES de escribir: un build que se pasa del límite no puede dejar
// en disco un index.html con pinta de entregable válido.
if (remaining < 0) {
  throw new Error(`The submission exceeds the js13k limit by ${-remaining} bytes`);
}

await writeFile(`${OUTPUT_DIR}/index.html`, html);
await writeFile(`${OUTPUT_DIR}/game.zip`, zip);
