import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const FORBIDDEN_PATTERNS = [
  /privateKey/i,
  /private_key/i,
  /seedPhrase/i,
  /mnemonic/i,
  /signTransaction/i,
  /signOrder/i,
  /placeOrder/i,
  /submitOrder/i,
  /executeTrade/i,
  /createOrder/i,
];

function walk(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  let files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files = files.concat(walk(full));
    } else if (entry.isFile() && (full.endsWith(".ts") || full.endsWith(".tsx"))) {
      files.push(full);
    }
  }
  return files;
}

describe("read-only safety", () => {
  const srcDir = path.join(__dirname, "..", "src");
  const files = walk(srcDir);

  it("scans every source file for order-placement / signing / key-handling code", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const content = fs.readFileSync(file, "utf-8");
      for (const pattern of FORBIDDEN_PATTERNS) {
        if (pattern.test(content)) {
          offenders.push(`${file} matched ${pattern}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("does not depend on any wallet/signing libraries (ethers, web3, viem, @polymarket/clob-client)", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf-8"));
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
    const bannedLibs = ["ethers", "web3", "viem", "@polymarket/clob-client", "@polymarket/order-utils"];
    for (const lib of bannedLibs) {
      expect(allDeps[lib]).toBeUndefined();
    }
  });

  it("the .env.example never contains a real-looking secret value", () => {
    const env = fs.readFileSync(path.join(__dirname, "..", ".env.example"), "utf-8");
    // Every KEY= line should either be empty or a placeholder/URL, never a
    // long hex/base58 string that looks like an actual secret.
    const suspicious = env
      .split("\n")
      .filter((line) => /=/.test(line) && !line.trim().startsWith("#"))
      .filter((line) => {
        const value = line.split("=")[1]?.trim() ?? "";
        return /^[a-zA-Z0-9+/]{32,}$/.test(value);
      });
    expect(suspicious).toEqual([]);
  });
});
