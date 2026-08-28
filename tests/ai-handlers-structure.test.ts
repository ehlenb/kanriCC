/**
 * Structural regression tests for lib/ai-handlers/*.ts.
 *
 * These guard against two bugs found in QA (2026-08-23):
 *
 * 1. claude-sonnet-5 emits an unrequested "thinking" content block by default.
 *    Every anthropic.messages.create() call must explicitly pass
 *    `thinking: { type: "disabled" }`, or a handler with a modest max_tokens
 *    budget can silently return {} / truncated output with no error — the
 *    model spends its whole budget thinking and never writes the answer.
 *
 * 2. Because of (1), `message.content[0]` is not reliably the text block.
 *    Every handler must locate the text block with
 *    `message.content.find((b) => b.type === "text")` instead of indexing.
 *
 * These are static source checks, not live API calls — fast, free, and they
 * fail immediately if either pattern regresses (e.g. a new handler is added
 * without disabling thinking, or copy-pastes the old content[0] pattern).
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const HANDLERS_DIR = join(__dirname, "..", "lib", "ai-handlers");

const handlerFiles = readdirSync(HANDLERS_DIR).filter((f) => f.endsWith(".ts"));

describe("ai-handlers: thinking must be explicitly disabled", () => {
  for (const file of handlerFiles) {
    // ask-kanri.ts is the one documented exception: it is a multi-turn tool-use
    // loop, not a one-shot handler, and plans which tools to chain materially
    // better with adaptive thinking on. The bug this rule guards against does
    // not apply -- it locates the text block with .content.find (never
    // content[0]) and echoes full content back each turn. See CLAUDE.md §18.
    if (file === "ask-kanri.ts") continue;

    const src = readFileSync(join(HANDLERS_DIR, file), "utf8");
    const callCount = (src.match(/\.messages\.create\(/g) ?? []).length;
    if (callCount === 0) continue;

    it(`${file}: every messages.create() call disables thinking`, () => {
      const thinkingDisabledCount = (src.match(/thinking:\s*{\s*type:\s*"disabled"\s*}/g) ?? []).length;
      expect(
        thinkingDisabledCount,
        `${file} has ${callCount} messages.create() call(s) but only ${thinkingDisabledCount} ` +
          `thinking:{type:"disabled"} declaration(s). Every call must disable thinking explicitly — ` +
          `otherwise claude-sonnet-5 may spend the whole max_tokens budget on an unrequested thinking ` +
          `block and return no usable text.`,
      ).toBe(callCount);
    });
  }
});

describe("ai-handlers: text block must be located via .find(), not content[0]", () => {
  for (const file of handlerFiles) {
    const src = readFileSync(join(HANDLERS_DIR, file), "utf8");
    if (!src.includes(".messages.create(")) continue;

    it(`${file}: does not index content[0] directly`, () => {
      const offendingLines = src
        .split("\n")
        .filter((line) => /\.content\[0\]/.test(line));
      expect(
        offendingLines,
        `${file} indexes .content[0] directly instead of using ` +
          `.content.find((b) => b.type === "text"). Since claude-sonnet-5 puts a "thinking" ` +
          `block first, content[0] is often not the text block:\n${offendingLines.join("\n")}`,
      ).toHaveLength(0);
    });
  }
});
