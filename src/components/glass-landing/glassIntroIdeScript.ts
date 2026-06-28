/** Glass Coder IDE intro choreography — composer, stream, preview. */

export const INTRO_IDE_PROJECT = "~/Projects/iivo-glass";

export const INTRO_IDE_COMPOSER_PROMPT =
  "Open iivo.ai in the live preview and start the dev server for IIVO Glass.";

export type IntroIdeToolStatus = "running" | "done";

export type IntroIdeStreamItem =
  | { kind: "thinking" }
  | { kind: "activity"; text: string }
  | {
      kind: "tool";
      name: string;
      label: string;
      status: IntroIdeToolStatus;
      detail?: string;
    }
  | { kind: "text"; text: string; live?: boolean };

/** Stream beats — matches GlassIdeStream transcript shapes. */
export const INTRO_IDE_STREAM_ITEMS: IntroIdeStreamItem[] = [
  { kind: "thinking" },
  { kind: "activity", text: "Reading GLASS_CONTEXT.md" },
  {
    kind: "tool",
    name: "read_file",
    label: "Read GLASS_CONTEXT.md",
    status: "done",
  },
  {
    kind: "tool",
    name: "run_terminal_cmd",
    label: "npm run dev",
    status: "running",
    detail: "Starting dev server…",
  },
  {
    kind: "tool",
    name: "run_terminal_cmd",
    label: "npm run dev",
    status: "done",
    detail: "listening on localhost:5173",
  },
  { kind: "activity", text: "Dev server ready — opening live preview" },
  {
    kind: "tool",
    name: "open_preview",
    label: "Open preview",
    status: "running",
    detail: "https://iivo.ai",
  },
  {
    kind: "tool",
    name: "open_preview",
    label: "Open preview",
    status: "done",
    detail: "https://iivo.ai",
  },
  {
    kind: "text",
    text: "Live preview ready — IIVO Glass landing is running inside the IDE.",
    live: true,
  },
];
