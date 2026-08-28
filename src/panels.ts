import * as vscode from "vscode";
import type { CloudflareResource, WranglerProject } from "./model";
import type { OperationOptions, WranglerOperations } from "./operations";
import { parseJsonOutput, rowsFromOutput } from "./structured";

interface PanelEntry { panel: vscode.WebviewPanel; created: boolean }
const panels = new Map<string, vscode.WebviewPanel>();

export function showStructuredDetail(
  title: string,
  value: unknown,
  actions: Array<{ command: string; label: string; args?: unknown[] }> = [],
  key = `detail:${title}`
): void {
  const entry = openPanel(key, "wranglerDetail", title, { enableScripts: true });
  const { panel } = entry;
  panel.webview.html = detailHtml(panel.webview, title, value, actions);
  if (!entry.created) return;
  panel.webview.onDidReceiveMessage(async (message: unknown) => {
    if (!isRecord(message) || message.type !== "command" || typeof message.command !== "string") return;
    await vscode.commands.executeCommand(message.command, ...(Array.isArray(message.args) ? message.args : []));
  });
}

export async function showCollection(
  project: WranglerProject,
  operations: WranglerOperations,
  args: string[],
  title: string,
  environment?: string,
  onSelect?: (row: Record<string, unknown>) => Promise<void>
): Promise<void> {
  const key = panelKey(project, `collection:${environment ?? ""}:${args.join("\u0000")}`);
  const existing = panels.get(key);
  if (existing) { existing.reveal(); return; }
  const result = await operations.run(project, [...args, "--json"], title, { environment, progress: true, notifySuccess: false });
  if (!result || result.code !== 0) return;
  const rows = rowsFromOutput(result.stdout);
  const { panel } = openPanel(key, "wranglerCollection", title, { enableScripts: Boolean(onSelect) });
  panel.webview.html = tablePage(panel.webview, title, rows, Boolean(onSelect));
  if (onSelect) panel.webview.onDidReceiveMessage(async (message: unknown) => {
    if (!isRecord(message) || message.type !== "select" || typeof message.index !== "number") return;
    const row = rows[message.index];
    if (row) await onSelect(row);
  });
}

export class D1QueryPanel {
  static show(project: WranglerProject, resource: CloudflareResource, operations: WranglerOperations, environment?: string): void {
    const key = panelKey(project, `d1:${environment ?? ""}:${resource.id ?? resource.name}`);
    const entry = openPanel(key, "wranglerD1Query", `D1 Query — ${resource.name}`, { enableScripts: true, retainContextWhenHidden: true });
    if (!entry.created) return;
    const panel = entry.panel;
    panel.webview.html = queryHtml(panel.webview, resource.name);
    panel.webview.onDidReceiveMessage(async (message: unknown) => {
      if (!isRecord(message) || message.type !== "query" || typeof message.sql !== "string") return;
      const target = message.target === "local" ? "--local" : "--remote";
      if (target === "--remote" && !isReadOnlySql(message.sql)) {
        const confirmed = await vscode.window.showWarningMessage(`Run a potentially mutating SQL statement against remote D1 database “${resource.name}”?`, { modal: true }, "Run remote SQL");
        if (!confirmed) {
          await panel.webview.postMessage({ type: "result", ok: false, error: "Remote query cancelled." });
          return;
        }
      }
      const options: OperationOptions = { environment, progress: true, notifySuccess: false };
      const result = await operations.run(project, ["d1", "execute", resource.name, target, "--command", message.sql, "--json"], `D1 Query: ${resource.name}`, options);
      if (!result) { await panel.webview.postMessage({ type: "duplicate" }); return; }
      const data = result.code === 0 ? parseJsonOutput(result.stdout) : undefined;
      await panel.webview.postMessage({ type: "result", ok: result.code === 0, html: data === undefined ? "" : renderStructured(data), error: result.stderr });
    });
  }
}

export class StorageBrowser {
  static async showKv(project: WranglerProject, resource: CloudflareResource, operations: WranglerOperations, environment?: string): Promise<void> {
    const key = panelKey(project, `kv:${environment ?? ""}:${resource.id ?? resource.binding}`);
    const existing = panels.get(key);
    if (existing) { existing.reveal(); return; }
    const selector = resource.id ? ["--namespace-id", resource.id] : ["--binding", resource.binding];
    const result = await operations.run(project, ["kv", "key", "list", ...selector, "--remote"], `KV Keys: ${resource.name}`, { environment, progress: true, notifySuccess: false });
    if (!result || result.code !== 0) return;
    let rows = rowsFromOutput(result.stdout);
    const { panel } = openPanel(key, "wranglerKv", `KV — ${resource.name}`, { enableScripts: true, retainContextWhenHidden: true });
    const render = () => { panel.webview.html = storageHtml(panel.webview, `KV — ${resource.name}`, rows); };
    render();
    panel.webview.onDidReceiveMessage(async (message: unknown) => {
      if (!isRecord(message)) return;
      if (message.type === "refresh") {
        const refreshed = await operations.run(project, ["kv", "key", "list", ...selector, "--remote"], `KV Keys: ${resource.name}`, { environment, progress: true, notifySuccess: false });
        if (refreshed?.code === 0) { rows = rowsFromOutput(refreshed.stdout); render(); }
        return;
      }
      if (message.type !== "get" || typeof message.key !== "string") return;
      const value = await operations.run(project, ["kv", "key", "get", message.key, ...selector, "--remote", "--text"], `KV Get: ${message.key}`, { environment, notifySuccess: false });
      await panel.webview.postMessage({ type: "value", key: message.key, ok: value?.code === 0, value: value?.stdout, error: value?.stderr });
    });
  }

  static showR2(project: WranglerProject, resource: CloudflareResource, operations: WranglerOperations, environment?: string): void {
    const key = panelKey(project, `r2:${environment ?? ""}:${resource.name}`);
    const entry = openPanel(key, "wranglerR2", `R2 — ${resource.name}`, { enableScripts: true, retainContextWhenHidden: true });
    if (!entry.created) return;
    const panel = entry.panel;
    panel.webview.html = r2Html(panel.webview, resource.name);
    panel.webview.onDidReceiveMessage(async (message: unknown) => {
      if (!isRecord(message) || typeof message.key !== "string" || !message.key.trim()) return;
      const objectPath = `${resource.name}/${message.key.trim()}`;
      if (message.type === "get") {
        const result = await operations.run(project, ["r2", "object", "get", objectPath, "--remote", "--pipe"], `R2 Get: ${message.key}`, { environment, progress: true, notifySuccess: false });
        await panel.webview.postMessage({ type: "value", key: message.key, ok: result?.code === 0, value: result?.stdout, error: result?.stderr });
      } else if (message.type === "download") {
        const uri = await vscode.window.showSaveDialog({ title: `Download ${message.key}` });
        if (uri) await operations.run(project, ["r2", "object", "get", objectPath, "--remote", "--file", uri.fsPath], `R2 Download: ${message.key}`, { environment, progress: true });
      } else if (message.type === "upload") {
        const [uri] = await vscode.window.showOpenDialog({ title: `Upload to ${message.key}`, canSelectMany: false }) ?? [];
        if (uri) {
          const confirmed = await vscode.window.showWarningMessage(`Upload to “${message.key}” in ${resource.name}? An existing object at this key will be overwritten.`, { modal: true }, "Upload object");
          if (confirmed) await operations.run(project, ["r2", "object", "put", objectPath, "--remote", "--file", uri.fsPath], `R2 Upload: ${message.key}`, { environment, progress: true });
        }
      } else if (message.type === "delete") {
        const confirmed = await vscode.window.showWarningMessage(`Delete R2 object “${message.key}” from ${resource.name}?`, { modal: true }, "Delete object");
        if (confirmed) await operations.run(project, ["r2", "object", "delete", objectPath, "--remote"], `R2 Delete: ${message.key}`, { environment, progress: true });
      }
    });
  }
}

export function renderStructured(value: unknown, dataTypes?: unknown): string {
  if (Array.isArray(value)) {
    if (value.length === 0) return `<p class="empty">No data returned.</p>`;
    if (value.every((item) => isRecord(item) && Array.isArray(item.results))) {
      return value.map((item, index) => `<section><h2>Result ${index + 1}</h2>${renderStructured(item)}</section>`).join("");
    }
    if (value.every(isRecord)) return renderTable(value, dataTypes);
    return `<ul>${value.map((item) => `<li>${renderValue(item)}</li>`).join("")}</ul>`;
  }
  if (isRecord(value)) {
    if (Array.isArray(value.results)) {
      const resultTable = renderStructured(value.results, value.data_types ?? dataTypes);
      const metadata = Object.fromEntries(Object.entries(value).filter(([key]) => key !== "results" && key !== "data_types"));
      return `${resultTable}${Object.keys(metadata).length ? `<h2>Metadata</h2>${renderRecord(metadata)}` : ""}`;
    }
    return renderRecord(value);
  }
  return renderValue(value, dataTypes);
}

function renderRecord(record: Record<string, unknown>): string {
  const entries = Object.entries(record).filter(([key]) => key !== "data_types");
  if (entries.length === 0) return `<p class="empty">No details available.</p>`;
  return `<dl class="fields">${entries.map(([key, value]) => {
    const hint = isRecord(record.data_types) ? record.data_types[key] : undefined;
    const rendered = Array.isArray(value) || isRecord(value)
      ? `<details open><summary>${summary(value)}</summary>${renderStructured(value, hint)}</details>`
      : renderValue(value, hint, key);
    return `<div class="field"><dt>${escapeHtml(fieldLabel(key))}</dt><dd>${rendered}</dd></div>`;
  }).join("")}</dl>`;
}

function renderTable(rows: Record<string, unknown>[], dataTypes?: unknown): string {
  if (rows.length === 0) return `<p class="empty">No data returned.</p>`;
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const hints = typeHints(columns, dataTypes);
  return `<div class="table-wrap"><table><thead><tr>${columns.map((column) => `<th>${escapeHtml(fieldLabel(column))}${hints[column] ? `<small>${escapeHtml(hints[column]!)}</small>` : ""}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${columns.map((column) => `<td>${renderValue(row[column], hints[column], column)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}

function renderValue(value: unknown, typeHint?: unknown, key?: string): string {
  const hint = typeof typeHint === "string" ? typeHint.toUpperCase() : "";
  if (value === null || value === undefined) return `<span class="null">—</span>`;
  if (typeof value === "boolean") return `<span class="badge ${value ? "success" : "muted"}">${value ? "Yes" : "No"}</span>`;
  if (typeof value === "number") return `<span class="number">${escapeHtml(Number.isFinite(value) ? value.toLocaleString() : String(value))}</span>`;
  if (Array.isArray(value) || isRecord(value)) return `<details><summary>${summary(value)}</summary>${renderStructured(value, typeHint)}</details>`;
  const text = String(value);
  if (hint.includes("JSON")) {
    try { return `<details><summary>JSON value</summary>${renderStructured(JSON.parse(text))}</details>`; } catch { /* display as text */ }
  }
  if (hint.includes("BLOB")) return `<span class="badge">Binary data</span>`;
  if (hint.includes("DATE") || hint.includes("TIME") || /(?:^|_)(?:created|updated|modified|timestamp|date)(?:_|$)/i.test(key ?? "")) {
    const date = new Date(text);
    if (!Number.isNaN(date.valueOf())) return `<time datetime="${escapeHtml(text)}" title="${escapeHtml(text)}">${escapeHtml(date.toLocaleString())}</time>`;
  }
  if (/^https?:\/\//i.test(text)) return `<a href="${escapeHtml(text)}">${escapeHtml(text)}</a>`;
  return `<span class="text">${escapeHtml(text)}</span>`;
}

function detailHtml(webview: vscode.Webview, title: string, value: unknown, actions: Array<{ command: string; label: string; args?: unknown[] }>): string {
  const nonce = nonceValue();
  const buttons = actions.map((action) => `<button data-command="${escapeHtml(action.command)}" data-args="${escapeHtml(JSON.stringify(action.args ?? []))}">${escapeHtml(action.label)}</button>`).join(" ");
  return page(webview, nonce, title, `<header><h1>${escapeHtml(title)}</h1><div>${buttons}</div></header>${renderStructured(value)}`,
    `document.querySelectorAll('[data-command]').forEach(b=>b.addEventListener('click',()=>vscode.postMessage({type:'command',command:b.dataset.command,args:JSON.parse(b.dataset.args)})));`);
}

function tablePage(webview: vscode.Webview, title: string, rows: Record<string, unknown>[], selectable: boolean): string {
  const nonce = nonceValue();
  const script = selectable ? `document.querySelectorAll('tbody tr').forEach((r,index)=>r.addEventListener('click',()=>vscode.postMessage({type:'select',index})));` : "";
  return page(webview, nonce, title, `<h1>${escapeHtml(title)}</h1>${renderTable(rows)}`, script);
}

function queryHtml(webview: vscode.Webview, name: string): string {
  const nonce = nonceValue();
  const body = `<h1>D1 Query — ${escapeHtml(name)}</h1><textarea id="sql" spellcheck="false">SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name;</textarea><div><button id="remote">Run remote</button><button id="local" class="secondary">Run local</button></div><div id="status" role="status"></div><div id="results"></div>`;
  return page(webview, nonce, `D1 Query — ${name}`, body, `
    const sql=document.getElementById('sql'),status=document.getElementById('status'),results=document.getElementById('results'),buttons=[document.getElementById('remote'),document.getElementById('local')];
    for(const target of ['remote','local'])document.getElementById(target).onclick=()=>{buttons.forEach(b=>b.disabled=true);status.textContent='Running…';results.innerHTML='';vscode.postMessage({type:'query',target,sql:sql.value});};
    addEventListener('message',e=>{const m=e.data;buttons.forEach(b=>b.disabled=false);if(m.type==='duplicate'){status.textContent='This query is already running.';return;}status.textContent=m.ok?'Completed':'Failed';results.innerHTML=m.ok?(m.html||'<p>No data returned.</p>'):'<pre>'+esc(m.error||'Unknown error')+'</pre>';});
    function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  `);
}

function storageHtml(webview: vscode.Webview, title: string, rows: Record<string, unknown>[]): string {
  const nonce = nonceValue();
  const keys = rows.map((row) => String(row.name ?? row.key ?? ""));
  const table = rows.length ? renderTable(rows) : `<p class="empty">No KV keys found.</p>`;
  return page(webview, nonce, title, `<header><h1>${escapeHtml(title)}</h1><button id="refresh">Refresh</button></header>${table}<h2>Value</h2><pre id="value">Select a key.</pre>`, `const keys=${JSON.stringify(keys)};document.getElementById('refresh').onclick=()=>vscode.postMessage({type:'refresh'});document.querySelectorAll('tbody tr').forEach((r,index)=>r.onclick=()=>vscode.postMessage({type:'get',key:keys[index]}));addEventListener('message',e=>document.getElementById('value').textContent=e.data.ok?e.data.value:e.data.error);`);
}

function r2Html(webview: vscode.Webview, bucket: string): string {
  const nonce = nonceValue();
  return page(webview, nonce, `R2 — ${bucket}`, `<h1>R2 — ${escapeHtml(bucket)}</h1><p>Wrangler does not expose an object-list command. Enter an object key to inspect, download, upload, or delete it.</p><input id="key" placeholder="path/to/object"><div><button data-action="get">Get</button><button data-action="download">Download</button><button data-action="upload">Upload</button><button data-action="delete" class="danger">Delete</button></div><pre id="value"></pre>`, `document.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>vscode.postMessage({type:b.dataset.action,key:document.getElementById('key').value}));addEventListener('message',e=>document.getElementById('value').textContent=e.data.ok?e.data.value:e.data.error);`);
}

function page(webview: vscode.Webview, nonce: string, title: string, body: string, script: string): string {
  return `<!doctype html><html><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>body{font-family:var(--vscode-font-family);padding:20px;color:var(--vscode-foreground)}header{display:flex;align-items:center;justify-content:space-between;gap:16px}h1{font-size:1.45rem}h2{font-size:1.1rem;margin-top:24px}.fields{display:grid;gap:1px;background:var(--vscode-panel-border);border:1px solid var(--vscode-panel-border)}.field{display:grid;grid-template-columns:minmax(140px,28%) 1fr;background:var(--vscode-editor-background)}dt,dd{padding:9px 12px;margin:0}dt{font-weight:600;background:var(--vscode-sideBar-background)}details>summary{cursor:pointer;color:var(--vscode-textLink-foreground);margin-bottom:8px}.table-wrap{overflow:auto}textarea{width:100%;height:180px;box-sizing:border-box;font-family:var(--vscode-editor-font-family);padding:10px;background:var(--vscode-input-background);color:var(--vscode-input-foreground);border:1px solid var(--vscode-input-border)}input{width:min(700px,100%);padding:8px;margin-bottom:10px}button{margin:8px 8px 8px 0;padding:7px 12px;background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:0}button:disabled{opacity:.55}button.secondary{background:var(--vscode-button-secondaryBackground)}button.danger{background:var(--vscode-inputValidation-errorBackground)}table{border-collapse:collapse;width:100%;margin-top:12px}th,td{text-align:left;border-bottom:1px solid var(--vscode-panel-border);padding:7px;vertical-align:top;max-width:420px;overflow-wrap:anywhere}th small{display:block;font-weight:400;opacity:.65}tbody tr:hover{background:var(--vscode-list-hoverBackground)}.badge{display:inline-block;border:1px solid var(--vscode-badge-background);border-radius:10px;padding:1px 7px}.success{color:var(--vscode-testing-iconPassed)}.muted,.null,.empty{opacity:.65}.number{font-variant-numeric:tabular-nums}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:var(--vscode-textCodeBlock-background);padding:12px}@media(max-width:600px){.field{grid-template-columns:1fr}dt{padding-bottom:2px}}</style></head><body>${body}<script nonce="${nonce}">const vscode=acquireVsCodeApi();${script}</script></body></html>`;
}

function openPanel(key: string, viewType: string, title: string, options: vscode.WebviewPanelOptions & vscode.WebviewOptions): PanelEntry {
  const existing = panels.get(key);
  if (existing) { existing.reveal(); return { panel: existing, created: false }; }
  const panel = vscode.window.createWebviewPanel(viewType, title, vscode.ViewColumn.Active, options);
  panels.set(key, panel);
  panel.onDidDispose(() => panels.delete(key));
  return { panel, created: true };
}

function panelKey(project: WranglerProject, suffix: string): string { return `${project.configUri.toString()}:${suffix}`; }
function typeHints(columns: string[], value: unknown): Record<string, string> {
  if (Array.isArray(value)) {
    if (value.every((item) => typeof item === "string")) return Object.fromEntries(columns.map((column, index) => [column, value[index] ?? ""]));
    if (value.every(isRecord)) return Object.fromEntries(value.flatMap((item) => typeof item.name === "string" && typeof item.type === "string" ? [[item.name, item.type] as const] : []));
  }
  if (isRecord(value)) return Object.fromEntries(Object.entries(value).flatMap(([key, type]) => typeof type === "string" ? [[key, type]] : []));
  return {};
}
function fieldLabel(value: string): string { return value.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase()); }
function summary(value: unknown): string { const count = Array.isArray(value) ? value.length : Object.keys(value as object).length; return `${count} ${Array.isArray(value) ? "item" : "field"}${count === 1 ? "" : "s"}`; }
function escapeHtml(value: string): string { return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[char] ?? char); }
function nonceValue(): string { return `${Date.now()}${Math.random().toString(36).slice(2)}`; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function isReadOnlySql(sql: string): boolean { const normalized = sql.replace(/--.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "").trim(); return /^(select|explain|pragma)\b/i.test(normalized); }
