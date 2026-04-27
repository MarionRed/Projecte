<template>
  <div class="app-shell">
    <header class="topbar p-3 is-flex is-align-items-center is-justify-content-space-between">
      <div>
        <span class="brand is-size-4">AccessGuard IAM</span>
        <span class="tag is-info is-light ml-3">{{ auth.user.username }} - {{ auth.user.role }}</span>
      </div>
      <button class="button is-light" @click="$emit('logout')">Salir</button>
    </header>

    <div class="workspace">
      <aside class="sidebar">
        <button
          v-for="item in tabs"
          :key="item.key"
          class="button nav-button"
          :class="activeTab === item.key ? 'is-primary' : 'is-light'"
          @click="activeTab = item.key"
        >
          {{ item.label }}
        </button>
      </aside>

      <main class="main-panel">
        <div v-if="message" class="notification is-warning">{{ message }}</div>

        <section v-if="activeTab === 'overview'" class="panel-box">
          <h1 class="title is-3">Panel IAM</h1>
          <div class="columns">
            <div class="column">
              <div class="notification is-primary is-light">
                <p class="heading">Usuarios</p>
                <p class="title is-4">{{ users.length }}</p>
              </div>
            </div>
            <div class="column">
              <div class="notification is-link is-light">
                <p class="heading">Grupos</p>
                <p class="title is-4">{{ groups.length }}</p>
              </div>
            </div>
            <div class="column">
              <div class="notification is-success is-light">
                <p class="heading">Recursos</p>
                <p class="title is-4">{{ resources.length }}</p>
              </div>
            </div>
            <div class="column">
              <div class="notification is-warning is-light">
                <p class="heading">Permisos</p>
                <p class="title is-4">{{ permissions.length }}</p>
              </div>
            </div>
          </div>
          <p>
            Gestiona identidades, grupos y permisos sobre recursos tipo
            <code>/home/clase</code>, registrando cada decision de acceso.
          </p>
        </section>

        <section v-if="activeTab === 'users'" class="panel-box">
          <h2 class="title is-4">Usuarios</h2>
          <table class="table is-fullwidth is-striped">
            <thead>
              <tr><th>ID</th><th>Usuario</th><th>Rol</th><th>Estado</th><th>Grupos</th><th></th></tr>
            </thead>
            <tbody>
              <tr v-for="user in users" :key="user.id">
                <td>{{ user.id }}</td>
                <td>{{ user.username }}</td>
                <td>
                  <div class="select is-small">
                    <select v-model="user.role" @change="updateUser(user)">
                      <option>user</option>
                      <option>security</option>
                      <option>admin</option>
                    </select>
                  </div>
                </td>
                <td>
                  <label class="checkbox">
                    <input v-model="user.isActive" type="checkbox" @change="updateUser(user)" />
                    Activa
                  </label>
                </td>
                <td>{{ (user.Groups || []).map((group) => group.name).join(", ") || "-" }}</td>
                <td>
                  <button class="button is-small is-danger is-light" @click="deleteUser(user)">Borrar</button>
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <section v-if="activeTab === 'groups'" class="panel-box">
          <h2 class="title is-4">Grupos</h2>
          <form class="columns" @submit.prevent="createGroup">
            <div class="column"><input v-model="groupForm.name" class="input" placeholder="nombre del grupo" required /></div>
            <div class="column"><input v-model="groupForm.description" class="input" placeholder="descripcion" /></div>
            <div class="column is-narrow"><button class="button is-primary">Crear</button></div>
          </form>

          <form class="columns" @submit.prevent="assignMember">
            <div class="column">
              <div class="select is-fullwidth">
                <select v-model.number="membership.userId" required>
                  <option disabled value="">Usuario</option>
                  <option v-for="user in users" :key="user.id" :value="user.id">{{ user.username }}</option>
                </select>
              </div>
            </div>
            <div class="column">
              <div class="select is-fullwidth">
                <select v-model.number="membership.groupId" required>
                  <option disabled value="">Grupo</option>
                  <option v-for="group in groups" :key="group.id" :value="group.id">{{ group.name }}</option>
                </select>
              </div>
            </div>
            <div class="column is-narrow"><button class="button is-link">Asignar</button></div>
          </form>

          <table class="table is-fullwidth is-striped">
            <thead><tr><th>ID</th><th>Grupo</th><th>Descripcion</th><th>Miembros</th></tr></thead>
            <tbody>
              <tr v-for="group in groups" :key="group.id">
                <td>{{ group.id }}</td>
                <td>{{ group.name }}</td>
                <td>{{ group.description }}</td>
                <td>{{ (group.Users || []).map((user) => user.username).join(", ") || "-" }}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section v-if="activeTab === 'resources'" class="panel-box">
          <h2 class="title is-4">Recursos</h2>
          <form class="columns is-multiline" @submit.prevent="createResource">
            <div class="column is-3"><input v-model="resourceForm.name" class="input" placeholder="nombre" required /></div>
            <div class="column is-4"><input v-model="resourceForm.path" class="input" placeholder="/home/clase/archivo.txt" required /></div>
            <div class="column is-2">
              <div class="select is-fullwidth">
                <select v-model="resourceForm.kind">
                  <option value="directory">directorio</option>
                  <option value="file">archivo</option>
                </select>
              </div>
            </div>
            <div class="column is-2"><input v-model="resourceForm.checksum" class="input" placeholder="checksum" /></div>
            <div class="column is-narrow"><button class="button is-primary">Crear</button></div>
          </form>

          <table class="table is-fullwidth is-striped">
            <thead><tr><th>Ruta</th><th>Tipo</th><th>Propietario</th><th>Checksum</th><th>chmod conceptual</th></tr></thead>
            <tbody>
              <tr v-for="resource in resources" :key="resource.id">
                <td class="resource-path">{{ resource.path }}</td>
                <td>{{ resource.kind }}</td>
                <td>{{ resource.ownerUser?.username || resource.ownerGroup?.name || "-" }}</td>
                <td>{{ resource.checksum || "-" }}</td>
                <td><code>{{ chmodFor(resource) }}</code></td>
              </tr>
            </tbody>
          </table>
        </section>

        <section v-if="activeTab === 'local-files'" class="panel-box">
          <div class="is-flex is-align-items-center is-justify-content-space-between mb-4">
            <div>
              <h2 class="title is-4 mb-1">Archivos reales</h2>
              <p class="is-size-7 has-text-grey">C:\AccessGuard\resources</p>
            </div>
            <button class="button is-light" @click="loadLocalFiles">Actualizar</button>
          </div>

          <div v-if="auth.user.role === 'admin'" class="columns">
            <div class="column is-4">
              <input v-model="localFileForm.filename" class="input" placeholder="nuevo.txt" />
            </div>
            <div class="column">
              <button class="button is-primary" @click="createLocalFile">Crear archivo</button>
            </div>
          </div>

          <div class="columns">
            <div class="column is-4">
              <table class="table is-fullwidth is-striped">
                <thead>
                  <tr><th>Archivo</th><th>Tamano</th><th></th></tr>
                </thead>
                <tbody>
                  <tr v-for="file in localFiles" :key="file.filename">
                    <td class="resource-path">{{ file.filename }}</td>
                    <td>{{ file.size }} B</td>
                    <td>
                      <button class="button is-small is-link is-light" @click="openLocalFile(file.filename)">Abrir</button>
                    </td>
                  </tr>
                  <tr v-if="localFiles.length === 0">
                    <td colspan="3">No hay archivos.</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div class="column">
              <div class="field">
                <label class="label">Archivo seleccionado</label>
                <input v-model="localFileForm.filename" class="input" placeholder="Selecciona o crea un archivo" />
              </div>
              <div class="field">
                <label class="label">Contenido</label>
                <textarea
                  v-model="localFileForm.content"
                  class="textarea local-file-editor"
                  :readonly="auth.user.role !== 'admin'"
                  placeholder="Contenido del archivo"
                ></textarea>
              </div>
              <div class="buttons" v-if="auth.user.role === 'admin'">
                <button class="button is-primary" :disabled="!localFileForm.filename" @click="updateLocalFile">Guardar cambios</button>
                <button class="button is-danger is-light" :disabled="!localFileForm.filename" @click="deleteLocalFile">Eliminar archivo</button>
              </div>
              <p v-if="auth.user.role === 'security'" class="notification is-info is-light">
                El rol security puede leer archivos, pero no modificarlos.
              </p>
              <p v-if="auth.user.role === 'user'" class="notification is-danger is-light">
                Acceso denegado para el rol user.
              </p>
            </div>
          </div>
        </section>

        <section v-if="activeTab === 'permissions'" class="panel-box">
          <h2 class="title is-4">Permisos</h2>
          <form class="columns is-multiline" @submit.prevent="savePermission">
            <div class="column is-2">
              <div class="select is-fullwidth">
                <select v-model="permissionForm.identityType">
                  <option value="user">usuario</option>
                  <option value="group">grupo</option>
                </select>
              </div>
            </div>
            <div class="column is-3">
              <div class="select is-fullwidth">
                <select v-model.number="permissionForm.identityId" required>
                  <option disabled value="">Identidad</option>
                  <option v-for="item in permissionTargets" :key="item.id" :value="item.id">{{ item.username || item.name }}</option>
                </select>
              </div>
            </div>
            <div class="column is-4">
              <div class="select is-fullwidth">
                <select v-model.number="permissionForm.resourceId" required>
                  <option disabled value="">Recurso</option>
                  <option v-for="resource in resources" :key="resource.id" :value="resource.id">{{ resource.path }}</option>
                </select>
              </div>
            </div>
            <div class="column is-1"><label class="checkbox"><input v-model="permissionForm.canRead" type="checkbox" /> read</label></div>
            <div class="column is-1"><label class="checkbox"><input v-model="permissionForm.canWrite" type="checkbox" /> write</label></div>
            <div class="column is-narrow"><button class="button is-primary">Guardar</button></div>
          </form>

          <table class="table is-fullwidth is-striped">
            <thead><tr><th>ID</th><th>Identidad</th><th>Recurso</th><th>Read</th><th>Write</th></tr></thead>
            <tbody>
              <tr v-for="permission in permissions" :key="permission.id">
                <td>{{ permission.id }}</td>
                <td>{{ permission.identityType }} #{{ permission.identityId }}</td>
                <td class="resource-path">{{ permission.Resource?.path }}</td>
                <td>{{ permission.canRead ? "si" : "no" }}</td>
                <td>{{ permission.canWrite ? "si" : "no" }}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section v-if="activeTab === 'simulator'" class="panel-box">
          <h2 class="title is-4">Simulador de acceso</h2>
          <form class="columns" @submit.prevent="checkAccess">
            <div class="column">
              <div class="select is-fullwidth">
                <select v-model.number="accessForm.userId" required>
                  <option disabled value="">Usuario</option>
                  <option v-for="user in users" :key="user.id" :value="user.id">{{ user.username }}</option>
                </select>
              </div>
            </div>
            <div class="column">
              <div class="select is-fullwidth">
                <select v-model.number="accessForm.resourceId" required>
                  <option disabled value="">Recurso</option>
                  <option v-for="resource in resources" :key="resource.id" :value="resource.id">{{ resource.path }}</option>
                </select>
              </div>
            </div>
            <div class="column is-2">
              <div class="select is-fullwidth">
                <select v-model="accessForm.action">
                  <option value="read">read</option>
                  <option value="write">write</option>
                </select>
              </div>
            </div>
            <div class="column is-narrow"><button class="button is-link">Comprobar</button></div>
          </form>

          <div v-if="accessResult" class="notification" :class="accessResult.allowed ? 'is-success is-light' : 'is-danger is-light'">
            <p :class="accessResult.allowed ? 'status-allowed' : 'status-denied'">
              {{ accessResult.allowed ? "ACCESO PERMITIDO" : "ACCESO DENEGADO" }}
            </p>
            <p>{{ accessResult.reason }}</p>
          </div>
        </section>

        <section v-if="activeTab === 'logs'" class="panel-box">
          <h2 class="title is-4">Auditoria</h2>
          <table class="table is-fullwidth is-striped">
            <thead><tr><th>Fecha</th><th>Actor</th><th>Accion</th><th>Estado</th><th>Detalle</th></tr></thead>
            <tbody>
              <tr v-for="log in logs" :key="log.id">
                <td>{{ new Date(log.createdAt).toLocaleString() }}</td>
                <td>{{ log.actor }}</td>
                <td>{{ log.action }}</td>
                <td>{{ log.status }}</td>
                <td>{{ log.details }}</td>
              </tr>
            </tbody>
          </table>
        </section>
      </main>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from "vue";
import { http } from "@/api/http";
import { useAuthStore } from "@/stores/auth";

defineEmits(["logout"]);

const auth = useAuthStore();
const activeTab = ref("overview");
const message = ref("");
const users = ref([]);
const groups = ref([]);
const resources = ref([]);
const permissions = ref([]);
const logs = ref([]);
const accessResult = ref(null);
const localFiles = ref([]);

const tabs = [
  { key: "overview", label: "Resumen" },
  { key: "users", label: "Usuarios" },
  { key: "groups", label: "Grupos" },
  { key: "resources", label: "Recursos" },
  { key: "local-files", label: "Archivos reales" },
  { key: "permissions", label: "Permisos" },
  { key: "simulator", label: "Simulador" },
  { key: "logs", label: "Logs" },
];

const groupForm = reactive({ name: "", description: "" });
const membership = reactive({ userId: "", groupId: "" });
const resourceForm = reactive({
  name: "",
  path: "",
  kind: "file",
  checksum: "",
  fileType: "",
  parentId: null,
  ownerUserId: null,
  ownerGroupId: null,
});
const permissionForm = reactive({
  identityType: "group",
  identityId: "",
  resourceId: "",
  canRead: true,
  canWrite: false,
});
const accessForm = reactive({ userId: "", resourceId: "", action: "read" });
const localFileForm = reactive({ filename: "", content: "" });

const permissionTargets = computed(() =>
  permissionForm.identityType === "user" ? users.value : groups.value,
);

async function loadAll() {
  message.value = "";
  try {
    const [usersRes, groupsRes, resourcesRes, permissionsRes, logsRes] = await Promise.all([
      http.get("/users"),
      http.get("/groups"),
      http.get("/resources"),
      http.get("/permissions"),
      http.get("/logs"),
    ]);
    users.value = usersRes.data.users;
    groups.value = groupsRes.data.groups;
    resources.value = resourcesRes.data.resources;
    permissions.value = permissionsRes.data.permissions;
    logs.value = logsRes.data.logs;
    await loadLocalFiles();
  } catch (err) {
    message.value = err.response?.data?.message || "No se pudieron cargar los datos";
  }
}

async function loadLocalFiles() {
  try {
    const { data } = await http.get("/app/resources");
    localFiles.value = data.files;
  } catch (err) {
    localFiles.value = [];
    if (auth.user.role !== "user") {
      message.value = err.response?.data?.message || "No se pudieron cargar los archivos reales";
    }
  }
}

async function openLocalFile(filename) {
  try {
    const { data } = await http.get(`/app/resources/${encodeURIComponent(filename)}`);
    localFileForm.filename = data.filename;
    localFileForm.content = data.content;
  } catch (err) {
    message.value = err.response?.data?.message || "No se pudo leer el archivo";
  }
}

async function createLocalFile() {
  try {
    await http.post("/app/resources", {
      filename: localFileForm.filename,
      content: localFileForm.content,
    });
    await loadLocalFiles();
  } catch (err) {
    message.value = err.response?.data?.message || "No se pudo crear el archivo";
  }
}

async function updateLocalFile() {
  try {
    await http.put(`/app/resources/${encodeURIComponent(localFileForm.filename)}`, {
      content: localFileForm.content,
    });
    await loadLocalFiles();
  } catch (err) {
    message.value = err.response?.data?.message || "No se pudo actualizar el archivo";
  }
}

async function deleteLocalFile() {
  const confirmed = window.confirm(`Seguro que quieres eliminar "${localFileForm.filename}"?`);
  if (!confirmed) return;

  try {
    await http.delete(`/app/resources/${encodeURIComponent(localFileForm.filename)}`);
    localFileForm.filename = "";
    localFileForm.content = "";
    await loadLocalFiles();
  } catch (err) {
    message.value = err.response?.data?.message || "No se pudo eliminar el archivo";
  }
}

async function updateUser(user) {
  await http.patch(`/users/${user.id}`, { role: user.role, isActive: user.isActive });
  await loadAll();
}

async function deleteUser(user) {
  const confirmed = window.confirm(`Seguro que quieres borrar el usuario "${user.username}"?`);
  if (!confirmed) return;

  await http.delete(`/users/${user.id}`);
  await loadAll();
}

async function createGroup() {
  await http.post("/groups", { ...groupForm });
  groupForm.name = "";
  groupForm.description = "";
  await loadAll();
}

async function assignMember() {
  await http.post("/groups/members", { ...membership });
  membership.userId = "";
  membership.groupId = "";
  await loadAll();
}

async function createResource() {
  await http.post("/resources", {
    ...resourceForm,
    checksum: resourceForm.kind === "file" ? resourceForm.checksum || null : null,
    fileType: resourceForm.kind === "file" ? resourceForm.fileType || "text/plain" : null,
  });
  Object.assign(resourceForm, {
    name: "",
    path: "",
    kind: "file",
    checksum: "",
    fileType: "",
    parentId: null,
    ownerUserId: null,
    ownerGroupId: null,
  });
  await loadAll();
}

async function savePermission() {
  await http.post("/permissions", { ...permissionForm });
  permissionForm.identityId = "";
  permissionForm.resourceId = "";
  await loadAll();
}

async function checkAccess() {
  const { data } = await http.post("/permissions/check", { ...accessForm });
  accessResult.value = data;
  await loadAll();
}

function chmodFor(resource) {
  const perms = resource.Permissions || [];
  const anyRead = perms.some((permission) => permission.canRead);
  const anyWrite = perms.some((permission) => permission.canWrite);
  const owner = "6";
  const group = anyWrite ? "6" : anyRead ? "4" : "0";
  const other = "0";
  return `${owner}${group}${other}`;
}

onMounted(loadAll);
</script>
