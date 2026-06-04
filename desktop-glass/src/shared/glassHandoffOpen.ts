/**
 * Injectable handoff URL opener (shared — no Electron).
 */

export type GlassHandoffOpenResult =
  | { ok: true; url: string }
  | { ok: false; url: string; error: string; copiedToClipboard: boolean };

export type GlassHandoffOpenFn = (url: string) => Promise<GlassHandoffOpenResult>;

let handoffOpenImpl: GlassHandoffOpenFn | null = null;

export function setGlassHandoffOpenImpl(impl: GlassHandoffOpenFn | null): void {
  handoffOpenImpl = impl;
}

export async function openGlassHandoffUrl(url: string): Promise<GlassHandoffOpenResult> {
  if (!handoffOpenImpl) {
    return { ok: false, url, error: "Handoff opener not configured", copiedToClipboard: false };
  }
  return handoffOpenImpl(url);
}
