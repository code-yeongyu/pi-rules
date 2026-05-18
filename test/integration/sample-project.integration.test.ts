import { readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { BeforeAgentStartEvent, SessionStartEvent, ToolResultEvent } from "@mariozechner/pi-coding-agent";
import { describe, expect, it } from "vitest";

import piRulesExtension from "../../src/index.js";
import { createFakePi, type FakePiHarness } from "../helpers/fake-pi.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE_PROJECT = path.resolve(__dirname, "../fixtures/sample-project");
const BASE_SYSTEM_PROMPT = "Base prompt.";

type BeforeAgentStartResult = {
	systemPrompt: string;
};

type ToolResult = {
	content: Array<{ type: "text"; text: string }>;
};

function registerExtension(): FakePiHarness {
	const harness = createFakePi();
	piRulesExtension(harness.pi);
	return harness;
}

function projectCwd(): string {
	return realpathSync.native(SAMPLE_PROJECT);
}

function fixturePath(relativePath: string): string {
	return path.resolve(projectCwd(), relativePath);
}

function sessionStartEvent(reason: SessionStartEvent["reason"]): SessionStartEvent {
	return { type: "session_start", reason };
}

function beforeAgentStartEvent(cwd: string): BeforeAgentStartEvent {
	return {
		type: "before_agent_start",
		prompt: "Implement the task.",
		systemPrompt: BASE_SYSTEM_PROMPT,
		systemPromptOptions: { cwd, contextFiles: [] },
	};
}

function readToolResultEvent(toolCallId: string, filePath: string): ToolResultEvent {
	return {
		type: "tool_result",
		toolCallId,
		toolName: "read",
		input: { path: filePath },
		content: [{ type: "text", text: readFileSync(filePath, "utf-8") }],
		isError: false,
		details: undefined,
	};
}

function expectBeforeAgentStartResult(result: unknown): BeforeAgentStartResult {
	expect(result).toEqual({ systemPrompt: expect.any(String) });
	return result as BeforeAgentStartResult;
}

function expectToolResult(result: unknown): ToolResult {
	expect(result).toEqual({ content: expect.any(Array) });
	return result as ToolResult;
}

function textContent(result: ToolResult): string {
	return result.content.map((part) => part.text).join("\n");
}

describe("sample-project full session integration", () => {
	it("#given sample-project fixture #when running full session with static and dynamic injection #then each turn mutates once and preserves harness state", async () => {
		// given
		const harness = registerExtension();
		const cwd = projectCwd();
		const ctx = harness.makeCtx({ cwd });
		const appPath = fixturePath("apps/web/src/App.tsx");
		const apiPath = fixturePath("packages/api/src/index.ts");

		// when
		const sessionResult = await harness.emit("session_start", sessionStartEvent("startup"), ctx);
		const firstBeforeResult = await harness.emit("before_agent_start", beforeAgentStartEvent(cwd), ctx);
		const appToolResult = await harness.emit("tool_result", readToolResultEvent("tool-call-app", appPath), ctx);
		const apiToolResult = await harness.emit("tool_result", readToolResultEvent("tool-call-api", apiPath), ctx);
		const secondBeforeResult = await harness.emit("before_agent_start", beforeAgentStartEvent(cwd), ctx);

		// then
		expect(sessionResult).toBeUndefined();
		expect(harness.entries).toEqual([{ customType: "pi-rules.scan", data: { cwd, reason: "startup" } }]);

		const firstBefore = expectBeforeAgentStartResult(firstBeforeResult);
		expect(firstBefore.systemPrompt).toContain("Instructions from:");
		expect(firstBefore.systemPrompt).toContain("AGENTS.md");
		expect(firstBefore.systemPrompt).toContain("Always wear safety goggles when refactoring.");
		expect(firstBefore.systemPrompt).toContain("Use TypeScript strict mode. Always.");
		expect(firstBefore.systemPrompt).toContain("Reviewers MUST check tests pass before approving.");

		const appTool = expectToolResult(appToolResult);
		const appToolText = textContent(appTool);
		expect(appTool.content).toHaveLength(2);
		expect(appTool.content[0]?.text).toBe(readFileSync(appPath, "utf-8"));
		expect(appToolText).toContain("Additional project instructions matched for apps/web/src/App.tsx");
		expect(appToolText).toContain("Prefer `unknown` over `any`. Use exhaustive switch checks.");
		expect(appToolText).toContain("React components must be functional and prop-typed.");

		const apiTool = expectToolResult(apiToolResult);
		const apiToolText = textContent(apiTool);
		expect(apiTool.content).toHaveLength(2);
		expect(apiTool.content[0]?.text).toBe(readFileSync(apiPath, "utf-8"));
		expect(apiToolText).toContain("Additional project instructions matched for packages/api/src/index.ts");
		expect(apiToolText).toContain("Prefer `unknown` over `any`. Use exhaustive switch checks.");
		expect(apiToolText).not.toContain("React components must be functional and prop-typed.");

		expect(secondBeforeResult).toBeUndefined();
		expect(harness.entries).toHaveLength(1);
	});

	it('#given session is running with rules injected #when session_start emitted again with reason="reload" #then state is reset and before_agent_start injects from scratch', async () => {
		// given
		const harness = registerExtension();
		const cwd = projectCwd();
		const ctx = harness.makeCtx({ cwd });
		await harness.emit("session_start", sessionStartEvent("startup"), ctx);
		const firstBeforeResult = await harness.emit("before_agent_start", beforeAgentStartEvent(cwd), ctx);
		expectBeforeAgentStartResult(firstBeforeResult);
		expect(await harness.emit("before_agent_start", beforeAgentStartEvent(cwd), ctx)).toBeUndefined();

		// when
		const reloadResult = await harness.emit("session_start", sessionStartEvent("reload"), ctx);
		const afterReloadResult = await harness.emit("before_agent_start", beforeAgentStartEvent(cwd), ctx);

		// then
		expect(reloadResult).toBeUndefined();
		expect(harness.entries).toEqual([
			{ customType: "pi-rules.scan", data: { cwd, reason: "startup" } },
			{ customType: "pi-rules.scan", data: { cwd, reason: "reload" } },
		]);
		const afterReload = expectBeforeAgentStartResult(afterReloadResult);
		expect(afterReload.systemPrompt).toContain("Always wear safety goggles when refactoring.");
		expect(afterReload.systemPrompt).toContain("Use TypeScript strict mode. Always.");
	});

	it("#given same toolCallId emits two tool_results for same file #when both emitted #then first injects and second returns undefined", async () => {
		// given
		const harness = registerExtension();
		const cwd = projectCwd();
		const ctx = harness.makeCtx({ cwd });
		const appPath = fixturePath("apps/web/src/App.tsx");
		await harness.emit("session_start", sessionStartEvent("startup"), ctx);
		const firstEvent = readToolResultEvent("tool-call-repeat", appPath);
		const secondEvent = readToolResultEvent("tool-call-repeat", appPath);

		// when
		const firstResult = await harness.emit("tool_result", firstEvent, ctx);
		const secondResult = await harness.emit("tool_result", secondEvent, ctx);

		// then
		const firstTool = expectToolResult(firstResult);
		expect(firstTool.content).toHaveLength(2);
		expect(textContent(firstTool)).toContain("Prefer `unknown` over `any`. Use exhaustive switch checks.");
		expect(textContent(firstTool)).toContain("React components must be functional and prop-typed.");
		expect(secondResult).toBeUndefined();
	});

	it('#given pi-rules-mode="off" then changed to "both" #when before_agent_start emitted before and after #then first call is undefined and second call mutates', async () => {
		// given
		const harness = registerExtension();
		const cwd = projectCwd();
		const ctx = harness.makeCtx({ cwd });
		await harness.emit("session_start", sessionStartEvent("startup"), ctx);
		harness.flagValues.set("pi-rules-mode", "off");

		// when
		const offResult = await harness.emit("before_agent_start", beforeAgentStartEvent(cwd), ctx);
		harness.flagValues.set("pi-rules-mode", "both");
		const bothResult = await harness.emit("before_agent_start", beforeAgentStartEvent(cwd), ctx);

		// then
		expect(offResult).toBeUndefined();
		const both = expectBeforeAgentStartResult(bothResult);
		expect(both.systemPrompt).toContain("Always wear safety goggles when refactoring.");
		expect(both.systemPrompt).toContain("Use TypeScript strict mode. Always.");
	});

	it("#given sample-project has .github/copilot-instructions.md with no frontmatter #when before_agent_start emitted #then copilot-instructions content is in injected systemPrompt", async () => {
		// given
		const harness = registerExtension();
		const cwd = projectCwd();
		const ctx = harness.makeCtx({ cwd });

		// when
		const result = await harness.emit("before_agent_start", beforeAgentStartEvent(cwd), ctx);

		// then
		const returnedEvent = expectBeforeAgentStartResult(result);
		expect(returnedEvent.systemPrompt).toContain(".github/copilot-instructions.md");
		expect(returnedEvent.systemPrompt).toContain("Always include error messages with context.");
	});
});
