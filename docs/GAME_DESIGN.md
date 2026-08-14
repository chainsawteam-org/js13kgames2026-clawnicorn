# UNICORN CLAW — diseño y arquitectura de implementación

Estado: simulación y bucle jugable implementados
Objetivo: js13kGames 2026, ZIP final ≤ **13.312 bytes**
Tema de diseño: **Unicorns and Rainbows**

> **Cambio de rumbo respecto a la primera versión de este documento.** El diseño
> original prohibía las físicas y resolvía el agarre con una puntuación
> geométrica. Se implementaron físicas, se midieron y se decidió conservarlas: el
> montón que reacciona, se derrumba y estorba es el mayor diferenciador del juego
> y el que sostiene los tres pilares. El documento describe ahora lo que existe.

## 1. Pitch

Una máquina de gancho 3D, vista desde una cámara fija, contiene exactamente 13
unicornios low-poly amontonados en una bandeja. El jugador tiene cinco intentos
para apuntar, bajar el gancho y sacar los premios de mayor valor. El montón se
simula: los peluches chocan entre sí, se apoyan unos en otros, se derrumban
cuando les quitas el de abajo y estorban el agarre cuando rodean a un premio.
Una partida dura entre 60 y 120 segundos.

La fantasía no es "simular una recreativa", sino reproducir sus tres emociones:
apuntar con incertidumbre, esperar mientras el gancho sube y celebrar o lamentar
el desenlace.

## 2. Pilares y alcance

1. **Legible en dos segundos.** Máquina, gancho, premios y conducto deben leerse
   sin tutorial largo.
2. **Una decisión por tirada.** Perseguir un premio valioso y difícil o asegurar
   uno común. Está medido: ver §4.
3. **El montón es el antagonista.** El peluche que quieres está aprisionado por
   sus vecinos, y sacar a otro lo libera. Esto es lo que las físicas compran.
4. **Estética nacida de la restricción.** Primitivas sin texturas, colores pastel,
   sombreado plano y audio generado.

MVP obligatorio: escena 3D, 13 premios, control X/Z, ciclo completo del gancho,
cinco intentos, cuatro rarezas, puntuación, final y reinicio, teclado, audio
procedural y feedback visual de éxito/fallo.

Fuera del MVP: modelos externos, texturas, sombras reales, postprocesado,
multijugador, persistencia online, niveles, tienda, localización y menús
complejos. Touch/gamepad sólo entran si quedan al menos 800 bytes libres.

## 3. Bucle jugable

1. La máquina aparece llena. Un rótulo breve muestra flechas/WASD + espacio.
2. En `AIM`, el jugador mueve el carro sobre el plano X/Z. Una retícula sobre el
   suelo de la bandeja proyecta su posición.
3. Espacio fija la posición. El gancho baja **hasta apoyarse en el montón**, no
   siempre hasta el fondo, y el sistema resuelve una captura una sola vez.
4. Los dedos se cierran, hay una pausa breve y sube con premio o vacío. Una
   captura puede resbalar durante la subida.
5. Si llega arriba, el carro viaja al conducto y suelta el premio, que cae por el
   agujero de la bandeja y suma puntos.
6. El montón se reacomoda solo: no hay paso de recolocación artificial.
7. Tras cinco intentos aparece el resultado y `R`/espacio inicia otra partida.

No se permite mover el carro durante una animación. El input se ignora salvo la
tecla de mute (`M`).

## 4. Contenido y balance

| Rareza | Cantidad | Puntos | `REQUIRED` | Entrega con puntería perfecta |
|---|---:|---:|---:|---:|
| Nube | 6 | 100 | 0,32 | 85 % |
| Rosa | 3 | 200 | 0,44 | 90 % |
| Dorado | 2 | 500 | 0,56 | 90 % |
| Rainbow coronado | 2 | 5.000 | 0,865 | 17 % |

Los porcentajes están **medidos**, no estimados: los produce `npm run simtest`.

La tabla `REQUIRED` es el mando de balance más sensible del juego y por eso es
una tabla explícita y no una fórmula. El acantilado es estrecho: mover el Rainbow de
0,85 a 0,88 lo lleva de 9 jackpots por cada 60 partidas a 1.

**La decisión existe y está verificada.** Contra el mismo conjunto de semillas:

| Estrategia | Media | Premios | Partidas a cero | Con jackpot |
|---|---:|---:|---:|---:|
| Codiciosa (siempre el Rainbow) | 482 pts | 0,62 | 27/60 | 5/60 |
| Conservadora (el más despejado) | 297 pts | 1,72 | 6/60 | 0/60 |

Ninguna domina: pagan casi lo mismo de media con perfiles de riesgo opuestos.
`simtest` falla si una supera a la otra por más de 2×, para que un retoque de
balance no mate el pilar 2 sin que nadie se entere.

La primera tirada de una partida nunca sufre resbalón. Es una ayuda invisible que
enseña el bucle y evita una primera impresión injusta.

## 5. Modelo de físicas y agarre

Todo vive en `src/game/sim.ts`, que es **puro**: sin DOM, sin WebGL, sin
`performance.now`, sin `Math.random`. Eso es lo que permite comprobarlo sin
navegador y lo que hace el juego reproducible.

### 5.1 Paso fijo

El mundo avanza en pasos de `H = 1/120 s` mediante un acumulador en `main.ts`:

```ts
acc = Math.min(acc + dt, .2);
while (acc >= H) { step(sim); acc -= H; }
```

El reloj de fase del gancho avanza **dentro** del mismo paso que las físicas. Si
se dejara fuera, el premio agarrado iría un frame por detrás del carro.

Esto no es un detalle de estilo. La versión anterior integraba con
`steps = 3` sobre un `dt` variable y una amortiguación por subpaso, lo que hacía
que la velocidad terminal de caída dependiera del monitor con un factor de 4,5×
entre 30 y 240 Hz, y que el juego **fuera imposible de puntuar a 75 Hz o más**.
`simtest` compara ahora las puntuaciones de 30 a 240 Hz y exige que sean
idénticas.

### 5.2 La regla que evita catapultas

Verlet guarda la velocidad como `x − ox`. Mover `x` sin mover `ox` **no** es
corregir una penetración: es aplicar un impulso proporcional al salto. Un
teletransporte de 1 unidad inyectaba 353 u/s y cruzaba la máquina entera.

Por eso existe un único helper y **ninguna otra línea del solver toca `p.x/y/z`**:

```ts
push(p, dx, dy, dz, carry)   // corrige posición Y velocidad
```

`carry = 1` significa "el obstáculo se mueve y el peluche lo acompaña" (dedos del
gancho, soldadura al carro): no gana velocidad. `carry ≈ 0,6` significa "he
chocado": deja un rebote corto. Las paredes son un caso aparte: reconstruyen la
velocidad a partir de la que traía el peluche, nunca a partir del salto de
posición. Además `push` acota toda corrección a `MAX_PUSH`, de modo que ninguna
puede catapultar nada aunque la geometría cambie.

### 5.3 El peluche

Dos esferas: torso en el origen local y cabeza a 0,62 según `yaw`. Un unicornio
mide unas 2,0 × 1,5 unidades; una sola esfera de radio 0,55 cubría un tercio del
modelo y el gancho atravesaba cabezas y cuernos. Con dos esferas los peluches se
entrelazan y `yaw` pasa a significar algo físicamente.

Las colisiones premio-premio son 78 pares con dos iteraciones Gauss-Seidel y el
eje Y amplificado ×1,2, para que se aplasten al apilarse en vez de rodar como
canicas. Un empuje aplicado en la cabeza además genera par: los peluches voltean.

Los peluches se duermen tras 12 pasos por debajo del umbral de movimiento y
despiertan al primer contacto. Sin esto el montón vibraría para siempre.

### 5.4 El agarre

Se evalúa **una sola vez**, en el instante en que el carro toca fondo y **antes**
de que los dedos empiecen a cerrarse. Si se evaluara después, los propios dedos
ya habrían expulsado al peluche —una esfera de radio 0,55 no cabe en una pinza
que cierra a 0,37— y ningún agarre sería nunca válido.

```text
centring = 1 − distanciaHorizontal / GRAB_R
contacts = cápsulas de dedo que tocan, sobre la pose cerrada (0…6)
exposure = 0,6·(1 − vecinos/4) + 0,4·(altura sobre el suelo)
grip     = 0,70·centring + 0,12·(contacts/6) + 0,18·exposure
```

Sólo compiten los candidatos que superan **su propio** `REQUIRED`; entre ésos gana
el de mayor `grip`. El orden importa: si se eligiera primero por agarre bruto, un
Rainbow a medio agarrar bloquearía una captura fácil que sí valía y el jugador vería
fallar tiradas que en realidad eran buenas.

`exposure` es lo que hace que enterrar al Rainbow importe, y funciona igual en un
montón de una capa que en uno de tres.

Un agarre "perfecto" ronda 0,60 y no 1,0, porque el gancho al bajar ya desplaza
al objetivo unas 0,35 unidades. `REQUIRED` está calibrada contra ese hecho.

### 5.5 Resbalón

```text
slipChance = clamp(0,05 + dificultad·0,40 − grip·0,14, 0, 0,35)
```

Se tira una sola vez con el PRNG sembrado y, si sale, el instante se fija entre el
35 % y el 80 % de la subida. Al dispararse se rompe la soldadura y el peluche cae
**con velocidad real** sobre el montón, que colisiona y reacciona.

Los dos números aleatorios se consumen siempre, gane o pierda el sorteo, para que
el flujo del PRNG no dependa del resultado.

### 5.6 El conducto

El conducto **sólo acepta lo que entrega el gancho**. Un premio soltado sobre la
boca pasa a `state = 3` y cae por su columna sin paredes ni suelo; cualquier
peluche del montón que se acerque por debajo del borde es expulsado.

La alternativa —una boca abierta que acepte a cualquiera— resultó frágil: en una
bandeja apretada los peluches acaban exprimidos hacia dentro y puntúan solos. Se
pierde la jugada emergente de empujar un premio al conducto a cambio de que la
puntuación sea siempre legible y nunca accidental.

El hueco visual del suelo se deriva de las mismas constantes que la boca lógica,
así que no pueden desincronizarse. El suelo de la bandeja son dos losas, no una,
y lo que dejan entre ellas *es* el conducto.

### 5.7 Determinismo

PRNG xorshift32 sembrado por partida. Con el paso fijo, la misma semilla y las
mismas entradas en los mismos instantes de simulación producen exactamente la
misma partida. Durante una jam esto importa menos por el criterio de aceptación
que porque **permite reproducir un bug de físicas**.

## 6. Máquina de estados

```text
TITLE → AIM → LOWER → CLOSE → PAUSE → LIFT → CARRY → DROP → RETURN → SETTLE
          ↑                                    ↘ resbalón ↙            │
          └────────────────────────────────────────────────────────────┤
                                                          RESULT ──────┘
```

Duraciones: bajar 0,85 s; cerrar 0,45 s; pausa 0,18 s; subir 1,15 s; transportar
0,9 s; soltar 1,4 s; volver 0,9 s; asentar 0,35 s.

La simulación no toca DOM ni audio: encola eventos (`EV_GRAB`, `EV_SLIP`,
`EV_WIN`…) que `main.ts` consume. Render, HUD y sonido no deciden nada.

## 7. Controles y cámara

- Flechas y WASD: movimiento X/Z, con aceleración y fricción.
- Espacio/Enter: empezar, soltar gancho, continuar desde resultados.
- R: reiniciar en resultados. M: mute.

El carro se mueve dentro de `AIM_X/AIM_Z`, que cubren la bandeja: no se puede
apuntar a suelo vacío donde nunca hay nada que coger.

Cámara en tres cuartos, orbitable con el ratón (yaw ±55°, pitch 4–34°), FOV 30°.

**W no llama nunca a `gl.viewport`** y sólo rehace la matriz de proyección cuando
se le pasa `fov`. Redimensionar la ventana dejaba la escena estirada y recortada.
`scene.resize()` hace las dos cosas explícitamente y recalcula la distancia de
cámara según el aspecto.

## 8. Dirección visual y geometría procedural

Todo se compone con `cube`, `sphere` y `pyramid` de W:

- Unicornio: torso elipsoidal, cabeza, hocico, cuatro patas, cuerno, dos ojos y
  piezas de crin/cola. Cada rareza tiene una silueta propia: la Nube es redonda y
  mullida, la Rosa alta y orejuda, la Dorada lleva alas y la Rainbow combina
  crin multicolor, cuerno largo y corona. Las dos esferas de colisión coinciden
  con torso y cabeza.
- Máquina: suelo, techo, cuatro postes, paneles y la bandeja de premios, cuyos
  cuatro bordes son exactamente los muros de la simulación.
- Gancho: carro, cable, núcleo y tres dedos prismáticos que rotan al cerrar.

La bandeja es más pequeña que el mueble, como en una máquina real. Que sea
ajustada no es decorativo: es lo que hace que 13 peluches formen montón en vez de
una capa dispersa, y por tanto lo que da sentido a `exposure`.

Paleta: fondo `#f9b2d3`, estructura `#e6327d`, blanco `#fff7fd`, sombra `#8d1749`,
dorado `#ffc83d`, cyan `#55ddeb`, violeta `#9b65e6`.

## 9. UI, feedback y audio

HUD mínimo DOM: puntuación a la izquierda, cinco créditos a la derecha, tabla de
valores y texto central para título/resultados.

Feedback implementado: retícula bajo el gancho **sólo durante AIM**; pausa antes
de subir; arco de 10 chispas animadas al anotar; número `+puntos`; aviso de
`SLIPPED!` distinto del de `MISSED!`.

Audio con un único `AudioContext` y osciladores, creado tras el primer gesto.
Eventos: inicio, motor al bajar, cierre, agarre, resbalón, premio y final.

## 10. Arquitectura de código

```text
src/
  main.ts                 acumulador de paso fijo, entrada, HUD, audio, render
  game/sim.ts             simulación pura: estado, PRNG, fases, físicas, reglas
  render/scene.ts         geometría y fachada de W
  types/w.d.ts            superficie TypeScript mínima de W
tools/
  build.mjs               bundle, minify, pack, ZIP y size gate
  simtest.mjs             comprobación de la simulación sin navegador
```

`sim.ts` es la única fuente de verdad. La frontera importa: `scene.ts` importa de
`sim.ts` las constantes de geometría (`X0`, `MOUTH_X`, `FLOOR`…) para que lo que
se ve y lo que choca no puedan separarse.

No hay ECS ni clases: 13 premios y un gancho. Objetos planos y funciones.

## 11. Stack

- TypeScript como lenguaje fuente; el navegador recibe JavaScript.
- **W 1.0.2 full**, framework WebGL2 de dominio público.
- APIs nativas: DOM, `requestAnimationFrame`, WebAudio y Keyboard Events.
- Tooling: Vite (dev), esbuild, Terser, Roadroller, fflate. Ninguno llega al
  navegador final.

## 12. Presupuesto de bytes

Medición real tras implementar las físicas:

```text
build/game.zip: 9.700 / 13.312 bytes aprox.  (~3.600 libres)
```

Las físicas completas costaron algo más de 1.400 bytes ZIP sobre la versión
anterior, dentro de un presupuesto que tenía 5.065 libres.

Gates: cada feature se evalúa por `git diff` + diferencia de `build/game.zip`.
Nunca medir gzip suelto como sustituto del ZIP.

Reserva restante prevista para: controles táctiles (≤ 800 B), más juice y
correcciones de última hora.

## 13. Verificación

`npm run check` encadena `typecheck`, `simtest` y `build`.

`tools/simtest.mjs` no se empaqueta y comprueba:

- **independencia del refresco**: mismas puntuaciones de 30 a 240 Hz, sobre cinco
  semillas, exigiendo además que la comparación no sea trivial;
- **determinismo**: misma semilla ⇒ misma puntuación y mismas posiciones;
- **integridad** en 40 partidas: nada se cuelga, `ganados + montón = 13`, sin NaN,
  nadie sale de la cuba, un jugador sensato rara vez se va en blanco;
- **asentado inicial**: nadie atraviesa el suelo, nadie cae solo al conducto y el
  montón queda dormido;
- **balance**: la escalera de dificultad por rareza y que ninguna estrategia
  domine a la otra.

Manual: girar la cámara por debajo y por los lados para confirmar que nada flota
ni se hunde, y redimensionar la ventana a media partida.

## 14. Criterios de aceptación

- `npm run check` termina sin errores y genera un ZIP ≤ 13.312 bytes.
- El ZIP contiene `index.html` en raíz y funciona sin red ni assets externos.
- Una partida completa puede jugarse sólo con teclado y reiniciarse sin recargar.
- Hay exactamente 13 unicornios y cinco intentos al comenzar.
- **El juego se comporta igual a 30, 60, 144 y 240 Hz.**
- Mismas semilla e inputs producen mismos agarres y resbalones.
- Ningún premio desaparece sin puntuar ni sale despedido de la cuba.
- La puntuación y los intentos coinciden con el estado lógico.
- WebAudio sólo arranca después de un gesto y mute funciona.
- El objetivo y los controles se entienden sin leer este documento.

## 15. Riesgos y decisiones de recorte

1. **W full consume demasiado.** Pasar a W lite y registrar sólo cubo/pirámide.
   `scene.ts` es la frontera que lo hace viable.
2. **Demasiadas draw calls.** Reducir piezas por unicornio antes de escribir
   batching nuevo. El coste de física es despreciable frente al de render.
3. **El agarre parece arbitrario.** Aumentar la retícula y la legibilidad de la
   exposición. No tocar `REQUIRED` sin volver a correr `simtest`: el acantilado
   del Rainbow coronado es estrecho.
4. **Falta espacio.** Recortar en este orden: touch, música, corona compleja,
   partículas secundarias, texto extra. Nunca recortar el feedback de cierre,
   subida y premio.
5. **Regresión silenciosa de físicas.** El riesgo real ya no es el tamaño sino
   reintroducir un impulso por proyección. La regla de §5.2 es innegociable:
   nada fuera de `push` toca la posición.

## 16. Fuentes técnicas

- Recursos oficiales js13kGames: <https://js13kgames.com/resources>
- W 1.0.2: <https://github.com/xem/W>
- Roadroller: <https://github.com/lifthrasiir/roadroller>

Las reglas definitivas de la edición deben verificarse antes de entregar: el
pipeline aplica el límite histórico de 13.312 bytes y este documento asume el
tema "Unicorns and Rainbows". Ambas cosas hay que confirmarlas contra las reglas
publicadas de 2026, no contra este repositorio.
