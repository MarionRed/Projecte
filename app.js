const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bodyParser = require('body-parser');
const session = require('express-session');
const argon2 = require('argon2');
const helmet = require('helmet');

const app = express();
const port = 3001;

// Configuració de SQLite
const dbPath = path.resolve(__dirname, 'database.db');
const db = new sqlite3.Database(dbPath);

// Configuració de Express
app.use(bodyParser.urlencoded({ extended: true })); // Per processar les dades del formulari
app.use(session({
  secret: 'tu_secreto_aquí',  // Assegura't d'utilitzar un secret segur
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false }  // Per desenvolupament, estableix secure: false si no utilitzes HTTPS
}));

// Configurar Helmet per millorar la seguretat
app.use(helmet());

// Ruta principal
app.get('/', (req, res) => {
  if (req.session.user) {
    // Si l'usuari ha iniciat sessió, mostra la pàgina principal
    res.sendFile(path.join(__dirname, '/views/index.html'));
  } else {
    // Si l'usuari no ha iniciat sessió, redirigeix al formulari d'inici de sessió
    res.redirect('/login');
  }
});

// Ruta per afegir tasques
app.post('/addTask', async (req, res) => {
  if (req.session.user) {
    const task = req.body.task;

    try {
      // Usar consulta parametritzada per prevenir injeccions SQL
      await db.run('INSERT INTO tasks (task, user_id) VALUES (?, ?)', [task, req.session.user.id]);
      console.log(`Tarea añadida: ${task}`);
      res.redirect('/');
    } catch (err) {
      console.error(err.message);
      res.status(500).send('Error al agregar la tarea');
    }
  } else {
    res.redirect('/login');
  }
});

// Ruta per mostrar el formulari de registre
app.get('/register', (req, res) => {
  res.sendFile(path.join(__dirname, '/views/register.html'));
});

// Ruta per processar el formulari de registre
app.post('/register', async (req, res) => {
  const { username, password } = req.body;

  try {
    // Hashear la contrasenya utilitzant argon2
    const hashedPassword = await argon2.hash(password);

    await db.run('INSERT INTO users (username, password) VALUES (?, ?)', [username, hashedPassword]);
    res.redirect('/login');
  } catch (err) {
    console.error(err);
    res.status(500).send('Error al registrar el usuario');
  }
});

// Ruta per mostrar el formulari d'inici de sessió
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, '/views/login.html'));
});

// Ruta per processar l'inici de sessió
app.post('/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    // Consulta SQL per obtenir l'usuari pel nom d'usuari
    db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
      if (err) {
        console.error(err);
        return res.status(500).send('Error al procesar la solicitud');
      }

      // Verificar si l'usuari existeix
      if (!user) {
        return res.status(401).send('Usuari no trobat');
      }

      // Depuració: imprimeix el hash recuperat de la base de dades
      console.log('Contrasenya recuperada de la base de dades:', user.password);
      console.log('Contrasenya ingressada:', password);

      try {
        // Verificar si la contrasenya coincideix amb el hash emmagatzemat a la base de dades
        const validPassword = await argon2.verify(user.password, password);
        console.log('Contrasenya vàlida:', validPassword); // Verifica si és true

        if (validPassword) {
          // Si l'inici de sessió és correcte, establir la sessió
          req.session.user = { id: user.id, username: user.username };

          // Redirigir l'usuari a la pàgina principal
          res.redirect('/');
        } else {
          res.status(401).send('Contrasenya incorrecta');
        }
      } catch (err) {
        console.error(err);
        res.status(500).send('Error al verificar la contrasenya');
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error al processar l\'inici de sessió');
  }
});

// Inicialització del servidor
app.listen(port, () => {
  console.log(`Servidor en http://localhost:${port}`);
});
