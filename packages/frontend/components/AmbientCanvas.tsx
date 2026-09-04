"use client";

import { useEffect, useRef } from "react";

// Ambient WebGL field behind the landing page: three slow-drifting soft color
// blobs (the app's accent hues at ~6-10%) over the base background, plus fine
// grain and a gentle pointer parallax. Deliberately quiet — a texture, not a
// light show.
//
// Behaviour contract:
//  - prefers-reduced-motion → renders ONE static frame, no rAF loop, no pointer
//  - tab hidden → loop paused (visibilitychange)
//  - no WebGL → canvas stays transparent, the body gradient shows through
//  - renders at half resolution (soft field, cheap GPU); canvas is aria-hidden

const VERT = `
attribute vec2 a_pos;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const FRAG = `
precision highp float;
uniform vec2 u_res;
uniform float u_t;
uniform vec2 u_m; // smoothed pointer, -1..1

float gauss(vec2 p, vec2 c, float r) {
  float d = length(p - c);
  return exp(-(d * d) / (r * r));
}

void main() {
  vec2 p = gl_FragCoord.xy / u_res.y; // aspect-corrected, y up
  float t = u_t * 0.05;
  vec2 m = u_m * 0.06;

  vec3 base = vec3(0.965, 0.969, 0.984); // #f6f7fb
  vec3 c = base;

  // indigo, top-left drift
  c += vec3(0.388, 0.400, 0.945) * 0.10 *
       gauss(p, vec2(0.30 + 0.12 * sin(t), 1.15 + 0.10 * cos(t * 1.3)) + m, 0.75);
  // pink, right drift
  c += vec3(0.925, 0.298, 0.616) * 0.06 *
       gauss(p, vec2(1.45 + 0.10 * cos(t * 0.8), 0.35 + 0.12 * sin(t * 1.1)) - m, 0.70);
  // sky, bottom-center drift
  c += vec3(0.055, 0.647, 0.914) * 0.05 *
       gauss(p, vec2(0.85 + 0.14 * sin(t * 0.6), -0.15 + 0.08 * cos(t)) + m * 0.5, 0.80);

  // fine grain so the gradient never bands
  float g = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  c += (g - 0.5) * 0.016;

  gl_FragColor = vec4(c, 1.0);
}`;

export function AmbientCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);

  // Syncs with the GPU lifecycle: compile, loop, listeners, teardown.
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", { antialias: false, alpha: true });
    if (!gl) return;

    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type);
      if (!sh) return null;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) return null;
      return sh;
    };
    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return;
    const prog = gl.createProgram();
    if (!prog) return;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "a_pos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(prog, "u_res");
    const uT = gl.getUniformLocation(prog, "u_t");
    const uM = gl.getUniformLocation(prog, "u_m");

    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const pointer = { x: 0, y: 0, tx: 0, ty: 0 };

    const resize = () => {
      // half-resolution is plenty for a soft field and keeps the GPU idle
      const scale = Math.min(devicePixelRatio || 1, 2) * 0.5;
      canvas.width = Math.max(1, Math.floor(innerWidth * scale));
      canvas.height = Math.max(1, Math.floor(innerHeight * scale));
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    resize();
    addEventListener("resize", resize);

    const onMove = (e: PointerEvent) => {
      pointer.tx = (e.clientX / innerWidth) * 2 - 1;
      pointer.ty = -((e.clientY / innerHeight) * 2 - 1);
    };
    if (!reduced) addEventListener("pointermove", onMove);

    const draw = (t: number) => {
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uT, t);
      gl.uniform2f(uM, pointer.x, pointer.y);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    let raf = 0;
    const t0 = performance.now();
    const frame = (now: number) => {
      pointer.x += (pointer.tx - pointer.x) * 0.03;
      pointer.y += (pointer.ty - pointer.y) * 0.03;
      draw((now - t0) / 1000);
      raf = requestAnimationFrame(frame);
    };
    const onVisibility = () => {
      cancelAnimationFrame(raf);
      if (reduced) draw(7.3);
      else if (!document.hidden) raf = requestAnimationFrame(frame);
    };
    document.addEventListener("visibilitychange", onVisibility);

    if (reduced) draw(7.3);
    else raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      removeEventListener("resize", resize);
      removeEventListener("pointermove", onMove);
      document.removeEventListener("visibilitychange", onVisibility);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 h-full w-full"
    />
  );
}
