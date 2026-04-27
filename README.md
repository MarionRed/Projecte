# Projecte IAM

Aplicacion IAM para clase. La version actual esta separada en backend y frontend:

```txt
backend/   API Express + Sequelize + SQLite + Zod
frontend/  Vue + Vite + Bulma + Pinia + Axios
legacy/    Version antigua Express/HTML, solo como referencia
```

## Arranque

Instala dependencias:

```bash
npm install
```

Arranca la aplicacion completa:

```bash
npm run dev
```

URLs:

- Frontend: http://localhost:5173
- Backend: http://localhost:3001

Tambien puedes arrancar solo una parte:

```bash
npm run dev:backend
npm run dev:frontend
```

`node app.js` y `npm start` arrancan el backend nuevo, no la version antigua.

## Usuario Demo

- Usuario: `admin`
- Contrasena: `Admin123!`

Captcha y 2FA se pueden activar con variables de entorno:

```bash
CAPTCHA_ENABLED=true
TWO_FACTOR_ENABLED=true
```

## Funcionalidades

- Login con JWT en cookie.
- Registro de usuarios.
- Roles `user`, `security` y `admin`.
- Gestion de usuarios y grupos.
- Recursos tipo Linux, por ejemplo `/home/clase/apuntes/tema1.txt`.
- Gestion de archivos reales dentro de `C:\AccessGuard\resources`.
- Permisos `read` y `write` por usuario o grupo.
- Simulador de acceso permitido/denegado.
- Logs de auditoria.
- SQLite con Sequelize.

La primera fase aplica permisos IAM guardados en base de datos. La siguiente fase conectara esos permisos con una VM Linux mediante un adaptador controlado.

## Archivos Locales

La pestaña `Archivos reales` trabaja solo dentro de:

```txt
C:\AccessGuard\resources
```

Permisos:

- `admin`: crear, leer, editar y borrar.
- `security`: leer.
- `user`: acceso denegado.

El backend rechaza rutas absolutas, rutas con `..` y cualquier intento de salir del directorio permitido.

## Integracion Linux VM

La propuesta esta documentada en [docs/vm-linux-integration.md](docs/vm-linux-integration.md).

## Version Antigua

La version inicial del proyecto esta apartada en:

```txt
legacy/old-express/
```

Solo se conserva como referencia. Si hiciera falta arrancarla:

```bash
npm run legacy:start
```
