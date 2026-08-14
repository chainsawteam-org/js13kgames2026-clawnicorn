// Geometría compartida por físicas y render. Las terrazas usan rampas entre
// niveles: no hay saltos de heightfield capaces de teletransportar un premio.
export const FLOOR = -3.225;
// Límites jugables del montón; la plataforma visible se prolonga algo más allá
// para llenar el mueble sin alterar el balance de colisiones.
export const X0 = -3.1, X1 = 3.1, Z0 = -1.75, Z1 = 1.75;
export const MOUTH_X = -2.35, MOUTH_Z = 1.05, MOUTH_R = .7;
export const SHAPE_COUNT = 3;
export type MachineShape = 0 | 1 | 2;

// centro X/Z, anchura, fondo y altura. Su huella no invade la zona protegida
// del conducto (MOUTH_R + radio del torso).
export const PYRAMID = [.35, -.35, 2.9, 2.05, .72] as const;

// Pares z/altura, de fondo a frente. Tramos iguales = terraza; distintos = rampa.
export const TERRACES = [-1.75, .52, -1.1, .52, -.85, .28, -.55, .28, -.25, 0] as const;

export type Surface = { y: number; nx: number; ny: number; nz: number };

export function surface(shape: number, x: number, z: number): Surface {
  let h = 0, sx = 0, sz = 0;
  if (shape === 1) {
    const [cx, cz, w, d, top] = PYRAMID;
    const ax = Math.abs(x - cx) / (w / 2), az = Math.abs(z - cz) / (d / 2);
    const edge = Math.max(ax, az);
    if (edge < 1) {
      h = top * (1 - edge);
      if (ax > az) sx = -Math.sign(x - cx) * top / (w / 2);
      else sz = -Math.sign(z - cz) * top / (d / 2);
    }
  } else if (shape === 2 && z < TERRACES[TERRACES.length - 2]!) {
    for (let i = 0; i < TERRACES.length - 2; i += 2) {
      const z0 = TERRACES[i]!, y0 = TERRACES[i + 1]!, z1 = TERRACES[i + 2]!, y1 = TERRACES[i + 3]!;
      if (z <= z1) { sz = (y1 - y0) / (z1 - z0); h = y0 + (z - z0) * sz; break; }
    }
  }
  const l = Math.hypot(sx, 1, sz);
  return { y: FLOOR + h, nx: -sx / l, ny: 1 / l, nz: -sz / l };
}
