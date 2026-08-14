import { readFile, mkdir, rm, writeFile } from "node:fs/promises";
import { build } from "esbuild";
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
  format: "iife",
  target: "es2020",
  minify: true,
  legalComments: "none"
});

const app = new TextDecoder().decode(result.outputFiles[0].contents);
const renderer = await readFile("node_modules/w/dist/w1.0.full.min.js", "utf8");
const tersed = await minify(renderer + ";" + app, {
  compress: { passes: 3, unsafe: true },
  mangle: true,
  format: { comments: false }
});

if (!tersed.code) throw new Error("Terser produced no JavaScript");

const css = (await readFile("src/style.css", "utf8"))
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\s+/g, " ")
  .replace(/\s*([{}:;,])\s*/g, "$1")
  .trim();

const pack = async (code) => {
  const packer = new Packer([{ data: code, type: "js", action: "eval" }], {
    allowFreeVars: true
  });
  await packer.optimize(1);
  const { firstLine, secondLine } = packer.makeDecoder();
  return firstLine + secondLine;
};

const makeHtml = (code) =>
  `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>UNICORN CLAW</title><style>${css}</style><canvas id=game></canvas><main id=hud><div id=top><span id=score></span><h1>UNICORN CLAW</h1><span id=tries></span></div><aside id=values><b>PRIZE VALUES</b><span><i class=cloud></i>CLOUD <strong>100</strong></span><span><i class=pink></i>PINK <strong>200</strong></span><span><i class=gold></i>GOLD <strong>500</strong></span><span><i class=rainbow></i>RAINBOW <strong>1000</strong></span><span><i class=king></i>KING <strong>5000</strong></span></aside><div class=overlay><div><div id=message></div><p id=sub></div></div><div id=toast></div><div class=help>WASD / ARROWS: AIM • DRAG: LOOK • SPACE: DROP</div><span id=mute>♪</span></main><script>${code}</script>`;

const makeZip = (html) => zipSync({ "index.html": strToU8(html) }, { level: 9 });
const plainHtml = makeHtml(tersed.code);
let html = plainHtml;
let mode = "terser";

if (useRoadroller) {
  const rolledHtml = makeHtml(await pack(tersed.code));
  if (makeZip(rolledHtml).length < makeZip(plainHtml).length) {
    html = rolledHtml;
    mode = "roadroller";
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
