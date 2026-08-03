for (const key of ["PI_RULES_DISABLED", "PI_RULES_MAX_RULE_CHARS", "PI_RULES_MAX_RESULT_CHARS"]) {
	delete process.env[key];
}
