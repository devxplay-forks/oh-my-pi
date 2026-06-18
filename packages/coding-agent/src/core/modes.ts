import * as fs from "node:fs";
import * as path from "node:path";
import type { ThinkingLevel } from "@oh-my-pi/pi-agent-core";
import type { Model } from "@oh-my-pi/pi-ai";
import { YAML } from "bun";
import { getModesPath } from "../config";

export { getModesPath };

/** Configuration for a single named mode loaded from modes.yml. */
export interface ModeConfig {
	provider?: string;
	model?: string;
	thinkingLevel?: ThinkingLevel;
	instructions?: string;
	reminder?: string;
	intentTracing?: boolean;
}

/** Snapshot of the session state before entering a non-session mode. */
export interface SessionBaseline {
	model: Model | undefined;
	thinkingLevel: ThinkingLevel;
}

/**
 * Load mode configurations from global (~/.omp/agent/modes.yml or .yaml) and
 * project-local (.omp/modes.yml or .yaml), with project-local overriding global.
 */
export function loadModes(cwd: string): Record<string, ModeConfig> {
	const globalPath = getModesPath();

	const projectDir = path.join(cwd, ".omp");
	let projectPath = path.join(projectDir, "modes.yml");
	if (!fs.existsSync(projectPath)) {
		const alternativePath = path.join(projectDir, "modes.yaml");
		if (fs.existsSync(alternativePath)) {
			projectPath = alternativePath;
		}
	}

	let globalModes: Record<string, ModeConfig> = {};
	let projectModes: Record<string, ModeConfig> = {};

	const parseFile = (filePath: string): Record<string, ModeConfig> => {
		try {
			const content = fs.readFileSync(filePath, "utf-8");
			return YAML.parse(content) as Record<string, ModeConfig>;
		} catch {
			return {};
		}
	};

	if (fs.existsSync(globalPath)) {
		globalModes = parseFile(globalPath);
	}

	if (fs.existsSync(projectPath)) {
		projectModes = parseFile(projectPath);
	}

	return { ...globalModes, ...projectModes };
}
