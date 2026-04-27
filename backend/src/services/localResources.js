const fs = require("fs/promises");
const path = require("path");

const RESOURCE_ROOT = path.resolve(process.env.RESOURCE_ROOT);

function validateResourcePath(filename) {
  if (typeof filename !== "string") {
    throw Object.assign(new Error("Nombre de archivo no valido"), {
      statusCode: 400,
    });
  }

  const cleanName = filename.trim();

  if (!cleanName) {
    throw Object.assign(new Error("Nombre de archivo obligatorio"), {
      statusCode: 400,
    });
  }

  if (
    cleanName.includes("\0") ||
    cleanName.includes("/") ||
    cleanName.includes("\\") ||
    cleanName.split(/[\\/]+/).includes("..") ||
    cleanName.includes("..") ||
    path.isAbsolute(cleanName) ||
    path.win32.isAbsolute(cleanName) ||
    path.posix.isAbsolute(cleanName)
  ) {
    throw Object.assign(new Error("Ruta no permitida"), { statusCode: 400 });
  }

  const finalPath = path.resolve(RESOURCE_ROOT, cleanName);
  const rootWithSeparator = RESOURCE_ROOT.endsWith(path.sep)
    ? RESOURCE_ROOT
    : `${RESOURCE_ROOT}${path.sep}`;

  if (
    finalPath === RESOURCE_ROOT ||
    !finalPath.toLowerCase().startsWith(rootWithSeparator.toLowerCase())
  ) {
    throw Object.assign(new Error("Ruta fuera del directorio permitido"), {
      statusCode: 400,
    });
  }

  return { filename: cleanName, finalPath };
}

async function ensureResourceRoot() {
  await fs.mkdir(RESOURCE_ROOT, { recursive: true });
}

async function listResources() {
  await ensureResourceRoot();

  const entries = await fs.readdir(RESOURCE_ROOT, { withFileTypes: true });
  const files = await Promise.all(
    entries
      .filter((entry) => entry.isFile())
      .map(async (entry) => {
        const finalPath = path.resolve(RESOURCE_ROOT, entry.name);
        const stats = await fs.stat(finalPath);

        return {
          filename: entry.name,
          size: stats.size,
          modifiedAt: stats.mtime,
        };
      }),
  );

  return files.sort((left, right) =>
    left.filename.localeCompare(right.filename),
  );
}

async function readResource(filename) {
  await ensureResourceRoot();
  const { finalPath } = validateResourcePath(filename);
  return fs.readFile(finalPath, "utf8");
}

async function createResource(filename, content) {
  await ensureResourceRoot();
  const { finalPath } = validateResourcePath(filename);
  await fs.writeFile(finalPath, content ?? "", {
    encoding: "utf8",
    flag: "wx",
  });
}

async function updateResource(filename, content) {
  await ensureResourceRoot();
  const { finalPath } = validateResourcePath(filename);
  await fs.writeFile(finalPath, content ?? "", { encoding: "utf8", flag: "w" });
}

async function deleteResource(filename) {
  await ensureResourceRoot();
  const { finalPath } = validateResourcePath(filename);
  await fs.unlink(finalPath);
}

module.exports = {
  RESOURCE_ROOT,
  validateResourcePath,
  listResources,
  readResource,
  createResource,
  updateResource,
  deleteResource,
};
