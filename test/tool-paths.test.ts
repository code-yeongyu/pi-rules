import type { ToolResultEvent } from "@mariozechner/pi-coding-agent";
import { describe, expect, it } from "vitest";

import { extractToolPaths, isTrackedTool } from "../src/rules/tool-paths.js";

const CWD = "/tmp/project";

function toolResultEvent(
	toolName: string,
	overrides: Partial<Omit<ToolResultEvent, "type" | "toolCallId" | "toolName" | "input" | "content" | "isError">> & {
		input?: Record<string, unknown>;
		isError?: boolean;
	} = {},
): ToolResultEvent {
	return {
		type: "tool_result",
		toolCallId: "tool-call-id",
		toolName,
		input: overrides.input ?? {},
		content: [],
		isError: overrides.isError ?? false,
		details: overrides.details,
	};
}

describe("extractToolPaths", () => {
	it("#given read tool result with filePath in details #when extracting #then returns [filePath]", () => {
		// given
		const filePath = "/tmp/project/src/read-target.ts";
		const event = toolResultEvent("read", { details: { filePath } });

		// when
		const paths = extractToolPaths(event, CWD);

		// then
		expect(paths).toEqual([filePath]);
	});

	it("#given edit tool result with filePath in details #when extracting #then returns [filePath]", () => {
		// given
		const filePath = "/tmp/project/src/edit-target.ts";
		const event = toolResultEvent("edit", { details: { filePath } });

		// when
		const paths = extractToolPaths(event, CWD);

		// then
		expect(paths).toEqual([filePath]);
	});

	it("#given write tool result with filePath in input #when extracting #then returns [filePath]", () => {
		// given
		const filePath = "/tmp/project/src/write-target.ts";
		const event = toolResultEvent("write", { input: { filePath } });

		// when
		const paths = extractToolPaths(event, CWD);

		// then
		expect(paths).toEqual([filePath]);
	});

	it("#given relative read path and cwd differs from process cwd #when extracting #then resolves against cwd", () => {
		// given
		const event = toolResultEvent("read", { input: { path: "src/read-target.ts" } });

		// when
		const paths = extractToolPaths(event, CWD);

		// then
		expect(paths).toEqual(["/tmp/project/src/read-target.ts"]);
	});

	it("#given tool with isError=true #when extracting #then returns []", () => {
		// given
		const event = toolResultEvent("read", {
			details: { filePath: "/tmp/project/src/read-target.ts" },
			isError: true,
		});

		// when
		const paths = extractToolPaths(event, CWD);

		// then
		expect(paths).toEqual([]);
	});

	it("#given untracked tool name (bash) #when extracting #then returns []", () => {
		// given
		const event = toolResultEvent("bash", { input: { filePath: "/tmp/project/src/bash-target.ts" } });

		// when
		const paths = extractToolPaths(event, CWD);

		// then
		expect(paths).toEqual([]);
	});

	it("#given untracked tool name (grep) #when extracting #then returns []", () => {
		// given
		const event = toolResultEvent("grep", { input: { filePath: "/tmp/project/src/grep-target.ts" } });

		// when
		const paths = extractToolPaths(event, CWD);

		// then
		expect(paths).toEqual([]);
	});

	it("#given untracked tool name (find) #when extracting #then returns []", () => {
		// given
		const event = toolResultEvent("find", { input: { filePath: "/tmp/project/src/find-target.ts" } });

		// when
		const paths = extractToolPaths(event, CWD);

		// then
		expect(paths).toEqual([]);
	});

	it("#given untracked tool name (ls) #when extracting #then returns []", () => {
		// given
		const event = toolResultEvent("ls", { input: { filePath: "/tmp/project/src/ls-target.ts" } });

		// when
		const paths = extractToolPaths(event, CWD);

		// then
		expect(paths).toEqual([]);
	});

	it("#given custom tool name #when extracting #then returns []", () => {
		// given
		const event = toolResultEvent("custom-tool", { input: { filePath: "/tmp/project/src/custom-target.ts" } });

		// when
		const paths = extractToolPaths(event, CWD);

		// then
		expect(paths).toEqual([]);
	});

	it("#given read tool with missing details #when extracting #then returns []", () => {
		// given
		const event = toolResultEvent("read");

		// when
		const paths = extractToolPaths(event, CWD);

		// then
		expect(paths).toEqual([]);
	});

	it("#given read tool with details but no filePath #when extracting #then returns []", () => {
		// given
		const event = toolResultEvent("read", { details: { truncation: { truncated: false } } });

		// when
		const paths = extractToolPaths(event, CWD);

		// then
		expect(paths).toEqual([]);
	});

	it("#given write tool with no input #when extracting #then returns []", () => {
		// given
		const event = toolResultEvent("write");

		// when
		const paths = extractToolPaths(event, CWD);

		// then
		expect(paths).toEqual([]);
	});
});

describe("isTrackedTool", () => {
	it('#given isTrackedTool("read") #then true', () => {
		// given
		const toolName = "read";

		// when
		const tracked = isTrackedTool(toolName);

		// then
		expect(tracked).toBe(true);
	});

	it('#given isTrackedTool("write") #then true', () => {
		// given
		const toolName = "write";

		// when
		const tracked = isTrackedTool(toolName);

		// then
		expect(tracked).toBe(true);
	});

	it('#given isTrackedTool("edit") #then true', () => {
		// given
		const toolName = "edit";

		// when
		const tracked = isTrackedTool(toolName);

		// then
		expect(tracked).toBe(true);
	});

	it('#given isTrackedTool("bash") #then false', () => {
		// given
		const toolName = "bash";

		// when
		const tracked = isTrackedTool(toolName);

		// then
		expect(tracked).toBe(false);
	});
});
