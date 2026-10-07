/**
 * Luz ambiente do palco em WebGL puro (sem biblioteca): holofote quente que respira
 * sobre a mesa, contraluz azul e granulação de filme. É só uma camada a mais —
 * sem WebGL, o CSS já desenha a mesma iluminação estática.
 *
 * Custos sob controle: resolução reduzida (luz é difusa), no máximo ~30 quadros por
 * segundo, pausa com a aba oculta e libera o contexto ao sair da tela.
 */

const VERTEX = `
attribute vec2 aPosition;
void main() { gl_Position = vec4(aPosition, 0.0, 1.0); }
`;

const FRAGMENT = `
precision mediump float;
uniform vec2 uResolution;
uniform float uTime;
uniform float uIntensity;
const vec3 WARM = vec3(1.0, 0.56, 0.2);
const vec3 COOL = vec3(0.28, 0.45, 1.0);

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  float aspect = uResolution.x / uResolution.y;
  float t = uTime * 0.16;

  // Holofote de cima, oscilando devagar sobre o centro do palco.
  vec2 cone = uv - vec2(0.5 + sin(t) * 0.05, 0.98);
  cone.x *= aspect * 1.35;
  float spot = smoothstep(1.05, 0.0, length(cone)) * (0.85 + 0.15 * sin(t * 2.3));

  // Brilho sobre a mesa, onde as cartas projetam sombra.
  vec2 table = uv - vec2(0.5, 0.2);
  table.x *= aspect * 0.55;
  float tableGlow = exp(-dot(table, table) * 14.0);

  // Contraluz azul que varre as laterais.
  float sweep = exp(-pow((uv.x - 0.5 - cos(t * 0.9) * 0.38) * 3.2, 2.0)) * smoothstep(0.05, 0.75, uv.y);

  vec3 color = WARM * (spot * 0.5 + tableGlow * 0.32) + COOL * sweep * 0.3;
  float alpha = clamp(spot * 0.5 + tableGlow * 0.32 + sweep * 0.3, 0.0, 1.0);
  float grain = (hash(gl_FragCoord.xy + fract(uTime)) - 0.5) * 0.035;
  alpha = clamp((alpha + grain) * uIntensity, 0.0, 1.0);
  gl_FragColor = vec4(color * alpha, alpha);
}
`;

export interface TableLight {
  /** Intensidade alvo (1 = normal); a transição é suave. */
  setIntensity(value: number): void;
  stop(): void;
}

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

/**
 * Devolve null quando não há WebGL com GPU de verdade: quem chama segue só com o CSS.
 * Canvas sem luz fica escondido — com o contexto perdido, o Chromium o pinta de branco.
 */
export function startTableLight(canvas: HTMLCanvasElement): TableLight | null {
  const light = startLight(canvas);
  if (!light) canvas.hidden = true;
  return light;
}

function startLight(canvas: HTMLCanvasElement): TableLight | null {
  let gl: WebGLRenderingContext | null = null;
  try {
    // failIfMajorPerformanceCaveat: sem GPU de verdade (renderização por software), nem começa.
    gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, powerPreference: "low-power", failIfMajorPerformanceCaveat: true });
  } catch {
    gl = null;
  }
  if (!gl) return null;
  const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
  const renderer = debugInfo ? String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)) : "";
  if (/swiftshader|llvmpipe|software/i.test(renderer)) {
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return null;
  }

  const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
  const program = gl.createProgram();
  if (!vertex || !fragment || !program) return null;
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  gl.useProgram(program);

  // Um triângulo que cobre a tela inteira.
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, "aPosition");
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

  const uResolution = gl.getUniformLocation(program, "uResolution");
  const uTime = gl.getUniformLocation(program, "uTime");
  const uIntensity = gl.getUniformLocation(program, "uIntensity");

  const context = gl;
  let frame = 0;
  let lastDraw = 0;
  let intensity = 0;
  let targetIntensity = 1;
  let stopped = false;
  const startedAt = performance.now();
  // Vigia de desempenho: se o aparelho não sustenta a luz, ela se desliga sozinha.
  const frameGaps: number[] = [];
  let lastFrame = 0;

  function resize() {
    // Metade da resolução: a luz é difusa e o navegador amplia sem perda visível.
    const scale = Math.min(window.devicePixelRatio || 1, 2) * 0.5;
    const width = Math.max(1, Math.round(canvas.clientWidth * scale));
    const height = Math.max(1, Math.round(canvas.clientHeight * scale));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      context.viewport(0, 0, width, height);
    }
  }

  function stop() {
    stopped = true;
    cancelAnimationFrame(frame);
    canvas.hidden = true;
    context.getExtension("WEBGL_lose_context")?.loseContext();
  }

  function draw(now: number) {
    if (stopped) return;
    frame = requestAnimationFrame(draw);
    if (lastFrame && !document.hidden && frameGaps.length < 60) {
      frameGaps.push(now - lastFrame);
      if (frameGaps.length === 60) {
        const sorted = [...frameGaps].sort((a, b) => a - b);
        if (sorted[30] > 40) {
          stop();
          return;
        }
      }
    }
    lastFrame = now;
    if (document.hidden || now - lastDraw < 33) return;
    lastDraw = now;
    intensity += (targetIntensity - intensity) * 0.08;
    resize();
    context.uniform2f(uResolution, canvas.width, canvas.height);
    context.uniform1f(uTime, (now - startedAt) / 1000);
    context.uniform1f(uIntensity, intensity);
    context.clearColor(0, 0, 0, 0);
    context.clear(context.COLOR_BUFFER_BIT);
    context.drawArrays(context.TRIANGLES, 0, 3);
  }

  frame = requestAnimationFrame(draw);

  return {
    setIntensity(value: number) {
      targetIntensity = value;
    },
    stop,
  };
}
