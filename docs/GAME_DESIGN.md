# UNICORN CLAW — diseño y arquitectura de implementación

Estado: especificación previa a implementación  
Objetivo: js13kGames 2026, ZIP final ≤ **13.312 bytes**  
Tema de diseño: **Unicorns and Rainbows**

## 1. Pitch

Una máquina de gancho 3D, vista desde una cámara fija, contiene exactamente 13
unicornios low-poly. El jugador tiene cinco intentos para apuntar, bajar el
gancho y sacar los premios de mayor valor. No hay físicas rígidas: el montón es
un puzzle de posiciones y accesibilidad que se perturba ligeramente tras cada
tirada. Una partida debe durar entre 60 y 120 segundos.

La fantasía no es “simular una recreativa”, sino reproducir sus tres emociones:
apuntar con incertidumbre, esperar mientras el gancho sube y celebrar o lamentar
el desenlace.

## 2. Pilares y alcance

1. **Legible en dos segundos.** Máquina, gancho, premios y agujero deben leerse
   sin tutorial largo.
2. **Una decisión por tirada.** Perseguir un premio valioso y difícil o asegurar
   uno común.
3. **Suspense barato en bytes.** El balanceo, la pausa al cerrar y el posible
   resbalón aportan más que una simulación física.
4. **Estética nacida de la restricción.** Primitivas sin texturas, colores pastel,
   sombreado plano y audio generado.

MVP obligatorio: escena 3D, 13 premios, control X/Z, ciclo completo del gancho,
cinco intentos, cinco rarezas, puntuación, final y reinicio, teclado, audio
procedural y feedback visual de éxito/fallo.

Fuera del MVP: físicas rígidas, modelos externos, texturas, sombras reales,
postprocesado, multijugador, persistencia online, niveles, tienda, localización y
menús complejos. Touch/gamepad sólo entran si quedan al menos 800 bytes libres.

## 3. Bucle jugable

1. La máquina aparece ya llena. Un rótulo breve muestra flechas/WASD + espacio.
2. En `AIM`, el jugador mueve el carro sobre el plano X/Z. Una sombra circular o
   retícula falsa ayuda a proyectar su posición sobre el montón.
3. Espacio fija la posición. El gancho baja, se cierra y el sistema resuelve una
   captura una sola vez.
4. Sube con premio o vacío. Una captura puede resbalar durante la subida.
5. Si llega arriba, el carro viaja al conducto, suelta el premio y suma puntos.
6. El montón se recoloca unos centímetros y se consume un intento.
7. Tras cinco intentos aparece el resultado y `R`/espacio inicia otra partida.

No se permite mover el carro durante una animación. El input se ignora salvo la
tecla de mute (`M`). Esto evita estados imposibles y reduce código.

## 4. Contenido y balance inicial

| Rareza | Cantidad | Puntos | Dificultad base | Color/rasgo |
|---|---:|---:|---:|---|
| Nube | 6 | 100 | 0,15 | blanco, crin pastel |
| Rosa | 3 | 200 | 0,25 | cuerpo rosa |
| Dorado | 2 | 500 | 0,40 | amarillo cálido |
| Rainbow | 1 | 1.000 | 0,55 | crin multicolor |
| King | 1 | 5.000 | 0,70 | corona simple |

Total: 13 premios. El King debe verse parcialmente enterrado pero alcanzable en
algunas semillas. La puntuación máxima teórica de una partida son los cinco
premios más valiosos; el juego no promete vaciar la máquina en una sesión.

La primera tirada de una partida nunca debe sufrir resbalón si el agarre fue
válido. Es una ayuda invisible que enseña el bucle y evita una primera impresión
injusta.

## 5. Modelo de agarre sin físicas

Cada unicornio conserva sólo los datos que afectan al juego:

```ts
type Unicorn = {
  x: number; y: number; z: number;
  yaw: number; roll: number;
  rarity: 0 | 1 | 2 | 3 | 4;
  state: 0 | 1 | 2; // pile, held, won
  exposure: number; // 0 enterrado, 1 libre
};
```

Al terminar `LOWER`, se consideran los unicornios `pile` dentro de un radio
horizontal. Para cada candidato:

```text
distanceScore = 1 - distance / grabRadius
heightScore   = clamp((y - pileMinY) / pileHeight)
grip          = 0,60*distanceScore + 0,25*heightScore + 0,15*exposure
required      = 0,30 + rarityDifficulty
```

Gana el candidato con mayor `grip`. Si no alcanza `required`, el gancho vuelve
vacío. Si lo alcanza, se adjunta visualmente al grupo del gancho. El resbalón se
decide en ese instante con el PRNG sembrado, no frame a frame:

```text
slipChance = clamp(0,02 + rarityDifficulty*0,35 - grip*0,20, 0, 0,35)
```

Si va a resbalar, se precalcula un instante entre el 35 % y el 80 % de la subida.
Así una misma semilla y los mismos inputs producen el mismo resultado.

Tras cada intento, los premios no ganados reciben un desplazamiento X/Z pequeño,
una rotación y una corrección a los límites de la cuba. `exposure` cambia poco.
No se resuelven colisiones entre premios; las interpenetraciones moderadas son
parte del aspecto de peluche amontonado.

## 6. Máquina de estados

```text
BOOT → TITLE → AIM → LOWER → CLOSE → LIFT
                         ↘ miss    ↙  ↘ slip
                RETURN_EMPTY    RETURN_EMPTY
                                  ↓
                         CARRY_TO_CHUTE → DROP_PRIZE
                                  ↓
                      SETTLE → AIM | RESULTS → TITLE
```

Estados recomendados como enteros: `BOOT=0`, `TITLE=1`, `AIM=2`, etc. Cada
transición fija `phaseTime=0`; `update(dt)` incrementa el reloj y calcula curvas
con `t = min(1, phaseTime/duration)`. Usar `smoothstep(t)=t*t*(3-2*t)` evita una
librería de tweening.

Duraciones objetivo: bajar 0,8 s; cerrar 0,25 s; pausa 0,18 s; subir 1,0 s;
transportar 0,65 s; soltar/celebrar 0,75 s. Una tirada completa dura unos 3 s.

## 7. Controles y cámara

- Flechas y WASD: movimiento X/Z.
- Espacio/Enter: empezar, soltar gancho, continuar desde resultados.
- R: reiniciar en resultados.
- M: mute.

El movimiento usa aceleración y fricción, no saltos por pulsación. Se normaliza
la diagonal y se limita a la caja jugable. La cámara permanece en tres cuartos,
ligeramente elevada, con perspectiva estrecha (FOV aproximado 30°). No se mueve
durante el gameplay; una sacudida de 100–150 ms al cerrar puede implementarse
moviendo el grupo raíz, no la cámara.

Resolución interna recomendada: adaptar el canvas al viewport con DPR máximo 2.
Si móviles modestos fallan, fijar una dimensión interna de 960×540 y escalar por
CSS. WebGL2 es requisito explícito del renderer elegido; mostrar un mensaje DOM
si `getContext('webgl2')` no existe sólo si el coste final es aceptable.

## 8. Dirección visual y geometría procedural

No hay archivos de modelos, imágenes ni fuentes. Todo se compone con `cube`,
`sphere` y `pyramid` de W:

- Unicornio: torso elipsoidal, cabeza, hocico, cuatro patas, dos orejas, cuerno,
  dos ojos y 2–3 piezas de crin/cola. 14–18 primitivas.
- Máquina: suelo, techo, cuatro postes, paneles opacos finos y conducto. El
  “cristal” se sugiere con reflejos/blancos y marcos; evitar transparencia
  ordenada salvo que resulte gratuita.
- Gancho: carro, cable, núcleo y tres dedos prismáticos. Los dedos rotan al cerrar.
- Corona del King: tres pirámides sobre una banda. Rainbow reutiliza las piezas de
  crin con colores distintos; no crea otra malla.

Los 13 unicornios son instancias lógicas, no geometría única por premio. Las
fábricas asignan nombres compactos y grupos de W para mover un premio completo.
No actualizar objetos inmóviles cada frame: sólo llamar `W.move` para el gancho,
el premio agarrado, partículas y piezas que estén asentándose.

Paleta inicial: fondo `#ffd9ef`, estructura `#e85b9e`, blanco `#fff7fd`, sombra
`#81355f`, dorado `#ffc83d`, cyan `#55ddeb`, violeta `#9b65e6`. Antes de cerrar
la entrega, probar colores de 3 dígitos donde no se pierda identidad.

## 9. UI, feedback y audio

HUD mínimo DOM: puntuación a la izquierda, cinco créditos a la derecha y texto
central sólo para título/resultados. El DOM suele ser más barato y nítido que
dibujar texto en WebGL; se usa la fuente del sistema.

Feedback prioritario:

- retícula/sombra bajo el gancho durante `AIM`;
- cambio de tono y pequeño squash del candidato al cerrar;
- pausa antes de subir;
- arco de 8–12 partículas de colores al anotar;
- número `+puntos` que asciende con CSS o actualización simple;
- balanceo sinusoidal del cable/premio durante la subida;
- flash corto del marco para King/Rainbow.

Audio con un único `AudioContext`, osciladores y ruido generado. Eventos: click de
inicio, motor continuo con ganancia en rampas, cierre, fallo, premio, fanfarria de
rareza alta. Crear el contexto tras el primer gesto del usuario. No incluir música
en el MVP; un loop musical sólo entra si sobran más de 1 KiB.

## 10. Arquitectura de código objetivo

```text
src/
  main.ts                 composición y bucle requestAnimationFrame
  config.ts               números de balance y paleta
  game/
    model.ts              GameState, Unicorn y estados enteros
    rules.ts              target, agarre, score y settle; funciones puras
    update.ts             transiciones y reloj de fases
  input/
    controls.ts           teclado y, opcionalmente, pointer
  render/
    scene.ts              bootstrap actual; después fachada de W
    machine.ts            geometría estática
    unicorn.ts            fábrica y actualización visual
    effects.ts            partículas, retícula y shake
  audio/
    synth.ts              WebAudio procedural
  ui/
    hud.ts                score, intentos, mensajes y mute
  utils/
    rng.ts                PRNG sembrado
  types/w.d.ts            superficie TypeScript mínima de W
tools/
  build.mjs               bundle, minify, pack, ZIP y size gate
```

`GameState` es la única fuente de verdad. Render, UI y audio consumen eventos
producidos por `update`; no deciden resultados. `rules.ts` no toca DOM, WebGL,
tiempo real ni `Math.random`, por lo que puede comprobarse con tests baratos.

No introducir ECS: hay 13 premios y un gancho. Tampoco clases; objetos planos,
arrays y funciones comprimen mejor y bastan para el problema.

## 11. Stack elegido

### Runtime

- TypeScript sólo como lenguaje fuente; el navegador recibe JavaScript.
- **W 1.0.2 full**, framework WebGL2 de dominio público. La edición full aporta
  primitivas integradas y sombreado y deja más tiempo de jam para game feel.
- APIs nativas: DOM, `requestAnimationFrame`, WebAudio y Keyboard Events.

### Tooling

- Vite: servidor de desarrollo, sin runtime final.
- esbuild: bundle IIFE inicial.
- Terser: tres pasadas y mangle.
- Roadroller: packer específico para demos/js13k; el script sólo lo conserva si
  el ZIP resultante es realmente menor.
- fflate: crea el ZIP y aplica el límite exacto de 13 × 1024 bytes.

La página oficial de recursos también lista microW (~1 KiB), WebGLframework
(antecesor de W, ~1,5 KiB), CSS3Dframework (~1,5 KiB) y W (~3 KiB comprimido).
microW ahorra bytes pero desplaza al juego la generación de mallas y utilidades;
CSS3D complica profundidad, clipping y aspecto sólido. W es el mejor punto de
partida para este escenario de cámara fija. Mantener `render/scene.ts` como
frontera hace viable migrar a W lite/microW/WebGL propio si la medición lo exige.

## 12. Presupuesto de bytes y gates

| Área | Objetivo ZIP incremental |
|---|---:|
| HTML + CSS + HUD | 700 B |
| W full | 3.000 B |
| escena y fábricas | 2.100 B |
| estado, input y reglas | 2.000 B |
| animación y efectos | 1.400 B |
| audio | 900 B |
| Roadroller/overhead de entrega | 800 B |
| reserva | 2.412 B |
| **Total máximo** | **13.312 B** |

Estos números son gates, no estimaciones acumulables de archivos sin más: DEFLATE
comparte diccionario y el coste real sólo se conoce construyendo el ZIP.

- Gate A, escena estática: ≤ 5 KiB.
- Gate B, bucle completo sin juice: ≤ 8 KiB.
- Gate C, audio + feedback + UI final: ≤ 11 KiB.
- Release candidate: ≤ 12,5 KiB para conservar margen de metadatos/correcciones.

Cada feature se evalúa por `git diff` + diferencia de `dist/game.zip`. Si supera
su valor percibido, se elimina. Nunca medir gzip suelto como sustituto del ZIP.

## 13. Plan de implementación

1. Definir `GameState`, PRNG y tests de `selectTarget/resolveGrab`.
2. Construir máquina, cámara y límites; validar encuadre 16:9, 4:3 y móvil.
3. Crear un unicornio por primitivas y luego instanciar los 13 desde una tabla
   compacta generada por semilla.
4. Implementar `AIM → LOWER → CLOSE → LIFT → SETTLE` sin puntuación.
5. Añadir captura, resbalón, conducto, intentos, score y resultados.
6. Añadir HUD, retícula y onboarding de una línea.
7. Añadir audio y tres efectos visuales en orden de prioridad.
8. Medir, perfilar, recortar, probar en Chrome/Firefox/Safari y verificar el ZIP
   descomprimido desde un servidor local.

## 14. Criterios de aceptación

- `npm run check` termina sin errores y genera un ZIP ≤ 13.312 bytes.
- El ZIP contiene `index.html` en raíz y funciona sin red ni assets externos.
- Una partida completa puede jugarse sólo con teclado y reiniciarse sin recargar.
- Hay exactamente 13 unicornios y cinco intentos al comenzar.
- Mismas semilla e inputs producen mismos agarres y resbalones.
- No hay estados bloqueados tras perder, ganar, resbalar o pulsar rápido.
- La puntuación y los intentos coinciden con el estado lógico.
- WebAudio sólo arranca después de un gesto y mute funciona.
- El objetivo y los controles se entienden sin leer este documento.

## 15. Riesgos y decisiones de recorte

1. **W full consume demasiado.** Pasar a W lite y registrar sólo cubo/pirámide;
   aproximar esferas con una malla compartida. Último recurso: microW.
2. **Demasiadas draw calls.** Reducir piezas por unicornio, ocultar premios tapados
   y fusionar decoración estática antes de escribir batching nuevo.
3. **Transparencia problemática.** Eliminar cristales y sugerirlos con reflejos.
4. **El agarre parece arbitrario.** Aumentar retícula y exposición visual; no
   añadir físicas.
5. **Roadroller empeora carga o tamaño.** El build ya compara ambas variantes;
   para release también probar ECT/Advzip sobre el mismo `index.html`.
6. **Falta espacio.** Recortar en este orden: touch, música, corona compleja,
   partículas secundarias, texto/tutorial extra. Nunca recortar el feedback de
   cierre, subida y premio.

## 16. Fuentes técnicas consultadas

- Recursos oficiales js13kGames: <https://js13kgames.com/resources>
- Repositorio de la lista de recursos: <https://github.com/js13kGames/resources>
- W 1.0.2: <https://github.com/xem/W>
- microW: <https://github.com/xem/microW>
- Roadroller: <https://github.com/lifthrasiir/roadroller>

Las reglas definitivas de la edición deben verificarse de nuevo antes de entregar;
el pipeline aplica el límite histórico y explícito de 13.312 bytes y no usa red en
runtime.
