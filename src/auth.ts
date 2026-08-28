import { spawn } from "node:child_process";
import type { AuthStatus, WranglerExecutable, WranglerProject } from "./model";
import type { WranglerRunner } from "./runner";

const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]`, "g");

export class AuthService {
  constructor(private readonly runner: WranglerRunner) {}

  async check(project: WranglerProject): Promise<AuthStatus> {
    const executable = await this.runner.resolve(project);
    if (!executable) {
      return { state: "unavailable", label: "Wrangler not found", detail: "Install Wrangler locally or configure a system executable." };
    }

    const version = await capture(executable.command, ["--version"], project.rootUri.fsPath);
    const resolved: WranglerExecutable = {
      ...executable,
      version: firstMeaningfulLine(version.output)
    };
    const result = await capture(executable.command, ["whoami", "--json"], project.rootUri.fsPath, 15_000);
    const output = result.output.replace(ANSI, "").trim();
    if (result.timedOut) {
      return { state: "error", label: "Authentication check timed out", detail: sourceDetail(resolved), executable: resolved };
    }
    const identity = parseWhoamiIdentity(output);
    if (result.code === 0 && identity?.loggedIn) {
      const accountDetail = identity.accounts?.length
        ? ` — ${identity.accounts.map((account) => account.name).join(", ")}`
        : "";
      return {
        state: "loggedIn",
        label: identity.email ? `Authenticated as ${identity.email}` : `Authenticated (${identity.authType ?? "Cloudflare"})`,
        detail: `${sourceDetail(resolved)}${accountDetail}`,
        executable: resolved
      };
    }
    if (identity?.loggedIn === false) {
      return { state: "loggedOut", label: "Not authenticated", detail: sourceDetail(resolved), executable: resolved };
    }
    return {
      state: "error",
      label: "Could not check authentication",
      detail: `${sourceDetail(resolved)}${output ? ` — ${firstMeaningfulLine(output)}` : ""}`,
      executable: resolved
    };
  }
}

interface CaptureResult { code: number | null; output: string; timedOut: boolean }

function capture(command: string, args: string[], cwd: string, timeout = 5_000): Promise<CaptureResult> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: CaptureResult) => {
      if (!settled) {
        settled = true;
        resolve(result);
      }
    };
    const child = spawn(command, args, {
      cwd,
      shell: process.platform === "win32",
      env: { ...process.env, NO_COLOR: "1", CI: "1" }
    });
    let output = "";
    let timedOut = false;
    child.stdout?.on("data", (chunk: Buffer) => { output += chunk.toString(); });
    child.stderr?.on("data", (chunk: Buffer) => { output += chunk.toString(); });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeout);
    child.once("error", (error) => {
      clearTimeout(timer);
      finish({ code: null, output: `${output}\n${error.message}`, timedOut });
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      finish({ code, output, timedOut });
    });
  });
}

interface Identity {
  loggedIn: boolean;
  authType?: string;
  email?: string;
  accounts?: Array<{ id: string; name: string }>;
}

export function parseWhoamiIdentity(output: string): Identity | undefined {
  const start = output.indexOf("{");
  const end = output.lastIndexOf("}");
  if (start < 0 || end < start) return undefined;
  try {
    return JSON.parse(output.slice(start, end + 1)) as Identity;
  } catch {
    return undefined;
  }
}

function firstMeaningfulLine(value: string): string | undefined {
  return value.replace(ANSI, "").split(/\r?\n/).map((line) => line.trim()).find(Boolean);
}

function sourceDetail(executable: WranglerExecutable): string {
  const source = executable.source === "local"
    ? "project-local Wrangler"
    : executable.source === "system"
      ? "system Wrangler"
      : "configured Wrangler";
  return executable.version ? `${source} (${executable.version})` : source;
}
