import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

/** Git stores the historical text checkpoints with LF, even on CRLF checkouts. */
export function checkpointSha256(file: string): string {
  const bytes = readFileSync(file);
  // Geometry, images, and other payloads must retain their exact bytes.
  const content = /\.(?:bin|png|webp|jpg|jpeg|gif|woff2?|pdf|webm)$/i.test(file)
    ? bytes
    : bytes.toString("utf8").replace(/\r\n/g, "\n");
  return createHash("sha256").update(content).digest("hex");
}

/** Verify an archival source inventory against the commit where it was approved. */
export function checkpointAggregate(files: string[], commit: string): string {
  const records = files
    .slice()
    .sort((left, right) => left.localeCompare(right))
    .map((file) => {
      const blob = execFileSync("git", ["show", `${commit}:${file}`], { maxBuffer: 16 * 1024 * 1024 });
      return `${file}\t${createHash("sha256").update(blob).digest("hex")}\n`;
    })
    .join("");
  return createHash("sha256").update(records).digest("hex");
}

/** Some published manifests intentionally freeze their Windows checkout bytes. */
export function rawSha256(file: string): string {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

export function checkpointText(file: string, commit: string): string {
  return execFileSync("git", ["show", `${commit}:${file}`], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
}
