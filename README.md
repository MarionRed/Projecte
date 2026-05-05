# Control de Accesos

Control de Accesos es una aplicacion web para gestionar usuarios, grupos, recursos locales y permisos de lectura/escritura. El proyecto simula un sistema de autorizacion sobre ficheros reales, combinando una interfaz Vue con una API Express que valida cada accion antes de operar sobre disco o base de datos.

La aplicacion esta pensada para mostrar de forma clara como funcionan los roles, los permisos directos, los permisos por grupo, los permisos sobre carpetas y la auditoria de actividad.

## Indice

- [Objetivo](#objetivo)
- [Funcionalidades](#funcionalidades)
- [Roles](#roles)
- [Arquitectura](#arquitectura)
- [Estructura del codigo](#estructura-del-codigo)
- [Modelo de datos](#modelo-de-datos)
- [Flujos principales](#flujos-principales)
- [Seguridad y permisos](#seguridad-y-permisos)
- [Arranque local](#arranque-local)
- [Docker](#docker)
- [Variables de entorno](#variables-de-entorno)
- [Usuario de demostracion](#usuario-de-demostracion)
- [Notas para presentar el proyecto](#notas-para-presentar-el-proyecto)

## Objetivo

El objetivo del proyecto es resolver un caso comun en sistemas de gestion: no basta con autenticar usuarios, tambien hay que decidir que recursos puede ver o modificar cada persona.

Para ello, la aplicacion permite:

- Crear usuarios.
- Organizar usuarios en grupos.
- Registrar recursos locales como carpetas y ficheros.
- Asignar permisos `read` y `write`.
- Comprobar si una accion esta permitida.
- Consultar logs de actividad.

El backend no confia en la interfaz: todas las operaciones sensibles se vuelven a validar en servidor.

## Funcionalidades

- Login con JWT almacenado en cookie `httpOnly`.
- Registro de usuarios.
- Captcha y doble factor configurables.
- Roles `admin`, `security` y `user`.
- Gestion de usuarios.
- Gestion de grupos.
- Asignacion y retirada de permisos.
- Explorador de recursos locales dentro de `RESOURCE_ROOT`.
- Sincronizacion entre disco y SQLite.
- Lectura de ficheros permitidos.
- Permisos especificos sobre carpetas y ficheros.
- Simulador de acceso permitido o denegado.
- Logs generales para administradores y personal de seguridad.
- Logs propios para usuarios estandar.
- Imagen Docker con frontend y backend servidos juntos.

## Roles

### `admin`

Tiene acceso completo a la aplicacion:

- Gestiona usuarios.
- Gestiona grupos.
- Gestiona recursos.
- Asigna y retira permisos.
- Consulta todos los logs.
- Usa el simulador de acceso.

La cuenta `admin` esta protegida: no se puede borrar ni cambiar de rol desde la aplicacion.

### `security`

Representa un usuario encargado de seguridad o administracion operativa:

- Gestiona grupos.
- Gestiona recursos.
- Asigna y retira permisos.
- Consulta logs.
- Usa el simulador.

No puede asignar el rol `admin` ni modificar la cuenta administradora.

### `user`

Es el usuario estandar:

- Solo ve los recursos sobre los que tiene permiso.
- Puede leer archivos si tiene permiso `read` o `write`.
- Puede ver sus propios logs.
- No puede gestionar usuarios, grupos ni permisos.

## Arquitectura

```txt
backend/   API Express + Sequelize + SQLite + Zod
frontend/  Vue + Vite + Bulma + Pinia + Axios
legacy/    Version antigua Express/HTML, solo como referencia
```

En desarrollo, frontend y backend se ejecutan como procesos separados:

- Frontend Vite: `http://localhost:5173`
- Backend Express: `http://localhost:3001`

El frontend llama a la API mediante rutas relativas `/api`. Vite usa un proxy en desarrollo, y en produccion Express sirve tanto la API como el frontend compilado.

## Estructura del codigo

### Backend

```txt
backend/src/app.js
backend/src/server.js
backend/src/config/
backend/src/middleware/
backend/src/models/
backend/src/routes/
backend/src/services/
backend/src/validators/
```

#### `backend/src/app.js`

Crea la aplicacion Express:

- Carga middlewares globales.
- Configura CORS si `CORS_ORIGIN` existe.
- Configura cookies y sesiones.
- Registra las rutas `/api/*`.
- Sirve `frontend/dist` en produccion.
- Define el middleware final de errores.

#### `backend/src/server.js`

Arranca la aplicacion:

- Sincroniza Sequelize con SQLite.
- Crea datos de demostracion con `seedDemoData()`.
- Abre el puerto configurado en `PORT`.

#### `backend/src/models/index.js`

Define los modelos principales:

- `User`
- `Group`
- `Resource`
- `Permission`
- `Log`
- `UserGroup`

Tambien contiene:

- Relaciones entre modelos.
- Funcion `logEvent()`.
- Funcion `seedDemoData()`.

#### `backend/src/routes/`

Contiene las rutas HTTP de la API:

- `auth.routes.js`: login, registro, captcha, usuario actual y logout.
- `users.routes.js`: listado, actualizacion y borrado de usuarios.
- `groups.routes.js`: grupos y asignacion de miembros.
- `resources.routes.js`: recursos persistidos y operaciones sobre ficheros.
- `permissions.routes.js`: asignacion, retirada y simulacion de permisos.
- `logs.routes.js`: consulta de logs.
- `appResources.routes.js`: rutas antiguas de recursos simples.

#### `backend/src/services/accessControl.js`

Centraliza la logica de autorizacion sobre recursos.

Comprueba:

- Si el usuario es `admin`.
- Si el usuario es propietario del recurso.
- Si existe permiso directo.
- Si existe permiso por grupo.
- Si existe permiso directo sobre el recurso.

Un permiso `write` tambien permite leer.

#### `backend/src/services/resourceManager.js`

Coordina los recursos entre disco y base de datos:

- Lista recursos visibles para cada usuario.
- Sincroniza disco con SQLite.
- Crea recursos.
- Lee contenido.
- Actualiza contenido.
- Renombra recursos.
- Borra recursos.
- Aplica compensacion si una operacion falla a mitad.

#### `backend/src/services/localResources.js`

Encapsula las operaciones de bajo nivel sobre disco:

- Validacion de rutas.
- Resolucion segura dentro de `RESOURCE_ROOT`.
- Lectura y escritura de archivos.
- Creacion, movimiento y borrado.
- Escaneo recursivo de recursos.

Este modulo evita que una ruta maliciosa salga del directorio permitido.

#### `backend/src/validators/schemas.js`

Define los esquemas Zod para validar entradas:

- Login y registro.
- Actualizacion de usuarios.
- Grupos.
- Recursos.
- Permisos.
- Simulacion de acceso.

### Frontend

```txt
frontend/index.html
frontend/vite.config.js
frontend/src/main.js
frontend/src/App.vue
frontend/src/api/
frontend/src/stores/
frontend/src/views/
frontend/src/styles.css
```

#### `frontend/src/main.js`

Inicializa Vue, Pinia, Bulma y los estilos propios.

#### `frontend/src/App.vue`

Decide si mostrar:

- `LoginView`, si no hay usuario autenticado.
- `DashboardView`, si hay sesion activa.

#### `frontend/src/api/http.js`

Crea la instancia Axios:

```js
baseURL: import.meta.env.VITE_API_BASE_URL || "/api"
```

Esto permite usar la misma app en desarrollo y Docker.

#### `frontend/src/stores/auth.js`

Store Pinia para:

- Cargar el usuario actual.
- Hacer login.
- Hacer logout.

#### `frontend/src/views/LoginView.vue`

Pantalla de entrada:

- Login.
- Registro.
- Captcha si esta activado.
- Codigo 2FA si corresponde.

#### `frontend/src/views/DashboardView.vue`

Vista principal de la aplicacion.

Incluye:

- Resumen.
- Gestion de usuarios.
- Gestion de grupos.
- Explorador de recursos.
- Permisos por usuario o grupo.
- Simulador de acceso.
- Logs.

La vista adapta sus pestanas segun el rol del usuario.

#### `frontend/src/views/partials/CaptchaField.vue`

Componente reutilizable para mostrar y refrescar el captcha.

## Modelo de datos

### `User`

Representa una identidad del sistema.

Campos principales:

- `username`
- `passwordHash`
- `role`
- `twoFactorSecret`
- `twoFactorEnabled`
- `isActive`
- `failedAttempts`
- `blockUntil`

### `Group`

Agrupa usuarios para asignar permisos de forma colectiva.

Campos:

- `name`
- `description`

### `Resource`

Representa un fichero o carpeta persistido en SQLite.

Campos principales:

- `name`
- `path`
- `kind`
- `fileType`
- `checksum`
- `ownerUserId`
- `ownerGroupId`
- `parentId`

### `Permission`

Relaciona usuarios o grupos con recursos.

Campos:

- `identityType`: `user` o `group`.
- `identityId`: id del usuario o grupo.
- `resourceId`: recurso afectado.
- `canRead`
- `canWrite`

La combinacion `identityType + identityId + resourceId` es unica.

### `Log`

Registra actividad relevante:

- Actor.
- Accion.
- Estado.
- Detalle.
- Fecha.

## Flujos principales

### Login

1. El usuario envia credenciales.
2. El backend valida captcha si esta activo.
3. Busca el usuario en SQLite.
4. Comprueba si esta activo o bloqueado.
5. Verifica la contrasena con Argon2.
6. Verifica 2FA si esta activo.
7. Genera un JWT.
8. Guarda el JWT en una cookie `httpOnly`.
9. Registra el evento en logs.

### Registro

1. El usuario envia nombre y contrasena.
2. El backend valida captcha si esta activo.
3. Comprueba que el usuario no exista.
4. Genera secreto 2FA.
5. Guarda la contrasena hasheada.
6. Devuelve QR y clave manual.
7. Registra el evento.

### Gestion de permisos

1. Un `admin` o `security` selecciona un recurso.
2. Elige si el permiso se asigna a usuario o grupo.
3. Marca lectura, escritura o ambas.
4. El backend crea o actualiza el permiso.
5. El usuario afectado ve el recurso si el permiso le aplica.

### Permisos sobre carpetas

Los permisos sobre una carpeta aplican a la carpeta como recurso. Un permiso `write` sobre una carpeta permite crear nuevos recursos dentro de ella, pero no permite leer ni modificar automaticamente los ficheros o carpetas que ya existan dentro.

Ejemplo:

```txt
/clase/apuntes
/clase/apuntes/tema1.txt
```

Si `jairo` tiene `read` sobre `/clase/apuntes`, puede ver esa carpeta. Para leer `/clase/apuntes/tema1.txt`, necesita permiso directo sobre ese fichero, ser su propietario o tener rol `admin`/`security`.

### Lectura de archivos

1. El usuario selecciona un fichero.
2. El frontend solicita `/api/resources/:id/content`.
3. El backend llama a `requireResourceAccess()`.
4. Si hay permiso, lee el fichero desde disco.
5. Registra `RESOURCE_READ`.

## Seguridad y permisos

La seguridad se aplica en varias capas.

### Autenticacion

El middleware `authenticate`:

- Lee el token desde cookie.
- Verifica el JWT.
- Carga el usuario desde SQLite.
- Rechaza usuarios inactivos.

### Autorizacion por rol

El middleware `requireRole()` protege rutas administrativas.

Ejemplos:

- Crear grupos: `admin`, `security`.
- Borrar grupos: `admin`, `security`.
- Crear permisos: `admin`, `security`.
- Retirar permisos: `admin`, `security`.
- Modificar usuarios: `admin`.

### Autorizacion por recurso

La funcion `requireResourceAccess()` comprueba si un usuario puede leer o escribir un recurso.

Orden general:

1. `admin` tiene acceso total.
2. El propietario del recurso tiene acceso.
3. Se buscan permisos directos de usuario sobre el recurso.
4. Se buscan permisos directos por grupo sobre el recurso.
5. Si no hay coincidencia, se deniega.

### Seguridad de rutas locales

Los recursos solo pueden vivir dentro de `RESOURCE_ROOT`.

El backend rechaza:

- Rutas absolutas.
- Rutas con `..`.
- Rutas con caracteres nulos.
- Nombres con `/` o `\`.
- Intentos de salir del directorio permitido.

## Arranque local

Instalar dependencias:

```bash
npm install
```

Arrancar frontend y backend:

```bash
npm run dev
```

URLs:

- Frontend: http://localhost:5173
- Backend: http://localhost:3001

Arrancar cada parte por separado:

```bash
npm run dev:backend
npm run dev:frontend
```

Arrancar solo backend:

```bash
npm start
```

Compilar frontend:

```bash
npm run build
```

## Docker

La imagen Docker compila el frontend y lo sirve desde Express junto con la API.

Construir:

```bash
docker build -t control-accesos .
```

Ejecutar con volumen persistente:

```bash
docker run --rm -p 3001:3001 -v control-accesos-data:/data control-accesos
```

URL:

```txt
http://localhost:3001
```

En Docker se recomienda usar:

```txt
RESOURCE_ROOT=/data/resources
DATABASE_STORAGE=/data/iam.sqlite
```

## Variables de entorno

Ejemplo:

```txt
RESOURCE_ROOT=./.resources
DATABASE_STORAGE=./backend/iam.sqlite
CORS_ORIGIN=http://localhost:5173
SESSION_SECRET=SuperSecretTokenChangeMe
JWT_SECRET=AnotherSuperSecretTokenChangeMePlease
PORT=3001
CAPTCHA_ENABLED=true
TWO_FACTOR_ENABLED=true
```

### Variables importantes

- `RESOURCE_ROOT`: carpeta raiz donde se gestionan recursos locales.
- `DATABASE_STORAGE`: ubicacion del fichero SQLite.
- `CORS_ORIGIN`: origen permitido para desarrollo separado.
- `SESSION_SECRET`: secreto para la sesion Express.
- `JWT_SECRET`: secreto para firmar tokens JWT.
- `PORT`: puerto del backend.
- `CAPTCHA_ENABLED`: activa o desactiva captcha.
- `TWO_FACTOR_ENABLED`: activa o desactiva 2FA.

## Usuario de demostracion

```txt
Usuario: admin
Contrasena: Admin123!
```

Tambien se crean datos de ejemplo como grupos y recursos iniciales desde `seedDemoData()`.

## Integracion Linux VM

La propuesta esta documentada en:

[docs/vm-linux-integration.md](docs/vm-linux-integration.md)

## Version antigua

La version inicial del proyecto esta apartada en:

```txt
legacy/old-express/
```

Solo se conserva como referencia.

Arranque:

```bash
npm run legacy:start
```

## Notas para presentar el proyecto

Una forma clara de explicar la aplicacion:

1. Primero, mostrar el login y explicar que la autenticacion usa JWT en cookie.
2. Despues, entrar como `admin` y explicar los roles.
3. Crear o revisar un grupo, por ejemplo `alumnos`.
4. Mostrar un recurso tipo carpeta.
5. Asignar permiso de lectura sobre la carpeta.
6. Entrar como usuario estandar y comprobar que ve la carpeta.
7. Asignar permiso directo a un fichero y abrirlo como usuario permitido.
8. Volver a logs y mostrar que la accion ha quedado registrada.
9. Usar el simulador para justificar una decision de acceso.

La idea principal que conviene destacar es que la interfaz no decide la seguridad: el backend vuelve a validar cada accion con roles, permisos, grupos y rutas seguras.
