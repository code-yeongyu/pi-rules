import type { Component } from "@mariozechner/pi-tui";

export class DynamicBorder implements Component {
	constructor(private readonly color: (str: string) => string) {}

	render(width: number): string[] {
		return [this.color("─".repeat(Math.max(1, width)))];
	}

	invalidate(): void {}
}
