const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");

const RESOURCE_ROOT = path.resolve(process.env.RESOURCE_ROOT || "./.resources");
const ROLLBACK_DIR = ".accessguard-rollback";

function httpError(message, statusCode = 400) {
  return Object.assign(new Error(message), { statusCode });
}

function toResourcePath(input) {
  if (typeof input !== "string") {
    throw httpError("Ruta no valida");
  }

  const value = input.trim().replace(/\\/g, "/");
  if (!value || value === "/") {
    return "/";
  }

  if (value.includes("\0")) {
    throw httpError("Ruta no permitida");
  }

  const parts = value
    .replace(/^\/+/, "")
    .split("/")
    .filter(Boolean);

  if (parts.some((part) => part === "." || part === "..")) {
    throw httpError("Ruta no permitida");
  }

  return `/${parts.join("/")}`;
}

function validateResourceName(name) {
  if (typeof name !== "string") {
    throw httpError("Nombre no valido");
  }

  const cleanName = name.trim();
  if (!cleanName) {
    throw httpError("Nombre obligatorio");
  }

  if (
    cleanName.includes("\0") ||
    cleanName.includes("/") ||
    cleanName.includes("\\") ||
    cleanName === "." ||
    cleanName === ".." ||
    path.isAbsolute(cleanName) ||
    path.win32.isAbsolute(cleanName) ||
    path.posix.isAbsolute(cleanName)
  ) {
    throw httpError("Nombre no permitido");
  }

  return cleanName;
}

function resourcePathToRelative(resourcePath) {
  const cleanPath = toResourcePath(resourcePath);
  return cleanPath === "/" ? "" : cleanPath.slice(1).split("/").join(path.sep);
}

function resolveResourcePath(resourcePath) {
  const finalPath = path.resolve(RESOURCE_ROOT, resourcePathToRelative(resourcePath));
  const rootWithSeparator = RESOURCE_ROOT.endsWith(path.sep)
    ? RESOURCE_ROOT
    : `${RESOURCE_ROOT}${path.sep}`;

  if (
    finalPath !== RESOURCE_ROOT &&
    !finalPath.toLowerCase().startsWith(rootWithSeparator.toLowerCase())
  ) {
    throw httpError("Ruta fuera del directorio permitido");
  }

  return finalPath;
}

function joinResourcePath(parentPath, name) {
  const cleanParent = toResourcePath(parentPath || "/");
  const cleanName = validateResourceName(name);
  return cleanParent === "/" ? `/${cleanName}` : `${cleanParent}/${cleanName}`;
}

async function ensureResourceRoot() {
  await fs.mkdir(RESOURCE_ROOT, { recursive: true });
}

async function ensureRollbackDir() {
  await ensureResourceRoot();
  const rollbackPath = path.resolve(RESOURCE_ROOT, ROLLBACK_DIR);
  await fs.mkdir(rollbackPath, { recursive: true });
  return rollbackPath;
}

async function pathExists(finalPath) {
  try {
    await fs.access(finalPath);
    return true;
  } catch (err) {
    if (err.code === "ENOENT") return false;
    throw err;
  }
}

async function checksumFile(finalPath) {
  const content = await fs.readFile(finalPath);
  return crypto.createHash("sha256").update(content).digest("hex");
}

async function metadataForPath(resourcePath) {
  const finalPath = resolveResourcePath(resourcePath);
  const stats = await fs.stat(finalPath);
  const kind = stats.isDirectory() ? "directory" : "file";

  return {
    kind,
    size: stats.size,
    modifiedAt: stats.mtime,
    checksum: kind === "file" ? await checksumFile(finalPath) : null,
  };
}

async function scanDiskResources() {
  await ensureResourceRoot();
  const results = [];

  async function walk(directoryPath, parentResourcePath) {
    const entries = await fs.readdir(directoryPath, { withFileTypes: true });
    const visibleEntries = entries.filter((entry) => entry.name !== ROLLBACK_DIR);

    for (const entry of visibleEntries) {
      const resourcePath = joinResourcePath(parentResourcePath, entry.name);
      const finalPath = path.resolve(directoryPath, entry.name);
      const stats = await fs.stat(finalPath);
      const kind = entry.isDirectory() ? "directory" : "file";

      results.push({
        name: entry.name,
        path: resourcePath,
        kind,
        size: stats.size,
        modifiedAt: stats.mtime,
        checksum: kind === "file" ? await checksumFile(finalPath) : null,
      });

      if (entry.isDirectory()) {
        await walk(finalPath, resourcePath);
      }
    }
  }

  await walk(RESOURCE_ROOT, "/");
  return results.sort((left, right) => left.path.localeCompare(right.path));
}

async function readResourceFile(resourcePath) {
  await ensureResourceRoot();
  const finalPath = resolveResourcePath(resourcePath);
  return fs.readFile(finalPath, "utf8");
}

async function writeResourceFile(resourcePath, content, flag = "w") {
  await ensureResourceRoot();
  const finalPath = resolveResourcePath(resourcePath);
  await fs.writeFile(finalPath, content ?? "", { encoding: "utf8", flag });
}

async function createDiskResource(resourcePath, kind, content = "") {
  await ensureResourceRoot();
  const finalPath = resolveResourcePath(resourcePath);

  if (kind === "directory") {
    await fs.mkdir(finalPath, { recursive: false });
    return;
  }

  await fs.writeFile(finalPath, content ?? "", { encoding: "utf8", flag: "wx" });
}

async function moveDiskResource(sourcePath, targetPath) {
  await ensureResourceRoot();
  await fs.rename(resolveResourcePath(sourcePath), resolveResourcePath(targetPath));
}

async function removeDiskResource(resourcePath) {
  await ensureResourceRoot();
  await fs.rm(resolveResourcePath(resourcePath), { recursive: true, force: false });
}

async function makeRollbackPath(resourcePath) {
  const rollbackDir = await ensureRollbackDir();
  const safeName = resourcePathToRelative(resourcePath).replace(/[\\/]/g, "__") || "root";
  return path.resolve(rollbackDir, `${Date.now()}-${crypto.randomUUID()}-${safeName}`);
}

module.exports = {
  RESOURCE_ROOT,
  ROLLBACK_DIR,
  checksumFile,
  createDiskResource,
  ensureResourceRoot,
  joinResourcePath,
  makeRollbackPath,
  metadataForPath,
  moveDiskResource,
  pathExists,
  readResourceFile,
  removeDiskResource,
  resolveResourcePath,
  scanDiskResources,
  toResourcePath,
  validateResourceName,
  writeResourceFile,
};
