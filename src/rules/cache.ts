import type { LoadedRule, SessionState } from "./types.js";

export function createSessionState(cwd?: string): SessionState {
	return { cwd, staticDedup: new Set(), dynamicDedup: new Map(), loadedRules: [], diagnostics: [] };
}

export function staticDedupKey(cwd: string, rulePath: string, contentHash: string): string {
	return `${cwd}::${rulePath}::${contentHash}`;
}

export function dynamicDedupKey(rulePath: string, contentHash: string): string {
	return `${rulePath}::${contentHash}`;
}

export function markStaticInjected(state: SessionState, rule: LoadedRule): boolean {
	const key = staticDedupKey(state.cwd ?? "", rule.realPath, rule.contentHash);
	if (state.staticDedup.has(key)) {
		return false;
	}

	state.staticDedup.add(key);
	return true;
}

export function markDynamicInjected(state: SessionState, toolCallId: string, rule: LoadedRule): boolean {
	let keys = state.dynamicDedup.get(toolCallId);
	if (keys === undefined) {
		keys = new Set();
		state.dynamicDedup.set(toolCallId, keys);
	}

	const key = dynamicDedupKey(rule.realPath, rule.contentHash);
	if (keys.has(key)) {
		return false;
	}

	keys.add(key);
	return true;
}

export function isStaticInjected(state: SessionState, rule: LoadedRule): boolean {
	return state.staticDedup.has(staticDedupKey(state.cwd ?? "", rule.realPath, rule.contentHash));
}

export function isDynamicInjected(state: SessionState, toolCallId: string, rule: LoadedRule): boolean {
	return state.dynamicDedup.get(toolCallId)?.has(dynamicDedupKey(rule.realPath, rule.contentHash)) === true;
}

export function clearSession(state: SessionState): void {
	state.staticDedup.clear();
	state.dynamicDedup.clear();
	state.loadedRules.length = 0;
	state.diagnostics.length = 0;
}

export function clearDynamicForToolCall(state: SessionState, toolCallId: string): void {
	state.dynamicDedup.delete(toolCallId);
}
