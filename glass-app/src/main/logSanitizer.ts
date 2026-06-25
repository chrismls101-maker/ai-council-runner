/**
 * Install process-wide log redaction for console and stdio streams.
 */

import { sanitizeLogText, sanitizeLogTextWithEnvSecrets } from "../shared/logSanitizer.ts";

export { sanitizeLogText, sanitizeLogTextWithEnvSecrets };

let installed = false;

function sanitizeUnknownArg(arg: unknown): unknown {
  if (typeof arg === "string") return sanitizeLogTextWithEnvSecrets(arg);
  if (arg instanceof Error) {
    const copy = new Error(sanitizeLogTextWithEnvSecrets(arg.message));
    copy.name = arg.name;
    copy.stack = arg.stack ? sanitizeLogTextWithEnvSecrets(arg.stack) : undefined;
    return copy;
  }
  try {
    const json = JSON.stringify(arg);
    if (json) {
      return JSON.parse(sanitizeLogTextWithEnvSecrets(json)) as unknown;
    }
  } catch {
    /* non-serializable */
  }
  return arg;
}

function patchStreamWrite(stream: NodeJS.WriteStream, sanitizer: (chunk: string) => string): void {
  const originalWrite = stream.write.bind(stream);
  stream.write = ((chunk: unknown, encoding?: unknown, callback?: unknown) => {
    if (typeof chunk === "string") {
      return originalWrite(sanitizer(chunk), encoding as BufferEncoding, callback as (() => void) | undefined);
    }
    if (Buffer.isBuffer(chunk)) {
      const text = chunk.toString("utf8");
      const sanitized = sanitizer(text);
      if (sanitized !== text) {
        return originalWrite(
          Buffer.from(sanitized, "utf8"),
          encoding as BufferEncoding,
          callback as (() => void) | undefined,
        );
      }
    }
    return originalWrite(chunk as never, encoding as never, callback as never);
  }) as typeof stream.write;
}

/** Patch console and stdio so accidental key leaks are redacted. */
export function installLogSanitizer(): void {
  if (installed) return;
  installed = true;

  const wrap =
    (original: (...args: unknown[]) => void) =>
    (...args: unknown[]): void => {
      original(...args.map(sanitizeUnknownArg));
    };

  console.log = wrap(console.log.bind(console));
  console.info = wrap(console.info.bind(console));
  console.warn = wrap(console.warn.bind(console));
  console.error = wrap(console.error.bind(console));
  console.debug = wrap(console.debug.bind(console));

  patchStreamWrite(process.stdout, sanitizeLogTextWithEnvSecrets);
  patchStreamWrite(process.stderr, sanitizeLogTextWithEnvSecrets);
}
