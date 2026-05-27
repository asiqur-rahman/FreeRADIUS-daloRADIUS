import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

let loaded = false;

function parseEnvFile(path: string) {
  const text = readFileSync(path, "utf8").replace(/^\uFEFF/, "");

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separator = trimmed.indexOf("=");
    if (separator < 1) continue;

    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    const isQuoted =
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"));

    if (isQuoted) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, "").trim();
    }

    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

export function loadAppEnv() {
  if (loaded) return;
  loaded = true;

  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(here, "..", ".env"),
    resolve(here, "..", "..", "..", ".env"),
  ];

  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;

    if (typeof process.loadEnvFile === "function") {
      process.loadEnvFile(candidate);
      continue;
    }

    parseEnvFile(candidate);
  }
}

loadAppEnv();
