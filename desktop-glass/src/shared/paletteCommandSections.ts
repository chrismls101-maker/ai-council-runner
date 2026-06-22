/**
 * Command Palette section layout — groups registry entries by category.
 */

import type { GlassCommandItem, PaletteCommandRegistrySection, PaletteSection } from "./paletteTypes.ts";

export const COMMAND_PALETTE_SECTIONS: Array<{
  section: PaletteCommandRegistrySection;
  id: PaletteSection["id"];
  label: string;
  order: number;
}> = [
  { section: "ask", id: "ask-answer", label: "Ask & Answer", order: 1 },
  { section: "terminal", id: "terminal-commands", label: "Terminal", order: 2 },
  { section: "builder", id: "builder", label: "Builder Strip", order: 3 },
  { section: "extract", id: "extract", label: "Extract & Build", order: 4 },
  { section: "clipboard", id: "clipboard", label: "Clipboard", order: 5 },
];

export function buildCommandPaletteSections(
  commandItems: GlassCommandItem[],
  sectionByCommandId: Map<string, PaletteCommandRegistrySection>,
): PaletteSection[] {
  return COMMAND_PALETTE_SECTIONS.map(({ section, id, label, order }) => ({
    id,
    label,
    order,
    maxVisible: 99,
    items: commandItems.filter(
      (item) => item.type === "command" && sectionByCommandId.get(item.commandId) === section,
    ),
  })).filter((s) => s.items.length > 0);
}
