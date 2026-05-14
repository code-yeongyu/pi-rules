import path from "node:path";
import { fileURLToPath } from "node:url";

import type { SessionStartEvent, ToolResultEvent } from "@mariozechner/pi-coding-agent";
import { describe, expect, it } from "vitest";

import piRulesExtension from "../../src/index.js";
import { createFakePi, type FakePiHarness } from "../helpers/fake-pi.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE_PROJECT = path.resolve(__dirname, "../fixtures/sample-project");
const APP_FILE_PATH = path.resolve(SAMPLE_PROJECT, "apps/web/src/App.tsx");
const API_FILE_PATH = path.resolve(SAMPLE_PROJECT, "packages/api/src/index.ts");

type TextPart = { type: "text"; text: string };
type ToolResultMutation = { content: TextPart[] };

function sessionStartEvent(): SessionStartEvent {
	return { type: "session_start", reason: "startup" };
}

async function createStartedHarness(flags: Readonly<Record<string, boolean | string>> = {}): Promise<{
	harness: FakePiHarness;
	ctx: ReturnType<FakePiHarness["makeCtx"]>;
}> {
	const harness = createFakePi();
	piRulesExtension(harness.pi);
	for (const [name, value] of Object.entries(flags)) {
		harness.flagValues.set(name, value);
	}
	const ctx = harness.makeCtx({ cwd: SAMPLE_PROJECT });
	await harness.emit("session_start", sessionStartEvent(), ctx);
	return { harness, ctx };
}

function readToolResult(filePath: string, toolCallId = "call_1", isError = false): ToolResultEvent {
	return {
		type: "tool_result",
		toolName: "read",
		toolCallId,
		input: { path: filePath },
		content: [{ type: "text", text: "file contents" }],
		isError,
		details: undefined,
	};
}

function writeToolResult(filePath: string): ToolResultEvent {
	return {
		type: "tool_result",
		toolName: "write",
		toolCallId: "call_1",
		input: { filePath },
		content: [{ type: "text", text: "written" }],
		isError: false,
		details: undefined,
	};
}

function editToolResult(filePath: string): ToolResultEvent {
	const details = { diff: "", filePath };
	return {
		type: "tool_result",
		toolName: "edit",
		toolCallId: "call_1",
		input: {},
		content: [{ type: "text", text: "edited" }],
		isError: false,
		details,
	};
}

function untrackedToolResult(toolName: "bash" | "grep" | "ls"): ToolResultEvent {
	return {
		type: "tool_result",
		toolName,
		toolCallId: "call_1",
		input: { filePath: APP_FILE_PATH },
		content: [{ type: "text", text: "tool output" }],
		isError: false,
		details: undefined,
	};
}

function expectToolResultMutation(result: unknown): ToolResultMutation {
	expect(result).toEqual({
		content: expect.arrayContaining([{ type: "text", text: expect.any(String) }]),
	});
	return result as ToolResultMutation;
}

function injectedText(result: unknown): string {
	const mutation = expectToolResultMutation(result);
	const lastContent = mutation.content[mutation.content.length - 1];
	expect(lastContent).toBeDefined();
	if (lastContent === undefined) {
		throw new Error("Expected injected content part");
	}
	expect(lastContent).toEqual({ type: "text", text: expect.any(String) });
	return lastContent.text;
}

describe("tool_result integration", () => {
	it("#given read tool result for App.tsx #when tool_result emitted #then result.content has additional text part", async () => {
		// given
		const { harness, ctx } = await createStartedHarness();
		const event = readToolResult(APP_FILE_PATH);

		// when
		const result = await harness.emit("tool_result", event, ctx);

		// then
		const mutation = expectToolResultMutation(result);
		expect(mutation.content).toHaveLength(event.content.length + 1);
		expect(mutation.content[mutation.content.length - 1]?.type).toBe("text");
	});

	it('"#given read tool result for App.tsx #when emitted #then injected text contains "Additional project instructions matched for"', async () => {
		// given
		const { harness, ctx } = await createStartedHarness();

		// when
		const result = await harness.emit("tool_result", readToolResult(APP_FILE_PATH), ctx);

		// then
		expect(injectedText(result)).toContain("Additional project instructions matched for");
	});

	it("#given absolute tool target #when emitted #then dynamic header uses cwd-relative display path", async () => {
		// given
		const { harness, ctx } = await createStartedHarness();

		// when
		const result = await harness.emit("tool_result", readToolResult(APP_FILE_PATH), ctx);

		// then
		expect(injectedText(result)).toContain("Additional project instructions matched for apps/web/src/App.tsx:");
	});

	it("#given read tool result for App.tsx (matches **/*.tsx) #when emitted #then typescript.md content present in injected text", async () => {
		// given
		const { harness, ctx } = await createStartedHarness();

		// when
		const result = await harness.emit("tool_result", readToolResult(APP_FILE_PATH), ctx);

		// then
		expect(injectedText(result)).toContain("Prefer `unknown` over `any`. Use exhaustive switch checks.");
	});

	it("#given read tool result for App.tsx #when emitted #then ui.mdc rule content present (matches apps/web/**/*.tsx)", async () => {
		// given
		const { harness, ctx } = await createStartedHarness();

		// when
		const result = await harness.emit("tool_result", readToolResult(APP_FILE_PATH), ctx);

		// then
		expect(injectedText(result)).toContain("React components must be functional and prop-typed.");
	});

	it("#given read tool result for packages/api/src/index.ts #when emitted #then security.md NOT included (path doesn't match auth/secrets)", async () => {
		// given
		const { harness, ctx } = await createStartedHarness();

		// when
		const result = await harness.emit("tool_result", readToolResult(API_FILE_PATH), ctx);

		// then
		expect(injectedText(result)).not.toContain("Do not log credentials. Always rotate API keys quarterly.");
	});

	it("#given read tool result for packages/api/src/index.ts (matches **/*.ts) #when emitted #then typescript.md included", async () => {
		// given
		const { harness, ctx } = await createStartedHarness();

		// when
		const result = await harness.emit("tool_result", readToolResult(API_FILE_PATH), ctx);

		// then
		expect(injectedText(result)).toContain("Prefer `unknown` over `any`. Use exhaustive switch checks.");
	});

	it("#given write tool result for App.tsx via input.filePath #when emitted #then dynamic injection works", async () => {
		// given
		const { harness, ctx } = await createStartedHarness();

		// when
		const result = await harness.emit("tool_result", writeToolResult(APP_FILE_PATH), ctx);

		// then
		expect(injectedText(result)).toContain("React components must be functional and prop-typed.");
	});

	it("#given edit tool result with details.filePath #when emitted #then dynamic injection works", async () => {
		// given
		const { harness, ctx } = await createStartedHarness();

		// when
		const result = await harness.emit("tool_result", editToolResult(APP_FILE_PATH), ctx);

		// then
		expect(injectedText(result)).toContain("React components must be functional and prop-typed.");
	});

	it("#given bash tool result #when emitted #then result is undefined (untracked tool)", async () => {
		// given
		const { harness, ctx } = await createStartedHarness();

		// when
		const result = await harness.emit("tool_result", untrackedToolResult("bash"), ctx);

		// then
		expect(result).toBeUndefined();
	});

	it("#given grep tool result #when emitted #then result is undefined", async () => {
		// given
		const { harness, ctx } = await createStartedHarness();

		// when
		const result = await harness.emit("tool_result", untrackedToolResult("grep"), ctx);

		// then
		expect(result).toBeUndefined();
	});

	it("#given ls tool result #when emitted #then result is undefined", async () => {
		// given
		const { harness, ctx } = await createStartedHarness();

		// when
		const result = await harness.emit("tool_result", untrackedToolResult("ls"), ctx);

		// then
		expect(result).toBeUndefined();
	});

	it("#given read tool result with isError=true #when emitted #then result is undefined", async () => {
		// given
		const { harness, ctx } = await createStartedHarness();

		// when
		const result = await harness.emit("tool_result", readToolResult(APP_FILE_PATH, "call_1", true), ctx);

		// then
		expect(result).toBeUndefined();
	});

	it("#given read tool result for App.tsx emitted twice with same toolCallId #when second emitted #then no duplicate injection (dynamic dedup per toolCallId)", async () => {
		// given
		const { harness, ctx } = await createStartedHarness();
		const event = readToolResult(APP_FILE_PATH, "same_call");
		const firstResult = await harness.emit("tool_result", event, ctx);

		// when
		const secondResult = await harness.emit("tool_result", event, ctx);

		// then
		expectToolResultMutation(firstResult);
		expect(secondResult).toBeUndefined();
	});

	it('#given read tool result for App.tsx with toolCallId "a" then "b" #when both emitted #then second is deduped', async () => {
		// given
		const { harness, ctx } = await createStartedHarness();

		// when
		const firstResult = await harness.emit("tool_result", readToolResult(APP_FILE_PATH, "a"), ctx);
		const secondResult = await harness.emit("tool_result", readToolResult(APP_FILE_PATH, "b"), ctx);

		// then
		expect(injectedText(firstResult)).toContain("Additional project instructions matched for");
		expect(secondResult).toBeUndefined();
	});

	it("#given dynamic rule injected before compaction #when session_compact then same file read #then rule injects again", async () => {
		// given
		const { harness, ctx } = await createStartedHarness();
		const beforeCompact = await harness.emit("tool_result", readToolResult(APP_FILE_PATH, "before-compact"), ctx);
		expect(injectedText(beforeCompact)).toContain("Additional project instructions matched for");
		const cached = await harness.emit("tool_result", readToolResult(APP_FILE_PATH, "cached-before-compact"), ctx);
		expect(cached).toBeUndefined();

		// when
		await harness.emit("session_compact", { type: "session_compact" }, ctx);
		const afterCompact = await harness.emit("tool_result", readToolResult(APP_FILE_PATH, "after-compact"), ctx);

		// then
		expect(injectedText(afterCompact)).toContain("Additional project instructions matched for");
	});

	it("#given static rules already injected #when tool_result emitted #then dynamic injection skips static duplicates", async () => {
		// given
		const { harness, ctx } = await createStartedHarness();
		const beforeAgentResult = await harness.emit(
			"before_agent_start",
			{
				type: "before_agent_start",
				prompt: "Implement the task.",
				systemPrompt: "Base prompt.",
				systemPromptOptions: { cwd: SAMPLE_PROJECT, contextFiles: [] },
			},
			ctx,
		);

		// when
		const result = await harness.emit("tool_result", readToolResult(APP_FILE_PATH), ctx);

		// then
		expect(beforeAgentResult).toEqual({ systemPrompt: expect.stringContaining("Project Instructions") });
		expect(injectedText(result)).not.toContain("Always wear safety goggles when refactoring.");
		expect(injectedText(result)).toContain("React components must be functional and prop-typed.");
	});

	it("#given pi-rules-disabled=true flag #when tool_result emitted #then returns undefined", async () => {
		// given
		const { harness, ctx } = await createStartedHarness({ "pi-rules-disabled": true });

		// when
		const result = await harness.emit("tool_result", readToolResult(APP_FILE_PATH), ctx);

		// then
		expect(result).toBeUndefined();
	});

	it('#given mode="static" #when tool_result emitted #then returns undefined', async () => {
		// given
		const { harness, ctx } = await createStartedHarness({ "pi-rules-mode": "static" });

		// when
		const result = await harness.emit("tool_result", readToolResult(APP_FILE_PATH), ctx);

		// then
		expect(result).toBeUndefined();
	});

	it('#given mode="off" #when tool_result emitted #then returns undefined', async () => {
		// given
		const { harness, ctx } = await createStartedHarness({ "pi-rules-mode": "off" });

		// when
		const result = await harness.emit("tool_result", readToolResult(APP_FILE_PATH), ctx);

		// then
		expect(result).toBeUndefined();
	});
});
