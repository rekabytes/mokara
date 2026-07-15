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
uniform float uReducedMotion;

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
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p = m * p * 2.0;
    a *= 0.5;
  }
  return v;
}

mat2 rot(float a) {
  float c = cos(a), s = sin(a);
  return mat2(c, -s, s, c);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution.xy;
  float ar = uResolution.x / uResolution.y;

  vec2 p = uv;
  p.x *= ar;

  float t = uTime * 0.055 * (1.0 - uReducedMotion);

  // Parallax: mouse nudges the whole field
  vec2 mOff = (uMouse - 0.5);
  p += mOff * 0.10;

  // Two-level domain warping with rotation = silky, fluid flow
  vec2 q = vec2(
    fbm(p + t),
    fbm(p + vec2(5.2, 1.3) - 0.7 * t)
  );

  vec2 r1 = rot(0.32 * t) * vec2(
    fbm(p + 3.4 * q + vec2(1.7, 9.2) + 0.15 * t),
    fbm(p + 3.4 * q + vec2(8.3, 2.8) + 0.126 * t)
  );

  float f = fbm(p + 4.0 * r1);

  // --- Pastel palette (kept), with brand indigo pulled in deeper ---
  vec3 cBlue     = vec3(0.62, 0.74, 0.99);
  vec3 cIndigo   = vec3(0.39, 0.40, 0.95);
  vec3 cPink     = vec3(1.00, 0.78, 0.87);
  vec3 cMint     = vec3(0.70, 0.94, 0.82);
  vec3 cLavender = vec3(0.84, 0.78, 0.99);
  vec3 cPeach    = vec3(1.00, 0.86, 0.78);

  vec3 color = mix(cBlue, cIndigo, clamp(f * f * 2.4, 0.0, 1.0));
  color = mix(color, cLavender, clamp(length(q) * 1.15, 0.0, 1.0));
  color = mix(color, cMint, clamp(r1.x * r1.x * 2.0, 0.0, 1.0));
  color = mix(color, cPeach, clamp(r1.y * r1.y * 1.4, 0.0, 1.0));
  color = mix(color, cPink, clamp(f * 1.1, 0.0, 1.0));

  // Convergence highlight → subtle depth where the flow pools
  float highlight = pow(clamp(f * 1.4 - 0.3, 0.0, 1.0), 3.0);
  color += highlight * vec3(1.0, 0.97, 0.92) * 0.22;

  // Vignette + lift to keep the soft, airy feel
  float vig = smoothstep(1.2, 0.15, length(uv - 0.5));
  color = mix(vec3(0.985, 0.988, 0.995), color, 0.82 * vig + 0.38);

  // Film grain — kills gradient banding on cheap displays
  float grain = (hash(gl_FragCoord.xy + fract(uTime)) - 0.5) * 0.022;
  color += grain;

  gl_FragColor = vec4(color, 1.0);
}
`;

const FALLBACK_GRADIENT =
  "linear-gradient(135deg,#e0e7ff 0%,#fce7f3 45%,#dbeafe 75%,#dcfce7 100%)";

// Render the shader at SCALE × the CSS size; the browser upscales the canvas
// bitmap smoothly (image-rendering: auto). For soft aurora gradients this is
// visually indistinguishable from full-res but runs on ~4× fewer pixels.
const SCALE = 0.5;

export default function AuroraBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    const gl = canvas.getContext("webgl", {
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    if (!gl) {
      canvas.style.background = FALLBACK_GRADIENT;
      return;
    }

    const compile = (type: number, src: string) => {
      const s = gl.createShader(type);
      if (!s) return null;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(s));
        gl.deleteShader(s);
        return null;
      }
      return s;
    };

    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) {
      canvas.style.background = FALLBACK_GRADIENT;
      return;
    }

    const prog = gl.createProgram();
    if (!prog) return;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error(gl.getProgramInfoLog(prog));
      canvas.style.background = FALLBACK_GRADIENT;
      return;
    }
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );

    const aPos = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const uResolution = gl.getUniformLocation(prog, "uResolution");
    const uTime = gl.getUniformLocation(prog, "uTime");
    const uMouse = gl.getUniformLocation(prog, "uMouse");
    const uReducedMotion = gl.getUniformLocation(prog, "uReducedMotion");

    let w = 0;
    let h = 0;
    const mouse = [0.5, 0.5];
    const target = [0.5, 0.5];

    const resize = () => {
      const nw = Math.max(1, Math.floor(window.innerWidth * SCALE));
      const nh = Math.max(1, Math.floor(window.innerHeight * SCALE));
      if (nw !== w || nh !== h) {
        w = nw;
        h = nh;
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
    };

    const onMouse = (e: MouseEvent) => {
      target[0] = e.clientX / window.innerWidth;
      target[1] = 1 - e.clientY / window.innerHeight;
    };

    // FPS-aware frame skipping: engage sooner (6 slow frames) so the user
    // never feels sustained lag before relief kicks in.
    let raf = 0;
    let visible = true;
    let skip = false;
    let lastFrame = performance.now();
    let slowFrames = 0;
    const start = performance.now();

    const render = () => {
      raf = requestAnimationFrame(render);
      if (!visible) return;

      const now = performance.now();
      const dt = now - lastFrame;
      lastFrame = now;

      if (dt > 20) {
        slowFrames = Math.min(slowFrames + 1, 20);
      } else if (slowFrames > 0) {
        slowFrames -= 1;
      }
      const throttled = slowFrames > 6;
      if (throttled) {
        skip = !skip;
        if (skip) return;
      }

      resize();
      mouse[0] += (target[0] - mouse[0]) * 0.045;
      mouse[1] += (target[1] - mouse[1]) * 0.045;

      const t = (now - start) / 1000;
      gl.uniform2f(uResolution, w, h);
      gl.uniform1f(uTime, t);
      gl.uniform2f(uMouse, mouse[0], mouse[1]);
      gl.uniform1f(uReducedMotion, reducedMotion ? 1.0 : 0.0);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    };

    const onVisibility = () => {
      visible = !document.hidden;
      if (visible) lastFrame = performance.now();
    };

    const onContextLost = (e: Event) => {
      e.preventDefault();
      cancelAnimationFrame(raf);
    };
    const onContextRestored = () => {
      lastFrame = performance.now();
      render();
    };

    canvas.addEventListener("webglcontextlost", onContextLost, false);
    canvas.addEventListener("webglcontextrestored", onContextRestored, false);
    window.addEventListener("resize", resize);
    window.addEventListener("mousemove", onMouse);
    document.addEventListener("visibilitychange", onVisibility);

    resize();
    if (reducedMotion) {
      gl.uniform2f(uResolution, w, h);
      gl.uniform1f(uTime, 12.0);
      gl.uniform2f(uMouse, 0.5, 0.5);
      gl.uniform1f(uReducedMotion, 1.0);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    } else {
      render();
    }

    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      canvas.removeEventListener("webglcontextrestored", onContextRestored);
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
        imageRendering: "auto",
        background: FALLBACK_GRADIENT,
      }}
    />
  );
}
