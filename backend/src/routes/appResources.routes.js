const express = require("express");
const { z } = require("zod");
const { authenticate } = require("../middleware/auth");
const { logEvent } = require("../models");
const {
  RESOURCE_ROOT,
  createDiskResource,
  readResourceFile,
  removeDiskResource,
  scanDiskResources,
  writeResourceFile,
} = require("../services/localResources");

const router = express.Router();

const filenameSchema = z.string().min(1).max(180);
const contentSchema = z.object({
  content: z.string().max(1024 * 1024).default(""),
});

router.use(authenticate);

function canReadFiles(role) {
  return role === "admin" || role === "security";
}

function canWriteFiles(role) {
  return role === "admin";
}

async function denyResourceAccess(req, res, action, filename = null) {
  await logEvent(req.user.username, "RESOURCE_DENIED", "DENIED", `${action}${filename ? ` ${filename}` : ""}`);
  return res.status(403).json({ message: "Acceso denegado" });
}

function parseFilename(req) {
  const result = filenameSchema.safeParse(req.params.filename);
  if (!result.success) {
    throw Object.assign(new Error("Nombre de archivo no valido"), { statusCode: 400 });
  }

  return result.data;
}

function parseBodyFilename(req) {
  const result = filenameSchema.safeParse(req.body?.filename);
  if (!result.success) {
    throw Object.assign(new Error("Nombre de archivo no valido"), { statusCode: 400 });
  }

  return result.data;
}

function parseContent(req) {
  const result = contentSchema.safeParse(req.body);
  if (!result.success) {
    throw Object.assign(new Error("Contenido no valido"), { statusCode: 400 });
  }

  return result.data.content;
}

router.get("/", async (req, res, next) => {
  if (!canReadFiles(req.user.role)) {
    return denyResourceAccess(req, res, "LIST");
  }

  try {
    const files = (await scanDiskResources())
      .filter((item) => item.kind === "file" && item.path.split("/").length === 2)
      .map((item) => ({
        filename: item.name,
        size: item.size,
        modifiedAt: item.modifiedAt,
      }));
    return res.json({ root: RESOURCE_ROOT, files });
  } catch (err) {
    return next(err);
  }
});

router.get("/:filename", async (req, res, next) => {
  let filename = null;

  try {
    filename = parseFilename(req);

    if (!canReadFiles(req.user.role)) {
      return denyResourceAccess(req, res, "READ", filename);
    }

    const content = await readResourceFile(`/${filename}`);
    await logEvent(req.user.username, "RESOURCE_READ", "SUCCESS", filename);
    return res.json({ filename, content });
  } catch (err) {
    if (filename) {
      await logEvent(req.user.username, "RESOURCE_READ", "FAILED", filename);
    }
    return next(err);
  }
});

router.post("/", async (req, res, next) => {
  const filename = req.body?.filename;

  if (!canWriteFiles(req.user.role)) {
    return denyResourceAccess(req, res, "CREATE", filename);
  }

  try {
    const parsedFilename = parseBodyFilename(req);
    const content = parseContent(req);

    await createDiskResource(`/${parsedFilename}`, "file", content);
    await logEvent(req.user.username, "RESOURCE_CREATE", "SUCCESS", parsedFilename);
    return res.status(201).json({ message: "Archivo creado" });
  } catch (err) {
    await logEvent(req.user.username, "RESOURCE_CREATE", "FAILED", filename || "");
    return next(err);
  }
});

router.put("/:filename", async (req, res, next) => {
  let filename = null;

  try {
    filename = parseFilename(req);

    if (!canWriteFiles(req.user.role)) {
      return denyResourceAccess(req, res, "UPDATE", filename);
    }

    const content = parseContent(req);
    await writeResourceFile(`/${filename}`, content);
    await logEvent(req.user.username, "RESOURCE_UPDATE", "SUCCESS", filename);
    return res.json({ message: "Archivo actualizado" });
  } catch (err) {
    if (filename) {
      await logEvent(req.user.username, "RESOURCE_UPDATE", "FAILED", filename);
    }
    return next(err);
  }
});

router.delete("/:filename", async (req, res, next) => {
  let filename = null;

  try {
    filename = parseFilename(req);

    if (!canWriteFiles(req.user.role)) {
      return denyResourceAccess(req, res, "DELETE", filename);
    }

    await removeDiskResource(`/${filename}`);
    await logEvent(req.user.username, "RESOURCE_DELETE", "SUCCESS", filename);
    return res.status(204).send();
  } catch (err) {
    if (filename) {
      await logEvent(req.user.username, "RESOURCE_DELETE", "FAILED", filename);
    }
    return next(err);
  }
});

module.exports = router;
