/**
 * Glass built-in terminal — OSC 133 + OSC 7 shell integration bootstrap.
 *
 * Writes integration scripts to userData and configures PTY spawn env/args so
 * block parsing works reliably without modifying the user's dotfiles.
 */

import { app } from "electron";
import fs from "node:fs";
import path from "node:path";

const INTEGRATION_VERSION = 1;

const ZSH_INTEGRATION = `# Glass terminal — OSC 133 semantic prompts + OSC 7 cwd (zsh)
[[ -n "\${__GLASS_SHELL_INTEGRATION:-}" ]] && return
__GLASS_SHELL_INTEGRATION=1

__glass_osc133() { printf '\\033]133;%s\\007' "$1"; }

__glass_precmd() {
  local ret=$?
  __glass_osc133 "D;$ret"
  __glass_osc133 "A"
  printf '\\033]7;file://%s%s\\033\\\\' "\${HOST:-localhost}" "\${PWD//\\//%2F}"
}

__glass_preexec() { __glass_osc133 "C"; }

if [[ -o interactive ]]; then
  # precmd OSC bytes must not trigger zsh PROMPT_SP "%" marker
  setopt no_prompt_sp 2>/dev/null || true

  autoload -Uz add-zsh-hook
  add-zsh-hook precmd __glass_precmd
  add-zsh-hook preexec __glass_preexec

  if [[ "\${PS1:-}" != *'133;B'* ]]; then
    PS1="\${PS1}%{\\$(__glass_osc133 B)%}"
  fi
fi
`;

const BASH_INTEGRATION = `# Glass terminal — OSC 133 semantic prompts + OSC 7 cwd (bash)
[[ -n "\${__GLASS_SHELL_INTEGRATION:-}" ]] && return
__GLASS_SHELL_INTEGRATION=1

if [[ -f "$HOME/.bashrc" ]]; then
  # shellcheck disable=SC1090
  source "$HOME/.bashrc"
fi

__glass_osc133() { printf '\\033]133;%s\\007' "$1"; }

__glass_prompt_command() {
  local ret=$?
  __glass_osc133 "D;$ret"
  __glass_osc133 "A"
  printf '\\033]7;file://%s%s\\033\\\\' "\${HOSTNAME:-localhost}" "\\$(pwd | sed 's/ /%20/g')"
}

__glass_debug_trap() {
  local cmd=$BASH_COMMAND
  [[ "$cmd" == __glass_* || "$cmd" == trap ]] && return
  __glass_osc133 "C"
}

if [[ $- == *i* ]]; then
  PROMPT_COMMAND="__glass_prompt_command\${PROMPT_COMMAND:+; \$PROMPT_COMMAND}"
  trap '__glass_debug_trap' DEBUG
  if [[ "\${PS1:-}" != *'133;B'* ]]; then
    PS1="\${PS1}\\[\\$(__glass_osc133 B)\\]"
  fi
fi
`;

const ZDOTDIR_ZSHRC = `# Glass terminal ZDOTDIR — load user config, then integration
if [[ -n "$HOME" && -f "$HOME/.zshrc" && "$HOME/.zshrc" != "$0" ]]; then
  source "$HOME/.zshrc"
fi
if [[ -n "\${GLASS_SHELL_INTEGRATION:-}" && -f "$GLASS_SHELL_INTEGRATION" ]]; then
  source "$GLASS_SHELL_INTEGRATION"
fi
`;

export interface ShellLaunchConfig {
  args: string[];
  env: Record<string, string>;
}

function integrationRoot(): string {
  return path.join(app.getPath("userData"), "glass-shell-integration", String(INTEGRATION_VERSION));
}

function writeIfChanged(filePath: string, content: string): void {
  try {
    if (fs.existsSync(filePath) && fs.readFileSync(filePath, "utf8") === content) return;
  } catch {
    /* rewrite */
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, { mode: 0o644 });
}

/** Materialize integration scripts; safe to call on every PTY spawn. */
export function ensureShellIntegrationFiles(): string {
  const root = integrationRoot();
  const zshPath = path.join(root, "glass-integration.zsh");
  const bashPath = path.join(root, "glass-integration.bash");
  const zdotdir = path.join(root, "zdotdir");
  const zshrcPath = path.join(zdotdir, ".zshrc");

  writeIfChanged(zshPath, ZSH_INTEGRATION);
  writeIfChanged(bashPath, BASH_INTEGRATION);
  writeIfChanged(zshrcPath, ZDOTDIR_ZSHRC);

  return root;
}

/**
 * Returns extra PTY spawn args + env for Glass shell integration.
 * Falls back gracefully for unknown shells (no args/env beyond GLASS_TERMINAL).
 */
export function shellLaunchConfig(shellPath: string): ShellLaunchConfig {
  const root = ensureShellIntegrationFiles();
  const base = path.basename(shellPath).toLowerCase();

  if (base === "zsh") {
    return {
      args: [],
      env: {
        GLASS_TERMINAL: "1",
        ZDOTDIR: path.join(root, "zdotdir"),
        GLASS_SHELL_INTEGRATION: path.join(root, "glass-integration.zsh"),
      },
    };
  }

  if (base === "bash") {
    return {
      args: ["--init-file", path.join(root, "glass-integration.bash")],
      env: { GLASS_TERMINAL: "1" },
    };
  }

  return { args: [], env: { GLASS_TERMINAL: "1" } };
}
