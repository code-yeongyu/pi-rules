import type { Theme } from "@mariozechner/pi-coding-agent";
import { Container } from "@mariozechner/pi-tui";
import type { LoadedRule, RuleDiagnostic } from "../rules/types.js";
import { DynamicBorder } from "./dynamic-border.js";

export interface RulesBannerProps {
	ruleCount: number;
	diagnostics: ReadonlyArray<RuleDiagnostic>;
	topRules?: ReadonlyArray<Pick<LoadedRule, "relativePath" | "matchReason">>;
}

export class RulesBanner extends Container {
	constructor(
		private readonly props: RulesBannerProps,
		private readonly theme: Theme,
	) {
		super();
	}

	override render(width: number): string[] {
		return renderBannerLines(this.props, this.theme, width);
	}

	override invalidate(): void {}
}

export function renderBannerLines(props: RulesBannerProps, theme: Theme, width: number): string[] {
	const lines: string[] = [];
	const border = new DynamicBorder((str) => theme.fg("border", str));

	if (props.ruleCount === 0) {
		lines.push(...border.render(width));
		lines.push(`${theme.bold(theme.fg("accent", "[pi-rules]"))} No rules discovered`);
		lines.push(...border.render(width));
		return lines;
	}

	lines.push(...border.render(width));
	lines.push(
		`${theme.bold(theme.fg("accent", "[pi-rules]"))} ${theme.fg("muted", `${props.ruleCount} active rules`)}`,
	);
	lines.push("");

	if (props.topRules) {
		for (const rule of props.topRules) {
			const hasDiagnostic = props.diagnostics.some((diagnostic) => diagnostic.source === rule.relativePath);
			const indicator = hasDiagnostic ? theme.fg("error", "⚠") : theme.fg("success", "●");

			let annotation = "";
			if (typeof rule.matchReason === "object" && rule.matchReason.kind === "glob") {
				annotation = ` ${theme.fg("muted", rule.matchReason.pattern)}`;
			}

			lines.push(`  ${indicator} ${rule.relativePath}${annotation}`);
		}
	}

	if (props.diagnostics.length > 0) {
		lines.push(`  ${theme.fg("warning", `⚠ ${props.diagnostics.length} warning(s)`)}`);
	}

	lines.push("");
	lines.push(...border.render(width));

	return lines;
}

export interface StatusLineInput {
	ruleCount: number;
	hasErrors: boolean;
}

export function statusLineText(input: StatusLineInput, theme: Theme): string {
	const base = `[pi-rules] ${input.ruleCount} active`;
	if (input.hasErrors) {
		return theme.fg("muted", `${base} · `) + theme.fg("error", "⚠ errors");
	}
	return theme.fg("muted", base);
}
