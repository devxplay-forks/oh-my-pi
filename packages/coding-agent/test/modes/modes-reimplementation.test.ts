import { beforeAll, describe, expect, it } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { getModesPath } from "@oh-my-pi/pi-coding-agent/config";
import { loadModes } from "@oh-my-pi/pi-coding-agent/core/modes";
import { renderSegment } from "@oh-my-pi/pi-coding-agent/modes/components/status-line/segments";
import type { SegmentContext } from "@oh-my-pi/pi-coding-agent/modes/components/status-line/types";
import { initTheme } from "@oh-my-pi/pi-coding-agent/modes/theme/theme";

beforeAll(async () => {
	await initTheme();
});

describe("Alt+Tab diagnostic", () => {
	it("diagnoses Alt+Tab parsing", () => {
		const { parseKey, matchesKey } = require("../../../tui/src/index");
		console.log("parseKey('\\x1b\\t'):", parseKey("\x1b\t"));
		console.log("matchesKey('\\x1b\\t', 'alt+tab'):", matchesKey("\x1b\t", "alt+tab"));
		console.log("parseKey('\\x1b[27;3;9~'):", parseKey("\x1b[27;3;9~"));
		console.log("matchesKey('\\x1b[27;3;9~', 'alt+tab'):", matchesKey("\x1b[27;3;9~", "alt+tab"));
	});
});

function createModeSegmentContext(activeModeName?: string): SegmentContext {
	return {
		session: {
			state: { model: { id: "test-model", name: "Test Model" } },
			isFastModeActive: () => false,
			isAutoThinking: false,
			autoResolvedThinkingLevel: () => undefined,
			isAdvisorActive: () => false,
		} as unknown as SegmentContext["session"],
		width: 120,
		options: {},
		planMode: null,
		loopMode: null,
		goalMode: null,
		activeModeName,
		collab: null,
		usageStats: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			premiumRequests: 0,
			cost: 0,
			tokensPerSecond: null,
		},
		contextPercent: 0,
		contextWindow: 0,
		autoCompactEnabled: false,
		subagentCount: 0,
		sessionStartTime: Date.now(),
		git: { branch: null, status: null, pr: null },
		usage: null,
	};
}

describe("Modes implementation", () => {
	it("correctly loads global and project-local modes", () => {
		const tempDir = fs.mkdtempSync(path.join(path.dirname(getModesPath()), "omp-modes-test-"));
		try {
			const globalModesFile = getModesPath();
			const projectModesDir = path.join(tempDir, ".omp");
			fs.mkdirSync(projectModesDir, { recursive: true });

			const originalGlobalExists = fs.existsSync(globalModesFile);
			const originalGlobalContent = originalGlobalExists ? fs.readFileSync(globalModesFile, "utf8") : "";

			fs.writeFileSync(
				globalModesFile,
				`
fast:
  model: gemini-flash
  provider: google
high:
  model: claude-sonnet
  provider: anthropic
  thinkingLevel: high
`,
			);
			fs.writeFileSync(
				path.join(projectModesDir, "modes.yml"),
				`
fast:
  model: gpt-4o-mini
  provider: openai
custom:
  model: custom-model
  provider: custom-provider
`,
			);

			try {
				const modes = loadModes(tempDir);
				expect(modes.fast.provider).toBe("openai"); // Project overridden
				expect(modes.fast.model).toBe("gpt-4o-mini");
				expect(modes.high.provider).toBe("anthropic"); // Kept from global
				expect(modes.custom.provider).toBe("custom-provider"); // Added in project
			} finally {
				if (originalGlobalExists) {
					fs.writeFileSync(globalModesFile, originalGlobalContent);
				} else {
					try {
						fs.unlinkSync(globalModesFile);
					} catch {}
				}
			}
		} finally {
			try {
				fs.rmSync(tempDir, { recursive: true, force: true });
			} catch {}
		}
	});

	it("renders active mode in status line model segment when activeModeName is present", () => {
		const renderedWithMode = renderSegment("model", createModeSegmentContext("customMode"));
		expect(renderedWithMode.content).toContain("[customMode]");

		const renderedWithoutMode = renderSegment("model", createModeSegmentContext(undefined));
		expect(renderedWithoutMode.content).not.toContain("[customMode]");
	});
});
