type WSettings = {
  n?: string;
  g?: string;
  x?: number;
  y?: number;
  z?: number;
  rx?: number;
  ry?: number;
  rz?: number;
  w?: number;
  h?: number;
  d?: number;
  size?: number;
  b?: string;
  fov?: number;
  [key: string]: unknown;
};

declare const W: {
  gl: WebGL2RenderingContext;
  canvas: HTMLCanvasElement;
  reset(canvas: HTMLCanvasElement): void;
  camera(settings: WSettings): void;
  light(settings: WSettings): void;
  ambient(value: number): void;
  clearColor(color: string): void;
  group(settings: WSettings): void;
  cube(settings: WSettings): void;
  sphere(settings: WSettings): void;
  pyramid(settings: WSettings): void;
  move(settings: WSettings): void;
};
