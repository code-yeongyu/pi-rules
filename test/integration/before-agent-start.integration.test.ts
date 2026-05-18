import { realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { BeforeAgentStartEvent, SessionStartEvent } from "@mariozechner/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import piRulesExtension from "../../src/index.js";
import { createFakePi, type FakePiHarness } from "../helpers/fake-pi.js";
import { createTempFs, type TempFs } from "../helpers/temp-fs.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE_PROJECT = path.resolve(__dirname, "../fixtures/sample-project");
const BASE_SYSTEM_PROMPT = "Base prompt.";
const ORIGINAL_HOME = process.env["HOME"];

const tempFiles: TempFs[] = [];

beforeEach(() => {
	const tempFile = createTempFs();
	tempFiles.push(tempFile);
	tempFile.mkdir("home");
	process.env["HOME"] = tempFile.path("home");
});

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

function createProjectTempFs(): TempFs {
	const tempFile = createTempFs();
	tempFiles.push(tempFile);
	tempFile.writeJson("package.json", { name: "fixture" });
	return tempFile;
}

function registerExtension(): FakePiHarness {
	const harness = createFakePi();
	piRulesExtension(harness.pi);
	return harness;
}

function projectCwd(projectPath: string): string {
	return realpathSync.native(projectPath);
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

function sessionStartEvent(): SessionStartEvent {
	return { type: "session_start", reason: "startup" };
}

function expectBeforeAgentStartResult(result: unknown): { systemPrompt: string } {
	expect(result).toEqual({ systemPrompt: expect.any(String) });
	return result as { systemPrompt: string };
}

describe("before_agent_start integration", () => {
	it("#given sample-project fixture #when before_agent_start emitted #then result.systemPrompt is a string longer than event.systemPrompt", async () => {
		// given
		const harness = registerExtension();
		const cwd = projectCwd(SAMPLE_PROJECT);
		const event = beforeAgentStartEvent(cwd);

		// when
		const result = await harness.emit("before_agent_start", event, harness.makeCtx({ cwd }));

		// then
		const returnedEvent = expectBeforeAgentStartResult(result);
		expect(returnedEvent.systemPrompt.length).toBeGreaterThan(event.systemPrompt.length);
	});

	it('#given sample-project fixture #when before_agent_start emitted #then result.systemPrompt contains "Project Instructions"', async () => {
		// given
		const harness = registerExtension();
		const cwd = projectCwd(SAMPLE_PROJECT);

		// when
		const result = await harness.emit("before_agent_start", beforeAgentStartEvent(cwd), harness.makeCtx({ cwd }));

		// then
		const returnedEvent = expectBeforeAgentStartResult(result);
		expect(returnedEvent.systemPrompt).toContain("Project Instructions");
	});

	it('#given sample-project fixture #when before_agent_start emitted #then result.systemPrompt contains "Instructions from:"', async () => {
		// given
		const harness = registerExtension();
		const cwd = projectCwd(SAMPLE_PROJECT);

		// when
		const result = await harness.emit("before_agent_start", beforeAgentStartEvent(cwd), harness.makeCtx({ cwd }));

		// then
		const returnedEvent = expectBeforeAgentStartResult(result);
		expect(returnedEvent.systemPrompt).toContain("Instructions from:");
	});

	it("#given sample-project fixture #when before_agent_start emitted #then result.systemPrompt contains AGENTS.md content", async () => {
		// given
		const harness = registerExtension();
		const cwd = projectCwd(SAMPLE_PROJECT);

		// when
		const result = await harness.emit("before_agent_start", beforeAgentStartEvent(cwd), harness.makeCtx({ cwd }));

		// then
		const returnedEvent = expectBeforeAgentStartResult(result);
		expect(returnedEvent.systemPrompt).toContain("Always wear safety goggles when refactoring.");
	});

	it("#given sample-project fixture with AGENTS.md and CLAUDE.md at root #when before_agent_start emitted #then ONLY AGENTS.md content appears (first-match-wins at distance 0)", async () => {
		// given
		const harness = registerExtension();
		const cwd = projectCwd(SAMPLE_PROJECT);

		// when
		const result = await harness.emit("before_agent_start", beforeAgentStartEvent(cwd), harness.makeCtx({ cwd }));

		// then
		const returnedEvent = expectBeforeAgentStartResult(result);
		expect(returnedEvent.systemPrompt).toContain("Always wear safety goggles when refactoring.");
		expect(returnedEvent.systemPrompt).not.toContain("This is the secondary instruction file.");
	});

	it("#given sample-project fixture #when before_agent_start emitted with systemPromptOptions.contextFiles already containing AGENTS.md #then AGENTS.md is NOT re-injected (dedup against pi-mono native loader)", async () => {
		// given
		const harness = registerExtension();
		const cwd = projectCwd(SAMPLE_PROJECT);
		const event = beforeAgentStartEvent(cwd, [
			{ path: path.resolve(cwd, "AGENTS.md"), content: "Already loaded by pi-mono." },
		]);

		// when
		const result = await harness.emit("before_agent_start", event, harness.makeCtx({ cwd }));

		// then
		const returnedEvent = expectBeforeAgentStartResult(result);
		expect(returnedEvent.systemPrompt).not.toContain(`Instructions from: ${path.resolve(cwd, "AGENTS.md")}`);
		expect(returnedEvent.systemPrompt).not.toContain("Always wear safety goggles when refactoring.");
		expect(returnedEvent.systemPrompt).toContain("Use TypeScript strict mode. Always.");
	});

	it("#given empty temp project (no rules) #when before_agent_start emitted #then result is undefined (no mutation)", async () => {
		// given
		const project = createProjectTempFs();
		const harness = registerExtension();
		const cwd = projectCwd(project.root);

		// when
		const result = await harness.emit("before_agent_start", beforeAgentStartEvent(cwd), harness.makeCtx({ cwd }));

		// then
		expect(result).toBeUndefined();
	});

	it("#given sample-project #when before_agent_start emitted twice in same session #then second call does NOT inject (engine.isStaticInjected dedup)", async () => {
		// given
		const harness = registerExtension();
		const cwd = projectCwd(SAMPLE_PROJECT);
		const ctx = harness.makeCtx({ cwd });
		const event = beforeAgentStartEvent(cwd);
		await harness.emit("session_start", sessionStartEvent(), ctx);

		// when
		const firstResult = await harness.emit("before_agent_start", event, ctx);
		const secondResult = await harness.emit("before_agent_start", event, ctx);

		// then
		expectBeforeAgentStartResult(firstResult);
		expect(secondResult).toBeUndefined();
	});

	it("#given pi-rules-disabled flag set to true #when before_agent_start emitted #then result is undefined", async () => {
		// given
		const harness = registerExtension();
		harness.flagValues.set("pi-rules-disabled", true);
		const cwd = projectCwd(SAMPLE_PROJECT);

		// when
		const result = await harness.emit("before_agent_start", beforeAgentStartEvent(cwd), harness.makeCtx({ cwd }));

		// then
		expect(result).toBeUndefined();
	});

	it('#given mode set to "off" via flag #when before_agent_start emitted #then result is undefined', async () => {
		// given
		const harness = registerExtension();
		harness.flagValues.set("pi-rules-mode", "off");
		const cwd = projectCwd(SAMPLE_PROJECT);

		// when
		const result = await harness.emit("before_agent_start", beforeAgentStartEvent(cwd), harness.makeCtx({ cwd }));

		// then
		expect(result).toBeUndefined();
	});

	it('#given mode="dynamic" via flag #when before_agent_start emitted #then result is undefined (dynamic mode skips static injection)', async () => {
		// given
		const harness = registerExtension();
		harness.flagValues.set("pi-rules-mode", "dynamic");
		const cwd = projectCwd(SAMPLE_PROJECT);

		// when
		const result = await harness.emit("before_agent_start", beforeAgentStartEvent(cwd), harness.makeCtx({ cwd }));

		// then
		expect(result).toBeUndefined();
	});
});
