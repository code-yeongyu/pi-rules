import { describe, expect, it, vi } from "vitest";
import { registerSlashCommands } from "../src/commands.js";
import type { Engine } from "../src/rules/engine.js";
import { defaultConfig } from "../src/rules/engine.js";
import type { LoadedRule, RuleDiagnostic } from "../src/rules/types.js";
import { createFakePi } from "./helpers/fake-pi.js";
import { makeLoadedRule } from "./helpers/rule-fixtures.js";

function createStubEngine(
	options: {
		rules?: LoadedRule[];
		diagnostics?: RuleDiagnostic[];
		resetSession?: (cwd?: string) => void;
		loadStaticRules?: (cwd: string) => { rules: LoadedRule[]; diagnostics: RuleDiagnostic[] };
	} = {},
): Engine {
	const rules = options.rules ?? [
		makeLoadedRule({ path: "/tmp/test/foo.md", relativePath: "foo.md", body: "Rule body" }),
	];
	const diagnostics = options.diagnostics ?? [];

	return {
		state: {
			cwd: "/tmp/test",
			staticDedup: new Set(),
			dynamicDedup: new Map(),
			dynamicTargetFingerprints: new Map(),
			loadedRules: rules,
			diagnostics,
		},
		config: defaultConfig(),
		loadStaticRules: options.loadStaticRules ?? (() => ({ rules, diagnostics })),
		loadDynamicRules: () => ({ rules: [], diagnostics: [] }),
		formatStatic: () => "static block",
		formatDynamic: () => "dynamic block",
		resetSession: options.resetSession ?? (() => {}),
		isStaticInjected: () => false,
		isDynamicInjected: () => false,
		markStaticInjected: () => true,
		markDynamicInjected: () => true,
		fingerprintDynamicTargets: () => [],
		isDynamicTargetFingerprintCurrent: () => true,
		commitDynamicTargetFingerprints: () => {},
	};
}

function registerCommands(engine: Engine = createStubEngine()) {
	const fakePi = createFakePi();
	registerSlashCommands(fakePi.pi, engine);
	return fakePi;
}

describe("registerSlashCommands", () => {
	it("#given fake pi #when registerSlashCommands called #then 2 commands registered (rules, reload-rules)", () => {
		// given
		const fakePi = createFakePi();
		const engine = createStubEngine();

		// when
		registerSlashCommands(fakePi.pi, engine);

		// then
		expect(fakePi.commands.map((command) => command.name)).toEqual(["rules", "reload-rules"]);
	});

	it("#given /rules command registered #when invoked with empty args in UI mode #then ctx.ui.notify called with summary text", async () => {
		// given
		const fakePi = registerCommands();
		const command = fakePi.commands.find((candidate) => candidate.name === "rules");

		// when
		await command?.options.handler("", fakePi.makeCommandCtx({ cwd: "/tmp/test", hasUI: true }));

		// then
		expect(fakePi.notifications).toEqual([{ message: "pi-rules: 1 rules from 1 sources", severity: "info" }]);
	});

	it('#given /rules with "list" subcommand #when invoked #then notify text contains rule paths', async () => {
		// given
		const rule = makeLoadedRule({ path: "/tmp/test/foo.md", relativePath: "foo.md", source: ".omo/rules" });
		const fakePi = registerCommands(createStubEngine({ rules: [rule] }));
		const command = fakePi.commands.find((candidate) => candidate.name === "rules");

		// when
		await command?.options.handler("list", fakePi.makeCommandCtx({ cwd: "/tmp/test" }));

		// then
		expect(fakePi.notifications[0]?.message).toContain("foo.md");
		expect(fakePi.notifications[0]?.message).toContain(".omo/rules");
	});

	it('#given /rules with "show foo.md" subcommand and matching rule #when invoked #then notify text contains rule body', async () => {
		// given
		const rule = makeLoadedRule({ relativePath: "foo.md", body: "Use concise TypeScript." });
		const fakePi = registerCommands(createStubEngine({ rules: [rule] }));
		const command = fakePi.commands.find((candidate) => candidate.name === "rules");

		// when
		await command?.options.handler("show foo.md", fakePi.makeCommandCtx({ cwd: "/tmp/test" }));

		// then
		expect(fakePi.notifications).toEqual([{ message: "Use concise TypeScript.", severity: "info" }]);
	});

	it('#given /rules with "show <unknown>" #when invoked #then notify error severity', async () => {
		// given
		const fakePi = registerCommands();
		const command = fakePi.commands.find((candidate) => candidate.name === "rules");

		// when
		await command?.options.handler("show missing.md", fakePi.makeCommandCtx({ cwd: "/tmp/test" }));

		// then
		expect(fakePi.notifications).toEqual([{ message: "Rule not found: missing.md", severity: "error" }]);
	});

	it('#given /rules with "paths" subcommand #when invoked #then notify with absolute paths', async () => {
		// given
		const firstRule = makeLoadedRule({ path: "/tmp/test/foo.md", relativePath: "foo.md" });
		const secondRule = makeLoadedRule({ path: "/tmp/test/bar.md", relativePath: "bar.md" });
		const fakePi = registerCommands(createStubEngine({ rules: [firstRule, secondRule] }));
		const command = fakePi.commands.find((candidate) => candidate.name === "rules");

		// when
		await command?.options.handler("paths", fakePi.makeCommandCtx({ cwd: "/tmp/test" }));

		// then
		expect(fakePi.notifications).toEqual([{ message: "/tmp/test/foo.md\n/tmp/test/bar.md", severity: "info" }]);
	});

	it('#given /rules with empty engine.state.loadedRules #when invoked #then summary shows "0 rules"', async () => {
		// given
		const fakePi = registerCommands(createStubEngine({ rules: [] }));
		const command = fakePi.commands.find((candidate) => candidate.name === "rules");

		// when
		await command?.options.handler("", fakePi.makeCommandCtx({ cwd: "/tmp/test" }));

		// then
		expect(fakePi.notifications).toEqual([{ message: "pi-rules: 0 rules from 0 sources", severity: "info" }]);
	});

	it("#given /reload-rules invoked #when called #then engine.resetSession called", async () => {
		// given
		const resetSession = vi.fn();
		const fakePi = registerCommands(createStubEngine({ resetSession }));
		const command = fakePi.commands.find((candidate) => candidate.name === "reload-rules");

		// when
		await command?.options.handler("", fakePi.makeCommandCtx({ cwd: "/tmp/test" }));

		// then
		expect(resetSession).toHaveBeenCalledWith("/tmp/test");
	});

	it("#given /reload-rules invoked #when called #then loadStaticRules called", async () => {
		// given
		const loadStaticRules = vi.fn((_cwd: string) => ({ rules: [], diagnostics: [] }));
		const fakePi = registerCommands(createStubEngine({ loadStaticRules }));
		const command = fakePi.commands.find((candidate) => candidate.name === "reload-rules");

		// when
		await command?.options.handler("", fakePi.makeCommandCtx({ cwd: "/tmp/test" }));

		// then
		expect(loadStaticRules).toHaveBeenCalledWith("/tmp/test");
	});

	it("#given /reload-rules in UI mode #when invoked #then notify called with reload status", async () => {
		// given
		const fakePi = registerCommands();
		const command = fakePi.commands.find((candidate) => candidate.name === "reload-rules");

		// when
		await command?.options.handler("", fakePi.makeCommandCtx({ cwd: "/tmp/test", hasUI: true }));

		// then
		expect(fakePi.notifications).toEqual([{ message: "Reloaded 1 rules from 1 sources", severity: "info" }]);
	});

	it('#given /rules getArgumentCompletions("li") #when called #then returns ["list"]', async () => {
		// given
		const fakePi = registerCommands();
		const command = fakePi.commands.find((candidate) => candidate.name === "rules");

		// when
		const completions = await command?.options.getArgumentCompletions?.("li");

		// then
		expect(completions?.map((completion) => completion.value)).toEqual(["list"]);
	});

	it('#given /rules getArgumentCompletions("") #when called #then returns all 4 subcommands', async () => {
		// given
		const fakePi = registerCommands();
		const command = fakePi.commands.find((candidate) => candidate.name === "rules");

		// when
		const completions = await command?.options.getArgumentCompletions?.("");

		// then
		expect(completions?.map((completion) => completion.value)).toEqual(["list", "show", "paths", "status"]);
	});

	it('#given /rules getArgumentCompletions("xyz") #when called #then returns null', async () => {
		// given
		const fakePi = registerCommands();
		const command = fakePi.commands.find((candidate) => candidate.name === "rules");

		// when
		const completions = await command?.options.getArgumentCompletions?.("xyz");

		// then
		expect(completions).toBeNull();
	});

	it("#given hasUI=false context #when /rules invoked #then notify still called (commands work in non-UI mode)", async () => {
		// given
		const fakePi = registerCommands();
		const command = fakePi.commands.find((candidate) => candidate.name === "rules");

		// when
		await command?.options.handler("status", fakePi.makeCommandCtx({ cwd: "/tmp/test", hasUI: false }));

		// then
		expect(fakePi.notifications).toEqual([{ message: "pi-rules: 1 rules from 1 sources", severity: "info" }]);
	});

	it("#given hasUI=false #when /reload-rules invoked #then engine.resetSession still called and notify still works", async () => {
		// given
		const resetSession = vi.fn();
		const fakePi = registerCommands(createStubEngine({ resetSession }));
		const command = fakePi.commands.find((candidate) => candidate.name === "reload-rules");

		// when
		await command?.options.handler("", fakePi.makeCommandCtx({ cwd: "/tmp/test", hasUI: false }));

		// then
		expect(resetSession).toHaveBeenCalledWith("/tmp/test");
		expect(fakePi.notifications).toEqual([{ message: "Reloaded 1 rules from 1 sources", severity: "info" }]);
	});
});
