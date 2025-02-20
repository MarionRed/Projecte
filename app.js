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

// Ruta per processar el formulari de registre
app.post("/register", async (req, res) => {
  const { username, password } = req.body;
  console.log("Intentant registrar usuari:", username);

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
app.post("/login", (req, res) => {
  const { username, password, twoFactorCode } = req.body;
  console.log("Intentant iniciar sessió per a l'usuari:", username);

  db.get(
    "SELECT * FROM users WHERE username = ?",
    [username],
    async (err, user) => {
      if (err) {
        console.error("Error al procesar la solicitud:", err);
        return res.status(500).send("Error al procesar la solicitud");
      }

      if (!user) {
        console.log("Usuari no trobat:", username);
        return res.status(401).send("Usuari no trobat");
      }

      try {
        const validPassword = await argon2.verify(user.password, password);

        if (!validPassword) {
          console.log("Contrasenya incorrecta per a l'usuari:", username);
          return res.status(401).send("Contrasenya incorrecta");
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
          console.log("Codi 2FA incorrecte per a l'usuari:", username);
          return res.status(401).send("Codi 2FA incorrecte");
        }

        console.log(
          "Codi 2FA verificat correctament per a l'usuari:",
          username
        );
        req.session.user = { id: user.id, username: user.username };
        res.cookie("token", jwt.sign({ id: user.id }, jwtSecret));
        res.redirect("/app/index");
      } catch (err) {
        console.error("Error al processar l'inici de sessió:", err);
        res.status(500).send("Error al processar l'inici de sessió");
      }
    }
  );
});

app.get("/", (req, res) => res.redirect("/auth/login"));

// Inicialització del servidor
app.listen(port, () => {
  console.log(`Servidor en http://localhost:${port}`);
});
