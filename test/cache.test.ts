import { describe, expect, it } from "vitest";

import {
	clearDynamicForToolCall,
	clearSession,
	createSessionState,
	dynamicDedupKey,
	isDynamicInjected,
	isStaticInjected,
	markDynamicInjected,
	markStaticInjected,
	staticDedupKey,
} from "../src/rules/cache.js";
import { makeLoadedRule } from "./helpers/rule-fixtures.js";

describe("createSessionState", () => {
	it("#given new state #when created #then has empty sets and undefined cwd", () => {
		// given
		const cwd = undefined;

		// when
		const state = createSessionState(cwd);

		// then
		expect(state.cwd).toBeUndefined();
		expect(state.staticDedup.size).toBe(0);
		expect(state.dynamicDedup.size).toBe(0);
		expect(state.loadedRules).toEqual([]);
		expect(state.diagnostics).toEqual([]);
	});

	it("#given state with cwd #when created with cwd arg #then state.cwd matches", () => {
		// given
		const cwd = "/workspace/project";

		// when
		const state = createSessionState(cwd);

		// then
		expect(state.cwd).toBe(cwd);
	});
});

describe("markStaticInjected", () => {
	it("#given fresh state and rule #when marking static injected first time #then returns true", () => {
		// given
		const state = createSessionState();
		const rule = makeLoadedRule();

		// when
		const result = markStaticInjected(state, rule);

		// then
		expect(result).toBe(true);
	});

	it("#given fresh state and rule #when marking static injected twice #then second returns false", () => {
		// given
		const state = createSessionState();
		const rule = makeLoadedRule();

		// when
		const firstResult = markStaticInjected(state, rule);
		const secondResult = markStaticInjected(state, rule);

		// then
		expect(firstResult).toBe(true);
		expect(secondResult).toBe(false);
	});

	it("#given two different rules #when marking both static injected #then both return true", () => {
		// given
		const state = createSessionState();
		const firstRule = makeLoadedRule({ realPath: "/workspace/.sisyphus/rules/first.md" });
		const secondRule = makeLoadedRule({ realPath: "/workspace/.sisyphus/rules/second.md" });

		// when
		const firstResult = markStaticInjected(state, firstRule);
		const secondResult = markStaticInjected(state, secondRule);

		// then
		expect(firstResult).toBe(true);
		expect(secondResult).toBe(true);
	});

	it("#given same realPath but different contentHash #when marking static injected #then both succeed (different keys)", () => {
		// given
		const state = createSessionState();
		const realPath = "/workspace/.sisyphus/rules/shared.md";
		const firstRule = makeLoadedRule({ realPath, contentHash: "first-hash" });
		const secondRule = makeLoadedRule({ realPath, contentHash: "second-hash" });

		// when
		const firstResult = markStaticInjected(state, firstRule);
		const secondResult = markStaticInjected(state, secondRule);

		// then
		expect(firstResult).toBe(true);
		expect(secondResult).toBe(true);
	});

	it("#given different cwd in state #when marking static #then key includes cwd", () => {
		// given
		const cwd = "/workspace/project";
		const state = createSessionState(cwd);
		const rule = makeLoadedRule({ realPath: "/workspace/project/AGENTS.md", contentHash: "hash" });

		// when
		const result = markStaticInjected(state, rule);

		// then
		expect(result).toBe(true);
		expect(state.staticDedup.has(staticDedupKey(cwd, rule.realPath, rule.contentHash))).toBe(true);
		expect(state.staticDedup.has(staticDedupKey("", rule.realPath, rule.contentHash))).toBe(false);
	});
});

describe("markDynamicInjected", () => {
	it("#given fresh state #when marking dynamic injected first time for toolCallId X #then returns true", () => {
		// given
		const state = createSessionState();
		const rule = makeLoadedRule();

		// when
		const result = markDynamicInjected(state, "tool-call-x", rule);

		// then
		expect(result).toBe(true);
	});

	it("#given marked rule #when marking dynamic injected again same toolCallId same rule #then returns false", () => {
		// given
		const state = createSessionState();
		const rule = makeLoadedRule();

		// when
		const firstResult = markDynamicInjected(state, "tool-call-x", rule);
		const secondResult = markDynamicInjected(state, "tool-call-x", rule);

		// then
		expect(firstResult).toBe(true);
		expect(secondResult).toBe(false);
	});

	it("#given marked rule for toolCallId X #when marking same rule for toolCallId Y #then returns true (per-toolCallId dedup)", () => {
		// given
		const state = createSessionState();
		const rule = makeLoadedRule();

		// when
		const firstResult = markDynamicInjected(state, "tool-call-x", rule);
		const secondResult = markDynamicInjected(state, "tool-call-y", rule);

		// then
		expect(firstResult).toBe(true);
		expect(secondResult).toBe(true);
	});
});

describe("isInjected", () => {
	it("#given marked dynamic #when isDynamicInjected #then true", () => {
		// given
		const state = createSessionState();
		const rule = makeLoadedRule();
		markDynamicInjected(state, "tool-call-x", rule);

		// when
		const result = isDynamicInjected(state, "tool-call-x", rule);

		// then
		expect(result).toBe(true);
	});

	it("#given marked static #when isStaticInjected #then true", () => {
		// given
		const state = createSessionState();
		const rule = makeLoadedRule();
		markStaticInjected(state, rule);

		// when
		const result = isStaticInjected(state, rule);

		// then
		expect(result).toBe(true);
	});
});

describe("clearSession", () => {
	it("#given clearSession #when state has injected entries #then all cleared", () => {
		// given
		const state = createSessionState();
		const rule = makeLoadedRule();
		markStaticInjected(state, rule);
		markDynamicInjected(state, "tool-call-x", rule);
		state.loadedRules.push(rule);
		state.diagnostics.push({ severity: "warning", source: rule.realPath, message: "diagnostic" });

		// when
		clearSession(state);

		// then
		expect(state.staticDedup.size).toBe(0);
		expect(state.dynamicDedup.size).toBe(0);
		expect(state.loadedRules).toEqual([]);
		expect(state.diagnostics).toEqual([]);
	});

	it("#given clearSession #when state.cwd is set #then cwd preserved", () => {
		// given
		const cwd = "/workspace/project";
		const state = createSessionState(cwd);

		// when
		clearSession(state);

		// then
		expect(state.cwd).toBe(cwd);
	});
});

describe("clearDynamicForToolCall", () => {
	it("#given clearDynamicForToolCall(X) #when X has entries #then X cleared but Y unaffected", () => {
		// given
		const state = createSessionState();
		const rule = makeLoadedRule();
		markDynamicInjected(state, "tool-call-x", rule);
		markDynamicInjected(state, "tool-call-y", rule);

		// when
		clearDynamicForToolCall(state, "tool-call-x");

		// then
		expect(isDynamicInjected(state, "tool-call-x", rule)).toBe(false);
		expect(isDynamicInjected(state, "tool-call-y", rule)).toBe(true);
	});
});

describe("dedup keys", () => {
	it("#given staticDedupKey #when same args #then deterministic", () => {
		// given
		const cwd = "/workspace/project";
		const rulePath = "/workspace/project/AGENTS.md";
		const contentHash = "hash";

		// when
		const firstKey = staticDedupKey(cwd, rulePath, contentHash);
		const secondKey = staticDedupKey(cwd, rulePath, contentHash);

		// then
		expect(firstKey).toBe("/workspace/project::/workspace/project/AGENTS.md::hash");
		expect(secondKey).toBe(firstKey);
	});

	it("#given dynamicDedupKey #when same args #then deterministic", () => {
		// given
		const rulePath = "/workspace/project/AGENTS.md";
		const contentHash = "hash";

		// when
		const firstKey = dynamicDedupKey(rulePath, contentHash);
		const secondKey = dynamicDedupKey(rulePath, contentHash);

		// then
		expect(firstKey).toBe("/workspace/project/AGENTS.md::hash");
		expect(secondKey).toBe(firstKey);
	});
});
