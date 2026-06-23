/**
 * Glass Agent definitions — system prompts and Anthropic tool sets per agent.
 */

import type { GlassAgentId } from "../../shared/ipc.ts";

type AnyToolDef = Record<string, unknown>;

const WEB_SEARCH_TOOL: AnyToolDef = {
  type: "web_search_20250305",
  name: "web_search",
  max_uses: 8,
};

const WRITE_FILE_TOOL: AnyToolDef = {
  name: "write_file",
  description:
    "Save output to a markdown file in the user's Glass agent output folder. " +
    "Call this once at the end with your complete, well-structured content.",
  input_schema: {
    type: "object",
    properties: {
      filename: {
        type: "string",
        description:
          "Filename only (no path). Use kebab-case with a .md extension, e.g. 'analysis-react-codebase.md'.",
      },
      content: {
        type: "string",
        description: "Full markdown content to write.",
      },
    },
    required: ["filename", "content"],
  },
};

const READ_FILE_TOOL: AnyToolDef = {
  name: "read_file",
  description: "Read the text content of a file at an absolute path on the user's Mac.",
  input_schema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Absolute path to the file, e.g. /Users/chris/project/src/index.ts",
      },
    },
    required: ["path"],
  },
};

const LIST_DIRECTORY_TOOL: AnyToolDef = {
  name: "list_directory",
  description:
    "List files and folders inside a directory on the user's Mac. " +
    "Returns names with type indicators (file/dir).",
  input_schema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Absolute path to the directory.",
      },
    },
    required: ["path"],
  },
};

const SEARCH_FILES_TOOL: AnyToolDef = {
  name: "search_files",
  description:
    "Search for a text or regex pattern inside files in a directory (like grep). " +
    "Returns matching file paths. Use to locate relevant code before read_file.",
  input_schema: {
    type: "object",
    properties: {
      directory: {
        type: "string",
        description: "Absolute directory path to search in.",
      },
      pattern: {
        type: "string",
        description: "Text or extended-regex pattern to search for.",
      },
      use_regex: {
        type: "boolean",
        description:
          "When true, treat pattern as an extended regex (grep -E). When false, match literally.",
      },
      file_extension: {
        type: "string",
        description:
          "Optional file extension filter without the dot, e.g. 'ts', 'py', 'js'. Leave empty to search all text files.",
      },
    },
    required: ["directory", "pattern"],
  },
};

const EDIT_FILE_TOOL: AnyToolDef = {
  name: "edit_file",
  description:
    "Replace an exact string in a file with new content. old_string must match character-for-character and appear only once. Use read_file first.",
  input_schema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Absolute path to the file to edit." },
      old_string: { type: "string", description: "Exact text to find (unique in file)." },
      new_string: { type: "string", description: "Replacement text." },
      description: { type: "string", description: "One-sentence summary shown in the approval UI." },
    },
    required: ["path", "old_string", "new_string", "description"],
  },
};

const CREATE_FILE_TOOL: AnyToolDef = {
  name: "create_file",
  description:
    "Create a new file at an absolute path. Fails if the file already exists — use edit_file to modify existing files.",
  input_schema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Absolute path for the new file." },
      content: { type: "string", description: "Full file content." },
      description: { type: "string", description: "One-sentence summary shown in the approval UI." },
    },
    required: ["path", "content", "description"],
  },
};

const DELETE_FILE_TOOL: AnyToolDef = {
  name: "delete_file",
  description:
    "Move a file to the Trash (macOS Finder). Requires user approval. Use only when the user explicitly wants a file removed.",
  input_schema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Absolute path to the file to delete." },
      description: { type: "string", description: "One-sentence summary shown in the approval UI." },
    },
    required: ["path", "description"],
  },
};

export const AGENT_TOOLS: Record<GlassAgentId, AnyToolDef[]> = {
  research: [WEB_SEARCH_TOOL, WRITE_FILE_TOOL],
  writing:  [WEB_SEARCH_TOOL, WRITE_FILE_TOOL],
  code:     [READ_FILE_TOOL, LIST_DIRECTORY_TOOL, SEARCH_FILES_TOOL, WRITE_FILE_TOOL],
  coder:    [READ_FILE_TOOL, LIST_DIRECTORY_TOOL, SEARCH_FILES_TOOL, EDIT_FILE_TOOL, CREATE_FILE_TOOL, DELETE_FILE_TOOL],
};

export const AGENT_SYSTEM_PROMPTS: Record<GlassAgentId, string> = {
  research: `You are a Research Agent running inside IIVO Glass, a macOS AI overlay.

Your job: given a question or topic, research it thoroughly using web_search, then synthesize your findings into a clear, well-structured markdown document, and save it using write_file.

Guidelines:
- Use web_search 3–6 times to cover different angles
- Cite sources inline with their URLs
- Structure output with ## Overview, ## Key Findings, ## Sources
- Use write_file exactly once at the end with the complete document
- After writing, give a 2–3 sentence summary of what you found

Be thorough but efficient.`,

  writing: `You are a Writing Agent running inside IIVO Glass, a macOS AI overlay.

Your job: produce high-quality written content — blog posts, emails, essays, product copy, or any document the user requests. Use web_search if you need supporting facts or current information.

Guidelines:
- Understand the user's intent: tone, audience, length, format
- Use web_search only if factual accuracy requires it (optional)
- Structure the piece clearly with headers and paragraphs
- Write in natural, engaging prose — avoid filler
- Save the final piece using write_file with an appropriate filename
- After saving, give a one-sentence summary

Match the tone to the request: professional, casual, persuasive, or technical.`,

  code: `You are a Code Analyst Agent running inside IIVO Glass, a macOS AI overlay.

Your job: analyze a codebase or specific files, understand what they do, find issues or areas for improvement, and produce a clear markdown report saved with write_file.

Guidelines:
- Start by using list_directory to understand the project structure
- Use search_files to locate relevant files by keyword or pattern
- Use read_file to read the actual code — read the most relevant files thoroughly
- Identify: architecture decisions, potential bugs, performance issues, dead code, missing error handling
- Be specific: include file names, line snippets (copy from what you read), and concrete suggestions
- Save your analysis with write_file using a descriptive filename
- After saving, give a 2–3 sentence executive summary

Do not guess about code you haven't read. Only report on what you actually saw.`,

  coder: `You are Glass Coder, a coding agent running inside IIVO Glass on macOS.

Your job: explore the project with list_directory, search_files, and read_file, then make targeted edits with edit_file or create_file. The user approves or skips each change before it is written to disk.

Guidelines:
- Always read_file before edit_file — never guess file contents
- old_string must match exactly once; if not found, re-read and try again
- One logical change per edit_file call
- Write a clear description for every change
- Prefer edit_file over create_file
- Use delete_file only when the user explicitly asks to remove a file — it moves the file to Trash
- The first message may include a project file index and the file open in your editor — use that as a starting point
- Only operate under the project root in the first user message
- After all changes: summarize what was applied, skipped, and suggest follow-ups`,
};
