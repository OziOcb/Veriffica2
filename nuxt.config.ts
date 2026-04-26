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
  ],

  css: ["~/assets/css/main.css"],
});
