import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { Agent } from "@oh-my-pi/pi-agent-core";
import { ModelRegistry } from "@oh-my-pi/pi-coding-agent/config/model-registry";
import { resetSettingsForTest, Settings } from "@oh-my-pi/pi-coding-agent/config/settings";
import { InteractiveMode } from "@oh-my-pi/pi-coding-agent/modes/interactive-mode";
import { initTheme } from "@oh-my-pi/pi-coding-agent/modes/theme/theme";
import { AgentSession } from "@oh-my-pi/pi-coding-agent/session/agent-session";
import { AuthStorage } from "@oh-my-pi/pi-coding-agent/session/auth-storage";
import { SessionManager } from "@oh-my-pi/pi-coding-agent/session/session-manager";
import { TempDir } from "@oh-my-pi/pi-utils";

describe("InteractiveMode session resumption model preservation", () => {
	let tempDir: TempDir;
	let authStorage: AuthStorage;
	let session: AgentSession;
	let mode: InteractiveMode;

	beforeAll(async () => {
		await initTheme();
	});

	beforeEach(async () => {
		resetSettingsForTest();
		tempDir = TempDir.createSync("@pi-resumption-");
		await Settings.init({ inMemory: true, cwd: tempDir.path() });
		authStorage = await AuthStorage.create(path.join(tempDir.path(), "testauth.db"));
		authStorage.setRuntimeApiKey("anthropic", "test-key");
		const modelRegistry = new ModelRegistry(authStorage);
		const model = modelRegistry.find("anthropic", "claude-sonnet-4-5");
		if (!model) throw new Error("Expected claude-sonnet-4-5 to exist in registry");

		// Write a dummy modes.yml so we can activate custom modes
		const ompDir = path.join(tempDir.path(), ".omp");
		fs.mkdirSync(ompDir, { recursive: true });
		fs.writeFileSync(
			path.join(ompDir, "modes.yml"),
			`
fast:
  model: claude-haiku-4-5
  provider: anthropic
  thinkingLevel: off
`
		);

		session = new AgentSession({
			agent: new Agent({
				initialState: { model, systemPrompt: ["Test"], tools: [], messages: [] },
			}),
			sessionManager: SessionManager.create(tempDir.path(), tempDir.path()),
			settings: Settings.isolated({}),
			modelRegistry,
		});
		mode = new InteractiveMode(session, "test");
	});

	afterEach(async () => {
		mode?.stop();
		await session?.dispose();
		authStorage?.close();
		tempDir?.removeSync();
		vi.useRealTimers();
		vi.restoreAllMocks();
		resetSettingsForTest();
	});

	it("preserves original session model and thinking level on resumption", async () => {
		// Verify initial model
		expect(session.model?.id).toBe("claude-sonnet-4-5");

		// Activate 'fast' mode
		const { loadModes } = require("../src/core/modes");
		const modeConfig = loadModes(tempDir.path()).fast;
		await mode.activateMode("fast", modeConfig);

		// Model and thinking level should now reflect the mode
		expect(session.model?.id).toBe("claude-haiku-4-5");
		expect(session.thinkingLevel).toBe("off");

		// Simulate session reload/resume
		const savedSessionFile = session.sessionFile;
		expect(savedSessionFile).toBeDefined();

		await session.sessionManager.ensureOnDisk();
		// Dispose current session/mode and load a new session from the saved file
		await session.dispose();

		const newSessionManager = await SessionManager.open(savedSessionFile!, tempDir.path());
		const newSession = new AgentSession({
			agent: new Agent({
				initialState: {
					model: session.modelRegistry.find("anthropic", "claude-sonnet-4-5")!,
					systemPrompt: ["Test"],
					tools: [],
					messages: [],
				},
			}),
			sessionManager: newSessionManager,
			settings: Settings.isolated({}),
			modelRegistry: session.modelRegistry,
		});
		const newMode = new InteractiveMode(newSession, "test");

		await newMode.restoreModeFromSession();
		// The new mode has the 'fast' mode active, but its baseline should be the session's original model!
		expect(newMode.activeModeName).toBe("fast");

		// When we switch back to 'session' mode, it should restore the original 'claude-sonnet-4-5'!
		await newMode.restoreSessionMode();
		expect(newSession.model?.id).toBe("claude-sonnet-4-5");

		newMode.stop();
		await newSession.dispose();
	});

	it("reverts back to default session mode when starting a new session via newSession", async () => {
		// Verify initial state
		expect(session.model?.id).toBe("claude-sonnet-4-5");

		// Activate 'fast' mode
		const { loadModes } = require("../src/core/modes");
		const modeConfig = loadModes(tempDir.path()).fast;
		await mode.activateMode("fast", modeConfig);
		expect(mode.activeModeName).toBe("fast");
		expect(session.model?.id).toBe("claude-haiku-4-5");

		// Set up the sessionSwitchReconciler
		session.setSessionSwitchReconciler(() => mode.restoreModeFromSession());

		// Call newSession (recreating starting a new session /new)
		const success = await session.newSession();
		expect(success).toBe(true);

		// Since it is a new session with no custom entries, active mode name should be reset (no longer 'fast' / 'hard')
		expect(mode.activeModeName).toBeUndefined();
	});
});
