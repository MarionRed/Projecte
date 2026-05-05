const app = require("./app");
const { ensureSchema, sequelize, seedDemoData } = require("./models");

const port = process.env.PORT || 3001;

async function start() {
  await sequelize.sync();
  await ensureSchema();
  await seedDemoData();

  app.listen(port, () => {
    console.log(`Control de Accesos en http://localhost:${port}`);
  });
}

start().catch((err) => {
  console.error("No se pudo arrancar el backend:", err);
  process.exit(1);
});
