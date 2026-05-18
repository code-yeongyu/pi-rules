import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { describe, expect, it } from "vitest";

import piRulesExtension from "../../src/index.js";
import { type CapturedCommand, createFakePi, type FakePiHarness } from "../helpers/fake-pi.js";

const EXPECTED_FLAGS = ["pi-rules-disabled", "pi-rules-mode"];
const EXPECTED_HANDLERS = ["session_start", "session_compact", "before_agent_start", "tool_result"];
const EXPECTED_COMMANDS = ["rules", "reload-rules"];

type RegistrationSurface = {
	harness: FakePiHarness;
	messageRendererRegistrations: number;
	providerRegistrations: number;
};

function registerExtension(): FakePiHarness {
	const harness = createFakePi();
	piRulesExtension(harness.pi);
	return harness;
}

function registerExtensionWithObservedSurface(): RegistrationSurface {
	const harness = createFakePi();
	let messageRendererRegistrations = 0;
	let providerRegistrations = 0;
	const registerMessageRenderer: ExtensionAPI["registerMessageRenderer"] = (...parameters) => {
		messageRendererRegistrations += 1;
		return harness.pi.registerMessageRenderer(...parameters);
	};
	const registerProvider: ExtensionAPI["registerProvider"] = (...parameters) => {
		providerRegistrations += 1;
		return harness.pi.registerProvider(...parameters);
	};

	piRulesExtension({ ...harness.pi, registerMessageRenderer, registerProvider });

	return { harness, messageRendererRegistrations, providerRegistrations };
}

function getCommand(harness: FakePiHarness, name: string): CapturedCommand {
	const command = harness.commands.find((candidate) => candidate.name === name);
	expect(command).toBeDefined();
	return command as CapturedCommand;
}

describe("load extension integration", () => {
	it("#given fake pi #when piRulesExtension factory called #then no errors thrown", () => {
		// given
		const harness = createFakePi();

		// when / then
		expect(() => piRulesExtension(harness.pi)).not.toThrow();
	});

	it("#given factory called #when inspecting harness.flags #then disabled and mode flags registered", () => {
		// given
		const harness = registerExtension();

		// when
		const flags = [...harness.flags.values()];

		// then
		expect(flags.map((flag) => flag.name)).toEqual(EXPECTED_FLAGS);
		expect(harness.flags.get("pi-rules-disabled")?.options).toMatchObject({ type: "boolean", default: false });
		expect(harness.flags.get("pi-rules-mode")?.options).toMatchObject({ type: "string", default: "both" });
	});

	it("#given factory called #when inspecting harness.handlers #then 4 hooks registered: session_start, session_compact, before_agent_start, tool_result", () => {
		// given
		const harness = registerExtension();

		// when
		const handlerEvents = harness.handlers.map((handler) => handler.event);

		// then
		expect(handlerEvents).toEqual(EXPECTED_HANDLERS);
	});

	it("#given factory called #when inspecting harness.commands #then 2 commands registered: rules, reload-rules", () => {
		// given
		const harness = registerExtension();

		// when
		const commandNames = harness.commands.map((command) => command.name);

		// then
		expect(commandNames).toEqual(EXPECTED_COMMANDS);
	});

	it("#given factory called #when each command's options.handler invoked with empty args and ctx #then no errors thrown (smoke test)", async () => {
		// given
		const harness = registerExtension();
		const ctx = harness.makeCommandCtx({ hasUI: false });

		// when / then
		await expect(
			Promise.all(harness.commands.map((command) => command.options.handler("", ctx))),
		).resolves.toBeDefined();
	});

	it("#given factory called #when each command's getArgumentCompletions called with prefix #then returns array OR null (no errors)", async () => {
		// given
		const harness = registerExtension();

		for (const command of harness.commands) {
			// when
			const completions = await Promise.resolve(command.options.getArgumentCompletions?.("s") ?? null);

			// then
			expect(completions === null || Array.isArray(completions)).toBe(true);
		}
	});

	it("#given factory called #when extension API surface inspected #then no extra registrations beyond expected (no rogue tools, shortcuts, message renderers, providers)", () => {
		// given
		const surface = registerExtensionWithObservedSurface();

		// when
		const harness = surface.harness;

		// then
		expect([...harness.flags.keys()]).toEqual(EXPECTED_FLAGS);
		expect(harness.handlers.map((handler) => handler.event)).toEqual(EXPECTED_HANDLERS);
		expect(harness.commands.map((command) => command.name)).toEqual(EXPECTED_COMMANDS);
		expect(harness.tools).toEqual([]);
		expect(harness.shortcuts).toEqual([]);
		expect(surface.messageRendererRegistrations).toBe(0);
		expect(surface.providerRegistrations).toBe(0);
		expect(harness.widgets.size).toBe(0);
		expect(harness.statuses.size).toBe(0);
	});

	it("#given factory called twice on same fake pi #when second call #then registrations DOUBLE (factory is not idempotent — pi-mono spawns one factory call per session typically)", () => {
		// given
		const harness = createFakePi();

		// when
		piRulesExtension(harness.pi);
		piRulesExtension(harness.pi);

		// then
		expect([...harness.flags.keys()]).toEqual(EXPECTED_FLAGS);
		expect(harness.commands.map((command) => command.name)).toEqual([...EXPECTED_COMMANDS, ...EXPECTED_COMMANDS]);
		expect(harness.handlers.map((handler) => handler.event)).toEqual([...EXPECTED_HANDLERS, ...EXPECTED_HANDLERS]);
	});

	it('#given /rules command\'s handler invoked with various subcommands ("list", "show foo.md", "paths", "status") in non-UI mode #then handler completes without throwing', async () => {
		// given
		const harness = registerExtension();
		const command = getCommand(harness, "rules");
		const ctx = harness.makeCommandCtx({ hasUI: false });
		const subcommands = ["list", "show foo.md", "paths", "status"];

		// when / then
		await expect(
			Promise.all(subcommands.map((subcommand) => command.options.handler(subcommand, ctx))),
		).resolves.toBeDefined();
	});

	it("#given /reload-rules invoked with empty args #then handler completes without throwing", async () => {
		// given
		const harness = registerExtension();
		const command = getCommand(harness, "reload-rules");
		const ctx = harness.makeCommandCtx({ hasUI: false });

		// when / then
		await expect(command.options.handler("", ctx)).resolves.toBeUndefined();
	});
});
