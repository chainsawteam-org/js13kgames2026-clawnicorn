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

`npm run build` recrea `build/` y genera `build/index.html` y `build/game.zip`, prueba Terser y
Roadroller, conserva automáticamente la variante que comprime mejor y falla si
el ZIP supera 13.312 bytes. `npm run build:plain` omite Roadroller para iterar
con más rapidez y también actualiza `build/`. El archivo final que se envía a
js13kGames es `build/game.zip`.

## Principios del repositorio

- `src/` debe seguir siendo legible; el golf sólo pertenece al resultado de build.
- No se añaden assets binarios ni dependencias de runtime sin medir antes el ZIP.
- La simulación de agarre es determinista y propia; no hay motor de físicas.
- `build/game.zip` es el artefacto de entrega y siempre contiene `index.html`.

W 1.0.2 se instala desde su repositorio oficial y es de dominio público. Vite,
TypeScript, esbuild, Terser, Roadroller y fflate son herramientas de desarrollo:
ninguna se descarga ni se ejecuta en el navegador final.
