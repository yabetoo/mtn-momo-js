import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs", "esm"],
  outDir: "lib",
  dts: true,
  clean: true,
  target: "node20",
  platform: "node",
  sourcemap: false
});
