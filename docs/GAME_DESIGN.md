# UNICORN CLAW — diseño y arquitectura de implementación

Estado: simulación, bucle jugable y controles (teclado + táctil) implementados
Objetivo: js13kGames 2026, ZIP final ≤ **13.312 bytes**
Tema de diseño: **Unicorns and Rainbows**

> **Cambio de rumbo respecto a la primera versión de este documento.** El diseño
> original prohibía las físicas y resolvía el agarre con una puntuación
> geométrica. Se implementaron físicas, se midieron y se decidió conservarlas: el
> montón que reacciona, se derrumba y estorba es el mayor diferenciador del juego
> y el que sostiene los tres pilares. El documento describe ahora lo que existe.

## 1. Pitch

Una máquina de gancho 3D, vista desde una cámara fija, contiene exactamente 13
premios low-poly amontonados en una bandeja. El jugador tiene cinco intentos
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
cinco intentos, cuatro rarezas, puntuación, final y reinicio, teclado, **táctil**,
audio procedural y feedback visual de éxito/fallo.

El táctil subió a obligatorio: el diseño original lo condicionaba a que sobraran
800 bytes, pero cabe holgadamente y una parte del jurado de la jam juega en el
móvil. Los detalles están en §7.4.

Fuera del MVP: modelos externos, texturas, sombras reales, postprocesado,
multijugador, persistencia online, niveles, tienda, localización, menús
complejos y **gamepad**.

## 3. Bucle jugable

1. La máquina aparece llena. Un rótulo breve muestra flechas/WASD + espacio; en
   puntero grueso ese rótulo se oculta y los propios controles en pantalla hacen
   de tutorial.
2. En `AIM`, el jugador mueve el carro sobre el plano X/Z. Una retícula sobre el
   suelo de la bandeja proyecta su posición.
3. Espacio fija la posición. El gancho baja **hasta apoyarse en el montón**, no
   siempre hasta el fondo, y el sistema resuelve una captura una sola vez.
4. Los dedos se cierran, hay una pausa breve y sube con premio o vacío. Una
   captura puede resbalar durante la subida, y de vez en cuando sube **enganchado
   un segundo peluche** que vale un doblete (§5.6).
5. Si llega arriba, el carro viaja al conducto y suelta el premio, que cae por el
   agujero de la bandeja y suma puntos.
6. El montón se reacomoda solo: no hay paso de recolocación artificial.
7. Tras cinco intentos aparece el resultado y `R`/espacio inicia otra partida. El
   cartel espera a que no quede nada bajando por el conducto: si no, la última
   tirada podría aterrizar después y el jugador leería una puntuación que ya no es
   la suya.

No se permite mover el carro durante una animación. El input se ignora salvo la
tecla de mute (`M`).

## 4. Contenido y balance

| Rareza | Cantidad | Puntos | `REQUIRED` | Entrega con puntería perfecta |
|---|---:|---:|---:|---:|
| Star | 6 | 250 | 0,24 | 93 % |
| Rainbow Item | 3 | 500 | 0,33 | 92 % |
| Unicorn | 2 | 1.000 | 0,44 | 92 % |
| Unicorn King | 2 | 2.000 | 0,745 | 83 % |

El índice de rareza ordena **a la vez** cuántos hay en el montón, lo difícil que es
agarrarlo y lo que paga, así que la decisión del jugador es siempre la misma
pregunta: cuánto riesgo por cuánto premio. La Star es el premio de entrada y el
Unicorn el escalón alto de la escala normal; el King queda aparte.

Los porcentajes están **medidos**, no estimados: los produce `npm run simtest`.

La tabla `REQUIRED` es el mando de balance más sensible del juego y por eso es
una tabla explícita y no una fórmula. Con la boca abierta, una entrega también
puede producirse por empuje; cualquier cambio exige volver a medir el conjunto.

**El tiro perfecto no es la métrica que importa.** Con puntería exacta casi todo
entra, incluso el King; lo que el jugador percibe como "posibilidades de agarre"
es cuánta puntería perdona el sistema. Medido con ruido de apuntado (`simtest`,
§ *tolerancia de puntería*), contra la tabla original `[0,32 0,44 0,56 0,865]`:

| Ruido de apuntado | Star | Rainbow | Unicorn | King |
|---|---:|---:|---:|---:|
| ±0,22 | 92 % | 96 % | 91 % | **53 %** |
| ±0,55 | 83 % | 83 % | 75 % | **20 %** |

El King ha pasado por tres calibraciones: 0,865 y 0,85 lo dejaban en un 5-10 % con
puntería humana —inalcanzable—, 0,80 lo subía al 27 % y **0,745, el valor actual,
al 53 %**. El salto de 0,80 a 0,745 es deliberado y está pedido: con 27 % y cinco
tiradas por partida, quien va a por el King lo ve fallar cuatro de cada cinco veces
y la corona sigue leyendo como imposible. El precio está abajo, en la comparación
de estrategias, y no es pequeño.

### `grip` no distingue rarezas — toda la dificultad vive en esta tabla

El dato que hay que tener delante antes de tocar nada, medido sobre 300 tiradas
por rareza: **la distribución de `grip` es la misma para las cuatro**, idéntica
dentro del ruido. Percentil 50 del `grip` alcanzable:

| Puntería | p50 de `grip` |
|---|---:|
| perfecta | 0,90 |
| ruido ±0,11 | 0,82 |
| ruido ±0,22 | 0,77 |

De ahí que un umbral por encima de ~0,80 no produzca "difícil" sino un
**acantilado**: cae en la parte vertical de la curva, y la tirada pasa a depender
de acertar al centímetro en lugar de jugar bien. El King estuvo en 0,865 y luego
en 0,85 y en los dos casos era inaccesible con un mando —10 % de agarres con ruido
±0,22 frente al 91-94 % del resto—, que es exactamente el síntoma de "la garra
nunca coge al King".

El 0,745 actual está elegido con la curva completa delante:

| Umbral | ±0,22 | ±0,55 | Partidas con jackpot (codiciosa) | |
|---:|---:|---:|---:|---|
| 0,85 | 10 % | 3 % | 20/60 | roto: lotería, no dificultad |
| 0,80 | 27 % | 8 % | 42/60 | el King seguía leyendo como imposible |
| 0,76 | 44 % | 16 % | | |
| **0,745** | **53 %** | **20 %** | **57/60** | elegido: el doble de agarrable que 0,80 |
| 0,75 | 58 % | 23 % | 58/60 | |

**Lo que esto cuesta, dicho claro**: por debajo de 0,80 perseguir al King deja de
ser una apuesta y pasa a ser la jugada obvia —firma jackpot en 57 de 60 partidas—,
y el riesgo/recompensa sobre el que está construido el juego se afloja. Es un
cambio pedido a sabiendas, no un descuido de calibración.

Si en algún momento hay que devolverle el filo, la palanca **no** es volver a subir
el umbral —ahí está el acantilado, y el problema que venía a resolver este cambio
vuelve intacto— sino cualquiera de estas dos, que no tocan la sensación de agarre:
bajar los 2.000 puntos del King, o enterrarlo más en el reparto inicial.

Lo que protege al King ya no es una precisión imposible sino **estar enterrado**,
que era la intención original: con `crowd ≥ 4` la exposición se anula y el `grip`
se queda en ~0,72, por debajo del umbral incluso apuntando perfecto.

> Nota histórica: la calibración original partía de que un agarre perfecto "ronda
> 0,60" porque la garra desplaza al objetivo 0,35 u al bajar. Está medido que no:
> `beginDrop` para el carro **sobre** el montón, el agarre se evalúa antes de que
> los dedos se muevan y el centrado real llega a 0,999. Ese 0,60 fantasma es el
> origen del acantilado del King.

**La decisión existe y está verificada.** Contra el mismo conjunto de semillas:

| Estrategia | Media | Premios | Partidas a cero | Con jackpot |
|---|---:|---:|---:|---:|
| Codiciosa (siempre el King) | 5.550 pts | 4,98 | 1/60 | 57/60 |
| Conservadora (el más despejado) | 2.950 pts | 5,40 | 0/60 | 27/60 |

La boca abierta recompensa las jugadas emergentes: perseguir al King también
puede empujarlo a él o a sus vecinos al conducto. `simtest` falla si la brecha
supera 3,5× o cualquiera deja de ser jugable.

Esa brecha (1,88×) es el **termómetro del umbral del King**, y hay que leerla con
la nota de arriba delante: con el umbral en 0,80 la codiciosa se iba a cero 12 de
60 veces y era una apuesta de verdad; con 0,745 casi no falla, así que hoy la
codiciosa domina. Sigue dentro de lo que el test acepta, pero es el número que
hay que vigilar si el juego empieza a parecer fácil.

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
chocado": deja un rebote corto. Las paredes y el techo son un caso aparte: se
resuelven al final del paso, contienen la extensión máxima de cuerpo y cabeza, y
reconstruyen un rebote corto a partir de la velocidad real. Además `push` acota
toda corrección a `MAX_PUSH`, de modo que ninguna puede catapultar nada.

### 5.3 El peluche

Dos esferas forman una envolvente común: cuerpo en el origen local y un segundo
volumen a 0,62 según `yaw`. Un premio mide unas 2,0 × 1,5 unidades; una sola
esfera de radio 0,55 cubría un tercio de los modelos y el gancho los atravesaba.
La envolvente común mantiene estables el apilado y el balance entre siluetas.

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
King a medio agarrar bloquearía una captura fácil que sí valía y el jugador vería
fallar tiradas que en realidad eran buenas.

`exposure` es lo que hace que enterrar al King importe, y funciona igual en un
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

Los tres números aleatorios de `resolveGrab` —dos de resbalón y uno de enganche—
se consumen siempre, gane o pierda cada sorteo, para que el flujo del PRNG no
dependa del resultado.

### 5.6 Enganche: el doblete

Con probabilidad `HOOK_CHANCE` (0,12) el vecino **más pegado** al premio agarrado
se queda prendido de sus pezuñas y sube con él, valiendo dos premios en una sola
tirada. Se elige el más cercano y no uno al azar para que la jugada se lea: el que
estaba encima es el que sube. Como no siempre hay vecino dentro de `HOOK_R`, la
frecuencia real medida es del **7,5 % de los agarres**.

El enganchado cuelga en la **misma columna** que el agarrado, no a su lado: la boca
sólo mide `MOUTH_R` de radio, así que un enganche lateral se quedaría en el borde y
el doblete no llegaría a cobrarse nunca. Su muelle es más blando que el del
agarrado, de modo que llega arrastrándose y se balancea un paso por detrás, y su
objetivo nunca baja del relieve: con la garra abajo va rozando el montón en vez de
hundirse en él, y sólo despega cuando el agarrado sube.

Dos detalles no son estéticos y se pagaron con medidas:

- **`HOOK_Y` = 1,2, no 0,9.** La cabeza del de abajo cuelga a `HEAD_X` del eje, así
  que con el par demasiado junto esa cabeza se solapa con el *torso* del de arriba
  y el empuje resultante es casi horizontal: los dos salen despedidos fuera del
  agujero. La separación mínima limpia es
  `hypot(HEAD_X, YSQUASH·(HOOK_Y − HEAD_Y)) ≥ R_BODY + R_HEAD`, que da 1,07.
  Con 0,9 el doblete se cobraba el 30 % de las veces; con 1,2, el **91 %**.
- **Los dos se sueltan a la vez.** En caída libre la distancia entre ellos se
  conserva, así que el par cae en columna sin tocarse. Escalonar la suelta es justo
  lo que lo rompe: el enganchado se queda quieto haciendo de obstáculo y desvía al
  agarrado fuera de la boca. Medido: 18 % de dobletes escalonando contra 91 %
  soltando a la vez.

Si el agarrado resbala durante la subida, caen los dos. El doblete se cobra entero
o no se cobra.

### 5.7 El conducto

El conducto es una abertura física real. Un premio sobre la boca conserva todas
sus colisiones mientras desciende: puede atascarse, ser desviado fuera o empujar
a otro premio al agujero. Sólo pasa a `state = 3` cuando su centro cruza el plano
del suelo; desde ahí cae por la columna y suma su valor una sola vez.

Los eventos de victoria codifican también la categoría del premio. Esto permite
contabilizar y mostrar correctamente varias caídas ocurridas en el mismo frame.

El hueco visual del suelo se deriva de las mismas constantes que la boca lógica,
así que no pueden desincronizarse. El suelo de la bandeja son dos losas, no una,
y lo que dejan entre ellas *es* el conducto.

**El embudo.** La boca no está abierta en un suelo llano: es el fondo de un cono
rodeado de un caballón, el perfil de una máquina de verdad. El cono perdona el
borde —lo que aterriza cerca resbala dentro en vez de quedarse encallado a dos
dedos del premio— y el caballón es lo que permite tenerlo, porque el solver no
tiene rozamiento estático: sobre cualquier pendiente un premio parado termina
deslizándose, así que un embudo a ras de suelo convierte la boca en un imán y el
montón se vacía solo mientras el jugador mira (medido: hasta 10.000 puntos en
veinte segundos sin tocar el mando). Con el caballón el montón se apoya en su
falda exterior, que empuja hacia fuera, y al cono sólo llega lo que viene por el
aire: lo soltado, lo resbalado y lo que se derrumba desde un escalón.

Todo esto vive en la geometría compartida (`surface`), no en un empujón especial
del solver: el embudo es relieve como cualquier otro, de modo que la altura de
parada de la garra, el objetivo del enganchado y la exposición siguen siendo
coherentes sin código añadido.

**El tirón de la boca** (`MOUTH_PULL`) es la única excepción a lo anterior, y es
pequeña a propósito: una aceleración radial hacia el centro, el 40 % de la
gravedad al alcance cero, que se desvanece linealmente hasta el pie exterior del
caballón y no existe más allá. Sirve para lo que el cono solo no termina de
perdonar: lo que llega rodando al borde y se queda encallado a un palmo.

Lo que impide que reabra la fuga que el caballón vino a cerrar es una **puerta de
velocidad**: sólo tira de lo que ya se mueve. Medido sobre las seis formas y 13.000
muestras, el montón en reposo tiembla a 2·10⁻⁴ u/paso de mediana y no pasa de
4,5·10⁻³ en el entorno del embudo, mientras que una caída real ronda 3·10⁻². El
umbral inferior queda por encima del techo del temblor y el superior en velocidad
de caída, así que un premio dormido en la falda no recibe nada por mucho que se
espere —el test de "esperar sin jugar" sigue en 0-250 puntos por cuatro partidas,
con el listón en 1.250— y uno que llega por el aire sí.

**Derrumbes.** El solver duerme a los premios quietos y los dormidos no se
integran, así que tampoco les cae la gravedad: cuando el de debajo desaparece, el
de encima se quedaba flotando sobre el hueco. Dos piezas lo arreglan:

- **contagio del movimiento** (`WAKE_EPS`): lo que se mueve de verdad despierta a
  sus vecinos dormidos. El umbral va por encima del percentil 99 del temblor de
  fondo —más bajo despertaría al montón entero para siempre, y el temblor perpetuo
  acaba escurriéndolo por la boca—, y es lo que convierte un empujón aislado en una
  cascada.
- **sacudida del hueco** (`COLLAPSE_*`): arrancar un peluche empuja a los de
  alrededor hacia su columna. Se aplica **dos veces**, al conceder el agarre y en
  el primer paso de la subida, porque la primera se gasta contra el propio
  agarrado —que sigue en su sitio y es masa infinita— y sólo la segunda llega con
  el hueco ya abriéndose. El empuje es horizontal y **descentrado**, a la altura de
  la cabeza, para que además los haga girar: sin ese par el derrumbe se ve como una
  traslación de un centímetro y no se lee. Medido sobre 29 agarres, los vecinos que
  no se movían absolutamente nada pasan del 66 % al 16 %. El render lo escalona en marcos concéntricos —la
misma solución que las terrazas radiales— porque cuatro rampas inclinadas no
casan en las esquinas.

### 5.8 Determinismo

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

`SETTLE` no cierra mientras quede un premio en `state = 3`: el resultado no se
dibuja hasta que la puntuación es definitiva.

La simulación no toca DOM ni audio: encola eventos (`EV_GRAB`, `EV_SLIP`,
`EV_HOOK`, `EV_WIN`…) que `main.ts` consume. Render, HUD y sonido no deciden nada.

## 7. Controles y cámara

### 7.1 Teclado

- Flechas y WASD: movimiento X/Z, con aceleración y fricción.
- Espacio/Enter: empezar, soltar gancho, continuar desde resultados.
- R: reiniciar en resultados. M: mute.

### 7.2 Alcance del carro

El carro se mueve dentro de `AIM_X/AIM_Z`, que cubren la bandeja: no se puede
apuntar a suelo vacío donde nunca hay nada que coger.

### 7.3 Cámara

Cámara en tres cuartos, orbitable arrastrando sobre el canvas (yaw ±55°,
pitch 4–34°), FOV 30°.

### 7.4 Táctil

Implementado con **Pointer Events** únicamente: un solo camino de código sirve a
ratón, lápiz y dedo, y no hay listeners `touch*` duplicados que costarían bytes y
divergirían en comportamiento.

- **Joystick virtual** (`#stick`): analógico, no digital. Se normaliza por el
  radio del control, aplica una zona muerta del 12 % y reescala el resto a 0…1,
  de modo que el táctil hereda la misma aceleración y fricción que el teclado en
  vez de sentirse como un interruptor.
- **Botón de agarre** (`#grab`): responde en `pointerdown`, no en `click`, para no
  heredar el retardo de la detección de doble toque. Muestra los intentos
  restantes, así que en móvil hace de HUD además de botón.
- **Mute** (`#mute`): equivalente táctil de `M`.
- **Cámara**: arrastre sobre el canvas, que lleva `touch-action:none` para que el
  navegador no robe el gesto como scroll o pinch.

**Multitáctil real.** Cada control captura su propio `pointerId` con
`setPointerCapture` y lo suelta en `pointerup`, `pointercancel` y
`lostpointercapture`. Por eso se puede mover el carro con el pulgar izquierdo y
soltar el gancho con el derecho en el mismo instante, que es la postura natural.
Soltar en los tres eventos —no sólo en `pointerup`— es lo que evita el joystick
"pegado" cuando el sistema cancela el toque (una llamada entrante, el gesto de
volver atrás).

El teclado tiene prioridad sobre el táctil (`sim.inX = keyX || touchX`). Sólo
importa en híbridos con pantalla táctil y teclado, y allí la precedencia correcta
es la del teclado.

Las teclas siguen siendo la única forma de leer las instrucciones: el HUD
`#instructions` se oculta en punteros gruesos porque los controles en pantalla
son autoexplicativos y el espacio vertical no da para ambos.

### 7.5 Layout adaptativo

Dos capas de CSS independientes, porque pantalla pequeña y dedo no son lo mismo:

- `@media(max-width:800px)` — problema de **espacio**: compacta marcadores y
  rótulo, oculta instrucciones y adelgaza el deck.
- `@media(any-pointer:coarse)` — problema de **precisión**: el joystick decorativo
  del deck pasa a ser un pad fijo de 104 px abajo a la izquierda, `#grab` sube a
  88 px abajo a la derecha y `#mute` a 48 px. Todos anclados con
  `env(safe-area-inset-bottom)` para no quedar bajo el notch o la barra de gestos.
- La combinación `coarse` + `max-width:600px` además oculta la tabla de valores,
  que es informativa y no operativa.

**Pendiente.** Los textos de overlay dicen "PRESS SPACE" y "SPACE / R TO PLAY
AGAIN". El toque funciona —`#grab` llama a `fire()`, que resuelve los tres
estados—, pero el texto no lo dice. Corregirlo es un cambio de copia, no de
lógica.

### 7.6 Nota sobre `gl.viewport`

**W no llama nunca a `gl.viewport`** y sólo rehace la matriz de proyección cuando
se le pasa `fov`. Redimensionar la ventana dejaba la escena estirada y recortada.
`scene.resize()` hace las dos cosas explícitamente y recalcula la distancia de
cámara según el aspecto.

## 8. Dirección visual y geometría procedural

Todo se compone con `cube`, `sphere` y `pyramid` de W:

- Premios, de menor a mayor valor: la Star tiene cinco puntas acolchadas; el
  Rainbow Item forma un arco de cuatro bandas con nubes; el Unicorn es redondo y
  mullido; y el Unicorn King combina cuerpo dorado, corona, cuerno largo y
  detalles reales. Los dos escalones altos son unicornios, que es lo que hace
  legible la escala de un vistazo. Todos comparten la misma envolvente física de
  dos esferas para conservar el balance.
- Máquina: suelo, techo, cuatro postes, paneles y la bandeja de premios, cuyos
  cuatro bordes son exactamente los muros de la simulación.
- Gancho: carro, cable, núcleo y tres dedos prismáticos que rotan al cerrar.

La bandeja es más pequeña que el mueble, como en una máquina real. Que sea
ajustada no es decorativo: es lo que hace que 13 peluches formen montón en vez de
una capa dispersa, y por tanto lo que da sentido a `exposure`.

Paleta: fondo `#f9b2d3`, estructura `#e6327d`, blanco `#fff7fd`, sombra `#8d1749`,
dorado `#ffc83d`, cyan `#55ddeb`, violeta `#9b65e6`.

## 9. UI, feedback y audio

HUD DOM: intentos a la izquierda, rótulo de la máquina al centro, puntuación a la
derecha, deck inferior con joystick, tabla de valores y botón de agarre, más el
texto central de título/resultados. Todo el HUD es `pointer-events:none` salvo los
controles que sí deben recibir toques, para que arrastrar sobre el canvas para
girar la cámara funcione también sobre las zonas cubiertas por el HUD.

Feedback implementado: retícula bajo el gancho **sólo durante AIM**; pausa antes
de subir; arco de 10 chispas animadas al anotar; número `+puntos`; aviso de
`SLIPPED!` distinto del de `MISSED!`; y `DOUBLE!` al enganchar. Este último se
anuncia **al agarrar, no al cobrar**: el jugador tiene que saber por qué suben dos
peluches antes de verlos caer, o el doblete parece un accidente del motor.

Audio con un único `AudioContext` y osciladores, creado tras el primer gesto.
Eventos: inicio, motor al bajar, cierre, agarre, enganche, resbalón, premio y
final.

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
- APIs nativas: DOM, `requestAnimationFrame`, WebAudio, Keyboard Events y
  **Pointer Events** (con captura de puntero para el multitáctil).
- Tooling: Vite (dev), esbuild, Terser, Roadroller, fflate. Ninguno llega al
  navegador final.

## 12. Presupuesto de bytes

Medición real, con físicas, táctil y presentación actuales:

```text
build/index.html: 18.709 bytes
build/game.zip:   11.794 / 13.312 bytes  (1.518 libres)
```

Las físicas completas costaron algo más de 1.400 bytes ZIP sobre la versión sin
ellas. El resto del gasto desde entonces es presentación —HUD de recreativa,
premios más detallados, shader— más el táctil.

Gates: cada feature se evalúa por `git diff` + diferencia de `build/game.zip`.
Nunca medir gzip suelto como sustituto del ZIP.

Reserva restante prevista para: juice y correcciones de última hora. Con 1.518
bytes el margen ya es estrecho; cualquier añadido grande obliga a recortar por el
orden de §15.4.

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
- **embudo**: lo que se posa en el cono acaba dentro en menos de tres segundos, lo
  que se posa en el caballón no se acerca a la boca y el llano de al lado sigue
  siendo llano — los tres por cada lado que la bandeja deja probar;
- **balance**: la escalera de dificultad por rareza y que ninguna estrategia
  domine a la otra;
- **que el montón no se vacíe solo**: cuatro partidas por forma sin tocar el mando
  no pueden valer ni cinco premios baratos. Es el guardián del tirón de la boca y
  del contagio del despertar: los dos son formas de mover el montón sin que el
  jugador juegue, y este test es lo que dice si se han pasado.

Manual: girar la cámara por debajo y por los lados para confirmar que nada flota
ni se hunde, y redimensionar la ventana a media partida.

Manual táctil, que `simtest` no puede cubrir porque no hay DOM:

- partida completa en un móvil real, sin teclado, incluido el reinicio;
- pulgar en el joystick y pulgar en `#grab` a la vez, comprobando que ninguno
  cancela al otro;
- soltar el dedo fuera de la ventana y bloquear la pantalla a media tirada: el
  carro debe pararse, no quedarse "pegado" a la última dirección;
- rotación a horizontal y vuelta a vertical con la partida en curso;
- un dispositivo con notch o barra de gestos, para verificar los `safe-area`.

## 14. Criterios de aceptación

- `npm run check` termina sin errores y genera un ZIP ≤ 13.312 bytes.
- El ZIP contiene `index.html` en raíz y funciona sin red ni assets externos.
- Una partida completa puede jugarse sólo con teclado y reiniciarse sin recargar.
- **Una partida completa puede jugarse sólo con el dedo**, en vertical, y
  reiniciarse sin recargar. Ningún control queda bajo el notch ni la barra de
  gestos, y el joystick nunca se queda pegado.
- Hay exactamente 13 premios y cinco intentos al comenzar.
- **El juego se comporta igual a 30, 60, 144 y 240 Hz.**
- Mismas semilla e inputs producen mismos agarres y resbalones.
- Ningún premio desaparece sin puntuar ni sale despedido de la cuba.
- La puntuación y los intentos coinciden con el estado lógico.
- WebAudio sólo arranca después de un gesto y mute funciona.
- El objetivo y los controles se entienden sin leer este documento.

## 15. Riesgos y decisiones de recorte

1. **W full consume demasiado.** Pasar a W lite y registrar sólo cubo/pirámide.
   `scene.ts` es la frontera que lo hace viable.
2. **Demasiadas draw calls.** Reducir piezas por premio antes de escribir
   batching nuevo. El coste de física es despreciable frente al de render.
3. **El agarre parece arbitrario.** Aumentar la retícula y la legibilidad de la
   exposición. No tocar `REQUIRED` sin volver a correr `simtest`: el acantilado
   del Unicorn King es estrecho —entre 0,865 y 0,82 la tasa de agarre pasa de
   5 % a 18 %— y la métrica que hay que mirar es la tolerancia con ruido de
   apuntado, no el tiro perfecto, que casi siempre entra.
4. **Falta espacio.** Recortar en este orden: música, corona compleja, partículas
   secundarias, texto extra, tabla de valores del deck. **El táctil ya no está en
   la lista de recortes**: era el primer candidato en la versión anterior de este
   documento, pero es lo que hace jugable el juego para una parte del jurado y
   cuesta muy poco —el grueso es CSS de media queries, que comprime bien. Nunca
   recortar el feedback de cierre, subida y premio.
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
