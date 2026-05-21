const express = require("express");
const { authenticate } = require("../middleware/auth");
const { asyncRoute } = require("../middleware/asyncRoute");
const { validate } = require("../middleware/validate");
const { idParam, taskSchema, taskUpdateSchema } = require("../validators/schemas");
const { UserTask, logEvent } = require("../models");

const router = express.Router();

router.use(authenticate);

function normalizeDueDate(value) {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? undefined : value;
}

router.get("/", asyncRoute(async (req, res) => {
  const tasks = await UserTask.findAll({
    where: { userId: req.user.id },
    order: [
      ["completed", "ASC"],
      ["dueDate", "ASC"],
      ["createdAt", "DESC"],
    ],
  });
  res.json({ tasks });
}));

router.post("/", validate(taskSchema), asyncRoute(async (req, res) => {
  const dueDate = normalizeDueDate(req.validated.body.dueDate);
  if (dueDate === undefined) {
    return res.status(400).json({ message: "Fecha no valida" });
  }

  const task = await UserTask.create({
    userId: req.user.id,
    text: req.validated.body.text,
    dueDate,
  });

  await logEvent(req.user.username, "TASK_CREATED", "SUCCESS", task.text);
  return res.status(201).json({ task });
}));

router.patch("/:id", validate(taskUpdateSchema), asyncRoute(async (req, res) => {
  const task = await UserTask.findOne({
    where: { id: req.validated.params.id, userId: req.user.id },
  });
  if (!task) return res.status(404).json({ message: "Tarea no encontrada" });

  const completed = req.validated.body.completed;
  await task.update({
    completed,
    completedAt: completed ? new Date() : null,
  });

  await logEvent(
    req.user.username,
    completed ? "TASK_COMPLETED" : "TASK_REOPENED",
    "SUCCESS",
    task.text,
  );
  return res.json({ task });
}));

router.delete("/:id", validate(idParam), asyncRoute(async (req, res) => {
  const task = await UserTask.findOne({
    where: { id: req.validated.params.id, userId: req.user.id },
  });
  if (!task) return res.status(404).json({ message: "Tarea no encontrada" });

  const details = task.text;
  await task.destroy();
  await logEvent(req.user.username, "TASK_DELETED", "SUCCESS", details);
  return res.status(204).send();
}));

module.exports = router;
