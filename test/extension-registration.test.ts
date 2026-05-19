import { realpathSync } from "node:fs";
import type { BeforeAgentStartEvent, SessionStartEvent, ToolResultEvent } from "@mariozechner/pi-coding-agent";
import { afterEach, describe, expect, it } from "vitest";

import piRulesExtension from "../src/index.js";
import { createFakePi, type FakePiHarness } from "./helpers/fake-pi.js";
import { createTempFs, type TempFs } from "./helpers/temp-fs.js";

const ORIGINAL_HOME = process.env["HOME"];

const tempFiles: TempFs[] = [];

afterEach(() => {
	for (const tempFile of tempFiles.splice(0)) {
		tempFile.cleanup();
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
		systemPrompt: "Base prompt.",
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

function bashToolResultEvent(): ToolResultEvent {
	return {
		type: "tool_result",
		toolCallId: "tool-call-id",
		toolName: "bash",
		input: {},
		content: [],
		isError: false,
		details: undefined,
	};
}

describe("piRulesExtension", () => {
	it("#given fake pi #when extension factory called #then disabled and mode flags registered", () => {
		// given
		const fakePi = createFakePi();

		// when
		piRulesExtension(fakePi.pi);

		// then
		expect([...fakePi.flags.keys()]).toEqual(["pi-rules-disabled", "pi-rules-mode"]);
		expect(fakePi.flags.get("pi-rules-disabled")?.options).toMatchObject({ type: "boolean", default: false });
		expect(fakePi.flags.get("pi-rules-mode")?.options).toMatchObject({ type: "string", default: "both" });
	});

	it("#given fake pi #when factory called #then session_start handler registered", () => {
		// given
		const fakePi = createFakePi();

		// when
		piRulesExtension(fakePi.pi);

		// then
		expect(fakePi.handlers.some((handler) => handler.event === "session_start")).toBe(true);
	});

	it("#given fake pi #when factory called #then before_agent_start handler registered", () => {
		// given
		const fakePi = createFakePi();

		// when
		piRulesExtension(fakePi.pi);

		// then
		expect(fakePi.handlers.some((handler) => handler.event === "before_agent_start")).toBe(true);
	});

	it("#given fake pi #when factory called #then tool_result handler registered", () => {
		// given
		const fakePi = createFakePi();

		// when
		piRulesExtension(fakePi.pi);

		// then
		expect(fakePi.handlers.some((handler) => handler.event === "tool_result")).toBe(true);
	});

	it("#given pi-rules-disabled flag set to true #when before_agent_start emitted #then handler returns undefined (no systemPrompt mutation)", async () => {
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

	it("#given disabled true #when tool_result emitted #then handler returns undefined", async () => {
		// given
		const project = createProject();
		const targetPath = project.write("src/index.ts", "export const value = 1;");
		project.write(".omo/rules/typescript.md", '---\nglobs: "src/**/*.ts"\n---\nUse TypeScript rules.');
		const fakePi = registerExtension();
		fakePi.flagValues.set("pi-rules-disabled", true);
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

	it('#given session_start emitted #when handler runs #then appendEntry called with "pi-rules.scan"', async () => {
		// given
		const project = createProject();
		const fakePi = registerExtension();
		const cwd = projectCwd(project);

		// when
		await fakePi.emit("session_start", sessionStartEvent("reload"), fakePi.makeCtx({ cwd }));

		// then
		expect(fakePi.entries).toEqual([{ customType: "pi-rules.scan", data: { cwd, reason: "reload" } }]);
	});

	it("#given session_start emitted #when handler runs twice #then state reset between", async () => {
		// given
		const project = createProject();
		project.write("AGENTS.md", "Use project rules.");
		const fakePi = registerExtension();
		const cwd = projectCwd(project);
		const event = beforeAgentStartEvent(cwd);
		const ctx = fakePi.makeCtx({ cwd });

		// when
		await fakePi.emit("session_start", sessionStartEvent(), ctx);
		const firstResult = await fakePi.emit("before_agent_start", event, ctx);
		await fakePi.emit("session_start", sessionStartEvent("new"), ctx);
		const secondResult = await fakePi.emit("before_agent_start", event, ctx);

		// then
		expect(firstResult).toMatchObject({ systemPrompt: expect.stringContaining("Use project rules.") });
		expect(secondResult).toMatchObject({ systemPrompt: expect.stringContaining("Use project rules.") });
	});

	it("#given before_agent_start with no rules in cwd #when handler runs #then returns undefined", async () => {
		// given
		const project = createProject();
		const fakePi = registerExtension();
		const cwd = projectCwd(project);

		// when
		const result = await fakePi.emit("before_agent_start", beforeAgentStartEvent(cwd), fakePi.makeCtx({ cwd }));

		// then
		expect(result).toBeUndefined();
	});

	it("#given default config and no rules #when before_agent_start emitted #then no systemPrompt change", async () => {
		// given
		const project = createProject();
		const fakePi = registerExtension();
		const cwd = projectCwd(project);

		// when
		const result = await fakePi.emit("before_agent_start", beforeAgentStartEvent(cwd), fakePi.makeCtx({ cwd }));

		// then
		expect(result).toBeUndefined();
	});

	it("#given systemPromptOptions.contextFiles contains a path same as a candidate #when before_agent_start emitted #then that candidate is skipped", async () => {
		// given
		const project = createProject();
		project.write("AGENTS.md", "Use project rules.");
		const fakePi = registerExtension();
		const cwd = projectCwd(project);
		const event = beforeAgentStartEvent(cwd, [{ path: `${cwd}/AGENTS.md`, content: "Already loaded." }]);

		// when
		const result = await fakePi.emit("before_agent_start", event, fakePi.makeCtx({ cwd }));

		// then
		expect(result).toBeUndefined();
	});

	it('#given mode="off" #when before_agent_start emitted #then returns undefined', async () => {
		// given
		const project = createProject();
		project.write("AGENTS.md", "Use project rules.");
		const fakePi = registerExtension();
		fakePi.flagValues.set("pi-rules-mode", "off");
		const cwd = projectCwd(project);

		// when
		const result = await fakePi.emit("before_agent_start", beforeAgentStartEvent(cwd), fakePi.makeCtx({ cwd }));

		// then
		expect(result).toBeUndefined();
	});

	it('#given mode="dynamic" #when before_agent_start emitted #then returns undefined', async () => {
		// given
		const project = createProject();
		project.write("AGENTS.md", "Use project rules.");
		const fakePi = registerExtension();
		fakePi.flagValues.set("pi-rules-mode", "dynamic");
		const cwd = projectCwd(project);

		// when
		const result = await fakePi.emit("before_agent_start", beforeAgentStartEvent(cwd), fakePi.makeCtx({ cwd }));

		// then
		expect(result).toBeUndefined();
	});

	it('#given mode="static" #when tool_result emitted #then returns undefined', async () => {
		// given
		const project = createProject();
		const targetPath = project.write("src/index.ts", "export const value = 1;");
		project.write(".omo/rules/typescript.md", '---\nglobs: "src/**/*.ts"\n---\nUse TypeScript rules.');
		const fakePi = registerExtension();
		fakePi.flagValues.set("pi-rules-mode", "static");
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

	it("#given tool_result with isError=true #when handler runs #then returns undefined", async () => {
		// given
		const project = createProject();
		const targetPath = project.write("src/index.ts", "export const value = 1;");
		project.write(".omo/rules/typescript.md", '---\nglobs: "src/**/*.ts"\n---\nUse TypeScript rules.');
		const fakePi = registerExtension();
		const cwd = projectCwd(project);

		// when
		const result = await fakePi.emit(
			"tool_result",
			readToolResultEvent({ details: { filePath: targetPath }, isError: true }),
			fakePi.makeCtx({ cwd }),
		);

		// then
		expect(result).toBeUndefined();
	});

	it("#given tool_result with bash tool name #when handler runs #then returns undefined (untracked tool)", async () => {
		// given
		const project = createProject();
		const fakePi = registerExtension();
		const cwd = projectCwd(project);

		// when
		const result = await fakePi.emit("tool_result", bashToolResultEvent(), fakePi.makeCtx({ cwd }));

		// then
		expect(result).toBeUndefined();
	});

	it("#given tool_result with read tool and no filePath in details #when handler runs #then returns undefined", async () => {
		// given
		const project = createProject();
		const fakePi = registerExtension();
		const cwd = projectCwd(project);

		// when
		const result = await fakePi.emit("tool_result", readToolResultEvent(), fakePi.makeCtx({ cwd }));

		// then
		expect(result).toBeUndefined();
	});
});
