import { defaultConfig } from "./rules/engine.js";
import type { PiRulesConfig } from "./rules/types.js";

/**
 * Resolve the documented `PI_RULES_*` environment variables on top of the defaults.
 *
 * Values that cannot be parsed (non-numeric, zero, negative) are ignored so a typo
 * degrades to the documented default instead of silently removing the char budget.
 */
export function configFromEnvironment(env: NodeJS.ProcessEnv = process.env): PiRulesConfig {
	const config = defaultConfig();
	config.disabled = isTruthy(readEnv(env, "PI_RULES_DISABLED"));
	config.maxRuleChars = parsePositiveInteger(readEnv(env, "PI_RULES_MAX_RULE_CHARS")) ?? config.maxRuleChars;
	config.maxResultChars = parsePositiveInteger(readEnv(env, "PI_RULES_MAX_RESULT_CHARS")) ?? config.maxResultChars;
	return config;
}

function readEnv(env: NodeJS.ProcessEnv, name: string): string | undefined {
	const value = env[name];
	return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function isTruthy(value: string | undefined): boolean {
	if (value === undefined) return false;
	return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function parsePositiveInteger(value: string | undefined): number | undefined {
	if (value === undefined) return undefined;
	const normalized = value.trim();
	if (!/^\d+$/.test(normalized)) return undefined;
	const parsed = Number(normalized);
	return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}
