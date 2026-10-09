"use client";

import { useEffect, useRef, useState } from "react";
import { HOME_FIELD } from "@/lib/motion";

// Deform a small line mesh in the vertex shader instead of shading every pixel.
const VERTEX = `
attribute vec2 a_position;
uniform vec2 u_resolution;
uniform vec2 u_pointer;
uniform float u_active;
varying float v_alpha;
void main() {
  vec2 uv = a_position;
  uv.y -= sin(uv.x * 5.0) * 0.12 + sin(uv.x * 9.0) * 0.035;
  vec2 delta = (uv - u_pointer) * vec2(u_resolution.x / u_resolution.y, 1.0);
  float influence = max(0.0, 1.0 - dot(delta, delta) * 3.0);
  influence = influence * influence * u_active;
  uv.y -= influence * 0.10;
  float sides = smoothstep(0.20, 0.47, abs(uv.x - 0.5));
  float edge = smoothstep(0.0, 0.12, uv.y) * smoothstep(0.0, 0.18, 1.0 - uv.y);
  v_alpha = sides * edge * (0.20 + influence * 0.16);
  gl_Position = vec4(uv * 2.0 - 1.0, 0.0, 1.0);
}
`;
const FRAGMENT = `
precision mediump float;
varying float v_alpha;
void main() { gl_FragColor = vec4(0.141, 0.333, 0.875, v_alpha); }
`;

export function HomeField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pausedRef = useRef(false);
  const updateRef = useRef<(() => void) | null>(null);
  const [paused, setPaused] = useState(false);
  const [available, setAvailable] = useState(false);

  // Syncs GPU resources and on-demand rendering with pointer, viewport, and OS preferences.
  useEffect(() => {
    const canvas = canvasRef.current;
    const host = canvas?.parentElement;
    if (!canvas || !host) return;
    const gl = canvas.getContext("webgl", {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      powerPreference: "low-power",
    });
    if (!gl) return;

    const shaders: WebGLShader[] = [];
    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type);
      if (!shader) return null;
      shaders.push(shader);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null;
    };
    const vertex = compile(gl.VERTEX_SHADER, VERTEX);
    const fragment = compile(gl.FRAGMENT_SHADER, FRAGMENT);
    const program = gl.createProgram();
    const buffer = gl.createBuffer();
    const release = () => {
      shaders.forEach((shader) => gl.deleteShader(shader));
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
    };
    if (!vertex || !fragment || !program || !buffer) {
      release();
      return;
    }
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      release();
      return;
    }
    gl.useProgram(program);

    const points: number[] = [];
    for (let row = 0; row < HOME_FIELD.lines; row++) {
      const y = (row + 0.5) / HOME_FIELD.lines;
      for (let segment = 0; segment < HOME_FIELD.segments; segment++) {
        points.push(segment / HOME_FIELD.segments, y, (segment + 1) / HOME_FIELD.segments, y);
      }
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(points), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, "a_position");
    if (position < 0) {
      release();
      return;
    }
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    gl.clearColor(0, 0, 0, 0);
    const resolution = gl.getUniformLocation(program, "u_resolution");
    const pointerLocation = gl.getUniformLocation(program, "u_pointer");
    const activeLocation = gl.getUniformLocation(program, "u_active");
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    const inputPreference = matchMedia("(hover: hover) and (pointer: fine)");
    let reduced = preference.matches;
    let finePointer = inputPreference.matches;
    let inView = true;
    let lost = false;
    let raf = 0;
    let previous = 0;
    let bounds = host.getBoundingClientRect();
    let boundsDirty = false;
    const pointer = { x: 0.5, y: 0.5, targetX: 0.5, targetY: 0.5, active: 0, targetActive: 0 };
    const enabled = () => !pausedRef.current && !reduced && finePointer;
    const visible = () => inView && !document.hidden && !lost;
    const draw = () => {
      if (!visible()) return;
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform2f(resolution, canvas.width, canvas.height);
      gl.uniform2f(pointerLocation, pointer.x, pointer.y);
      gl.uniform1f(activeLocation, pointer.active);
      gl.drawArrays(gl.LINES, 0, points.length / 2);
    };
    const settled = () =>
      Math.max(
        Math.abs(pointer.targetX - pointer.x),
        Math.abs(pointer.targetY - pointer.y),
        Math.abs(pointer.targetActive - pointer.active)
      ) < HOME_FIELD.settleThreshold;
    const frame = (now: number) => {
      raf = 0;
      if (!enabled() || !visible()) return;
      const delta = previous
        ? Math.min(now - previous, HOME_FIELD.maxDelta)
        : HOME_FIELD.initialDelta;
      previous = now;
      const blend = 1 - Math.exp(-delta / HOME_FIELD.pointerResponse);
      pointer.x += (pointer.targetX - pointer.x) * blend;
      pointer.y += (pointer.targetY - pointer.y) * blend;
      pointer.active += (pointer.targetActive - pointer.active) * blend;
      const done = settled();
      if (done) {
        pointer.x = pointer.targetX;
        pointer.y = pointer.targetY;
        pointer.active = pointer.targetActive;
      }
      draw();
      if (!done) raf = requestAnimationFrame(frame);
      else canvas.dataset.motion = "idle";
    };
    const wake = () => {
      if (raf || !enabled() || !visible() || settled()) return;
      previous = 0;
      canvas.dataset.motion = "running";
      raf = requestAnimationFrame(frame);
    };
    const update = () => {
      cancelAnimationFrame(raf);
      raf = 0;
      previous = 0;
      if (reduced || !finePointer) {
        pointer.active = 0;
        pointer.targetActive = 0;
      }
      canvas.dataset.motion = lost ? "unavailable" : enabled() && visible() ? "idle" : "paused";
      draw();
      wake();
      setAvailable(!reduced && finePointer && !lost);
    };
    const onPreferenceChange = (event: MediaQueryListEvent) => {
      reduced = event.matches;
      update();
    };
    const onInputChange = (event: MediaQueryListEvent) => {
      finePointer = event.matches;
      update();
    };
    updateRef.current = update;
    const resize = () => {
      bounds = host.getBoundingClientRect();
      boundsDirty = false;
      const scale = Math.min(
        devicePixelRatio || 1,
        HOME_FIELD.pixelRatio,
        Math.sqrt(HOME_FIELD.maxPixels / Math.max(1, bounds.width * bounds.height))
      );
      const width = Math.max(1, Math.round(bounds.width * scale));
      const height = Math.max(1, Math.round(bounds.height * scale));
      if (canvas.width === width && canvas.height === height) return;
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);
      draw();
    };
    const move = (event: PointerEvent) => {
      if (!enabled() || event.pointerType === "touch") return;
      if (boundsDirty) {
        bounds = host.getBoundingClientRect();
        boundsDirty = false;
      }
      pointer.targetX = (event.clientX - bounds.left) / bounds.width;
      pointer.targetY = 1 - (event.clientY - bounds.top) / bounds.height;
      pointer.targetActive = 1;
      wake();
    };
    const leave = () => {
      pointer.targetActive = 0;
      wake();
    };
    const onScroll = () => {
      boundsDirty = true;
    };
    const onLost = (event: Event) => {
      event.preventDefault();
      lost = true;
      cancelAnimationFrame(raf);
      raf = 0;
      canvas.dataset.motion = "unavailable";
      canvas.style.visibility = "hidden";
      setAvailable(false);
    };
    const resizeObserver = new ResizeObserver(resize);
    const intersectionObserver = new IntersectionObserver((entries) => {
      inView = entries.some((entry) => entry.isIntersecting);
      update();
    });
    resizeObserver.observe(host);
    intersectionObserver.observe(host);
    host.addEventListener("pointermove", move, { passive: true });
    host.addEventListener("pointerleave", leave);
    window.addEventListener("scroll", onScroll, { passive: true });
    canvas.addEventListener("webglcontextlost", onLost);
    preference.addEventListener("change", onPreferenceChange);
    inputPreference.addEventListener("change", onInputChange);
    document.addEventListener("visibilitychange", update);
    canvas.dataset.renderer = "webgl";
    resize();
    update();
    return () => {
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      host.removeEventListener("pointermove", move);
      host.removeEventListener("pointerleave", leave);
      window.removeEventListener("scroll", onScroll);
      canvas.removeEventListener("webglcontextlost", onLost);
      preference.removeEventListener("change", onPreferenceChange);
      inputPreference.removeEventListener("change", onInputChange);
      document.removeEventListener("visibilitychange", update);
      updateRef.current = null;
      delete canvas.dataset.renderer;
      delete canvas.dataset.motion;
      release();
    };
  }, []);

  return (
    <>
      <canvas ref={canvasRef} className="home-field" aria-hidden />
      {available && (
        <button
          type="button"
          className="home-motion-control"
          aria-pressed={paused}
          onClick={() => {
            const next = !paused;
            pausedRef.current = next;
            setPaused(next);
            updateRef.current?.();
          }}
        >
          {paused ? "Resume interaction" : "Pause interaction"}
          <span aria-hidden>{paused ? "▷" : "Ⅱ"}</span>
        </button>
      )}
    </>
  );
}
