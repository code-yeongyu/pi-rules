import type {
	ExtensionAPI,
	ExtensionCommandContext,
	ExtensionContext,
	ExtensionHandler,
	RegisteredCommand,
	ToolDefinition,
} from "@mariozechner/pi-coding-agent";
import { createEventBus } from "@mariozechner/pi-coding-agent";
import type { TSchema } from "typebox";

export interface CapturedTool {
	definition: ToolDefinition<TSchema, unknown, never>;
}

export interface CapturedCommand {
	name: string;
	options: Omit<RegisteredCommand, "name" | "sourceInfo">;
}

export interface CapturedFlag {
	name: string;
	options: { description?: string; type: "boolean" | "string"; default?: boolean | string };
}

export interface CapturedShortcut {
	shortcut: string;
	options: { description?: string; handler: (ctx: ExtensionContext) => Promise<void> | void };
}

export interface CapturedHandler<E = unknown, R = unknown> {
	event: string;
	handler: ExtensionHandler<E, R>;
}

export interface CapturedNotification {
	message: string;
	severity: "info" | "warning" | "error" | "success";
}

export interface CapturedWidget {
	key: string;
	content: string[] | undefined | "factory";
	options?: { placement?: "aboveEditor" | "belowEditor" };
}

export interface CapturedStatus {
	key: string;
	text: string | undefined;
}

export interface FakePiHarness {
	pi: ExtensionAPI;
	tools: CapturedTool[];
	commands: CapturedCommand[];
	flags: Map<string, CapturedFlag>;
	flagValues: Map<string, boolean | string>;
	shortcuts: CapturedShortcut[];
	handlers: CapturedHandler[];
	notifications: CapturedNotification[];
	widgets: Map<string, CapturedWidget>;
	statuses: Map<string, CapturedStatus>;
	entries: Array<{ customType: string; data: unknown }>;
	/**
	 * Emit an event to all registered handlers (Promise-aware).
	 * Handlers are chained: if a handler returns a result, that becomes the
	 * input for the next handler.
	 */
	emit(eventName: string, event: unknown, ctx: ExtensionContext): Promise<unknown>;
	/**
	 * Build a stub `ExtensionContext` with the given overrides. UI methods
	 * record into the harness; everything else is a typed no-op.
	 */
	makeCtx(overrides?: Partial<ExtensionContext>): ExtensionContext;
	/**
	 * Build a stub `ExtensionCommandContext` for command-handler tests.
	 */
	makeCommandCtx(overrides?: Partial<ExtensionCommandContext>): ExtensionCommandContext;
}

export function createFakePi(): FakePiHarness {
	const tools: CapturedTool[] = [];
	const commands: CapturedCommand[] = [];
	const flags = new Map<string, CapturedFlag>();
	const flagValues = new Map<string, boolean | string>();
	const shortcuts: CapturedShortcut[] = [];
	const handlers: CapturedHandler[] = [];
	const notifications: CapturedNotification[] = [];
	const widgets = new Map<string, CapturedWidget>();
	const statuses = new Map<string, CapturedStatus>();
	const entries: Array<{ customType: string; data: unknown }> = [];

	const on = ((event: string, handler: ExtensionHandler<never, unknown>) => {
		handlers.push({ event, handler: handler as ExtensionHandler<unknown, unknown> });
	}) as ExtensionAPI["on"];
	const registerTool: ExtensionAPI["registerTool"] = (definition) => {
		tools.push({ definition: definition as ToolDefinition<TSchema, unknown, never> });
	};
	const registerCommand: ExtensionAPI["registerCommand"] = (name, options) => {
		commands.push({ name, options });
	};
	const registerShortcut: ExtensionAPI["registerShortcut"] = (shortcut, options) => {
		shortcuts.push({ shortcut: String(shortcut), options });
	};
	const registerFlag: ExtensionAPI["registerFlag"] = (name, options) => {
		flags.set(name, { name, options });
		if (options.default !== undefined) flagValues.set(name, options.default);
	};
	const getFlag: ExtensionAPI["getFlag"] = (name) => flagValues.get(name);
	const registerMessageRenderer: ExtensionAPI["registerMessageRenderer"] = () => {};
	const sendMessage: ExtensionAPI["sendMessage"] = () => {};
	const sendUserMessage: ExtensionAPI["sendUserMessage"] = () => {};
	const appendEntry: ExtensionAPI["appendEntry"] = (customType, data) => {
		entries.push({ customType, data });
	};
	const setSessionName: ExtensionAPI["setSessionName"] = () => {};
	const getSessionName: ExtensionAPI["getSessionName"] = () => undefined;
	const setLabel: ExtensionAPI["setLabel"] = () => {};
	const exec: ExtensionAPI["exec"] = async () => ({
		stdout: "",
		stderr: "",
		code: 0,
		killed: false,
	});
	const getActiveTools: ExtensionAPI["getActiveTools"] = () => tools.map((tool) => tool.definition.name);
	const getAllTools: ExtensionAPI["getAllTools"] = () => [];
	const setActiveTools: ExtensionAPI["setActiveTools"] = () => {};
	const getCommands: ExtensionAPI["getCommands"] = () => [];
	const setModel: ExtensionAPI["setModel"] = async () => true;
	const getThinkingLevel: ExtensionAPI["getThinkingLevel"] = () => "medium";
	const setThinkingLevel: ExtensionAPI["setThinkingLevel"] = () => {};
	const registerProvider: ExtensionAPI["registerProvider"] = () => {};
	const unregisterProvider: ExtensionAPI["unregisterProvider"] = () => {};

	const pi = {
		on,
		registerTool,
		registerCommand,
		registerShortcut,
		registerFlag,
		getFlag,
		registerMessageRenderer,
		sendMessage,
		sendUserMessage,
		appendEntry,
		setSessionName,
		getSessionName,
		setLabel,
		exec,
		getActiveTools,
		getAllTools,
		setActiveTools,
		getCommands,
		setModel,
		getThinkingLevel,
		setThinkingLevel,
		registerProvider,
		unregisterProvider,
		events: createEventBus(),
	} satisfies ExtensionAPI;

	function makeUiContext(): ExtensionContext["ui"] {
		const ui = {
			notify: (message: string, severity: "info" | "warning" | "error" | "success" = "info") => {
				notifications.push({ message, severity });
			},
			setStatus: (key: string, text: string | undefined) => {
				statuses.set(key, { key, text });
			},
			setWidget: (
				key: string,
				content: string[] | undefined | unknown,
				options?: { placement?: "aboveEditor" | "belowEditor" },
			) => {
				const recorded: CapturedWidget = {
					key,
					content: Array.isArray(content) ? content : content === undefined ? undefined : "factory",
				};
				if (options !== undefined) recorded.options = options;
				widgets.set(key, recorded);
			},
			setHeader: () => {},
			setFooter: () => {},
			setEditorComponent: () => {},
			setWorkingVisible: () => {},
			confirm: async () => true,
			select: async (_key: string, items: string[]) => items[0],
			addAutocompleteProvider: () => () => {},
			getAutocompleteCompletions: async () => [],
		};
		return ui as Partial<ExtensionContext["ui"]> as ExtensionContext["ui"];
	}

	function makeCtx(overrides: Partial<ExtensionContext> = {}): ExtensionContext {
		const base: Record<keyof ExtensionContext, unknown> = {
			ui: makeUiContext(),
			hasUI: true,
			cwd: process.cwd(),
			sessionManager: { listSessions: () => [], getSession: () => undefined },
			modelRegistry: { listModels: () => [], getModel: () => undefined },
			model: undefined,
			isIdle: () => true,
			signal: undefined,
			abort: () => {},
			hasPendingMessages: () => false,
			shutdown: () => {},
			getContextUsage: () => undefined,
			compact: () => {},
			getSystemPrompt: () => "",
		};
		return { ...base, ...overrides } as ExtensionContext;
	}

	function makeCommandCtx(overrides: Partial<ExtensionCommandContext> = {}): ExtensionCommandContext {
		const base = {
			...makeCtx(),
			waitForIdle: async () => {},
			newSession: async () => ({ cancelled: false }),
			fork: async () => ({ cancelled: false }),
			navigateTree: async () => ({ cancelled: false }),
			switchSession: async () => ({ cancelled: false }),
			reload: async () => {},
		};
		return { ...(base as Partial<ExtensionCommandContext>), ...overrides } as ExtensionCommandContext;
	}

	async function emit(eventName: string, event: unknown, ctx: ExtensionContext): Promise<unknown> {
		let current = event;
		let lastResult: unknown;
		for (const handler of handlers) {
			if (handler.event !== eventName) continue;
			const result = await Promise.resolve(handler.handler(current as never, ctx));
			if (result !== undefined && result !== null) {
				lastResult = result;
				// Chain results into next handler's event for hooks that mutate event-shaped state.
				current = { ...(current as object), ...(result as object) };
			}
		}
		return lastResult;
	}

	return {
		pi,
		tools,
		commands,
		flags,
		flagValues,
		shortcuts,
		handlers,
		notifications,
		widgets,
		statuses,
		entries,
		emit,
		makeCtx,
		makeCommandCtx,
	};
}
