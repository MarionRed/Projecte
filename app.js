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

const jwtSecret = "tu_secreto_aquí"; // Assegura't d'utilitzar un secret segur

// Configuració de SQLite
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
    res.status(400).send("Token no válido.");
  }
}

function redirectIfAuthenticated(req, res, next) {
  try {
    jwt.verify(token, jwtSecret);
    res.redirect("/app");
  } catch (err) {
    next();
  }
}

function serveHtml(req, res) {
  res.sendFile(path.join(__dirname, "views", req.baseUrl, req.path + ".html"));
}

app.use(cookieParser());

// Configuració de Express
app.use(bodyParser.urlencoded({ extended: true })); // Per processar les dades del formulari
app.use(
  session({
    secret: "tu_secreto_aquí", // Assegura't d'utilitzar un secret segur
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }, // Per desenvolupament, estableix secure: false si no utilitzes HTTPS
  })
);

// Configurar Helmet per millorar la seguretat
app.use(helmet());

// Servir archivos estáticos desde la carpeta "public" y "views"
app.use("/public", express.static(path.join(__dirname, "public")));

app.use("/app", verifyToken, serveHtml);
app.use("/auth", redirectIfAuthenticated, serveHtml);

app.get("/captcha", (req, res) => {
  const captcha = svgCaptcha.create(); // Genera un captcha
  req.session.captcha = captcha.text; // Guarda el texto del captcha en la sesión
  res.type("svg");
  res.status(200).send(captcha.data); // Envia el SVG al cliente
});

// Ruta per processar el formulari de registre
app.post("/register", async (req, res) => {
  const { username, password, captcha } = req.body;
  console.log("Intentant registrar usuari:", username);

  // Validar el captcha
  if (captcha !== req.session.captcha) {
    return res.status(400).send("Captcha incorrecto. Inténtalo de nuevo.");
  }

  try {
    const hashedPassword = await argon2.hash(password);
    const twoFactorSecret = speakeasy.generateSecret({ length: 20 });

    db.run(
      "INSERT INTO users (username, password, two_factor_secret) VALUES (?, ?, ?)",
      [username, hashedPassword, twoFactorSecret.ascii],
      (err) => {
        if (err) {
          console.error("Error al registrar el usuario:", err.message);
          return res.status(500).send("Error al registrar el usuario");
        }

        // Generar un QR code per a l'usuari
        QRCode.toDataURL(twoFactorSecret.otpauth_url, (err, qrCodeUrl) => {
          if (err) {
            console.error("Error al generar el codi QR:", err);
            return res.status(500).send("Error al generar el codi QR");
          }

          console.log(
            "Escaneja aquest codi QR amb la teva aplicació d'autenticació:",
            qrCodeUrl
          );
          res.send(
            `<html><body><h1>Escanea este código QR con tu aplicación de autenticación</h1><img src="${qrCodeUrl}"><br><a href="/auth/login">Iniciar sesión</a></body></html>`
          );
        });
      }
    );
  } catch (err) {
    console.error("Error al registrar el usuario:", err);
    res.status(500).send("Error al registrar el usuario");
  }
});

// Ruta per processar l'inici de sessió
app.post("/login", async (req, res) => {
  const { username, password, twoFactorCode, captcha } = req.body;
  console.log("Intentant iniciar sessió per a l'usuari:", username);

  // Validar el captcha
  if (captcha !== req.session.captcha) {
    console.log("Captcha incorrecto para el usuario:", username);
    return res.status(400).send("Captcha incorrecto. Inténtalo de nuevo.");
  }

  // Buscar al usuario en la base de datos
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

      // Verificar si el usuario está bloqueado
      const currentTime = Date.now();
      if (user.block_until && currentTime < user.block_until) {
        const remainingTime = Math.ceil(
          (user.block_until - currentTime) / 1000
        );
        console.log(
          `Usuario ${username} bloqueado. Tiempo restante: ${remainingTime} segundos.`
        );
        return res
          .status(403)
          .send(
            `Has superado el número máximo de intentos. Intenta nuevamente en ${remainingTime} segundos.`
          );
      }

      try {
        // Verificar la contraseña
        const validPassword = await argon2.verify(user.password, password);

        if (!validPassword) {
          console.log("Contraseña incorrecta para el usuario:", username);

          // Incrementar los intentos fallidos
          const failedAttempts = user.failed_attempts + 1;
          let blockUntil = null;

          if (failedAttempts >= 3) {
            blockUntil = Date.now() + 30 * 1000; // Bloquear por 30 segundos
            console.log(`Usuario ${username} bloqueado por 30 segundos.`);
          }

          // Actualizar intentos fallidos y tiempo de bloqueo en la base de datos
          db.run(
            "UPDATE users SET failed_attempts = ?, block_until = ? WHERE username = ?",
            [failedAttempts, blockUntil, username],
            (updateErr) => {
              if (updateErr) {
                console.error(
                  "Error al actualizar los intentos fallidos:",
                  updateErr
                );
              }
            }
          );

          return res
            .status(401)
            .send("Contraseña incorrecta. Inténtalo de nuevo.");
        }

        // Verificar el código 2FA
        console.log("Secreto 2FA:", user.two_factor_secret);
        console.log("Código 2FA ingresado:", twoFactorCode);

        const verified = speakeasy.totp.verify({
          secret: user.two_factor_secret,
          encoding: "ascii",
          token: twoFactorCode,
        });

        if (!verified) {
          console.log("Código 2FA incorrecto para el usuario:", username);
          return res.status(401).send("Código 2FA incorrecto.");
        }

        console.log(
          "Código 2FA verificado correctamente para el usuario:",
          username
        );

        // Restablecer intentos fallidos al iniciar sesión correctamente
        db.run(
          "UPDATE users SET failed_attempts = 0, block_until = NULL WHERE username = ?",
          [username],
          (updateErr) => {
            if (updateErr) {
              console.error(
                "Error al restablecer los intentos fallidos:",
                updateErr
              );
            }
          }
        );

        // Generar token JWT y redirigir al usuario a la página principal
        req.session.user = { id: user.id, username: user.username };
        res.cookie("token", jwt.sign({ id: user.id }, jwtSecret));
        console.log(`Inicio de sesión exitoso para el usuario: ${username}`);
        res.redirect("/app/index");
      } catch (err) {
        console.error("Error al procesar el inicio de sesión:", err);
        res.status(500).send("Error al procesar el inicio de sesión.");
      }
    }
  );
});

app.get("/", (req, res) => res.redirect("/auth/login"));

// Inicialització del servidor
app.listen(port, () => {
  console.log(`Servidor en http://localhost:${port}`);
});
