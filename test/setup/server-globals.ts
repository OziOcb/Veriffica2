// Provide Nitro/H3 server globals that are normally auto-imported by Nitro
// but are missing when server files are imported in the nuxt test environment.
// Note: useRuntimeConfig is a Nuxt/Nitro global already provided by the
// @nuxt/test-utils nuxt environment — it does not need to be polyfilled here.
import {
  createError,
  defineEventHandler,
  getValidatedQuery,
  readValidatedBody,
  setResponseStatus,
} from "h3";

Object.assign(globalThis, {
  defineEventHandler,
  createError,
  getValidatedQuery,
  readValidatedBody,
  setResponseStatus,
});
