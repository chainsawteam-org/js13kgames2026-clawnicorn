type Model = {
  vertices: number[];
  indices?: number[];
  verticesBuffer?: WebGLBuffer;
  indicesBuffer?: WebGLBuffer;
};

type Node = WSettings & {
  n: string;
  type?: keyof typeof models | "group" | "camera" | "light";
  m?: DOMMatrix;
};

const cube: Model = { vertices: [
  .5,.5,.5,-.5,.5,.5,-.5,-.5,.5,.5,.5,.5,-.5,-.5,.5,.5,-.5,.5,
  .5,.5,-.5,.5,.5,.5,.5,-.5,.5,.5,.5,-.5,.5,-.5,.5,.5,-.5,-.5,
  .5,.5,-.5,-.5,.5,-.5,-.5,.5,.5,.5,.5,-.5,-.5,.5,.5,.5,.5,.5,
  -.5,-.5,.5,.5,.5,.5,.5,.5,-.5,-.5,-.5,.5,.5,-.5,-.5,-.5,-.5,-.5,
  .5,-.5,.5,.5,-.5,-.5,.5,.5,-.5,.5,-.5,.5,.5,.5,-.5,
  -.5,-.5,-.5,-.5,-.5,.5,-.5,.5,.5,-.5,-.5,-.5,-.5,.5,.5,-.5,.5,-.5
] };

const pyramid: Model = { vertices: [
  -.5,-.5,.5,.5,-.5,.5,0,.5,0,.5,-.5,.5,.5,-.5,-.5,0,.5,0,
  .5,-.5,-.5,-.5,-.5,-.5,0,.5,0,-.5,-.5,-.5,-.5,-.5,.5,0,.5,0,
  .5,-.5,.5,-.5,-.5,.5,-.5,-.5,-.5,.5,-.5,.5,-.5,-.5,-.5,.5,-.5,-.5
] };

const sphere: Model = (() => {
  const vertices: number[] = [], indices: number[] = [], precision = 20;
  for (let j = 0; j <= precision; j++) {
    const aj = j * Math.PI / precision;
    for (let i = 0; i <= precision; i++) {
      const ai = 2 * i * Math.PI / precision;
      vertices.push(
        Math.sin(ai) * Math.sin(aj) / 2,
        Math.cos(aj) / 2,
        Math.cos(ai) * Math.sin(aj) / 2
      );
      if (i < precision && j < precision) {
        const a = j * (precision + 1) + i, b = a + precision + 1;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  }
  return { vertices, indices };
})();

const models = { cube, pyramid, sphere };
const nodes: Record<string, Node> = {};
let projection = new DOMMatrix(), ambient = .2, objectCount = 0;
let positionLocation: number, colorLocation: number;
let pvLocation: WebGLUniformLocation, modelLocation: WebGLUniformLocation;
let lightLocation: WebGLUniformLocation, ambientLocation: WebGLUniformLocation;

const color = (value: string) => {
  const short = value.length < 5;
  return [...value.replace("#", "").match(short ? /./g : /../g)!
    .map(part => +("0x" + part) / (short ? 15 : 255)), 1];
};

const matrix = (node: Node) => new DOMMatrix()
  .translateSelf(node.x || 0, node.y || 0, node.z || 0)
  .rotateSelf(node.rx || 0, node.ry || 0, node.rz || 0)
  .scaleSelf(node.w ?? 1, node.h ?? 1, node.d ?? 1);

function compile(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return shader;
}

function setState(settings: WSettings, type?: Node["type"]) {
  const name = settings.n ||= "o" + objectCount++;
  if (settings.size) settings.w = settings.h = settings.d = settings.size;
  const old = nodes[name];
  const node = nodes[name] = { ...old, ...settings, n: name, type: type || old?.type };
  if (settings.fov) {
    const f = 1 / Math.tan(settings.fov * Math.PI / 180);
    projection = new DOMMatrix([
      f / (W.canvas.width / W.canvas.height),0,0,0, 0,f,0,0,
      0,0,-1001/999,-1, 0,0,-2002/999,0
    ]);
  }
  const model = node.type && models[node.type as keyof typeof models];
  if (model && !model.verticesBuffer) {
    const gl = W.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, model.verticesBuffer = gl.createBuffer()!);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(model.vertices), gl.STATIC_DRAW);
    if (model.indices) {
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, model.indicesBuffer = gl.createBuffer()!);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(model.indices), gl.STATIC_DRAW);
    }
  }
}

function draw() {
  requestAnimationFrame(draw);
  const gl = W.gl, camera = nodes.camera, light = nodes.light;
  if (!camera || !light) return;
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  const view = matrix(camera).invertSelf().preMultiplySelf(projection);
  gl.uniformMatrix4fv(pvLocation, false, view.toFloat32Array());
  gl.uniform3f(lightLocation, light.x || 0, light.y || 0, light.z || 0);
  gl.uniform1f(ambientLocation, ambient);
  for (const name in nodes) {
    const node = nodes[name]!;
    node.m = matrix(node);
    if (node.g && nodes[node.g]?.m) node.m.preMultiplySelf(nodes[node.g]!.m!);
    const model = node.type && models[node.type as keyof typeof models];
    if (!model) continue;
    gl.uniformMatrix4fv(modelLocation, false, node.m.toFloat32Array());
    gl.bindBuffer(gl.ARRAY_BUFFER, model.verticesBuffer!);
    gl.vertexAttribPointer(positionLocation, 3, gl.FLOAT, false, 0, 0);
    gl.vertexAttrib4fv(colorLocation, color(node.b || "888"));
    if (model.indices) {
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, model.indicesBuffer!);
      gl.drawElements(gl.TRIANGLES, model.indices.length, gl.UNSIGNED_SHORT, 0);
    } else gl.drawArrays(gl.TRIANGLES, 0, model.vertices.length / 3);
  }
}

export const W = {
  canvas: undefined as unknown as HTMLCanvasElement,
  gl: undefined as unknown as WebGL2RenderingContext,
  reset(canvas: HTMLCanvasElement) {
    W.canvas = canvas;
    const gl = W.gl = canvas.getContext("webgl2")!;
    const program = gl.createProgram()!;
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER,
      "#version 300 es\nprecision highp float;in vec4 p,c;uniform mat4 v,m;out vec4 q,k;void main(){gl_Position=v*(q=m*p);k=c;}"));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER,
      "#version 300 es\nprecision highp float;in vec4 q,k;uniform vec3 l;uniform float a;out vec4 c;void main(){c=vec4(k.rgb*(dot(l,-normalize(cross(dFdx(q.xyz),dFdy(q.xyz))))+a),k.a);}"));
    gl.linkProgram(program);
    gl.useProgram(program);
    positionLocation = gl.getAttribLocation(program, "p");
    colorLocation = gl.getAttribLocation(program, "c");
    gl.enableVertexAttribArray(positionLocation);
    pvLocation = gl.getUniformLocation(program, "v")!;
    modelLocation = gl.getUniformLocation(program, "m")!;
    lightLocation = gl.getUniformLocation(program, "l")!;
    ambientLocation = gl.getUniformLocation(program, "a")!;
    gl.enable(gl.CULL_FACE);
    gl.enable(gl.DEPTH_TEST);
    W.clearColor("fff");
    W.light({ y: -1 });
    W.camera({ fov: 30 });
    requestAnimationFrame(draw);
  },
  clearColor(value: string) { W.gl.clearColor(...color(value) as [number, number, number, number]); },
  ambient(value: number) { ambient = value; },
  group(settings: WSettings) { setState(settings, "group"); },
  cube(settings: WSettings) { setState(settings, "cube"); },
  pyramid(settings: WSettings) { setState(settings, "pyramid"); },
  sphere(settings: WSettings) { setState(settings, "sphere"); },
  camera(settings: WSettings) { settings.n = "camera"; setState(settings, "camera"); },
  light(settings: WSettings) { settings.n = "light"; setState(settings, "light"); },
  move(settings: WSettings) { setState(settings); }
};
