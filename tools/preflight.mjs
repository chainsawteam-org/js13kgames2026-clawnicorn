// Comprobación del artefacto que se sube a js13kGames. No entra en el ZIP.
import { readFile } from "node:fs/promises";
import { unzipSync } from "fflate";

const LIMIT = 13 * 1024;
const artifact = process.argv[2] || "build/game.zip";
const bytes = await readFile(artifact);

if (bytes.length > LIMIT)
  throw new Error(`${artifact} exceeds ${LIMIT} bytes by ${bytes.length - LIMIT}`);

let entries;
try {
  entries = unzipSync(bytes);
} catch (error) {
  throw new Error(`${artifact} is not a valid ZIP: ${error.message}`);
}

const names = Object.keys(entries).sort();
if (names.length !== 1 || names[0] !== "index.html")
  throw new Error(`${artifact} must contain only index.html (found: ${names.join(", ") || "nothing"})`);

const html = new TextDecoder().decode(entries["index.html"]);
if (!/^<!doctype html>/i.test(html)) throw new Error("index.html has no HTML doctype");

// El juego estándar no puede depender de red ni de ficheros que no viajen dentro
// del ZIP. Son patrones de entrega, no una lista de APIs permitidas del juego.
const forbidden = [
  [/(?:https?:)?\/\//i, "a network URL"],
  [/(?:fetch|WebSocket|XMLHttpRequest|EventSource|sendBeacon|importScripts)\s*\(/i, "a network API"],
  [/<(?:script|link|img|audio|video|source)\b[^>]*(?:src|href)\s*=/i, "an external asset reference"],
  [/\burl\s*\(/i, "a CSS URL reference"]
];
for (const [pattern, description] of forbidden)
  if (pattern.test(html)) throw new Error(`index.html contains ${description}`);

console.log(`Preflight passed: ${artifact} has only self-contained index.html (${bytes.length}/${LIMIT} bytes).`);
