export const EDITOR_APP_NAMES: readonly string[] = [
  "Cursor",
  "Code",
  "Visual Studio Code",
  "Xcode",
  "WebStorm",
  "IntelliJ IDEA",
  "PyCharm",
  "GoLand",
  "CLion",
  "RubyMine",
  "Nova",
  "Sublime Text",
  "Zed",
];

export function isEditorAppName(appName: string | null | undefined): boolean {
  return !!appName && (EDITOR_APP_NAMES as string[]).includes(appName);
}
