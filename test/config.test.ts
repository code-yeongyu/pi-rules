import { describe, expect, it } from "vitest";

import { configFromEnvironment } from "../src/config.js";
import type { PiRulesConfig } from "../src/rules/types.js";

const defaults: PiRulesConfig = {
	disabled: false,
	mode: "both",
	maxRuleChars: 12000,
	maxResultChars: 40000,
	enabledSources: "auto",
};

describe("configFromEnvironment", () => {
	it("#given empty env #when resolving config #then returns full defaults", () => {
		// given
		const env = {};

		// when
		const result = configFromEnvironment(env);

		// then
		expect(result).toEqual(defaults);
	});

	it("#given truthy PI_RULES_DISABLED values #when resolving config #then disabled is true", () => {
		// given
		const truthyValues = ["1", "true", "yes", "on", " TRUE "];

		// when
		const results = truthyValues.map((value) => configFromEnvironment({ PI_RULES_DISABLED: value }).disabled);

		// then
		expect(results).toEqual([true, true, true, true, true]);
	});

	it("#given non-truthy PI_RULES_DISABLED values #when resolving config #then disabled is false", () => {
		// given
		const nonTruthyValues = ["0", "false", "", "   ", "maybe"];

		// when
		const results = nonTruthyValues.map((value) => configFromEnvironment({ PI_RULES_DISABLED: value }).disabled);

		// then
		expect(results).toEqual([false, false, false, false, false]);
	});

	it("#given PI_RULES_MAX_RULE_CHARS=50 #when resolving config #then maxRuleChars is 50 and maxResultChars keeps default", () => {
		// given
		const env = { PI_RULES_MAX_RULE_CHARS: "50" };

		// when
		const result = configFromEnvironment(env);

		// then
		expect(result.maxRuleChars).toBe(50);
		expect(result.maxResultChars).toBe(40000);
	});

	it("#given PI_RULES_MAX_RESULT_CHARS=200 #when resolving config #then maxResultChars is 200 and maxRuleChars keeps default", () => {
		// given
		const env = { PI_RULES_MAX_RESULT_CHARS: "200" };

		// when
		const result = configFromEnvironment(env);

		// then
		expect(result.maxResultChars).toBe(200);
		expect(result.maxRuleChars).toBe(12000);
	});

	it("#given invalid numeric env values #when resolving config #then defaults preserved without throwing", () => {
		// given
		const invalidValues = ["abc", "0", "-5", "", "   "];

		// when
		const resolve = (value: string): PiRulesConfig =>
			configFromEnvironment({ PI_RULES_MAX_RULE_CHARS: value, PI_RULES_MAX_RESULT_CHARS: value });
		const results = invalidValues.map((value) => resolve(value));

		// then
		for (const value of invalidValues) {
			expect(() => resolve(value)).not.toThrow();
		}
		for (const result of results) {
			expect(result.maxRuleChars).toBe(12000);
			expect(result.maxResultChars).toBe(40000);
		}
	});

	it("#given PI_RULES_MAX_RULE_CHARS with surrounding whitespace #when resolving config #then value is trimmed and parsed", () => {
		// given
		const env = { PI_RULES_MAX_RULE_CHARS: " 50 " };

		// when
		const result = configFromEnvironment(env);

		// then
		expect(result.maxRuleChars).toBe(50);
	});

	it("#given no argument #when called #then it reads process.env", () => {
		// given
		const originalValue = process.env["PI_RULES_MAX_RULE_CHARS"];
		process.env["PI_RULES_MAX_RULE_CHARS"] = "77";

		try {
			// when
			const result = configFromEnvironment();

			// then
			expect(result.maxRuleChars).toBe(77);
		} finally {
			if (originalValue === undefined) {
				delete process.env["PI_RULES_MAX_RULE_CHARS"];
			} else {
				process.env["PI_RULES_MAX_RULE_CHARS"] = originalValue;
			}
		}
	});
});
