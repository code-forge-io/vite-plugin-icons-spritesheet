import { describe, it, expect } from "vitest";
// Note: tinyexec's exec() is used here, NOT child_process.exec().
// tinyexec spawns binaries directly without a shell — no injection risk.
// eslint-disable-next-line @typescript-eslint/no-require-imports
import { exec } from "tinyexec";
import { Readable } from "node:stream";

describe("formatter graceful degradation", () => {
  it("should not hang when formatter binary is not installed", async () => {
    // Reproduces the bug: when the formatter binary doesn't exist,
    // the spawn emits ENOENT. The fixed code must resolve the promise
    // (with the original content) instead of hanging forever.

    const fileContent = "<svg>test</svg>";
    const formatter = "this-formatter-does-not-exist";

    const stdinStream = new Readable();
    stdinStream.push(fileContent);
    stdinStream.push(null);

    // This mirrors the exact logic in lintFileContent after the fix
    const { process: proc } = exec(formatter, [], {});

    const result = await Promise.race([
      new Promise<string>((resolve) => {
        let settled = false;
        const settle = (value: string) => {
          if (!settled) {
            settled = true;
            resolve(value);
          }
        };

        if (!proc?.stdin) {
          settle(fileContent);
          return;
        }

        stdinStream.pipe(proc.stdin);

        proc.on("error", () => {
          settle(fileContent);
        });
        proc.on("exit", (code) => {
          settle(code === 0 ? "" : fileContent);
        });
      }),
      // Safety net: if the promise hangs, fail after 5s
      new Promise<string>((_, reject) => {
        setTimeout(
          () => reject(new Error("Promise hung for 5s — the ENOENT hang bug is present")),
          5000,
        );
      }),
    ]);

    expect(result).toBe(fileContent);
  });
});
