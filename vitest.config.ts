import { defineConfig } from "vitest/config";

const isTargetingIntegration = process.argv.some((argument) => argument.includes("test/integration"));

export default defineConfig({
	test: {
		include: ["test/**/*.test.ts"],
		exclude: isTargetingIntegration ? [] : ["test/integration/**"],
		environment: "node",
	},
});
