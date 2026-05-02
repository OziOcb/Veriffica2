// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",
  devtools: { enabled: true },

  modules: [
    "@pinia/nuxt",
    "@vueuse/nuxt",
    "@vite-pwa/nuxt",
    "@nuxt/test-utils",
    "@nuxt/eslint",
    "@nuxt/ui",
    "@nuxtjs/supabase",
  ],

  supabase: {
    types: "~/db/database.types.ts",
  },

  css: ["~/assets/css/main.css"],
});
