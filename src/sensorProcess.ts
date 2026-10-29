import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

export class SensorProcess {
  private child: ChildProcessWithoutNullStreams | null = null;
  private buffer = "";
  private sequence = 0;
  private pending: { id: number; resolve(value: unknown): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> } | null = null;
  private active: Promise<unknown> | null = null;
  private retryAt = 0;
  private lastError: Error | null = null;

  constructor(private file: string, private args: string[] = [], private env = process.env, private timeout = 12000) {}

  read(): Promise<unknown> {
    if (this.active) return this.active;
    if (this.lastError && Date.now() < this.retryAt) return Promise.reject(this.lastError);
    this.active = this.request().finally(() => { this.active = null; });
    return this.active;
  }

  private request(): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = ++this.sequence;
      const timer = setTimeout(() => this.fail(Object.assign(new Error("Sensor helper timed out."), { code: "ETIMEDOUT" })), this.timeout);
      this.pending = { id, resolve, reject, timer };
      if (!this.child) {
        const child = spawn(this.file, this.args, { env: this.env, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
        this.child = child;
        this.buffer = "";
        child.stdout.setEncoding("utf8");
        child.stdout.on("data", (chunk: string) => {
          if (this.child !== child) return;
          this.buffer += chunk;
          if (this.buffer.length > 1024 * 1024) return this.fail(Object.assign(new Error("Oversized sensor response."), { code: "EPROTO" }));
          let newline: number;
          while ((newline = this.buffer.indexOf("\n")) >= 0) {
            const line = this.buffer.slice(0, newline);
            this.buffer = this.buffer.slice(newline + 1);
            try {
              const data = JSON.parse(line) as { protocol?: number; id?: number };
              const pending = this.pending;
              if (!pending || !data || data.protocol !== 1 || data.id !== pending.id) throw new Error("Unexpected helper response.");
              clearTimeout(pending.timer);
              this.pending = null;
              this.lastError = null;
              pending.resolve(data);
            } catch {
              this.fail(Object.assign(new Error("Invalid sensor helper response."), { code: "EPROTO" }));
              return;
            }
          }
        });
        // Drain stderr without retaining potentially sensitive native driver reports.
        child.stderr.resume();
        child.on("error", (error) => { if (this.child === child) this.fail(error); });
        child.stdin.on("error", (error) => { if (this.child === child) this.fail(error); });
        child.on("exit", () => {
          if (this.child === child) this.fail(Object.assign(new Error("Sensor helper stopped unexpectedly."), { code: "HELPER_EXIT" }));
        });
      }
      this.child.stdin.write(`${id}\n`);
    });
  }

  private fail(error: Error) {
    this.lastError = error;
    this.retryAt = Date.now() + 30000;
    if (this.pending) {
      clearTimeout(this.pending.timer);
      this.pending.reject(error);
      this.pending = null;
    }
    this.close();
  }

  private close() {
    const child = this.child;
    this.child = null;
    this.buffer = "";
    if (child) {
      child.stdin.end();
      // Give native libraries a chance to release driver handles before forcing a stuck helper out.
      const timer = setTimeout(() => child.kill(), 1000);
      timer.unref();
      child.once("exit", () => clearTimeout(timer));
    }
  }

  stop() {
    if (this.pending) {
      clearTimeout(this.pending.timer);
      this.pending.reject(Object.assign(new Error("Sensor helper restarted."), { code: "HELPER_RESTART" }));
      this.pending = null;
    }
    this.close();
    this.lastError = null;
    this.retryAt = 0;
  }
}
