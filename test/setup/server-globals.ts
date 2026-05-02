// Provide Nitro/H3 server globals that are normally auto-imported by Nitro
// but are missing when server files are imported in the nuxt test environment.
import { createError, defineEventHandler } from "h3";

Object.assign(globalThis, { defineEventHandler, createError });
