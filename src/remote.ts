import type { ResourceGroup, WranglerProject } from "./model";
import type { WranglerOperations } from "./operations";
import { REMOTE_RESOURCE_SPECS, resourcesFromResult } from "./structured";

export class RemoteResourceService {
  constructor(private readonly operations: WranglerOperations) {}

  async discover(project: WranglerProject, environment?: string): Promise<{ groups: ResourceGroup[]; errors: string[] }> {
    const settled = await Promise.all(REMOTE_RESOURCE_SPECS.map(async (spec) => {
      const result = await this.operations.capture(project, spec.args, environment);
      return { spec, result };
    }));
    const errors: string[] = [];
    const groups: ResourceGroup[] = [];
    for (const { spec, result } of settled) {
      if (!result || result.code !== 0) {
        errors.push(`${spec.label}: ${result?.stderr.trim().split(/\r?\n/).at(-1) ?? "Wrangler unavailable"}`);
        continue;
      }
      const resources = resourcesFromResult(spec, result);
      groups.push({ kind: spec.kind, label: spec.label, icon: spec.icon, resources });
    }
    return { groups, errors };
  }
}
