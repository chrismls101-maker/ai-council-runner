export const INSUFFICIENT_CREDITS_MESSAGE =
  "Not enough credits for this run. Try Direct Answer, switch to Quick mode, or add local credits in Settings.";

export const PROVIDER_FAILURE_MESSAGE =
  "The provider request failed. Your credits were refunded according to the local usage rules where applicable. Check API keys or try again.";

export const NO_SOURCES_MESSAGE =
  "No sources were returned for this run. IIVO can still answer, but source-backed confidence is lower.";

export const ROUTER_UNCERTAINTY_MESSAGE =
  "IIVO was not fully confident about the route, so it chose the safest available path.";

export const MEMORY_UNAVAILABLE_MESSAGE =
  "No relevant memory was included for this run.";

export const BENCHMARK_LOW_CONFIDENCE_MESSAGE =
  "Benchmark scores are heuristic. Use them as guidance, not proof.";

export const ROUTER_UNCERTAINTY_THRESHOLD = 70;

export const LANDING_PROMPT_CHIPS = [
  { id: "build-now-or-wait", label: "Should I build this feature now or wait?" },
  { id: "customer-wedge", label: "Find my strongest customer wedge." },
  { id: "compare-one-model", label: "Compare this decision against one model." },
  { id: "launch-risks", label: "Audit my launch risks." },
  { id: "what-is-iivo", label: "What is IIVO?" },
] as const;

export const AUTO_ROUTER_HELPER = {
  title: "What path will IIVO use?",
  intro: "Auto Router decides:",
  paths: [
    { name: "Direct Answer", detail: "simple questions" },
    { name: "Verified Search", detail: "source-backed lookup" },
    { name: "Specialist Council", detail: "serious business, product, sales, or technical decisions" },
  ],
} as const;

export const BETA_WORKSPACE_LABEL = "Local Beta Workspace";

export const BETA_STORAGE_NOTE =
  "This build uses local JSON storage and local usage simulation — not production billing or cloud accounts.";
