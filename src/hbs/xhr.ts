export function ensureXmlHttpRequest() {
  if (typeof globalThis.XMLHttpRequest === 'function') return;
  globalThis.XMLHttpRequest = class XMLHttpRequest {
    status = 0;
    statusText = '';
    responseText = '';
    private method = 'GET';
    private url = '';
    private headers: Record<string, string> = {};

    open(method: string, url: string) {
      this.method = method;
      this.url = url;
    }

    setRequestHeader(name: string, value: string) {
      this.headers[name] = value;
    }

    send(body?: string | null) {
      const payload = { url: this.url, method: this.method, headers: this.headers, body: body ?? null };
      const result = Bun.spawnSync([
        process.execPath,
        '-e',
        `const p = ${JSON.stringify(payload)};
const res = await fetch(p.url, { method: p.method, headers: p.headers, body: p.body ?? undefined });
process.stdout.write(JSON.stringify({ status: res.status, statusText: res.statusText, text: await res.text() }));`,
      ], { stdout: 'pipe', stderr: 'pipe' });
      if (result.exitCode !== 0) {
        throw new Error(result.stderr.toString().trim() || 'XMLHttpRequest request failed');
      }
      const parsed = JSON.parse(result.stdout.toString()) as { status: number; statusText: string; text: string };
      this.status = parsed.status;
      this.statusText = parsed.statusText;
      this.responseText = parsed.text;
    }
  } as unknown as typeof XMLHttpRequest;
}
