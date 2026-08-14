# UNICORN CLAW — js13kGames 2026

Juego 3D low-poly para js13kGames: una máquina de gancho con 13 unicornios de
peluche, cinco intentos y una única meta, maximizar la puntuación.

El documento de referencia para implementar el juego es
[`docs/GAME_DESIGN.md`](docs/GAME_DESIGN.md).

## Comandos

```sh
npm install
npm run dev
npm run check
```

`npm run check` encadena `typecheck`, `simtest` y `build`. `npm run simtest`
ejecuta la simulación sin navegador y comprueba independencia del refresco,
determinismo, integridad y balance; ver `docs/GAME_DESIGN.md` §13.

`npm run build` recrea `build/` y genera `build/index.html` y `build/game.zip`, prueba Terser y
Roadroller, conserva automáticamente la variante que comprime mejor y falla si
el ZIP supera 13.312 bytes. `npm run build:plain` omite Roadroller para iterar
con más rapidez y también actualiza `build/`. El archivo final que se envía a
js13kGames es `build/game.zip`.

## Principios del repositorio

- `src/` debe seguir siendo legible; el golf sólo pertenece al resultado de build.
- No se añaden assets binarios ni dependencias de runtime sin medir antes el ZIP.
- `src/game/sim.ts` es puro y determinista: sin DOM, sin WebGL, sin `Math.random`
  y sin reloj real. Es lo que permite comprobarlo con `npm run simtest`.
- La física es propia (Verlet en paso fijo). **Nada fuera del helper `push` puede
  tocar la posición de un premio**: corregir posición sin corregir velocidad
  inyecta impulsos y catapulta peluches. Ver `docs/GAME_DESIGN.md` §5.2.
- `build/game.zip` es el artefacto de entrega y siempre contiene `index.html`.

W 1.0.2 se instala desde su repositorio oficial y es de dominio público. Vite,
TypeScript, esbuild, Terser, Roadroller y fflate son herramientas de desarrollo:
ninguna se descarga ni se ejecuta en el navegador final.
