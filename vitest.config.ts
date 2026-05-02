import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { defineVitestProject } from "@nuxt/test-utils/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          include: ["test/unit/*.{test,spec}.ts"],
          environment: "node",
        },
      },
      await defineVitestProject({
        resolve: {
          alias: {
            // Expose the #supabase/server virtual module so vi.mock can resolve it
            // in the Nuxt test environment.
            "#supabase/server": fileURLToPath(
              new URL(
                "./node_modules/@nuxtjs/supabase/dist/runtime/server/services/index.js",
                import.meta.url,
              ),
            ),
          },
        },
        test: {
          name: "nuxt",
          include: ["test/nuxt/*.{test,spec}.ts"],
          environment: "nuxt",
          setupFiles: ["./test/setup/server-globals.ts"],
          environmentOptions: {
            nuxt: {
              rootDir: fileURLToPath(new URL(".", import.meta.url)),
              domEnvironment: "happy-dom",
            },
          },
        },
      }),
    ],
    coverage: {
      enabled: true,
      provider: "v8",
    },
  },
});
