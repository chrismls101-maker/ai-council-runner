/**
 * auth.ts — better-auth configuration for IIVO
 *
 * Providers: GitHub OAuth (+ Google when added)
 * Magic link: enabled, emails via Resend (falls back to console.log in dev / when RESEND_API_KEY missing)
 * Database: PostgreSQL on Railway (DATABASE_URL)
 */

import { betterAuth } from "better-auth";
import { magicLink } from "better-auth/plugins";
import { getAuthPool } from "./authPool.js";
import { ensureUserRoleSchema, seedFounderEmail } from "./userRoles.js";

// ── Magic link email ──────────────────────────────────────────────────────────

async function sendMagicLinkEmail(to: string, url: string) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL ?? "noreply@iivo.ai";

  if (!apiKey) {
    // Dev fallback — log to console so you can click the link during local dev
    console.log(`[auth] Magic link for ${to} →\n  ${url}`);
    return;
  }

  // Lazy-import Resend so it's not required when RESEND_API_KEY is absent
  // @ts-ignore — resend not in devDeps; runtime-only when RESEND_API_KEY is set
  const { Resend } = await import("resend");
  const resend = new Resend(apiKey);
  await resend.emails.send({
    from,
    to,
    subject: "Your IIVO sign-in link",
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
        <h2 style="margin:0 0 8px;font-size:20px;color:#111">Sign in to IIVO</h2>
        <p style="margin:0 0 24px;color:#555;font-size:15px">
          Click the link below to sign in. It expires in 10 minutes.
        </p>
        <a href="${url}"
           style="display:inline-block;background:#7c3aed;color:#fff;text-decoration:none;
                  padding:12px 24px;border-radius:8px;font-size:15px;font-weight:600">
          Sign in to IIVO
        </a>
        <p style="margin:24px 0 0;color:#999;font-size:13px">
          If you didn't request this, ignore this email.
        </p>
      </div>
    `,
  });
}

// ── Social providers — only include if credentials are present ────────────────

function buildSocialProviders() {
  const providers: Record<string, { clientId: string; clientSecret: string }> = {};

  if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
    providers.github = {
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
    };
  }

  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    providers.google = {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    };
  }

  return providers;
}

// ── Auth instance ─────────────────────────────────────────────────────────────

const baseURL = process.env.NODE_ENV === "production"
  ? "https://iivo.ai"
  : "http://localhost:3001";

export const auth = betterAuth({
  baseURL,
  secret: process.env.BETTER_AUTH_SECRET ?? "dev-secret-change-in-production",

  database: {
    db: getAuthPool(),
    type: "pg",
  },

  user: {
    additionalFields: {
      role: {
        type: "string",
        required: false,
        defaultValue: "user",
        input: false,
      },
    },
  },

  emailAndPassword: { enabled: false },

  socialProviders: buildSocialProviders(),

  plugins: [
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        await sendMagicLinkEmail(email, url);
      },
      expiresIn: 600,
    }),
  ],

  trustedOrigins: [
    "https://iivo.ai",
    "http://localhost:3001",
    "http://localhost:5173",
  ],
});

export type Auth = typeof auth;

/** Ensure role column exists and FOUNDER_EMAIL is promoted on startup. */
export async function initAuthRoles(): Promise<void> {
  if (!process.env.DATABASE_URL?.trim()) return;
  try {
    const pool = getAuthPool();
    await ensureUserRoleSchema(pool);
    await seedFounderEmail(pool);
    const founder = process.env.FOUNDER_EMAIL?.trim();
    if (founder) {
      console.log(`[auth] Founder seed checked for ${founder}`);
    }
  } catch (err) {
    console.error("[auth] Role init failed:", err);
  }
}
