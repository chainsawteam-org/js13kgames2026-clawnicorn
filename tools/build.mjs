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
  define: { "import.meta.env.PROD": "true" },
  minify: true,
  legalComments: "none"
});

const app = new TextDecoder().decode(result.outputFiles[0].contents);
const baseRenderer = await readFile("node_modules/w/dist/w1.0.full.min.js", "utf8");
const oldShader = `#version 300 es
precision highp float;in vec4 v_pos,v_col,v_uv,v_normal;uniform vec3 light;uniform vec4 o;uniform sampler2D sampler;out vec4 c;void main(){c=mix(texture(sampler,v_uv.xy),v_col,o[3]);if(o[1]>0.){c=vec4(c.rgb*(dot(light,-normalize(o[0]>0.?vec3(v_normal.xyz):cross(dFdx(v_pos.xyz),dFdy(v_pos.xyz))))+o[2]),c.a);}}`;
const fxShader = `#version 300 es
precision highp float;in vec4 v_pos,v_col,v_uv,v_normal;uniform vec3 light;uniform vec4 o;uniform sampler2D sampler;out vec4 c;void main(){c=mix(texture(sampler,v_uv.xy),v_col,o.w);if(o.y>0.){vec3 n=normalize(o.x>0.?v_normal.xyz:cross(dFdx(v_pos.xyz),dFdy(v_pos.xyz)));float d=max(0.,dot(light,-n)),r=pow(1.-abs(dot(n,normalize(vec3(0.,.2,1.)))),3.);c=vec4(c.rgb*(o.z+d*.75+max(0.,n.y)*.1)+vec3(.3,.14,.35)*r*.2,c.a);}c.rgb=mix(c.rgb,vec3(.33,.28,.55),(1.-smoothstep(-3.,2.,v_pos.z))*.16);}`;
const renderer = baseRenderer.replace(JSON.stringify(oldShader).slice(1, -1), JSON.stringify(fxShader).slice(1, -1));
if (renderer === baseRenderer) throw new Error("W fragment shader not found");
const tersed = await minify(renderer + ";" + app, {
  compress: { passes: 3, unsafe: true },
  mangle: { properties: { regex: /^(toys|phase|time|score|tries|clawX|clawY|clawZ|close|dropY|fromX|fromZ|held|won|firstThrow|inX|inZ|events|lastWin|rarity|state|sleep|slipAt|shape|yaw|roll|ox|oy|oz|oyaw|nx|ny|nz|resize|setShape|moveCamera|moveClaw|moveReticle|movePrize|hidePrize|celebrate|hideSparks|models|current|next|textures|program|clearColor|projection|setState|ambientLight|lastFrame|render|animation|lerp|dist|ambient|col|add|smooth|vertices|indices|normals|verticesBuffer|indicesBuffer|normalsBuffer|uvBuffer|customNormals|mix|mode|size)$/ } },
  format: { comments: false }
});

if (!tersed.code) throw new Error("Terser produced no JavaScript");

const css = (await readFile("src/style.css", "utf8"))
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\s+/g, " ")
  .replace(/\s*([{}:;,])\s*/g, "$1")
  .replace(/cursor:grab|button\{font:inherit;color:inherit\}|\.star\{margin-right:5px\}|\.help b\{color:#e49e53;margin:6px\}/g, "")
  .trim();

const pack = async (code) => {
  const packer = new Packer([{ data: code, type: "js", action: "eval" }], {
    allowFreeVars: true
  });
  await packer.optimize(4);
  const { firstLine, secondLine } = packer.makeDecoder();
  return firstLine + secondLine;
};

const makeHtml = (code) =>
  `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>UNICORN CLAW</title><style>${css}</style><canvas id=game></canvas><main id=hud><header id=top><section class="meter attempts"><small>ATTEMPTS</small><strong><span class=star>★</span><span id=tries></span></strong></section><div class=marquee><span class=spark>★</span><h1>UNICORN CLAW</h1><div class=rainbow><i></i><i></i><i></i></div></div><section class="meter score"><small>SCORE</small><strong id=score></strong></section></header><aside id=instructions><b>HOW TO PLAY</b><span><kbd class=combo>WASD / ARROWS</kbd><strong>MOVE</strong></span><span><kbd class=combo>CLICK + DRAG</kbd><strong>LOOK</strong></span><span><kbd class=combo>SPACE</kbd><strong>GRAB</strong></span></aside><section id=deck><div class=joystick id=stick><i></i></div><aside id=values><span><i class=cloud></i><b>CLOUD</b><strong>100</strong></span><span><i class=pink></i><b>PINK</b><strong>200</strong></span><span><i class=gold></i><b>GOLD</b><strong>500</strong></span><span><i class=rainbow-prize></i><b>RAINBOW</b><strong>5.000</strong></span></aside><button id=grab></button></section><div class=overlay><div class=start-card><small>STEP RIGHT UP</small><div id=message></div><p id=sub></p><span>PRESS SPACE</span></div></div><div id=toast></div><button id=mute>♪</button></main><script>${code}</script>`;

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
