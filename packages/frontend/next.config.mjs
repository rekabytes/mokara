import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..");

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Minimal self-contained server bundle: .next/standalone holds server.js plus
  // only the traced files, which is what makes a ~40 MB runtime image possible
  // instead of shipping node_modules and the build toolchain.
  output: "standalone",
  // Required in a pnpm workspace: without it the traced file list stops at the
  // package boundary and the standalone bundle cannot resolve workspace files.
  // projectRoot is the same value turbopack.root uses below.
  outputFileTracingRoot: projectRoot,
  turbopack: {
    root: projectRoot,
  },
};

export default nextConfig;
