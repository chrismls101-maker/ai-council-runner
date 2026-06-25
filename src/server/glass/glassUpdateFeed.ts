/**
 * Proxy Glass update assets from private GitHub Releases through iivo.ai.
 * Packaged clients cannot read github.com/releases directly when the repo is private.
 */

import type { Request, Response } from "express";
import { loadGlassUpdateManifest } from "./glassUpdateManifest.js";

const GITHUB_OWNER = "chrismls101-maker";
const GITHUB_REPO = "ai-council-runner";

export const GLASS_RELEASES_PAGE_URL =
  `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases`;

type GitHubReleaseAsset = {
  name: string;
  url: string;
  browser_download_url: string;
};

type GitHubRelease = {
  tag_name: string;
  assets: GitHubReleaseAsset[];
};

export type GlassLatestDownloadInfo = {
  ok: boolean;
  version?: string;
  tagName?: string;
  arm64Url?: string;
  x64Url?: string;
  releasesPageUrl?: string;
  reason?: string;
};

let cachedRelease: { at: number; release: GitHubRelease } | null = null;
const CACHE_MS = 60_000;

function githubToken(): string | undefined {
  const token = process.env.GITHUB_TOKEN?.trim() || process.env.GH_TOKEN?.trim();
  return token || undefined;
}

function githubHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "iivo-glass-update-proxy",
  };
  const token = githubToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

export function parseGlassVersion(tagName: string): string {
  return tagName.replace(/^v/i, "").trim();
}

export function glassDmgFilename(version: string, arch: "arm64" | "x64"): string {
  return `IIVO-Glass-${version}-${arch}.dmg`;
}

async function fetchLatestRelease(): Promise<GitHubRelease> {
  const now = Date.now();
  if (cachedRelease && now - cachedRelease.at < CACHE_MS) {
    return cachedRelease.release;
  }

  const res = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`,
    { headers: githubHeaders() },
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `GitHub release lookup failed (${res.status})${body ? `: ${body.slice(0, 200)}` : ""}`,
    );
  }

  const release = (await res.json()) as GitHubRelease;
  cachedRelease = { at: now, release };
  return release;
}

function findAsset(release: GitHubRelease, filename: string): GitHubReleaseAsset | undefined {
  return release.assets.find((asset) => asset.name === filename);
}

function proxyDownloadUrl(req: Request, filename: string): string {
  const host = req.get("x-forwarded-host") ?? req.get("host") ?? "iivo.ai";
  const proto = req.get("x-forwarded-proto") ?? req.protocol ?? "https";
  return `${proto}://${host}/api/glass/update/download/${encodeURIComponent(filename)}`;
}

function publicGithubDownloadUrl(version: string, arch: "arm64" | "x64"): string {
  const tag = version.startsWith("v") ? version : `v${version}`;
  return `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/download/${tag}/${glassDmgFilename(version, arch)}`;
}

function resolveAssetDownloadUrl(req: Request, asset: GitHubReleaseAsset): string {
  if (githubToken()) return proxyDownloadUrl(req, asset.name);
  if (asset.browser_download_url?.trim()) return asset.browser_download_url.trim();
  return proxyDownloadUrl(req, asset.name);
}

function manifestFallback(version: string, req: Request): GlassLatestDownloadInfo {
  const arm64Name = glassDmgFilename(version, "arm64");
  const x64Name = glassDmgFilename(version, "x64");
  return {
    ok: true,
    version,
    tagName: version.startsWith("v") ? version : `v${version}`,
    arm64Url: githubToken()
      ? proxyDownloadUrl(req, arm64Name)
      : publicGithubDownloadUrl(version, "arm64"),
    x64Url: githubToken()
      ? proxyDownloadUrl(req, x64Name)
      : publicGithubDownloadUrl(version, "x64"),
    releasesPageUrl: GLASS_RELEASES_PAGE_URL,
  };
}

export async function resolveLatestGlassDownloadInfo(req: Request): Promise<GlassLatestDownloadInfo> {
  try {
    const release = await fetchLatestRelease();
    const version = parseGlassVersion(release.tag_name);
    const arm64 = findAsset(release, glassDmgFilename(version, "arm64"));
    const x64 = findAsset(release, glassDmgFilename(version, "x64"));

    if (!arm64 && !x64) {
      return {
        ok: false,
        version,
        tagName: release.tag_name,
        reason: `Latest release v${version} has no IIVO-Glass DMG assets.`,
      };
    }

    return {
      ok: true,
      version,
      tagName: release.tag_name,
      arm64Url: arm64 ? resolveAssetDownloadUrl(req, arm64) : undefined,
      x64Url: x64 ? resolveAssetDownloadUrl(req, x64) : undefined,
      releasesPageUrl: GLASS_RELEASES_PAGE_URL,
    };
  } catch (err) {
    const manifest = loadGlassUpdateManifest();
    if (manifest.ok && manifest.version?.trim()) {
      return manifestFallback(manifest.version.trim(), req);
    }

    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: message };
  }
}

export async function handleGlassDownloadLatest(req: Request, res: Response): Promise<void> {
  const info = await resolveLatestGlassDownloadInfo(req);
  if (!info.ok) {
    res.status(503).json(info);
    return;
  }
  res.json(info);
}

export async function handleGlassDownloadRedirect(
  req: Request,
  res: Response,
  arch: "arm64" | "x64",
): Promise<void> {
  const info = await resolveLatestGlassDownloadInfo(req);
  const url = arch === "arm64" ? info.arm64Url : info.x64Url;

  if (!info.ok || !url) {
    res.status(503).json({
      ok: false,
      error: info.reason ?? `No ${arch} download is available for the latest release.`,
    });
    return;
  }

  res.redirect(302, url);
}

export async function handleGlassUpdateDownload(req: Request, res: Response): Promise<void> {
  const filename = String(req.params.filename ?? "").trim();
  if (!filename || filename.includes("..")) {
    res.status(400).json({ ok: false, error: "Invalid filename." });
    return;
  }

  if (!githubToken()) {
    res.status(503).json({
      ok: false,
      error: "Update downloads are not configured (GITHUB_TOKEN missing on server).",
    });
    return;
  }

  try {
    const release = await fetchLatestRelease();
    const asset = findAsset(release, filename);
    if (!asset) {
      res.status(404).json({ ok: false, error: `Release asset not found: ${filename}` });
      return;
    }

    const upstream = await fetch(asset.url, {
      headers: {
        ...githubHeaders(),
        Accept: "application/octet-stream",
      },
    });
    if (!upstream.ok || !upstream.body) {
      res.status(upstream.status).json({ ok: false, error: `Download failed (${upstream.status}).` });
      return;
    }

    res.setHeader("Content-Type", upstream.headers.get("content-type") ?? "application/octet-stream");
    const length = upstream.headers.get("content-length");
    if (length) res.setHeader("Content-Length", length);
    res.setHeader("Content-Disposition", `attachment; filename="${asset.name}"`);

    const reader = upstream.body.getReader();
    const pump = async (): Promise<void> => {
      const { done, value } = await reader.read();
      if (done) {
        res.end();
        return;
      }
      res.write(Buffer.from(value));
      await pump();
    };
    await pump();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(502).json({ ok: false, error: message });
  }
}

export async function handleGlassElectronUpdateFeed(req: Request, res: Response): Promise<void> {
  if (!githubToken()) {
    res.status(503).type("text/plain").send("GITHUB_TOKEN is not configured on the server.");
    return;
  }

  try {
    const release = await fetchLatestRelease();
    const ymlAsset = findAsset(release, "latest-mac.yml");
    if (!ymlAsset) {
      res.status(404).type("text/plain").send("latest-mac.yml not found on latest GitHub release.");
      return;
    }

    const ymlRes = await fetch(ymlAsset.url, {
      headers: {
        ...githubHeaders(),
        Accept: "application/octet-stream",
      },
    });
    if (!ymlRes.ok) {
      res.status(ymlRes.status).type("text/plain").send(`Could not fetch latest-mac.yml (${ymlRes.status}).`);
      return;
    }

    let yml = await ymlRes.text();
    for (const asset of release.assets) {
      const proxyUrl = proxyDownloadUrl(req, asset.name);
      yml = yml.split(asset.name).join(proxyUrl);
    }

    res.type("text/yaml").send(yml);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(502).type("text/plain").send(message);
  }
}

/** Rewrite manifest file paths to proxied HTTPS download URLs for packaged clients. */
export function withGlassUpdateProxyUrls(
  req: Request,
  manifest: {
    version?: string;
    downloadUrl?: string;
    darwinArm64Dmg?: string;
    darwinUniversalDmg?: string;
  },
): typeof manifest {
  const version = manifest.version?.trim();
  if (!version) return manifest;

  const arm64Name = `IIVO-Glass-${version}-arm64.dmg`;
  const proxyDmg = proxyDownloadUrl(req, arm64Name);

  return {
    ...manifest,
    downloadUrl: proxyDmg,
    darwinArm64Dmg: proxyDmg,
    darwinUniversalDmg: manifest.darwinUniversalDmg
      ? proxyDownloadUrl(req, `IIVO-Glass-${version}-universal.dmg`)
      : "",
  };
}
