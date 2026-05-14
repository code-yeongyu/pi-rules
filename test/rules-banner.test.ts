import { Theme } from "@mariozechner/pi-coding-agent";
import { Container } from "@mariozechner/pi-tui";
import { describe, expect, it } from "vitest";
import { DynamicBorder } from "../src/ui/dynamic-border.js";
import { RulesBanner, renderBannerLines, statusLineText } from "../src/ui/rules-banner.js";

class PlainTheme extends Theme {
	constructor() {
		super(createForegroundColors(), createBackgroundColors(), "256color");
	}

	override fg(_color: Parameters<Theme["fg"]>[0], text: string): string {
		return text;
	}

	override bold(text: string): string {
		return text;
	}
}

const fakeTheme = new PlainTheme();

function createForegroundColors(): ConstructorParameters<typeof Theme>[0] {
	return Object.fromEntries(
		[
			"accent",
			"border",
			"borderAccent",
			"borderMuted",
			"success",
			"error",
			"warning",
			"muted",
			"dim",
			"text",
			"thinkingText",
			"userMessageText",
			"customMessageText",
			"customMessageLabel",
			"toolTitle",
			"toolOutput",
			"mdHeading",
			"mdLink",
			"mdLinkUrl",
			"mdCode",
			"mdCodeBlock",
			"mdCodeBlockBorder",
			"mdQuote",
			"mdQuoteBorder",
			"mdHr",
			"mdListBullet",
			"toolDiffAdded",
			"toolDiffRemoved",
			"toolDiffContext",
			"syntaxComment",
			"syntaxKeyword",
			"syntaxFunction",
			"syntaxVariable",
			"syntaxString",
			"syntaxNumber",
			"syntaxType",
			"syntaxOperator",
			"syntaxPunctuation",
			"thinkingOff",
			"thinkingMinimal",
			"thinkingLow",
			"thinkingMedium",
			"thinkingHigh",
			"thinkingXhigh",
			"bashMode",
		].map((color) => [color, 7]),
	) as ConstructorParameters<typeof Theme>[0];
}

function createBackgroundColors(): ConstructorParameters<typeof Theme>[1] {
	return Object.fromEntries(
		["selectedBg", "userMessageBg", "customMessageBg", "toolPendingBg", "toolSuccessBg", "toolErrorBg"].map(
			(color) => [color, 0],
		),
	) as ConstructorParameters<typeof Theme>[1];
}

describe("DynamicBorder", () => {
	it("returns single line of 80 dashes when width=80", () => {
		const border = new DynamicBorder((str) => str);
		expect(border.render(80)).toEqual(["─".repeat(80)]);
	});

	it("returns single line of at least 1 dash when width=0", () => {
		const border = new DynamicBorder((str) => str);
		expect(border.render(0)).toEqual(["─"]);
	});

	it("returns exactly 120 chars wide when width=120", () => {
		const border = new DynamicBorder((str) => str);
		expect(border.render(120)).toEqual(["─".repeat(120)]);
	});
});

describe("RulesBanner", () => {
	it("is instance of Container", () => {
		const banner = new RulesBanner(
			{
				ruleCount: 0,
				diagnostics: [],
			},
			fakeTheme,
		);
		expect(banner).toBeInstanceOf(Container);
	});
});

describe("renderBannerLines", () => {
	it("renders top border, title with count, top 3 rules, bottom border", () => {
		const lines = renderBannerLines(
			{
				ruleCount: 3,
				diagnostics: [],
				topRules: [
					{ relativePath: "rule1.md", matchReason: "alwaysApply" },
					{ relativePath: "rule2.md", matchReason: { kind: "glob", pattern: "**/*.ts" } },
					{ relativePath: "rule3.md", matchReason: "alwaysApply" },
				],
			},
			fakeTheme,
			80,
		);

		expect(lines[0]).toBe("─".repeat(80));
		expect(lines[1]).toContain("[pi-rules] 3 active rules");
		expect(lines[2]).toBe(""); // Spacer
		expect(lines[3]).toContain("● rule1.md");
		expect(lines[4]).toContain("● rule2.md");
		expect(lines[4]).toContain("**/*.ts");
		expect(lines[5]).toContain("● rule3.md");
		expect(lines[6]).toBe(""); // Spacer
		expect(lines[7]).toBe("─".repeat(80));
	});

	it("shows 'No rules discovered' message when ruleCount=0", () => {
		const lines = renderBannerLines(
			{
				ruleCount: 0,
				diagnostics: [],
			},
			fakeTheme,
			80,
		);

		expect(lines[0]).toBe("─".repeat(80));
		expect(lines[1]).toContain("[pi-rules] No rules discovered");
		expect(lines[2]).toBe("─".repeat(80));
	});

	it("shows exactly 3 rule lines when 5 rules but topRules has 3", () => {
		const lines = renderBannerLines(
			{
				ruleCount: 5,
				diagnostics: [],
				topRules: [
					{ relativePath: "rule1.md", matchReason: "alwaysApply" },
					{ relativePath: "rule2.md", matchReason: "alwaysApply" },
					{ relativePath: "rule3.md", matchReason: "alwaysApply" },
				],
			},
			fakeTheme,
			80,
		);

		expect(lines.filter((l) => l.includes("● rule")).length).toBe(3);
	});

	it("includes '2 warning(s)' line when diagnostics array has 2 entries", () => {
		const lines = renderBannerLines(
			{
				ruleCount: 1,
				diagnostics: [
					{ severity: "warning", source: "rule1.md", message: "warn1" },
					{ severity: "warning", source: "rule2.md", message: "warn2" },
				],
				topRules: [{ relativePath: "rule1.md", matchReason: "alwaysApply" }],
			},
			fakeTheme,
			80,
		);

		expect(lines.some((l) => l.includes("⚠ 2 warning(s)"))).toBe(true);
	});
});

describe("statusLineText", () => {
	it("returns string containing '[pi-rules]' and '3' when ruleCount=3", () => {
		const text = statusLineText({ ruleCount: 3, hasErrors: false }, fakeTheme);
		expect(text).toContain("[pi-rules]");
		expect(text).toContain("3 active");
	});

	it("returns '[pi-rules] 0 active' when ruleCount=0", () => {
		const text = statusLineText({ ruleCount: 0, hasErrors: false }, fakeTheme);
		expect(text).toContain("[pi-rules] 0 active");
	});

	it("returns string containing 'errors' or '⚠' when hasErrors=true", () => {
		const text = statusLineText({ ruleCount: 3, hasErrors: true }, fakeTheme);
		expect(text).toContain("⚠ errors");
	});
});
