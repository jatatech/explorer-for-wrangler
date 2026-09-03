import { describe, expect, it, vi } from "vitest";

vi.mock("vscode", () => ({
  EventEmitter: class {
    readonly event = vi.fn();
    fire = vi.fn();
    dispose = vi.fn();
  },
  ProgressLocation: { Notification: 15 },
  workspace: {
    getConfiguration: () => ({ get: <T>(_key: string, fallback: T) => fallback })
  },
  window: {
    withProgress: (_options: unknown, task: (progress: unknown, token: undefined) => unknown) => task({}, undefined),
    showInformationMessage: vi.fn(() => new Promise<string | undefined>(() => undefined)),
    showErrorMessage: vi.fn(() => new Promise<string | undefined>(() => undefined))
  },
  DiagnosticSeverity: { Warning: 1, Error: 0 }
}));

import type * as vscode from "vscode";
import type { WranglerProject } from "../src/model";
import { WranglerOperations } from "../src/operations";
import type { WranglerRunner } from "../src/runner";

describe("WranglerOperations", () => {
  it("clears the busy state without waiting for the success notification to be dismissed", async () => {
    const root = process.cwd();
    const uri = { fsPath: root, toString: () => `file://${root}` };
    const project = {
      name: "demo",
      rootUri: uri,
      configUri: { ...uri, toString: () => `file://${root}/wrangler.jsonc` }
    } as unknown as WranglerProject;
    const runner = {
      resolveOrPrompt: vi.fn(async () => ({ command: process.execPath, source: "system" }))
    } as unknown as WranglerRunner;
    const output = {
      append: vi.fn(),
      appendLine: vi.fn(),
      clear: vi.fn(),
      show: vi.fn()
    } as unknown as vscode.OutputChannel;
    const operations = new WranglerOperations(runner, output);

    const run = operations.run(project, ["-e", ""], "Deploy", { progress: true });
    const result = await Promise.race([
      run,
      new Promise<"timed out">((resolve) => setTimeout(() => resolve("timed out"), 1_000))
    ]);

    expect(result).not.toBe("timed out");
    expect(result).toMatchObject({ code: 0 });
    expect(operations.isBusy(project, ["-e", ""])).toBe(false);
    operations.dispose();
  });
});
