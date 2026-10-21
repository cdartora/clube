import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: {
          // O wrangler.jsonc traz o Access de produção; nos testes vale o DEV_USER_EMAIL.
          ACCESS_TEAM_DOMAIN: "",
          ACCESS_AUD: "",
          TEST_MIGRATIONS: await readD1Migrations("./drizzle/migrations"),
        },
      },
    })),
  ],
  test: {
    setupFiles: ["./test/apply-migrations.ts"],
  },
});
