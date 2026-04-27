# Integracion con VM Linux

Objetivo: usar la interfaz IAM como panel de administracion y aplicar los cambios sobre una VM Linux de laboratorio.

## Enfoque Recomendado

La app no debe ejecutar comandos Linux directamente desde cualquier formulario. Conviene crear un adaptador backend con operaciones cerradas:

- Crear usuario Linux.
- Crear grupo Linux.
- Anadir usuario a grupo.
- Crear directorio o archivo de prueba.
- Aplicar propietario con `chown`.
- Aplicar permisos con `chmod`.
- Consultar estado con `stat`, `id`, `groups` y `ls -l`.

El frontend seguiria hablando con la API IAM. La API decide si una accion esta permitida y, si toca aplicar al sistema real, llama al adaptador Linux.

## Flujo De Demo

1. El admin crea un usuario en la interfaz.
2. El backend guarda el usuario IAM.
3. El adaptador crea el usuario equivalente en la VM.
4. El admin crea grupos y recursos.
5. El backend calcula permisos `read` y `write`.
6. El adaptador traduce esos permisos a `chmod`/`chown`.
7. El simulador muestra si el acceso esta permitido.
8. Una pantalla de auditoria muestra que comandos se han aplicado.

## Seguridad

Para clase, lo mas seguro es usar una VM aislada y un usuario de servicio con `sudo` limitado. Ese usuario no deberia poder ejecutar cualquier comando, solo los necesarios para la demo.

Ejemplo conceptual de comandos permitidos:

```txt
/usr/sbin/useradd
/usr/sbin/groupadd
/usr/sbin/usermod
/usr/bin/chown
/usr/bin/chmod
/usr/bin/stat
/usr/bin/ls
```

## Variables Futuras

```txt
LINUX_VM_HOST=192.168.56.10
LINUX_VM_PORT=22
LINUX_VM_USER=iam-agent
LINUX_VM_PRIVATE_KEY=./keys/iam-agent
LINUX_SYNC_ENABLED=true
```

## Libreria Node Recomendada

Para conectarse por SSH desde Node:

```txt
ssh2
```

La base de datos seguiria siendo la fuente IAM. La VM seria el destino donde se materializan algunos cambios para la demo.
