import type { GlassApi } from "../preload/index.ts";

declare global {
  interface Window {
    glass: GlassApi;
  }
}

export {};
