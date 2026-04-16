const speakeasy = require("speakeasy");
const QRCode = require("qrcode");
const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const bodyParser = require("body-parser");
const session = require("express-session");
const argon2 = require("argon2");
const helmet = require("helmet");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const svgCaptcha = require("svg-captcha");

const app = express();
const port = 3001;

const jwtSecret = "tu_secreto_aquí"; // Mejor pasarlo luego a .env

// Configuración de SQLite
const dbPath = path.resolve(__dirname, "database.db");
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error("Error al conectar con la base de datos:", err.message);
  } else {
    console.log("Conectado a la base de datos SQLite");
  }
});

function logEvent(user, action, status) {
  db.run(
    "INSERT INTO logs (user, action, status) VALUES (?, ?, ?)",
    [user, action, status],
    (err) => {
      if (err) {
        console.error("Error al guardar log:", err.message);
      }
    },
  );
}

function verifyToken(req, res, next) {
  const token = req.cookies?.token;

  if (!token) {
    return res.redirect("/auth/login");
  }

  try {
    const verified = jwt.verify(token, jwtSecret);
    req.user = verified;
    next();
  } catch (err) {
    return res.status(400).send("Token no válido.");
  }
}

function isAdmin(req, res, next) {
  if (req.user && req.user.role === "admin") {
    return next();
  }

  logEvent(req.user?.username || "anonymous", "ACCESS_ADMIN_PANEL", "DENIED");
  return res
    .status(403)
    .send("Acceso denegado: se requieren privilegios de administrador.");
}

function requireRole(allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      logEvent(req.user?.username || "anonymous", "ACCESS_SENSITIVE", "DENIED");
      return res
        .status(403)
        .send("Acceso denegado: no tienes permisos suficientes.");
    }

    next();
  };
}

function redirectIfAuthenticated(req, res, next) {
  const token = req.cookies?.token;

  if (!token) {
    return next();
  }

  try {
    jwt.verify(token, jwtSecret);
    return res.redirect("/app/index");
  } catch (err) {
    return next();
  }
}

function serveHtml(req, res) {
  res.sendFile(path.join(__dirname, "views", req.baseUrl, req.path + ".html"));
}

app.use(cookieParser());

// Configuración de Express
app.use(bodyParser.urlencoded({ extended: true }));
app.use(
  session({
    secret: "tu_secreto_aquí",
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false },
  }),
);

// Seguridad básica
app.use(helmet());

// Archivos estáticos
app.use("/public", express.static(path.join(__dirname, "public")));

app.get("/app/admin", verifyToken, isAdmin, (req, res) => {
  logEvent(req.user.username, "ACCESS_ADMIN_PANEL", "SUCCESS");
  res.sendFile(path.join(__dirname, "views", "app", "admin.html"));
});

app.get("/app/admin/users", verifyToken, isAdmin, (req, res) => {
  db.all(
    "SELECT id, username, role, is_active FROM users ORDER BY id ASC",
    [],
    (err, users) => {
      if (err) {
        console.error("Error al obtener usuarios:", err.message);
        return res.status(500).send("Error al obtener los usuarios.");
      }

      const rows = users
        .map(
          (user) => `
            <tr>
              <td>${user.id}</td>
              <td>${user.username}</td>
              <td>${user.role}</td>
              <td>${user.is_active === 1 ? "Activa" : "Desactivada"}</td>
              <td>
                <form action="/app/admin/users/${user.id}/role" method="POST">
                  <select name="role">
                    <option value="user" ${user.role === "user" ? "selected" : ""}>user</option>
                    <option value="security" ${user.role === "security" ? "selected" : ""}>security</option>
                    <option value="admin" ${user.role === "admin" ? "selected" : ""}>admin</option>
                  </select>
                  <button type="submit">Cambiar</button>
                </form>
              </td>
            </tr>
          `,
        )
        .join("");

      res.send(`
        <!DOCTYPE html>
        <html lang="es">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>Usuarios - Panel Admin</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              margin: 40px;
              background: #f7f7f7;
            }
            h1 {
              margin-bottom: 20px;
            }
            a {
              text-decoration: none;
              color: #0066cc;
            }
            .topbar {
              margin-bottom: 20px;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              background: white;
            }
            th, td {
              border: 1px solid #ccc;
              padding: 12px;
              text-align: left;
            }
            th {
              background: #eee;
            }
            tr:nth-child(even) {
              background: #fafafa;
            }
            select, button {
              padding: 6px;
            }
          </style>
        </head>
        <body>
          <div class="topbar">
            <h1>Gestión de usuarios</h1>
            <p><a href="/app/admin">Volver al panel admin</a></p>
          </div>

          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Usuario</th>
                <th>Rol</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              ${rows || '<tr><td colspan="5">No hay usuarios.</td></tr>'}
            </tbody>
          </table>
        </body>
        </html>
      `);
    },
  );
});

app.post("/app/admin/users/:id/role", verifyToken, isAdmin, (req, res) => {
  const { id } = req.params;
  const { role } = req.body;

  const allowedRoles = ["user", "security", "admin"];

  if (!allowedRoles.includes(role)) {
    logEvent(req.user.username, `CHANGE_ROLE_USER_${id}`, "INVALID_ROLE");
    return res.status(400).send("Rol no válido.");
  }

  db.run("UPDATE users SET role = ? WHERE id = ?", [role, id], (err) => {
    if (err) {
      console.error("Error al actualizar el rol:", err.message);
      logEvent(req.user.username, `CHANGE_ROLE_USER_${id}`, "FAILED");
      return res.status(500).send("Error al actualizar el rol.");
    }

    logEvent(req.user.username, `CHANGE_ROLE_USER_${id}_TO_${role}`, "SUCCESS");
    return res.redirect("/app/admin/users");
  });
});

app.get("/app/logs", verifyToken, isAdmin, (req, res) => {
  logEvent(req.user.username, "VIEW_LOGS", "SUCCESS");

  db.all(
    "SELECT * FROM logs ORDER BY timestamp DESC, id DESC",
    [],
    (err, logs) => {
      if (err) {
        console.error("Error al obtener logs:", err.message);
        return res.status(500).send("Error al obtener logs.");
      }

      const rows = logs
        .map(
          (log) => `
          <tr>
            <td>${log.id}</td>
            <td>${log.user}</td>
            <td>${log.action}</td>
            <td style="
              color: ${
                log.status.includes("SUCCESS")
                  ? "green"
                  : log.status.includes("FAILED") ||
                      log.status.includes("DENIED") ||
                      log.status.includes("BLOCKED")
                    ? "red"
                    : "orange"
              };
              font-weight: bold;
            ">
              ${log.status}
            </td>
            <td>${log.timestamp}</td>
          </tr>
        `,
        )
        .join("");

      res.send(`
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Logs del sistema</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            margin: 40px;
            background: #f7f7f7;
          }
          h1 {
            margin-bottom: 20px;
          }
          a {
            text-decoration: none;
            color: #0066cc;
          }
          .topbar {
            margin-bottom: 20px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            background: white;
          }
          th, td {
            border: 1px solid #ccc;
            padding: 12px;
            text-align: left;
          }
          th {
            background: #eee;
          }
          tr:nth-child(even) {
            background: #fafafa;
          }
        </style>
      </head>
      <body>
        <div class="topbar">
          <h1>Logs del sistema</h1>
          <p><a href="/app/admin">Volver al panel admin</a></p>
        </div>

        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Usuario</th>
              <th>Acción</th>
              <th>Estado</th>
              <th>Fecha</th>
            </tr>
          </thead>
          <tbody>
            ${rows || '<tr><td colspan="5">No hay logs.</td></tr>'}
          </tbody>
        </table>
      </body>
      </html>
    `);
    },
  );
});

app.get(
  "/app/sensitive",
  verifyToken,
  requireRole(["admin", "security"]),
  (req, res) => {
    logEvent(req.user.username, "ACCESS_SENSITIVE", "SUCCESS");

    res.send(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Información sensible</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          margin: 40px;
          background: #f7f7f7;
        }
        .box {
          background: white;
          padding: 24px;
          border-radius: 8px;
          box-shadow: 0 0 10px rgba(0,0,0,0.08);
        }
        h1 {
          margin-top: 0;
        }
        a {
          text-decoration: none;
          color: #0066cc;
        }
      </style>
    </head>
    <body>
      <div class="box">
        <h1>Información sensible</h1>
        <p>Solo los administradores y el rol security pueden acceder a este contenido.</p>
        <ul>
          <li>Configuración crítica del sistema</li>
          <li>Datos internos de seguridad</li>
          <li>Recursos restringidos</li>
        </ul>
        <p><a href="/app/admin">Volver al panel admin</a></p>
      </div>
    </body>
    </html>
  `);
  },
);

// Rutas HTML protegidas
app.use("/app", verifyToken, serveHtml);
app.use("/auth", redirectIfAuthenticated, serveHtml);

app.get("/captcha", (req, res) => {
  const captcha = svgCaptcha.create();
  req.session.captcha = captcha.text;
  res.type("svg");
  res.status(200).send(captcha.data);
});

// Ruta de administración protegida por rol
app.get("/admin", verifyToken, isAdmin, (req, res) => {
  res.send("Panel de administración IAM");
});

// Registro
app.post("/register", async (req, res) => {
  const { username, password, captcha } = req.body;
  console.log("Intentando registrar usuario:", username);

  if (captcha !== req.session.captcha) {
    logEvent(username || "unknown", "REGISTER", "CAPTCHA_FAILED");
    return res.status(400).send("Captcha incorrecto. Inténtalo de nuevo.");
  }

  try {
    const hashedPassword = await argon2.hash(password);
    const twoFactorSecret = speakeasy.generateSecret({ length: 20 });

    db.run(
      `
      INSERT INTO users (username, password, two_factor_secret, role, is_active)
      VALUES (?, ?, ?, 'user', 1)
      `,
      [username, hashedPassword, twoFactorSecret.ascii],
      (err) => {
        if (err) {
          console.error("Error al registrar el usuario:", err.message);
          logEvent(username, "REGISTER", "FAILED");
          return res.status(500).send("Error al registrar el usuario");
        }

        logEvent(username, "REGISTER", "SUCCESS");

        QRCode.toDataURL(twoFactorSecret.otpauth_url, (qrErr, qrCodeUrl) => {
          if (qrErr) {
            console.error("Error al generar el código QR:", qrErr);
            return res.status(500).send("Error al generar el código QR");
          }

          console.log(
            "Escanea este código QR con tu aplicación de autenticación:",
            qrCodeUrl,
          );

          return res.send(`
            <html>
              <body>
                <h1>Escanea este código QR con tu aplicación de autenticación</h1>
                <img src="${qrCodeUrl}" alt="QR 2FA">
                <br>
                <a href="/auth/login">Iniciar sesión</a>
              </body>
            </html>
          `);
        });
      },
    );
  } catch (err) {
    console.error("Error al registrar el usuario:", err);
    logEvent(username || "unknown", "REGISTER", "FAILED");
    return res.status(500).send("Error al registrar el usuario");
  }
});

// Login
app.post("/login", async (req, res) => {
  const { username, password, twoFactorCode, captcha } = req.body;
  console.log("Intentando iniciar sesión para el usuario:", username);

  if (captcha !== req.session.captcha) {
    console.log("Captcha incorrecto para el usuario:", username);
    logEvent(username || "unknown", "LOGIN", "CAPTCHA_FAILED");
    return res.status(400).send("Captcha incorrecto. Inténtalo de nuevo.");
  }

  db.get(
    "SELECT * FROM users WHERE username = ?",
    [username],
    async (err, user) => {
      if (err) {
        console.error("Error al procesar la solicitud:", err);
        logEvent(username || "unknown", "LOGIN", "ERROR");
        return res.status(500).send("Error al procesar la solicitud");
      }

      if (!user) {
        console.log("Usuario no encontrado:", username);
        logEvent(username, "LOGIN", "USER_NOT_FOUND");
        return res.status(401).send("Usuario no encontrado");
      }

      // Comprobar si la cuenta está activa
      if (user.is_active === 0) {
        console.log("Cuenta desactivada para el usuario:", username);
        logEvent(username, "LOGIN", "ACCOUNT_DISABLED");
        return res
          .status(403)
          .send("Cuenta desactivada. Contacta con el administrador.");
      }

      // Verificar si el usuario está bloqueado temporalmente
      const currentTime = Date.now();
      if (user.block_until && currentTime < user.block_until) {
        const remainingTime = Math.ceil(
          (user.block_until - currentTime) / 1000,
        );
        console.log(
          `Usuario ${username} bloqueado. Tiempo restante: ${remainingTime} segundos.`,
        );
        logEvent(username, "LOGIN", "BLOCKED");
        return res
          .status(403)
          .send(
            `Has superado el número máximo de intentos. Intenta nuevamente en ${remainingTime} segundos.`,
          );
      }

      try {
        const validPassword = await argon2.verify(user.password, password);

        if (!validPassword) {
          console.log("Contraseña incorrecta para el usuario:", username);
          logEvent(username, "LOGIN", "FAILED_PASSWORD");

          const currentFailedAttempts = user.failed_attempts || 0;
          const failedAttempts = currentFailedAttempts + 1;
          let blockUntil = null;

          if (failedAttempts >= 3) {
            blockUntil = Date.now() + 30 * 1000; // 30 segundos
            console.log(`Usuario ${username} bloqueado por 30 segundos.`);
            logEvent(username, "LOGIN", "TEMP_BLOCKED");
          }

          db.run(
            "UPDATE users SET failed_attempts = ?, block_until = ? WHERE username = ?",
            [failedAttempts, blockUntil, username],
            (updateErr) => {
              if (updateErr) {
                console.error(
                  "Error al actualizar los intentos fallidos:",
                  updateErr,
                );
              }
            },
          );

          return res
            .status(401)
            .send("Contraseña incorrecta. Inténtalo de nuevo.");
        }

        // Verificación 2FA
        console.log("Secreto 2FA:", user.two_factor_secret);
        console.log("Código 2FA ingresado:", twoFactorCode);

        const verified2FA = speakeasy.totp.verify({
          secret: user.two_factor_secret,
          encoding: "ascii",
          token: twoFactorCode,
        });

        if (!verified2FA) {
          console.log("Código 2FA incorrecto para el usuario:", username);
          logEvent(username, "2FA", "FAILED");
          return res.status(401).send("Código 2FA incorrecto.");
        }

        console.log(
          "Código 2FA verificado correctamente para el usuario:",
          username,
        );

        // Reset de intentos fallidos
        db.run(
          "UPDATE users SET failed_attempts = 0, block_until = NULL WHERE username = ?",
          [username],
          (updateErr) => {
            if (updateErr) {
              console.error(
                "Error al restablecer los intentos fallidos:",
                updateErr,
              );
            }
          },
        );

        // Guardar sesión con rol
        req.session.user = {
          id: user.id,
          username: user.username,
          role: user.role,
        };

        // JWT con rol
        const token = jwt.sign(
          {
            id: user.id,
            username: user.username,
            role: user.role,
          },
          jwtSecret,
          { expiresIn: "1h" },
        );

        res.cookie("token", token, {
          httpOnly: true,
          secure: false,
          sameSite: "lax",
        });

        console.log(
          `Inicio de sesión exitoso para el usuario: ${username} con rol ${user.role}`,
        );

        logEvent(username, "LOGIN", "SUCCESS");
        return res.redirect("/app/index");
      } catch (loginErr) {
        console.error("Error al procesar el inicio de sesión:", loginErr);
        logEvent(username || "unknown", "LOGIN", "ERROR");
        return res.status(500).send("Error al procesar el inicio de sesión.");
      }
    },
  );
});

app.get("/logout", verifyToken, (req, res) => {
  const username = req.user.username;

  req.session.destroy(() => {
    res.clearCookie("token");
    logEvent(username, "LOGOUT", "SUCCESS");
    res.redirect("/auth/login");
  });
});

app.get("/", (req, res) => res.redirect("/auth/login"));

app.listen(port, () => {
  console.log(`Servidor en http://localhost:${port}`);
});
