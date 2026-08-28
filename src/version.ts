import * as https from "node:https";
import type * as vscode from "vscode";

const CACHE_KEY = "wranglerLatestVersion";
const CACHE_TTL = 6 * 60 * 60 * 1_000;
const REGISTRY_URL = "https://registry.npmjs.org/wrangler/latest";

interface VersionCache {
  version: string;
  checkedAt: number;
}

interface SemanticVersion {
  major: number;
  minor: number;
  patch: number;
  prerelease?: string;
}

export class WranglerVersionService {
  private pending?: Promise<string | undefined>;

  constructor(private readonly state: vscode.Memento) {}

  latest(): Promise<string | undefined> {
    const cached = this.state.get<VersionCache>(CACHE_KEY);
    if (cached && Date.now() - cached.checkedAt < CACHE_TTL) {
      return Promise.resolve(cached.version);
    }
    if (!this.pending) {
      this.pending = this.fetchLatest().finally(() => { this.pending = undefined; });
    }
    return this.pending;
  }

  private async fetchLatest(): Promise<string | undefined> {
    const response = await getJson(REGISTRY_URL);
    const version = response && typeof response.version === "string"
      ? normalizeWranglerVersion(response.version)
      : undefined;
    if (version) {
      await this.state.update(CACHE_KEY, { version, checkedAt: Date.now() } satisfies VersionCache);
    }
    return version;
  }
}

export function normalizeWranglerVersion(value: string): string | undefined {
  const match = /(?:^|[^0-9])v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)(?=$|[^0-9A-Za-z.-])/.exec(value);
  return match?.[1];
}

export function isNewerVersion(current: string, available: string): boolean {
  const currentVersion = parseVersion(current);
  const availableVersion = parseVersion(available);
  if (!currentVersion || !availableVersion) return false;
  for (const key of ["major", "minor", "patch"] as const) {
    if (availableVersion[key] !== currentVersion[key]) {
      return availableVersion[key] > currentVersion[key];
    }
  }
  if (currentVersion.prerelease && !availableVersion.prerelease) return true;
  if (!currentVersion.prerelease || !availableVersion.prerelease) return false;
  return comparePrerelease(availableVersion.prerelease, currentVersion.prerelease) > 0;
}

function parseVersion(value: string): SemanticVersion | undefined {
  const normalized = normalizeWranglerVersion(value);
  if (!normalized) return undefined;
  const [core, prerelease] = normalized.split("-", 2);
  const parts = core!.split(".").map(Number);
  return { major: parts[0]!, minor: parts[1]!, patch: parts[2]!, prerelease };
}

function comparePrerelease(left: string, right: string): number {
  const leftParts = left.split(".");
  const rightParts = right.split(".");
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const leftPart = leftParts[index];
    const rightPart = rightParts[index];
    if (leftPart === undefined) return -1;
    if (rightPart === undefined) return 1;
    if (leftPart === rightPart) continue;
    const leftNumber = /^\d+$/.test(leftPart) ? Number(leftPart) : undefined;
    const rightNumber = /^\d+$/.test(rightPart) ? Number(rightPart) : undefined;
    if (leftNumber !== undefined && rightNumber !== undefined) return leftNumber - rightNumber;
    if (leftNumber !== undefined) return -1;
    if (rightNumber !== undefined) return 1;
    return leftPart.localeCompare(rightPart);
  }
  return 0;
}

function getJson(url: string): Promise<Record<string, unknown> | undefined> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value?: Record<string, unknown>) => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };
    const request = https.get(url, {
      headers: { Accept: "application/json", "User-Agent": "explorer-for-wrangler" }
    }, (response) => {
      if (response.statusCode !== 200) {
        response.resume();
        finish();
        return;
      }
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk: string) => {
        body += chunk;
        if (body.length > 64 * 1_024) response.destroy();
      });
      response.once("error", () => finish());
      response.once("end", () => {
        try {
          const value = JSON.parse(body) as unknown;
          finish(value !== null && typeof value === "object" && !Array.isArray(value)
            ? value as Record<string, unknown>
            : undefined);
        } catch {
          finish();
        }
      });
    });
    request.setTimeout(5_000, () => request.destroy());
    request.once("error", () => finish());
  });
}
