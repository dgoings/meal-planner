import { defineConfig, type Plugin } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

// Convex bundles a `.wasm` import as a compiled `WebAssembly.Module`, which
// Convex Auth's password hashing relies on. Load it the same way in tests.
const wasmModules: Plugin = {
  name: "wasm-modules",
  enforce: "pre",
  load(id) {
    if (!id.endsWith(".wasm")) return null;
    return `import { readFileSync } from "node:fs";\nexport default new WebAssembly.Module(readFileSync(${JSON.stringify(id)}));`;
  },
};

export default defineConfig({
  plugins: [wasmModules],
  resolve: {
    alias: { "@": projectRoot },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    // Transform the password hasher so its `.wasm` import goes through the
    // plugin above instead of Node's own WebAssembly loader.
    server: { deps: { inline: ["password-hash-wasm"] } },
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["components/**/*.tsx", "convex/**/*.ts", "lib/**/*.ts"],
      exclude: ["convex/_generated/**", "convex/seed.ts", "convex/testing.helpers.ts"],
      thresholds: {
        // Vitest 5/V8 counts JSX and generated function branches more
        // precisely than Vitest 3. Keep each floor just below the audited
        // baseline so coverage regressions fail CI without retaining the old,
        // incompatible branch metric.
        statements: 70,
        branches: 60,
        functions: 75,
        lines: 70,
      },
    },
  },
});
