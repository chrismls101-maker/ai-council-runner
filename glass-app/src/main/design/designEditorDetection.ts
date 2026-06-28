/**
 * Main-process editor detection helpers for design-to-code capture.
 * Re-exports shared editor names + wires code context readers.
 */
export { EDITOR_APP_NAMES, isEditorAppName } from "../../shared/designToCode.ts";
export { detectLanguage, parseFileNameFromTitle, readCodeContext } from "../codeContextReader.ts";
