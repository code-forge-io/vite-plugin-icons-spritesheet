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
