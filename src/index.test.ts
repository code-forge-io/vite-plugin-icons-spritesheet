import { describe, it, expect } from "vitest";
// Note: tinyexec's exec() is used here, NOT child_process.exec().
// tinyexec spawns binaries directly without a shell — no injection risk.
import { exec } from "tinyexec";
import { Readable } from "node:stream";

/**
 * Helper that mirrors the lintFileContent logic for testing formatters.
 * Pipes content to the formatter's stdin and reads formatted output from stdout.
 */
async function formatViaStdin(formatter: string, args: string[], content: string): Promise<string> {
  const stdinStream = new Readable();
  stdinStream.push(content);
  stdinStream.push(null);

  const { process: proc } = exec(formatter, args, {});

  if (!proc?.stdin) {
    return content;
  }

  stdinStream.pipe(proc.stdin);

  let formattedContent = "";
  proc.stdout?.on("data", (data) => {
    formattedContent = formattedContent + data.toString();
  });

  return new Promise<string>((resolve) => {
    let settled = false;
    const settle = (value: string) => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };
    proc.on("error", () => {
      settle(content);
    });
    proc.on("exit", (code) => {
      settle(code === 0 ? formattedContent : content);
    });
  });
}

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

describe("oxfmt formatter", () => {
  it("should format TypeScript via stdin", async () => {
    const input = 'export const iconNames = [\n  "Foo",\n  "Bar",\n] as const\n\nexport type IconName = typeof iconNames[number]\n';
    const result = await formatViaStdin("oxfmt", ["--stdin-filepath", "file.ts"], input);

    // oxfmt should format the output (semicolons, parenthesized typeof)
    expect(result).toContain("as const;");
    expect(result).toContain("(typeof iconNames)[number]");
    expect(result).toContain("Foo");
    expect(result).toContain("Bar");
  });

  it("should format HTML/SVG via stdin", async () => {
    const input = '<svg xmlns="http://www.w3.org/2000/svg"><defs><symbol id="test"><path d="M0 0"/></symbol></defs></svg>';
    const result = await formatViaStdin("oxfmt", ["--stdin-filepath", "file.html"], input);

    // oxfmt should produce formatted multi-line HTML output
    expect(result).toContain("<svg");
    expect(result).toContain("<defs>");
    expect(result.split("\n").length).toBeGreaterThan(1);
  });
});
