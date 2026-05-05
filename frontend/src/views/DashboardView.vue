<template>
  <div class="app-shell">
    <header class="topbar p-3 is-flex is-align-items-center is-justify-content-space-between">
      <div>
        <span class="brand is-size-4">Control de Accesos</span>
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
          <h1 class="title is-3">Panel de control</h1>
          <div class="columns">
            <div class="column"><div class="notification is-primary is-light"><p class="heading">Usuarios</p><p class="title is-4">{{ users.length }}</p></div></div>
            <div class="column"><div class="notification is-link is-light"><p class="heading">Grupos</p><p class="title is-4">{{ groups.length }}</p></div></div>
            <div class="column"><div class="notification is-success is-light"><p class="heading">Recursos</p><p class="title is-4">{{ persistedResources.length }}</p></div></div>
            <div class="column"><div class="notification is-warning is-light"><p class="heading">Permisos</p><p class="title is-4">{{ permissions.length }}</p></div></div>
          </div>
          <p>
            Gestiona identidades, grupos y permisos sobre la estructura real de
            <code>{{ resourceRoot }}</code>.
          </p>
        </section>

        <section v-if="activeTab === 'users'" class="panel-box">
          <h2 class="title is-4">Usuarios</h2>
          <table class="table is-fullwidth is-striped">
            <thead><tr><th>ID</th><th>Usuario</th><th>Rol</th><th>Estado</th><th>Grupos</th><th></th></tr></thead>
            <tbody>
              <tr v-for="user in users" :key="user.id">
                <td>{{ user.id }}</td>
                <td>{{ user.username }}</td>
                <td>
                  <div class="select is-small">
                    <select v-model="user.role" :disabled="isProtectedAdmin(user)" @change="updateUser(user)">
                      <option>user</option>
                      <option>security</option>
                      <option disabled>admin</option>
                    </select>
                  </div>
                </td>
                <td><label class="checkbox"><input v-model="user.isActive" type="checkbox" :disabled="isProtectedAdmin(user)" @change="updateUser(user)" /> Activa</label></td>
                <td>{{ (user.Groups || []).map((group) => group.name).join(", ") || "-" }}</td>
                <td>
                  <button
                    class="button is-small is-danger is-light"
                    :disabled="isProtectedAdmin(user)"
                    @click="deleteUser(user)"
                  >
                    Borrar
                  </button>
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

          <form v-if="manageableGroups.length > 0" class="columns" @submit.prevent="assignMember">
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
                  <option v-for="group in manageableGroups" :key="group.id" :value="group.id">{{ group.name }}</option>
                </select>
              </div>
            </div>
            <div class="column is-narrow"><button class="button is-link">Asignar</button></div>
          </form>

          <table class="table is-fullwidth is-striped">
            <thead><tr><th>ID</th><th>Grupo</th><th>Creador</th><th>Descripcion</th><th>Miembros</th><th></th></tr></thead>
            <tbody>
              <tr v-for="group in groups" :key="group.id">
                <td>{{ group.id }}</td>
                <td>{{ group.name }}</td>
                <td>{{ group.creator?.username || "-" }}</td>
                <td>{{ group.description }}</td>
                <td>
                  <span v-if="(group.Users || []).length === 0">-</span>
                  <span v-for="member in group.Users || []" :key="member.id" class="tag is-light mr-1 mb-1">
                    {{ member.username }}
                    <button
                      v-if="canManageGroup(group) && canRemoveGroupMember(group, member)"
                      class="delete is-small ml-1"
                      type="button"
                      @click.stop="removeGroupMember(group, member)"
                    ></button>
                  </span>
                </td>
                <td>
                  <button v-if="canManageGroup(group)" class="button is-small is-danger is-light" @click="deleteGroup(group)">Borrar</button>
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <section v-if="activeTab === 'resources'" class="panel-box">
          <div class="is-flex is-align-items-center is-justify-content-space-between mb-4">
            <div>
              <h2 class="title is-4 mb-1">Recursos</h2>
              <p class="is-size-7 has-text-grey">{{ resourceRoot }}</p>
            </div>
            <div class="buttons">
              <button v-if="canManageCatalog" class="button is-light" @click="syncResources">Sincronizar</button>
              <button class="button is-light" @click="loadAll">Actualizar</button>
            </div>
          </div>

          <div class="columns">
            <div class="column is-4">
              <form v-if="canCreateResource" class="resource-create-box mb-4" @submit.prevent="createResource">
                <div class="field">
                  <label class="label">Crear en</label>
                  <input class="input" :value="createLocationLabel" readonly />
                </div>
                <div class="field">
                  <input v-model="resourceForm.name" class="input" placeholder="nombre" required />
                </div>
                <div class="field has-addons">
                  <p class="control is-expanded">
                    <span class="select is-fullwidth">
                      <select v-model="resourceForm.kind">
                        <option value="file">fichero</option>
                        <option value="directory">directorio</option>
                      </select>
                    </span>
                  </p>
                  <p class="control"><button class="button is-primary">Crear</button></p>
                </div>
              </form>

              <div class="resource-tree">
                <button
                  v-for="resource in sortedResources"
                  :key="resource.path"
                  class="resource-row"
                  :class="{ active: selectedResource?.path === resource.path, muted: !resource.id }"
                  :style="{ paddingLeft: `${resourceDepth(resource) * 1.1 + 0.75}rem` }"
                  @click="selectResource(resource)"
                >
                  <span class="resource-kind">{{ resource.kind === "directory" ? "dir" : "file" }}</span>
                  <span class="resource-path">{{ resource.name }}</span>
                  <span v-if="!resource.id" class="tag is-warning is-light">sin BD</span>
                </button>
              </div>
            </div>

            <div class="column">
              <div v-if="selectedResource" class="resource-detail">
                <div class="is-flex is-align-items-center is-justify-content-space-between mb-3">
                  <div>
                    <p class="heading">Seleccionado</p>
                    <h3 class="title is-5 mb-1">{{ selectedResource.path }}</h3>
                    <p class="is-size-7 has-text-grey">
                      {{ selectedResource.kind }} · {{ selectedResource.disk?.size ?? "-" }} B · permisos {{ accessLabelFor(selectedResource) }}
                    </p>
                  </div>
                  <div class="buttons" v-if="selectedResource.id && canWriteSelectedResource">
                    <button class="button is-danger is-light" @click="deleteSelectedResource">Eliminar</button>
                  </div>
                </div>

                <div v-if="!selectedResource.id && canManageCatalog" class="notification is-warning is-light">
                  Este elemento existe en disco pero no en SQLite. Usa Sincronizar para persistirlo y poder asignarle permisos.
                </div>

                <div v-if="selectedResource.id" class="columns">
                  <div class="column">
                    <form v-if="canWriteSelectedResource" class="field has-addons" @submit.prevent="renameSelectedResource">
                      <p class="control is-expanded"><input v-model="renameForm.name" class="input" required /></p>
                      <p class="control"><button class="button is-link">Renombrar</button></p>
                    </form>

                    <div v-if="selectedResource.kind === 'file'" class="field">
                      <label class="label">Contenido</label>
                      <textarea v-model="fileContent" class="textarea local-file-editor" :readonly="!canWriteSelectedResource"></textarea>
                      <button v-if="canWriteSelectedResource" class="button is-primary mt-2" @click="saveContent">Guardar contenido</button>
                    </div>
                  </div>

                  <div v-if="canManageSelectedPermissions" class="column is-5">
                    <h4 class="title is-6">Permisos del recurso</h4>
                    <form class="resource-permission-form" @submit.prevent="savePermission">
                      <div class="field">
                        <div class="select is-fullwidth">
                          <select v-model="permissionForm.identityType" @change="permissionForm.identityId = ''">
                            <option value="user">usuario</option>
                            <option value="group">grupo</option>
                          </select>
                        </div>
                      </div>
                      <div class="field">
                        <div class="select is-fullwidth">
                          <select v-model.number="permissionForm.identityId" required>
                            <option disabled value="">Identidad</option>
                            <option v-for="item in permissionTargets" :key="item.id" :value="item.id">{{ item.username || item.name }}</option>
                          </select>
                        </div>
                      </div>
                      <div class="field is-flex is-gap-3">
                        <label class="checkbox"><input v-model="permissionForm.canRead" type="checkbox" /> read</label>
                        <label class="checkbox"><input v-model="permissionForm.canWrite" type="checkbox" /> write</label>
                      </div>
                      <button class="button is-primary is-fullwidth">Guardar permiso</button>
                    </form>

                    <table class="table is-fullwidth is-striped mt-3">
                      <thead><tr><th>Identidad</th><th>R</th><th>W</th><th></th></tr></thead>
                      <tbody>
                        <tr v-for="permission in selectedPermissions" :key="permission.id">
                          <td>{{ permission.identity?.name || `${permission.identityType} #${permission.identityId}` }}</td>
                          <td>{{ permission.canRead ? "si" : "no" }}</td>
                          <td>{{ permission.canWrite ? "si" : "no" }}</td>
                          <td><button class="button is-small is-danger is-light" @click="deletePermission(permission)">Borrar</button></td>
                        </tr>
                        <tr v-if="selectedPermissions.length === 0"><td colspan="4">Sin permisos explicitos.</td></tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
              <div v-else class="notification is-info is-light">Selecciona un recurso para ver su contenido y permisos.</div>
            </div>
          </div>
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
                  <option v-for="resource in persistedResources" :key="resource.id" :value="resource.id">{{ resource.path }}</option>
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
          <h2 class="title is-4">Actividad</h2>
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
const selectedResource = ref(null);
const fileContent = ref("");
const resourceRoot = ref("");

const isAdmin = computed(() => auth.user?.role === "admin");
const canManageCatalog = computed(() => ["admin", "security"].includes(auth.user?.role));
const canUseSimulator = computed(() => canManageCatalog.value);
const tabs = computed(() => [
  { key: "overview", label: "Resumen" },
  ...(isAdmin.value ? [{ key: "users", label: "Usuarios" }] : []),
  { key: "groups", label: "Grupos" },
  { key: "resources", label: "Recursos" },
  ...(canUseSimulator.value ? [{ key: "simulator", label: "Simulador" }] : []),
  { key: "logs", label: "Logs" },
]);

const groupForm = reactive({ name: "", description: "" });
const membership = reactive({ userId: "", groupId: "" });
const resourceForm = reactive({ name: "", kind: "file" });
const renameForm = reactive({ name: "" });
const permissionForm = reactive({
  identityType: "group",
  identityId: "",
  canRead: true,
  canWrite: false,
});
const accessForm = reactive({ userId: "", resourceId: "", action: "read" });

const sortedResources = computed(() =>
  [...resources.value].sort((left, right) => {
    if (left.path === right.path) return 0;
    return left.path.localeCompare(right.path);
  }),
);
const persistedResources = computed(() => resources.value.filter((resource) => resource.id));
const permissionTargets = computed(() =>
  permissionForm.identityType === "user" ? users.value : groups.value,
);
const manageableGroups = computed(() => groups.value.filter((group) => canManageGroup(group)));
const selectedPermissions = computed(() =>
  selectedResource.value?.id
    ? permissions.value.filter((permission) => permission.resourceId === selectedResource.value.id)
    : [],
);
const createParent = computed(() => {
  if (!selectedResource.value?.id) return null;
  if (selectedResource.value.kind === "directory") return selectedResource.value;
  const parentPath = selectedResource.value.path.slice(0, selectedResource.value.path.lastIndexOf("/")) || "/";
  return resources.value.find((resource) => resource.path === parentPath && resource.id) || null;
});
const createLocationLabel = computed(() => createParent.value?.path || "/");
const canCreateResource = computed(() => canManageCatalog.value || !!createParent.value?.access?.canWrite);
const canWriteSelectedResource = computed(
  () => canManageCatalog.value || !!selectedResource.value?.access?.canWrite,
);
const canManageSelectedPermissions = computed(
  () => canManageCatalog.value || !!selectedResource.value?.access?.isOwner,
);

async function loadAll() {
  message.value = "";
  try {
    const requests = [
      http.get("/resources"),
      http.get("/logs"),
      http.get("/users"),
      http.get("/groups"),
      http.get("/permissions"),
    ];

    const [resourcesRes, logsRes, usersRes, groupsRes, permissionsRes] = await Promise.all(requests);
    resources.value = resourcesRes.data.resources;
    resourceRoot.value = resourcesRes.data.root;
    logs.value = logsRes.data.logs;
    users.value = usersRes.data.users;
    groups.value = groupsRes.data.groups;
    permissions.value = permissionsRes.data.permissions;

    if (!tabs.value.some((tab) => tab.key === activeTab.value)) {
      activeTab.value = "overview";
    }

    refreshSelected();
  } catch (err) {
    message.value = err.response?.data?.message || "No se pudieron cargar los datos";
  }
}

function refreshSelected() {
  if (!selectedResource.value) return;
  const current = resources.value.find((resource) => resource.path === selectedResource.value.path);
  selectedResource.value = current || null;
  renameForm.name = current?.name || "";
}

function isProtectedAdmin(user) {
  return user.role === "admin" || user.username === "admin";
}

function canManageGroup(group) {
  return canManageCatalog.value || group.creatorUserId === auth.user?.id;
}

function canRemoveGroupMember(group, member) {
  return canManageCatalog.value || group.creatorUserId !== member.id;
}

async function syncResources() {
  try {
    await http.post("/resources/sync");
    await loadAll();
  } catch (err) {
    message.value = err.response?.data?.message || "No se pudo sincronizar";
  }
}

async function selectResource(resource) {
  selectedResource.value = resource;
  renameForm.name = resource.name;
  fileContent.value = "";
  if (resource.id && resource.kind === "file") {
    try {
      const { data } = await http.get(`/resources/${resource.id}/content`);
      fileContent.value = data.content;
    } catch (err) {
      message.value = err.response?.data?.message || "No se pudo leer el fichero";
    }
  }
}

async function createResource() {
  if (!canCreateResource.value) return;

  try {
    await http.post("/resources", {
      name: resourceForm.name,
      kind: resourceForm.kind,
      parentId: createParent.value?.id || null,
      content: "",
    });
    resourceForm.name = "";
    await loadAll();
  } catch (err) {
    message.value = err.response?.data?.message || "No se pudo crear el recurso";
  }
}

async function renameSelectedResource() {
  if (!selectedResource.value?.id) return;
  try {
    await http.patch(`/resources/${selectedResource.value.id}`, { name: renameForm.name });
    await loadAll();
  } catch (err) {
    message.value = err.response?.data?.message || "No se pudo renombrar";
  }
}

async function saveContent() {
  if (!selectedResource.value?.id) return;
  try {
    await http.put(`/resources/${selectedResource.value.id}/content`, { content: fileContent.value });
    await loadAll();
  } catch (err) {
    message.value = err.response?.data?.message || "No se pudo guardar el contenido";
  }
}

async function deleteSelectedResource() {
  if (!selectedResource.value?.id) return;
  const confirmed = window.confirm(`Seguro que quieres eliminar "${selectedResource.value.path}"?`);
  if (!confirmed) return;

  try {
    await http.delete(`/resources/${selectedResource.value.id}`);
    selectedResource.value = null;
    fileContent.value = "";
    await loadAll();
  } catch (err) {
    message.value = err.response?.data?.message || "No se pudo eliminar el recurso";
  }
}

async function updateUser(user) {
  if (isProtectedAdmin(user)) return;
  try {
    await http.patch(`/users/${user.id}`, { role: user.role, isActive: user.isActive });
    await loadAll();
  } catch (err) {
    message.value = err.response?.data?.message || "No se pudo actualizar el usuario";
    await loadAll();
  }
}

async function deleteUser(user) {
  if (isProtectedAdmin(user)) return;
  const confirmed = window.confirm(`Seguro que quieres borrar el usuario "${user.username}"?`);
  if (!confirmed) return;
  await http.delete(`/users/${user.id}`);
  await loadAll();
}

async function createGroup() {
  try {
    await http.post("/groups", { ...groupForm });
    groupForm.name = "";
    groupForm.description = "";
    await loadAll();
  } catch (err) {
    message.value = err.response?.data?.message || "No se pudo crear el grupo";
  }
}

async function assignMember() {
  try {
    await http.post("/groups/members", { ...membership });
    membership.userId = "";
    membership.groupId = "";
    await loadAll();
  } catch (err) {
    message.value = err.response?.data?.message || "No se pudo asignar el usuario al grupo";
  }
}

async function deleteGroup(group) {
  const confirmed = window.confirm(`Seguro que quieres borrar el grupo "${group.name}"?`);
  if (!confirmed) return;
  try {
    await http.delete(`/groups/${group.id}`);
    await loadAll();
  } catch (err) {
    message.value = err.response?.data?.message || "No se pudo borrar el grupo";
  }
}

async function removeGroupMember(group, member) {
  try {
    await http.delete(`/groups/${group.id}/members/${member.id}`);
    await loadAll();
  } catch (err) {
    message.value = err.response?.data?.message || "No se pudo quitar el miembro del grupo";
  }
}

async function savePermission() {
  if (!selectedResource.value?.id) return;
  await http.post("/permissions", {
    ...permissionForm,
    resourceId: selectedResource.value.id,
  });
  permissionForm.identityId = "";
  await loadAll();
}

async function deletePermission(permission) {
  await http.delete(`/permissions/${permission.id}`);
  await loadAll();
}

async function checkAccess() {
  const { data } = await http.post("/permissions/check", { ...accessForm });
  accessResult.value = data;
  await loadAll();
}

function resourceDepth(resource) {
  return resource.path.split("/").filter(Boolean).length - 1;
}

function accessLabelFor(resource) {
  const canRead = !!resource?.access?.canRead;
  const canWrite = !!resource?.access?.canWrite;
  if (canRead && canWrite) return "RW";
  if (canRead) return "R";
  if (canWrite) return "W";
  return "-";
}

onMounted(loadAll);
</script>
