/**
 * Minimal ambient type stub for @xterm/xterm and @xterm/addon-fit.
 * Covers the API surface used by GlassTerminalPanel.tsx.
 */

declare module "@xterm/xterm" {
  export interface ITheme {
    background?: string;
    foreground?: string;
    cursor?: string;
    cursorAccent?: string;
    selectionBackground?: string;
    black?: string;
    red?: string;
    green?: string;
    yellow?: string;
    blue?: string;
    magenta?: string;
    cyan?: string;
    white?: string;
    brightBlack?: string;
    brightRed?: string;
    brightGreen?: string;
    brightYellow?: string;
    brightBlue?: string;
    brightMagenta?: string;
    brightCyan?: string;
    brightWhite?: string;
  }

  export interface ITerminalOptions {
    fontFamily?: string;
    fontSize?: number;
    lineHeight?: number;
    letterSpacing?: number;
    cursorBlink?: boolean;
    cursorStyle?: "block" | "underline" | "bar";
    scrollback?: number;
    theme?: ITheme;
    allowTransparency?: boolean;
    macOptionIsMeta?: boolean;
    cols?: number;
    rows?: number;
  }

  export interface IDisposable {
    dispose(): void;
  }

  export interface ITerminalAddon extends IDisposable {
    activate(terminal: Terminal): void;
  }

  export class Terminal {
    constructor(options?: ITerminalOptions);
    readonly cols: number;
    readonly rows: number;
    loadAddon(addon: ITerminalAddon): void;
    open(parent: HTMLElement): void;
    write(data: string | Uint8Array): void;
    writeln(data: string | Uint8Array): void;
    reset(): void;
    clear(): void;
    dispose(): void;
    onData(listener: (data: string) => void): IDisposable;
    onResize(listener: (size: { cols: number; rows: number }) => void): IDisposable;
    onKey(listener: (e: { key: string; domEvent: KeyboardEvent }) => void): IDisposable;
    focus(): void;
    scrollToBottom(): void;
  }
}

declare module "@xterm/xterm/css/xterm.css" {
  // Side-effect import — no exports needed.
}

declare module "@xterm/addon-fit" {
  import type { ITerminalAddon } from "@xterm/xterm";

  export class FitAddon implements ITerminalAddon {
    activate(terminal: import("@xterm/xterm").Terminal): void;
    dispose(): void;
    fit(): void;
    proposeDimensions(): { cols: number; rows: number } | undefined;
  }
}
