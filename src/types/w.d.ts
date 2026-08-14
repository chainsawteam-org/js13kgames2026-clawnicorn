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

interface ImportMeta { readonly env: { readonly PROD: boolean } }
