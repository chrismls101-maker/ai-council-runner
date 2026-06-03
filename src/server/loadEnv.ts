import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../..");
const envPath = path.join(projectRoot, ".env");

dotenv.config({ path: envPath });

export { logImageVisionStatus } from "./config/vision.js";

export function logApiKeyStatus(): void {
  console.log(
    `OPENAI_API_KEY=${process.env.OPENAI_API_KEY?.trim() ? "SET" : "MISSING"}`,
  );
  console.log(
    `ANTHROPIC_API_KEY=${process.env.ANTHROPIC_API_KEY?.trim() ? "SET" : "MISSING"}`,
  );
  console.log(
    `PERPLEXITY_API_KEY=${process.env.PERPLEXITY_API_KEY?.trim() ? "SET" : "MISSING"}`,
  );
}
