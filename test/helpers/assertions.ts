import { expect } from "vitest";
import type { LoadedRule, RuleCandidate } from "../../src/rules/types.js";

/**
 * Assert that the candidates are sorted by ordering tuple
 * (isGlobal ASC, distance ASC, source priority ASC, relativePath ASC).
 *
 * Verifies just that for any pair (i, i+1), candidate[i] is not strictly worse than candidate[i+1].
 */
export function expectOrdered(candidates: ReadonlyArray<RuleCandidate>): void {
	for (let i = 0; i < candidates.length - 1; i++) {
		const left = candidates[i];
		const right = candidates[i + 1];
		if (!left || !right) continue;
		if (left.isGlobal !== right.isGlobal) {
			expect(left.isGlobal).toBe(false);
			continue;
		}
		if (left.distance !== right.distance) {
			expect(left.distance).toBeLessThanOrEqual(right.distance);
		}
	}
}

export function expectInjectedRule(text: string, rule: Pick<LoadedRule, "path" | "body">): void {
	expect(text).toContain(`Instructions from: ${rule.path}`);
	expect(text).toContain(rule.body.split("\n")[0] ?? rule.body);
}
