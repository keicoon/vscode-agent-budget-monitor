import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const sourceDir = path.join(rootDir, "assets", "icon-font-src");
const outputDir = path.join(rootDir, "assets", "icon-font");
const packageJsonPath = path.join(rootDir, "package.json");
const fontName = "agent-budget-statusbar-icons";
const fontPath = `./assets/icon-font/${fontName}.woff`;
const mappingPath = path.join(outputDir, `${fontName}.json`);

runFantasticon();
syncPackageIcons();

function runFantasticon() {
  const npxBin = process.platform === "win32" ? "npx.cmd" : "npx";
  execFileSync(
    npxBin,
    [
      "fantasticon",
      sourceDir,
      "--output",
      outputDir,
      "--name",
      fontName,
      "--font-types",
      "woff",
      "--asset-types",
      "json",
      "--normalize",
    ],
    {
      cwd: rootDir,
      stdio: "inherit",
    },
  );
}

function syncPackageIcons() {
  const mapping = JSON.parse(readFileSync(mappingPath, "utf8"));
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  const iconEntries = Object.entries(mapping)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([iconName, codePoint]) => [
      `agent-budget-${iconName}`,
      {
        description: `${getIconLabel(iconName)} icon for Agent Budget Monitor`,
        default: {
          fontPath,
          fontCharacter: `\\${Number(codePoint).toString(16).toUpperCase().padStart(4, "0")}`,
        },
      },
    ]);

  packageJson.contributes ??= {};
  packageJson.contributes.icons = Object.fromEntries(iconEntries);

  writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
  console.log(`Synced ${iconEntries.length} icon registrations in package.json.`);
}

function getIconLabel(iconName) {
  switch (iconName) {
    case "copilot":
      return "GitHub Copilot";
    case "codex":
      return "Codex";
    case "claude":
      return "Claude";
    default:
      return iconName
        .split(/[-_]/g)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
  }
}
