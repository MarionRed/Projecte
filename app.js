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

  return res
    .status(403)
    .send("Acceso denegado: se requieren privilegios de administrador.");
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
  res.sendFile(path.join(__dirname, "views", "app", "admin.html"));
});

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
          return res.status(500).send("Error al registrar el usuario");
        }

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
    return res.status(500).send("Error al registrar el usuario");
  }
});

// Login
app.post("/login", async (req, res) => {
  const { username, password, twoFactorCode, captcha } = req.body;
  console.log("Intentando iniciar sesión para el usuario:", username);

  if (captcha !== req.session.captcha) {
    console.log("Captcha incorrecto para el usuario:", username);
    return res.status(400).send("Captcha incorrecto. Inténtalo de nuevo.");
  }

  db.get(
    "SELECT * FROM users WHERE username = ?",
    [username],
    async (err, user) => {
      if (err) {
        console.error("Error al procesar la solicitud:", err);
        return res.status(500).send("Error al procesar la solicitud");
      }

      if (!user) {
        console.log("Usuario no encontrado:", username);
        return res.status(401).send("Usuario no encontrado");
      }

      // Comprobar si la cuenta está activa
      if (user.is_active === 0) {
        console.log("Cuenta desactivada para el usuario:", username);
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

          const currentFailedAttempts = user.failed_attempts || 0;
          const failedAttempts = currentFailedAttempts + 1;
          let blockUntil = null;

          if (failedAttempts >= 3) {
            blockUntil = Date.now() + 30 * 1000; // 30 segundos
            console.log(`Usuario ${username} bloqueado por 30 segundos.`);
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

        return res.redirect("/app/index");
      } catch (loginErr) {
        console.error("Error al procesar el inicio de sesión:", loginErr);
        return res.status(500).send("Error al procesar el inicio de sesión.");
      }
    },
  );
});

app.get("/", (req, res) => res.redirect("/auth/login"));

app.listen(port, () => {
  console.log(`Servidor en http://localhost:${port}`);
});
