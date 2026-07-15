"use client";

import { useEffect, useRef } from "react";

const VERT = `
attribute vec2 aPos;
void main() {
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

const FRAG = `
precision highp float;
uniform vec2 uResolution;
uniform float uTime;
uniform vec2 uMouse;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 m = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = m * p * 2.0;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution.xy;
  vec2 p = uv;
  p.x *= uResolution.x / uResolution.y;
  p += (uMouse - 0.5) * 0.18;

  float t = uTime * 0.04;

  vec2 q = vec2(
    fbm(p + t),
    fbm(p + vec2(5.2, 1.3) + t)
  );
  vec2 r = vec2(
    fbm(p + 4.0 * q + vec2(1.7, 9.2) + 0.15 * t),
    fbm(p + 4.0 * q + vec2(8.3, 2.8) + 0.126 * t)
  );
  float f = fbm(p + 4.0 * r);

  vec3 cBlue     = vec3(0.66, 0.76, 0.99);
  vec3 cPink     = vec3(1.00, 0.80, 0.88);
  vec3 cMint     = vec3(0.74, 0.94, 0.84);
  vec3 cLavender = vec3(0.86, 0.80, 0.99);
  vec3 cPeach    = vec3(1.00, 0.88, 0.80);

  vec3 color = mix(cBlue, cPink, clamp(f * f * 2.6, 0.0, 1.0));
  color = mix(color, cLavender, clamp(length(q) * 1.2, 0.0, 1.0));
  color = mix(color, cMint, clamp(r.x * r.x * 2.1, 0.0, 1.0));
  color = mix(color, cPeach, clamp(r.y * r.y * 1.5, 0.0, 1.0));

  float vig = smoothstep(1.25, 0.1, length(uv - 0.5));
  color = mix(vec3(0.985, 0.988, 0.995), color, 0.82 * vig + 0.35);

  gl_FragColor = vec4(color, 1.0);
}
`;

export default function AuroraBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", { antialias: true, alpha: false });
    if (!gl) {
      canvas.style.background =
        "linear-gradient(135deg,#e0e7ff 0%,#fce7f3 45%,#dbeafe 75%,#dcfce7 100%)";
      return;
    }

    const compile = (type: number, src: string) => {
      const s = gl!.createShader(type);
      if (!s) return null;
      gl!.shaderSource(s, src);
      gl!.compileShader(s);
      if (!gl!.getShaderParameter(s, gl!.COMPILE_STATUS)) {
        console.error(gl!.getShaderInfoLog(s));
        gl!.deleteShader(s);
        return null;
      }
      return s;
    };

    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return;

    const prog = gl.createProgram();
    if (!prog) return;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error(gl.getProgramInfoLog(prog));
      return;
    }
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW
    );

    const aPos = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const uResolution = gl.getUniformLocation(prog, "uResolution");
    const uTime = gl.getUniformLocation(prog, "uTime");
    const uMouse = gl.getUniformLocation(prog, "uMouse");

    let w = 0;
    let h = 0;
    const mouse = [0.5, 0.5];
    const target = [0.5, 0.5];

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const nw = Math.max(1, Math.floor(window.innerWidth * dpr));
      const nh = Math.max(1, Math.floor(window.innerHeight * dpr));
      if (nw !== w || nh !== h) {
        w = nw;
        h = nh;
        canvas!.width = w;
        canvas!.height = h;
        gl!.viewport(0, 0, w, h);
      }
    };

    const onMouse = (e: MouseEvent) => {
      target[0] = e.clientX / window.innerWidth;
      target[1] = 1 - e.clientY / window.innerHeight;
    };

    let raf = 0;
    let visible = true;
    const start = performance.now();

    const render = () => {
      raf = requestAnimationFrame(render);
      if (!visible) return;
      resize();
      mouse[0] += (target[0] - mouse[0]) * 0.04;
      mouse[1] += (target[1] - mouse[1]) * 0.04;
      const t = (performance.now() - start) / 1000;
      gl!.uniform2f(uResolution, w, h);
      gl!.uniform1f(uTime, t);
      gl!.uniform2f(uMouse, mouse[0], mouse[1]);
      gl!.drawArrays(gl!.TRIANGLES, 0, 6);
    };

    const onVisibility = () => {
      visible = !document.hidden;
    };

    window.addEventListener("resize", resize);
    window.addEventListener("mousemove", onMouse);
    document.addEventListener("visibilitychange", onVisibility);

    resize();
    render();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMouse);
      document.removeEventListener("visibilitychange", onVisibility);
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.deleteBuffer(buf);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        width: "100vw",
        height: "100vh",
        display: "block",
        zIndex: 0,
        pointerEvents: "none",
        background:
          "linear-gradient(135deg,#e0e7ff 0%,#fce7f3 45%,#dbeafe 75%,#dcfce7 100%)",
      }}
    />
  );
}
