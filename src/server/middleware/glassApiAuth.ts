import type { NextFunction, Request, Response } from "express";

export function getGlassApiSecret(): string | undefined {
  const secret = process.env.GLASS_API_SECRET?.trim();
  return secret || undefined;
}

/** When GLASS_API_SECRET is set, require Bearer token on protected Glass API routes. */
export function glassApiAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const secret = getGlassApiSecret();
  if (!secret) {
    next();
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const token = authHeader.slice("Bearer ".length).trim();
  if (token !== secret) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  next();
}
