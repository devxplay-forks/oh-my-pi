import * as fs from "node:fs";
import * as path from "node:path";
import type { ThinkingLevel } from "@oh-my-pi/pi-agent-core";
import type { Model } from "@oh-my-pi/pi-ai";
import { YAML } from "bun";
import { getRolesPath } from "../config";

export { getRolesPath };

export const ROLE_CHANGE_ENTRY_TYPE = "role_change";

export interface RoleChangeEntryData {
	name?: string;
}

/** Configuration for a single named role loaded from roles.yml, roles.yaml, or roles.json. */
export interface RoleConfig {
	provider?: string;
	model?: string;
	thinkingLevel?: ThinkingLevel;
	instructions?: string;
	guidelines?: string;
	reminder?: string;
	intentTracing?: boolean;
}

/** Snapshot of the session state before entering a non-session role. */
export interface SessionBaseline {
	model: Model | undefined;
	thinkingLevel: ThinkingLevel;
}

/**
 * Load role configurations from global (~/.omp/agent/roles.{yml,yaml,json}) and
 * project-local (.omp/roles.{yml,yaml,json}), with project-local overriding global.
 */
export function loadRoles(cwd: string): Record<string, RoleConfig> {
	const globalPath = getRolesPath();

	const projectDir = path.join(cwd, ".omp");
	let projectPath = path.join(projectDir, "roles.yml");
	if (!fs.existsSync(projectPath)) {
		for (const alt of ["roles.yaml", "roles.json"]) {
			const alternativePath = path.join(projectDir, alt);
			if (fs.existsSync(alternativePath)) {
				projectPath = alternativePath;
				break;
			}
		}
	}

	let globalRoles: Record<string, RoleConfig> = {};
	let projectRoles: Record<string, RoleConfig> = {};

	const parseFile = (filePath: string): Record<string, RoleConfig> => {
		try {
			const content = fs.readFileSync(filePath, "utf-8");
			return YAML.parse(content) as Record<string, RoleConfig>;
		} catch {
			return {};
		}
	};

	if (fs.existsSync(globalPath)) {
		globalRoles = parseFile(globalPath);
	}

	if (fs.existsSync(projectPath)) {
		projectRoles = parseFile(projectPath);
	}

	return { ...globalRoles, ...projectRoles };
}
