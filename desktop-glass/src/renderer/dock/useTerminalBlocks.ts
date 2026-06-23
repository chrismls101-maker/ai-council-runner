/**
 * useTerminalBlocks — parses PTY streams into discrete command blocks per session.
 *
 * @see terminalBlockParser.ts for the pure parser implementation.
 */

import { useRef, useState, useCallback } from "react";
import {
  type TerminalBlock,
  type ParserState,
  createParserState,
  feedParserChunk,
  resetParserState,
} from "./terminalBlockParser.ts";

export type { BlockStatus, TerminalBlock } from "./terminalBlockParser.ts";

export function useTerminalBlockSessions(): {
  blocksFor: (termId: string | undefined) => TerminalBlock[];
  feedChunk: (termId: string, chunk: string) => void;
  clearFor: (termId: string) => void;
  clearAll: () => void;
} {
  const [revision, bump] = useState(0);
  const blocksRef = useRef<Map<string, TerminalBlock[]>>(new Map());
  const parsersRef = useRef<Map<string, ParserState>>(new Map());

  const rerender = useCallback((): void => {
    bump((n) => n + 1);
  }, []);

  const getParser = useCallback((termId: string): ParserState => {
    let parser = parsersRef.current.get(termId);
    if (!parser) {
      parser = createParserState();
      parsersRef.current.set(termId, parser);
    }
    return parser;
  }, []);

  const blocksFor = useCallback((termId: string | undefined): TerminalBlock[] => {
    if (!termId) return [];
    void revision;
    return blocksRef.current.get(termId) ?? [];
  }, [revision]);

  const feedChunk = useCallback((termId: string, chunk: string): void => {
    const pushBlock = (block: TerminalBlock): void => {
      const prev = blocksRef.current.get(termId) ?? [];
      const next = [...prev, block];
      blocksRef.current.set(
        termId,
        next.length > 500 ? next.slice(next.length - 500) : next,
      );
      rerender();
    };
    feedParserChunk(getParser(termId), chunk, pushBlock);
  }, [getParser, rerender]);

  const clearFor = useCallback((termId: string): void => {
    blocksRef.current.delete(termId);
    const parser = parsersRef.current.get(termId);
    if (parser) resetParserState(parser);
    rerender();
  }, [rerender]);

  const clearAll = useCallback((): void => {
    blocksRef.current.clear();
    for (const parser of parsersRef.current.values()) {
      resetParserState(parser);
    }
    rerender();
  }, [rerender]);

  return { blocksFor, feedChunk, clearFor, clearAll };
}
