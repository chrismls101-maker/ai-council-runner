/** Local prompt library storage — persists in Electron's localStorage. */

export interface Prompt {
  id: string;
  title: string;
  body: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

const STORAGE_KEY = "glass:prompt-library:v1";

function generateId(): string {
  return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function loadPrompts(): Prompt[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultPrompts();
    const parsed = JSON.parse(raw) as Prompt[];
    return Array.isArray(parsed) ? parsed : defaultPrompts();
  } catch {
    return defaultPrompts();
  }
}

export function savePrompts(prompts: Prompt[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prompts));
  } catch {
    // storage full or unavailable — fail silently
  }
}

export function createPrompt(title: string, body: string, tags: string[] = []): Prompt {
  return {
    id: generateId(),
    title: title.trim(),
    body: body.trim(),
    tags,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export function updatePrompt(prompts: Prompt[], id: string, patch: Partial<Pick<Prompt, "title" | "body" | "tags">>): Prompt[] {
  return prompts.map((p) =>
    p.id === id ? { ...p, ...patch, updatedAt: Date.now() } : p,
  );
}

export function deletePrompt(prompts: Prompt[], id: string): Prompt[] {
  return prompts.filter((p) => p.id !== id);
}

export function searchPrompts(prompts: Prompt[], query: string): Prompt[] {
  const q = query.toLowerCase().trim();
  if (!q) return prompts;
  return prompts.filter(
    (p) =>
      p.title.toLowerCase().includes(q) ||
      p.body.toLowerCase().includes(q) ||
      p.tags.some((t) => t.toLowerCase().includes(q)),
  );
}

/** Starter prompts so the library isn't empty on first launch. */
function defaultPrompts(): Prompt[] {
  const now = Date.now();
  return [
    {
      id: "default_1",
      title: "Debug this error",
      body: "I'm seeing this error in my terminal. Read it carefully, identify the root cause, and give me the fix with a one-line explanation of why it happened:\n\n[paste error here]",
      tags: ["debug", "terminal"],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "default_2",
      title: "Explain this code",
      body: "Walk me through what this code does — explain the purpose, the key logic, and anything that's non-obvious. Be concise but complete:\n\n[paste code here]",
      tags: ["code", "explain"],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "default_3",
      title: "Write component from design",
      body: "Build a React component that matches this design exactly. Use Tailwind for styling, TypeScript, and follow the conventions in this codebase. Make it production-ready:\n\n[describe or screenshot the design]",
      tags: ["design-to-code", "react"],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "default_4",
      title: "Review this PR diff",
      body: "Review this diff like a senior engineer. Look for: bugs, edge cases, security issues, performance concerns, and anything that breaks conventions. Be direct and specific:\n\n[paste diff here]",
      tags: ["review", "pr"],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "default_5",
      title: "Write tests for this",
      body: "Write comprehensive tests for the following code. Cover the happy path, edge cases, and error states. Use the testing framework already in this project:\n\n[paste code here]",
      tags: ["testing"],
      createdAt: now,
      updatedAt: now,
    },
  ];
}
