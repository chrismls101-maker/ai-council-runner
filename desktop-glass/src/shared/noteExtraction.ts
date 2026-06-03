/**
 * Deterministic, local note extraction for IIVO Glass v1.
 *
 * No LLM calls. This is a transparent rule-based pass over transcript text so
 * the user can see what Glass "understood" without anything leaving the device.
 * The optional "Analyze with IIVO" action is what sends data to the council.
 */

import type { ExtractedNotes } from "./types.ts";

const QUESTION_STARTERS = [
  "who",
  "what",
  "when",
  "where",
  "why",
  "how",
  "is",
  "are",
  "do",
  "does",
  "did",
  "can",
  "could",
  "should",
  "would",
  "will",
];

const ACTION_CUES = [
  "need to",
  "needs to",
  "should",
  "must",
  "let's",
  "lets ",
  "todo",
  "to-do",
  "action item",
  "action:",
  "follow up",
  "follow-up",
  "next step",
  "we'll",
  "i'll",
  "assign",
  "deadline",
  "due ",
];

const HYPOTHESIS_CUES = [
  "maybe",
  "might",
  "i think",
  "we think",
  "probably",
  "hypothesis",
  "could be",
  "what if",
  "my guess",
  "i suspect",
  "seems like",
  "likely",
];

function splitSentences(text: string): string[] {
  return text
    .replace(/\r/g, "\n")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function includesAny(haystack: string, needles: string[]): boolean {
  return needles.some((n) => haystack.includes(n));
}

function isQuestion(sentence: string): boolean {
  if (sentence.endsWith("?")) return true;
  const firstWord = sentence.toLowerCase().split(/\s+/)[0] ?? "";
  return QUESTION_STARTERS.includes(firstWord) && sentence.split(/\s+/).length > 2;
}

function dedupe(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const key = item.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(item);
    }
  }
  return out;
}

export function extractNotes(transcript: string, maxPerBucket = 6): ExtractedNotes {
  const sentences = splitSentences(transcript);
  const questions: string[] = [];
  const actionItems: string[] = [];
  const hypotheses: string[] = [];
  const keyIdeas: string[] = [];

  for (const sentence of sentences) {
    const lower = sentence.toLowerCase();
    if (isQuestion(sentence)) {
      questions.push(sentence);
      continue;
    }
    if (includesAny(lower, ACTION_CUES)) {
      actionItems.push(sentence);
      continue;
    }
    if (includesAny(lower, HYPOTHESIS_CUES)) {
      hypotheses.push(sentence);
      continue;
    }
    if (sentence.split(/\s+/).length >= 4) {
      keyIdeas.push(sentence);
    }
  }

  const summarySource = keyIdeas.length > 0 ? keyIdeas : sentences;
  const summary = summarySource.slice(0, 2).join(" ").trim();

  return {
    summary,
    keyIdeas: dedupe(keyIdeas).slice(0, maxPerBucket),
    questions: dedupe(questions).slice(0, maxPerBucket),
    hypotheses: dedupe(hypotheses).slice(0, maxPerBucket),
    actionItems: dedupe(actionItems).slice(0, maxPerBucket),
  };
}

export function emptyNotes(): ExtractedNotes {
  return { summary: "", keyIdeas: [], questions: [], hypotheses: [], actionItems: [] };
}
