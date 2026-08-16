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
// premio resbala en vez de teletransportarse.
export const FLOOR = -3.225;
// Límites jugables del montón; la plataforma visible se prolonga algo más allá
// para llenar el mueble sin alterar el balance de colisiones.
export const X0 = -3.7, X1 = 3.7, Z0 = -2.1, Z1 = 2.1;
export const MOUTH_R = .7;

export const SHAPES: number[][] = [
  // Plana: la referencia, con la boca en el centro del frente.
  [3, 1.5, 0, 0, 1, 0, 0, -9, 0, 9, 0],
  // Pirámide central.
  [-3, 1.5, 1, .35, -.35, 1.45, 1.025, 0, .72, 1, 0, 9, 0],
  // Terrazas que suben hacia el fondo; la boca vive en el llano del frente.
  [-3, 1.5, 0, 0, 1, 0, 0, -2.1, .52, -1.1, .52, -.85, .28, -.55, .28, -.25, 0, 9, 0],
  // Escalones laterales: alto a la izquierda, boca en la derecha llana.
  [3, 1.5, 0, 1, 0, 0, 0, -3.7, .5, -1.4, .5, -1.1, .25, -.4, .25, -.1, 0, 9, 0],
  // Cresta central en |x|: dos pasillos a los lados y la boca en uno de ellos.
  [-3.35, 1.5, 1, 0, 0, 1.2, 99, 0, .6, .55, .6, .75, .3, 1, .3, 1.25, 0, 9, 0],
  // Terrazas concéntricas: tarta de tres pisos y boca en la esquina llana.
  [3.2, 1.5, 1, 0, -.15, 1.75, 1.1, 0, .6, .42, .6, .52, .34, .72, .34, .82, 0, 9, 0]
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
  const sx = k * gx, sz = k * gz, l = Math.hypot(sx, 1, sz);
  return { y: FLOOR + h, nx: -sx / l, ny: 1 / l, nz: -sz / l };
}
