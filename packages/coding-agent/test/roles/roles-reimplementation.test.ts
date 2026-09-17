import { beforeAll, describe, expect, it } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { getRolesPath } from "@oh-my-pi/pi-coding-agent/config";
import { loadRoles } from "@oh-my-pi/pi-coding-agent/core/roles";
import { renderSegment } from "@oh-my-pi/pi-tui/status-line";
import type { SegmentContext } from "@oh-my-pi/pi-tui/status-line";
import { initTheme } from "@oh-my-pi/pi-tui/theme";

beforeAll(async () => {
	await initTheme();
});

describe("Alt+Tab diagnostic", () => {
	it("diagnoses Alt+Tab parsing", () => {
		const { parseKey, matchesKey } = require("../../../tui/src/keys");
		console.log("parseKey('\\x1b\\t'):", parseKey("\x1b\t"));
		console.log("matchesKey('\\x1b\\t', 'alt+tab'):", matchesKey("\x1b\t", "alt+tab"));
		console.log("parseKey('\\x1b[27;3;9~'):", parseKey("\x1b[27;3;9~"));
		console.log("matchesKey('\\x1b[27;3;9~', 'alt+tab'):", matchesKey("\x1b[27;3;9~", "alt+tab"));
	});
});

function createRoleSegmentContext(activeRoleName?: string): SegmentContext {
	return {
		session: {
			state: { model: { id: "test-model", name: "Test Model" } },
			isFastModeActive: () => false,
			isAutoThinking: false,
			autoResolvedThinkingLevel: () => undefined,
			isAdvisorActive: () => false,
		} as unknown as SegmentContext["session"],
		activeRepo: null,
		width: 120,
		options: {},
		compactThinkingLevel: false,
		planMode: null,
		prewalk: null,
		loopMode: null,
		goalMode: null,
		vibeMode: null,
		vim: null,
		activeRoleName,
		collab: null,
		stream: null,
		recording: false,
		usageStats: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 0,
			orchestrationInput: 0,
			orchestrationOutput: 0,
			orchestrationCacheRead: 0,
			premiumRequests: 0,
			cost: 0,
			tokensPerSecond: null,
		},
		contextPercent: 0,
		contextTokens: 0,
		contextWindow: 0,
		autoCompactEnabled: false,
		compactionSpeculation: "idle",
		speculationBlinkOn: false,
		subagentCount: 0,
		activeMs: 0,
		turnElapsedMs: null,
		git: { branch: null, status: null, pr: null },
		worktree: null,
		usage: null,
	};
}

describe("Roles implementation", () => {
	it("correctly loads global and project-local roles", () => {
		const tempDir = fs.mkdtempSync(path.join(path.dirname(getRolesPath()), "omp-roles-test-"));
		try {
			const globalRolesFile = getRolesPath();
			const projectRolesDir = path.join(tempDir, ".omp");
			fs.mkdirSync(projectRolesDir, { recursive: true });

			const originalGlobalExists = fs.existsSync(globalRolesFile);
			const originalGlobalContent = originalGlobalExists ? fs.readFileSync(globalRolesFile, "utf8") : "";

			fs.writeFileSync(
				globalRolesFile,
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
				path.join(projectRolesDir, "roles.yml"),
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
				const roles = loadRoles(tempDir);
				expect(roles.fast.provider).toBe("openai"); // Project overridden
				expect(roles.fast.model).toBe("gpt-4o-mini");
				expect(roles.high.provider).toBe("anthropic"); // Kept from global
				expect(roles.custom.provider).toBe("custom-provider"); // Added in project
			} finally {
				if (originalGlobalExists) {
					fs.writeFileSync(globalRolesFile, originalGlobalContent);
				} else {
					try {
						fs.unlinkSync(globalRolesFile);
					} catch {}
				}
			}
		} finally {
			try {
				fs.rmSync(tempDir, { recursive: true, force: true });
			} catch {}
		}
	});

	it("renders active role in status line model segment when activeRoleName is present", () => {
		const renderedWithRole = renderSegment("model", createRoleSegmentContext("customRole"));
		expect(renderedWithRole.content).toContain("[customRole]");

		const renderedWithoutRole = renderSegment("model", createRoleSegmentContext(undefined));
		expect(renderedWithoutRole.content).not.toContain("[customRole]");
	});
});
