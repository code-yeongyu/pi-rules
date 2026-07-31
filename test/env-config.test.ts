import { realpathSync } from "node:fs";
import type { BeforeAgentStartEvent, SessionStartEvent, ToolResultEvent } from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import piRulesExtension from "../src/index.js";
import { TRUNCATION_NOTICE } from "../src/rules/constants.js";
import { createFakePi, type FakePiHarness } from "./helpers/fake-pi.js";
import { createTempFs, type TempFs } from "./helpers/temp-fs.js";

const ORIGINAL_HOME = process.env["HOME"];

const BASE_SYSTEM_PROMPT = "Base prompt.";

const ENV_KEYS = ["PI_RULES_DISABLED", "PI_RULES_MAX_RULE_CHARS", "PI_RULES_MAX_RESULT_CHARS"] as const;

const savedEnv = new Map<string, string | undefined>();

const tempFiles: TempFs[] = [];

beforeEach(() => {
	savedEnv.clear();
	for (const key of ENV_KEYS) {
		savedEnv.set(key, process.env[key]);
		delete process.env[key];
	}
});

afterEach(() => {
	for (const tempFile of tempFiles.splice(0)) {
		tempFile.cleanup();
	}

	for (const key of ENV_KEYS) {
		const originalValue = savedEnv.get(key);
		if (originalValue === undefined) {
			delete process.env[key];
		} else {
			process.env[key] = originalValue;
		}
	}

	if (ORIGINAL_HOME === undefined) {
		delete process.env["HOME"];
	} else {
		process.env["HOME"] = ORIGINAL_HOME;
	}
});

function createIsolatedTempFs(): TempFs {
	const tempFile = createTempFs();
	tempFiles.push(tempFile);
	process.env["HOME"] = tempFile.path("home");
	tempFile.mkdir("home");
	return tempFile;
}

function createProject(): TempFs {
	const tempFile = createIsolatedTempFs();
	tempFile.writeJson("package.json", { name: "fixture" });
	return tempFile;
}

function projectCwd(project: TempFs): string {
	return realpathSync.native(project.root);
}

function registerExtension(): FakePiHarness {
	const fakePi = createFakePi();
	piRulesExtension(fakePi.pi);
	return fakePi;
}

function sessionStartEvent(reason: SessionStartEvent["reason"] = "startup"): SessionStartEvent {
	return { type: "session_start", reason };
}

function beforeAgentStartEvent(
	cwd: string,
	contextFiles: Array<{ path: string; content: string }> = [],
): BeforeAgentStartEvent {
	return {
		type: "before_agent_start",
		prompt: "Implement the task.",
		systemPrompt: BASE_SYSTEM_PROMPT,
		systemPromptOptions: { cwd, contextFiles },
	};
}

function readToolResultEvent(overrides: { details?: { filePath?: string }; isError?: boolean } = {}): ToolResultEvent {
	return {
		type: "tool_result",
		toolCallId: "tool-call-id",
		toolName: "read",
		input: {},
		content: [],
		isError: overrides.isError ?? false,
		details: overrides.details,
	};
}

function readSystemPrompt(result: unknown): string {
	if (typeof result !== "object" || result === null || !("systemPrompt" in result)) {
		throw new Error("expected before_agent_start result to carry a systemPrompt");
	}

	const { systemPrompt } = result;
	if (typeof systemPrompt !== "string") {
		throw new Error("expected systemPrompt to be a string");
	}

	return systemPrompt;
}

function injectedBlock(result: unknown): string {
	return readSystemPrompt(result).slice(BASE_SYSTEM_PROMPT.length);
}

function truncationNoticeFor(relativePath: string): string {
	return TRUNCATION_NOTICE.replace("{path}", relativePath);
}

describe("piRulesExtension environment configuration", () => {
	it("#given PI_RULES_MAX_RULE_CHARS=50 and PI_RULES_MAX_RESULT_CHARS=200 and a project rule body far longer than 50 chars #when before_agent_start is emitted #then the injected block respects the caps and carries the truncation notice", async () => {
		// given
		const project = createProject();
		project.write("AGENTS.md", "x".repeat(5000));
		process.env["PI_RULES_MAX_RULE_CHARS"] = "50";
		process.env["PI_RULES_MAX_RESULT_CHARS"] = "200";
		const fakePi = registerExtension();
		const cwd = projectCwd(project);

		// when
		const result = await fakePi.emit("before_agent_start", beforeAgentStartEvent(cwd), fakePi.makeCtx({ cwd }));

		// then
		const injected = injectedBlock(result);
		expect(injected.length).toBeLessThanOrEqual(200);
		expect(injected).toContain(truncationNoticeFor("AGENTS.md"));
	});

	it("#given PI_RULES_DISABLED=1 and a matching project rule and the pi-rules-disabled flag left at its default #when session_start then before_agent_start are emitted #then before_agent_start returns undefined", async () => {
		// given
		const project = createProject();
		project.write("AGENTS.md", "Use project rules.");
		process.env["PI_RULES_DISABLED"] = "1";
		const fakePi = registerExtension();
		const cwd = projectCwd(project);
		const ctx = fakePi.makeCtx({ cwd });
		const event = beforeAgentStartEvent(cwd);

		// when
		await fakePi.emit("session_start", sessionStartEvent(), ctx);
		const firstResult = await fakePi.emit("before_agent_start", event, ctx);
		const secondResult = await fakePi.emit("before_agent_start", event, ctx);

		// then
		expect(firstResult).toBeUndefined();
		expect(secondResult).toBeUndefined();
	});

	it("#given PI_RULES_DISABLED=1 #when tool_result is emitted for a read of a matching file #then the handler returns undefined", async () => {
		// given
		const project = createProject();
		const targetPath = realpathSync.native(project.write("src/index.ts", "export const value = 1;"));
		project.write(".omo/rules/typescript.md", '---\nglobs: "src/**/*.ts"\n---\nUse TypeScript rules.');
		process.env["PI_RULES_DISABLED"] = "1";
		const fakePi = registerExtension();
		const cwd = projectCwd(project);

		// when
		const result = await fakePi.emit(
			"tool_result",
			readToolResultEvent({ details: { filePath: targetPath } }),
			fakePi.makeCtx({ cwd }),
		);

		// then
		expect(result).toBeUndefined();
	});

	it("#given PI_RULES_MAX_RULE_CHARS=abc and PI_RULES_MAX_RESULT_CHARS=-5 #when before_agent_start is emitted #then injection still happens with the default budget", async () => {
		// given
		const project = createProject();
		project.write("AGENTS.md", "Use project rules.");
		process.env["PI_RULES_MAX_RULE_CHARS"] = "abc";
		process.env["PI_RULES_MAX_RESULT_CHARS"] = "-5";
		const fakePi = registerExtension();
		const cwd = projectCwd(project);

		// when
		const result = await fakePi.emit("before_agent_start", beforeAgentStartEvent(cwd), fakePi.makeCtx({ cwd }));

		// then
		expect(readSystemPrompt(result)).toContain("Use project rules.");
	});

	it("#given no PI_RULES_* env vars and the pi-rules-disabled flag set to true #when before_agent_start is emitted #then it still returns undefined", async () => {
		// given
		const project = createProject();
		project.write("AGENTS.md", "Use project rules.");
		const fakePi = registerExtension();
		fakePi.flagValues.set("pi-rules-disabled", true);
		const cwd = projectCwd(project);

		// when
		const result = await fakePi.emit("before_agent_start", beforeAgentStartEvent(cwd), fakePi.makeCtx({ cwd }));

		// then
		expect(result).toBeUndefined();
	});

	it("#given no PI_RULES_* env vars #when before_agent_start is emitted #then the rule is injected with default behavior", async () => {
		// given
		const project = createProject();
		project.write("AGENTS.md", "Use project rules.");
		const fakePi = registerExtension();
		const cwd = projectCwd(project);

		// when
		const result = await fakePi.emit("before_agent_start", beforeAgentStartEvent(cwd), fakePi.makeCtx({ cwd }));

		// then
		expect(readSystemPrompt(result)).toContain("Use project rules.");
	});
});
