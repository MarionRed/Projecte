const app = require("./app");
const { sequelize, seedDemoData } = require("./models");

const port = process.env.PORT || 3001;

async function start() {
  await sequelize.sync();
  await seedDemoData();

  app.listen(port, () => {
    console.log(`Backend IAM en http://localhost:${port}`);
  });
}

start().catch((err) => {
  console.error("No se pudo arrancar el backend:", err);
  process.exit(1);
});
