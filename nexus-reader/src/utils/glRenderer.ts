/**
 * WebGL SDF 字体渲染器
 * 核心：使用有向距离场 (SDF) 技术在 GPU 端直接绘制布局网格
 */

const VS_SOURCE = `
    attribute vec2 a_position;
    attribute vec2 a_texCoord;
    varying vec2 v_texCoord;
    uniform vec2 u_resolution;

    void main() {
        vec2 zeroToOne = a_position / u_resolution;
        vec2 zeroToTwo = zeroToOne * 2.0;
        vec2 clipSpace = zeroToTwo - 1.0;
        gl_Position = vec4(clipSpace * vec2(1, -1), 0, 1);
        v_texCoord = a_texCoord;
    }
`;

const FS_SOURCE = `
    precision mediump float;
    uniform sampler2D u_fontTexture;
    uniform vec4 u_textColor;
    varying vec2 v_texCoord;

    void main() {
        float distance = texture2D(u_fontTexture, v_texCoord).a;
        // 使用 smoothstep 进行抗锯齿处理
        float alpha = smoothstep(0.45, 0.55, distance);
        gl_FragColor = vec4(u_textColor.rgb, u_textColor.a * alpha);
    }
`;

export class GLRenderer {
  private gl: WebGLRenderingContext;
  private program: WebGLProgram;

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl', { antialias: true });
    if (!gl) throw new Error('WebGL not supported');
    this.gl = gl;
    this.program = this.createProgram(VS_SOURCE, FS_SOURCE);
  }

  private createProgram(vs: string, fs: string): WebGLProgram {
    const gl = this.gl;
    const vertexShader = this.loadShader(gl.VERTEX_SHADER, vs);
    const fragmentShader = this.loadShader(gl.FRAGMENT_SHADER, fs);
    const program = gl.createProgram()!;
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    return program;
  }

  private loadShader(type: number, source: string): WebGLShader {
    const shader = this.gl.createShader(type)!;
    this.gl.shaderSource(shader, source);
    this.gl.compileShader(shader);
    return shader;
  }

  /**
   * 根据布局网格绘制页面
   */
  public renderMesh(buffer: SharedArrayBuffer, charCount: number, options: { width: number, height: number, color: string }) {
    const gl = this.gl;
    const data = new Float32Array(buffer);

    gl.viewport(0, 0, options.width, options.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(this.program);

    // 这里仅展示核心思路：
    // 1. 根据 data 中的 charCode 从 Atlas 获取纹理坐标
    // 2. 构造顶点缓冲区
    // 3. 执行 drawArrays

    console.log(`🚀 Rendering ${charCount} chars via GPU...`);
  }
}
