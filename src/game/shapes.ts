// Geometría compartida por físicas y render. Una forma es UNA fila de números:
// añadir un relieve nuevo no cuesta código, sólo datos.
//
//   [mx, mz, modo, p0, p1, p2, p3, t0, h0, t1, h1, ...]
//
// mx/mz: centro de la boca de esa forma. Modo 0: t = x*p0 + z*p1 con (p0,p1)
// unitario. Modo 1: t = max(|x-p0|/p2, |z-p1|/p3), la distancia rectangular a un
// centro, que produce pirámides, anillos y crestas según el perfil.
//
// Los pares (t, altura) van en t ASCENDENTE y el último es un centinela plano.
// En modo 0 el primer tramo debe ser plano, porque por debajo de t0 el perfil
// extrapola con su pendiente; en modo 1 no hace falta, t nunca baja de cero.
// Dos t casi iguales con alturas distintas son un frente: el render enseña una
// cara vertical y la física resuelve una rampa muy inclinada, de la que un
// premio resbala en vez de teletransportarse. El ancho del frente NO es
// estético: la corrección del solver está topada en MAX_PUSH por paso, así que
// un frente demasiado estrecho para su desnivel deja al premio penetrando la
// rampa. Con escalones de un piso el ancho mínimo sano es ~0,6 (pendiente ~2,7);
// en modo 1 el ancho es Δt·p2 en X y Δt·p3 en Z, y manda el más estrecho.
export const FLOOR = -3.225;
// Límites jugables del montón; la plataforma visible se prolonga algo más allá
// para llenar el mueble sin alterar el balance de colisiones.
//
// La bandeja es una sola para todas las formas, y no por comodidad: con la
// bandeja pequeña del juego original (3,1 · 1,75) los trece peluches quedan tan
// apretados que la propia presión del montón los escupe al embudo. Medido, con la
// boca en las treinta posiciones que caben y sin tocar el mando: entre 2.000 y
// 16.000 puntos en seis partidas, cuando el listón son 1.875. El embudo y el
// caballón están calibrados para ESTA superficie; estrecharla vuelve a abrir la
// fuga que el caballón vino a cerrar.
export const X0 = -3.7, X1 = 3.7, Z0 = -2.1, Z1 = 2.1;
export const MOUTH_R = .7;
// Embudo. La boca no es un agujero de paredes rectas abierto en un suelo plano
// sino el fondo de un cono rodeado de un caballón, el mismo perfil que tiene el
// agujero de una máquina de verdad:
//
//        ___/‾\__                 llano de la bandeja
//           |   ‾\___             caballón: sube RIM_H en RIM_W
//   boca    |        ‾\___        embudo: baja hasta −FUNNEL_D en la boca
//   ────────┴──────────────
//   0     MOUTH_R      FUNNEL_R   FUNNEL_R+RIM_W
//
// El cono es lo que pidió existir: lo que aterriza cerca del borde resbala dentro
// en vez de quedarse encallado a dos dedos del premio.
//
// El caballón NO es decoración, es lo que hace que el cono se pueda tener. Este
// solver no tiene rozamiento estático —la fricción es un amortiguador viscoso—,
// así que sobre CUALQUIER pendiente un premio parado termina deslizándose: un
// embudo a ras de suelo convierte la boca en un imán y el montón se vacía solo
// mientras el jugador mira. Medido antes de añadirlo: hasta 10.000 puntos en
// veinte segundos sin tocar el mando. Con el caballón, el montón se apoya en su
// falda exterior, que empuja HACIA FUERA, y sólo entra en el cono lo que llega
// por el aire —lo soltado, lo resbalado, lo que se derrumba desde un escalón—,
// que es exactamente lo que el embudo quiere perdonar.
//
// Vive en la GEOMETRÍA y no en un empujón especial dentro del solver: siendo
// relieve, `supportSolve` ya lo trata como cualquier rampa y el resto —altura de
// parada de la garra, objetivo del enganchado, exposición— sale coherente sin
// tocar una línea más.
export const FUNNEL_R = 1.25, FUNNEL_D = .42, RIM_H = .2, RIM_W = .3;

// La unidad del relieve es el PISO: la altura de un premio, FEET + HEAD_Y +
// R_HEAD ≈ 1,6. Sólo hay dos alturas de escalón y las dos significan algo
// distinto para el barrido del carro (ver CLAW_TOP en sim.ts):
//
//   un piso  (1,6)  el peluche queda alto pero por debajo del premio que cuelga
//                   de la garra: se ve elevado y no se le puede volcar.
//   dos pisos (3,2) su CABEZA queda justo a la altura de ese premio colgado, y
//                   su torso justo por debajo. El carro que cruza hacia la boca
//                   lo engancha por la cabeza, lo hace girar y lo tira escalones
//                   abajo — que descienden siempre hacia la boca.
//
// Un escalón de dos pisos sólo cabe donde el perfil tiene sitio para dos frentes
// y para el llano que la boca necesita alrededor, así que vive en el eje largo
// (formas 3 y 5) y no en la profundidad de la bandeja.
export const STORY = 1.6;

export const SHAPES: number[][] = [
  // Plana: la referencia, con la boca en el centro del frente. Es la máquina "sin
  // obstáculos" del repertorio y sale una de cada seis partidas.
  [3, 1.5, 0, 0, 1, 0, 0, -9, 0, 9, 0],
  // Meseta central de un piso: una torre con sitio arriba para uno o dos premios.
  [-3, 1.5, 1, .35, -.35, 1.45, 1.025, 0, 1.6, .35, 1.6, 1, 0, 9, 0],
  // Terraza de un piso al fondo; la boca vive en el llano del frente. La
  // profundidad de la bandeja no da para dos pisos: el llano de la boca se come
  // 2,5 de los 4,2 que hay, y quedarían frentes de pared vertical.
  [-3, 1.5, 0, 0, 1, 0, 0, -2.1, 1.6, -.75, 1.6, 0, 0, 9, 0],
  // Escalones laterales: dos pisos a la izquierda, uno intermedio y la boca en la
  // derecha llana. Es la forma insignia del barrido: el carro cruza el estante
  // alto de punta a punta camino de la boca.
  [3, 1.5, 0, 1, 0, 0, 0, -3.7, 3.2, -1.65, 3.2, -1.05, 1.6, -.05, 1.6, .55, 0, 9, 0],
  // Cresta central en |x|, un piso: dos pasillos a los lados y la boca en uno.
  [-3.35, 1.5, 1, 0, 0, 1.2, 99, 0, 1.6, .6, 1.6, 1.15, 0, 9, 0],
  // Tarta concéntrica: dos pisos de cima, un anillo intermedio y la boca en la
  // esquina llana. Lo que se vuelca de la cima cae rodando hacia ella.
  //
  // El centro y los dos radios están puestos para que el frente EXTERIOR caiga
  // fuera de la banda que pisan los premios (|x| ≤ 3,15, |z| ≤ 1,55, que es donde
  // las paredes los sujetan). Las paredes corrigen la posición sin volver a
  // resolver el apoyo, así que un premio empujado contra una rampa se queda
  // clavado dentro de ella; contra un llano, no. Con radios 1,5 el frente
  // exterior arranca en |z+0,3| = 1,95 y en |x+1,45| = 1,95, los dos ya detrás de
  // la pared, y sólo quedan al alcance los anillos llanos y el frente interior.
  // Medido: con radios 1,35 se clavaban premios en 2 de 8 semillas; con 1,5, en
  // ninguna.
  [3.2, 1.5, 1, -1.45, -.3, 1.5, 1.5, 0, 3.2, .4, 3.2, .95, 1.6, 1.3, 1.6, 1.85, 0, 9, 0]
];
export const SHAPE_COUNT = SHAPES.length;

export type Surface = { y: number; nx: number; ny: number; nz: number };

export function surface(shape: number, x: number, z: number): Surface {
  const d = SHAPES[shape]!;
  // t y su gradiente en X/Z. En modo 1 manda el eje más alejado del centro, así
  // que el gradiente es axial y la normal de cada faldón sale estable.
  let t: number, gx: number, gz: number;
  if (d[2]) {
    const ax = (x - d[3]!) / d[5]!, az = (z - d[4]!) / d[6]!;
    if (Math.abs(ax) > Math.abs(az)) { t = Math.abs(ax); gx = Math.sign(ax) / d[5]!; gz = 0; }
    else { t = Math.abs(az); gx = 0; gz = Math.sign(az) / d[6]!; }
  } else { t = x * d[3]! + z * d[4]!; gx = d[3]!; gz = d[4]!; }

  let h = 0, k = 0;
  for (let i = 7; i < d.length - 2; i += 2) {
    if (t <= d[i + 2]!) {
      k = (d[i + 3]! - d[i + 1]!) / (d[i + 2]! - d[i]!);
      h = d[i + 1]! + (t - d[i]!) * k;
      break;
    }
  }
  let sx = k * gx, sz = k * gz;
  // Embudo y caballón se suman al perfil ya resuelto. El relieve alrededor de la
  // boca es llano en las seis formas —lo vigila simtest—, así que en la práctica
  // no hay dos pendientes que competir: el cono manda dentro de su radio.
  // `dr` es la pendiente radial del tramo, positiva cuesta arriba hacia fuera.
  const fx = x - d[0]!, fz = z - d[1]!, fr = Math.hypot(fx, fz) || 1e-9;
  let dr = 0;
  if (fr < MOUTH_R) h -= FUNNEL_D;         // fondo plano: ahí ya no hay suelo que pisar
  else if (fr < FUNNEL_R) {
    dr = (RIM_H + FUNNEL_D) / (FUNNEL_R - MOUTH_R);
    h += -FUNNEL_D + (fr - MOUTH_R) * dr;
  } else if (fr < FUNNEL_R + RIM_W) {
    dr = -RIM_H / RIM_W;
    h += RIM_H + (fr - FUNNEL_R) * dr;
  }
  sx += fx / fr * dr; sz += fz / fr * dr;
  const l = Math.hypot(sx, 1, sz);
  return { y: FLOOR + h, nx: -sx / l, ny: 1 / l, nz: -sz / l };
}
