import * as fs from "fs/promises";
import * as path from "path";

export interface FileMatch {
  filePath: string;
  mtimeMs: number;
}

export async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

export async function listRecentFiles(rootDir: string, suffix: string, limit: number): Promise<FileMatch[]> {
  const matches: FileMatch[] = [];

  async function walk(currentDir: string): Promise<void> {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });

    await Promise.all(
      entries.map(async (entry) => {
        const fullPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          await walk(fullPath);
          return;
        }

        if (!entry.isFile() || !entry.name.endsWith(suffix)) {
          return;
        }

        const stat = await fs.stat(fullPath);
        matches.push({ filePath: fullPath, mtimeMs: stat.mtimeMs });
      }),
    );
  }

  await walk(rootDir);
  matches.sort((left, right) => right.mtimeMs - left.mtimeMs);

  return matches.slice(0, limit);
}
