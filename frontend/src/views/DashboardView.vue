<template>
  <div class="app-shell">
    <header class="topbar p-3 is-flex is-align-items-center is-justify-content-space-between">
      <div>
        <span class="brand is-size-4">Control de Accesos</span>
        <span class="tag is-info is-light ml-3">{{ auth.user.username }} - {{ auth.user.role }}</span>
      </div>
      <span class="tag is-dark">IAM Demo</span>
    </header>

    <div class="workspace">
      <aside class="sidebar">
        <button
          v-for="item in tabs"
          :key="item.key"
          class="button nav-button"
          :class="activeTab === item.key ? 'is-primary' : 'is-light'"
          @click="selectTab(item.key)"
        >
          {{ item.label }}
        </button>
        <div class="sidebar-footer">
          <button class="button nav-button nav-logout is-light" @click="$emit('logout')">Salir</button>
        </div>
      </aside>

      <main class="main-panel">
        <div v-if="message" class="notification is-warning">{{ message }}</div>

        <section v-if="activeTab === 'overview'" class="panel-box profile-overview">
          <div class="profile-hero">
            <div class="profile-banner"></div>
            <div class="profile-identity">
              <div class="profile-avatar">{{ profileInitial }}</div>
              <div class="profile-main">
                <p class="heading">Resumen de identidad</p>
                <h1 class="title is-3 mb-2">{{ profileUser.username }}</h1>
                <div class="profile-tags">
                  <span class="tag" :class="badgeClass(profileUser.role, 'role')">{{ profileUser.role }}</span>
                  <span class="tag" :class="profileUser.twoFactorEnabled ? 'is-success' : 'is-light'">
                    MFA {{ profileUser.twoFactorEnabled ? "activado" : "desactivado" }}
                  </span>
                  <span class="tag" :class="profileUser.emailVerified ? 'is-success' : 'is-warning'">
                    Email {{ profileUser.emailVerified ? "verificado" : "pendiente" }}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div class="profile-layout">
            <section class="profile-card profile-account-card">
              <div class="profile-card-head">
                <div>
                  <p class="heading">Cuenta</p>
                  <h2 class="title is-5 mb-0">Informacion principal</h2>
                </div>
              </div>
              <div class="profile-facts">
                <div><span>Email</span><strong>{{ profileUser.email || "-" }}</strong></div>
                <div><span>Ultimo login</span><strong>{{ lastLoginLabel }}</strong></div>
                <div>
                  <span>Grupos</span>
                  <div class="profile-group-list">
                    <span v-for="group in profileGroups" :key="group.id" class="tag is-link is-light">{{ group.name }}</span>
                    <strong v-if="profileGroups.length === 0">Sin grupos</strong>
                  </div>
                </div>
              </div>
              <div class="profile-actions">
                <button class="button is-primary" type="button" @click="focusPasswordChange">Cambiar contrasena</button>
                <button v-if="!isSecurity" class="button is-light" type="button" @click="selectTab('resources')">Ir a recursos</button>
                <button class="button is-light" type="button" @click="jumpToActivity">Ver actividad</button>
              </div>
            </section>

            <section id="password-change" class="profile-card">
              <p class="heading">Seguridad personal</p>
              <h2 class="title is-5">Cambio de contrasena</h2>
              <form class="profile-password-form" @submit.prevent="changePassword">
                <input v-model="passwordChange.currentPassword" class="input" type="password" placeholder="contrasena actual" required />
                <input v-model="passwordChange.newPassword" class="input" type="password" placeholder="nueva contrasena segura" required />
                <button class="button is-primary">Cambiar</button>
              </form>
            </section>
          </div>

          <section class="profile-card task-board">
            <div class="profile-card-head">
              <div>
                <p class="heading">Miniagenda privada</p>
                <h2 class="title is-5 mb-0">Tareas IAM</h2>
              </div>
              <span class="tag is-info is-light">{{ pendingTasks.length }} pendientes</span>
            </div>
            <form class="task-form" @submit.prevent="createTask">
              <input v-model="taskForm.text" class="input" maxlength="180" placeholder="Ej. Revisar logs del sistema" required />
              <input v-model="taskForm.dueDate" class="input" type="date" />
              <button class="button is-primary">Anadir</button>
            </form>
            <div class="task-columns">
              <div class="task-column">
                <h3 class="title is-6">Pendientes</h3>
                <article v-for="task in pendingTasks" :key="task.id" class="task-item">
                  <label class="checkbox task-check">
                    <input type="checkbox" :checked="task.completed" @change="toggleTask(task)" />
                    <span>{{ task.text }}</span>
                  </label>
                  <small>{{ task.dueDate ? formatDate(task.dueDate) : "Sin fecha" }}</small>
                  <button class="delete is-small" type="button" @click="deleteTask(task)"></button>
                </article>
                <p v-if="pendingTasks.length === 0" class="task-empty">Sin tareas pendientes.</p>
              </div>
              <div class="task-column task-column-done">
                <h3 class="title is-6">Completadas</h3>
                <article v-for="task in completedTasks" :key="task.id" class="task-item done">
                  <label class="checkbox task-check">
                    <input type="checkbox" :checked="task.completed" @change="toggleTask(task)" />
                    <span>{{ task.text }}</span>
                  </label>
                  <small>{{ task.completedAt ? new Date(task.completedAt).toLocaleString() : "Completada" }}</small>
                  <button class="delete is-small" type="button" @click="deleteTask(task)"></button>
                </article>
                <p v-if="completedTasks.length === 0" class="task-empty">Aun no hay tareas completadas.</p>
              </div>
            </div>
          </section>

          <section v-if="!isSecurity" class="profile-card">
            <div class="profile-card-head">
              <div>
                <p class="heading">Acceso</p>
                <h2 class="title is-5 mb-0">Mis solicitudes</h2>
              </div>
            </div>
            <form class="compact-request-form" @submit.prevent="createAccessRequest">
              <div class="select is-fullwidth">
                <select v-model.number="accessRequestForm.resourceId" required>
                  <option disabled value="">Recurso</option>
                  <option v-for="resource in persistedResources" :key="resource.id" :value="resource.id">{{ resource.path }}</option>
                </select>
              </div>
              <div class="select is-fullwidth">
                <select v-model="accessRequestForm.action">
                  <option value="read">read</option>
                  <option value="write">write</option>
                </select>
              </div>
              <input v-model="accessRequestForm.reason" class="input" placeholder="motivo opcional" />
              <button class="button is-primary">Solicitar</button>
            </form>
            <table class="table is-fullwidth is-striped mt-3">
              <thead><tr><th>Fecha</th><th>Recurso</th><th>Accion</th><th>Estado</th></tr></thead>
              <tbody>
                <tr v-for="request in accessRequests.slice(0, 5)" :key="request.id">
                  <td>{{ new Date(request.createdAt).toLocaleString() }}</td>
                  <td>{{ request.Resource?.path || request.resourceId }}</td>
                  <td>{{ request.action }}</td>
                  <td><span class="tag" :class="badgeClass(request.status)">{{ request.status }}</span></td>
                </tr>
                <tr v-if="accessRequests.length === 0"><td colspan="4">No tienes solicitudes todavia.</td></tr>
              </tbody>
            </table>
          </section>

          <section id="profile-activity" class="profile-card">
            <p class="heading">Actividad reciente</p>
            <h2 class="title is-5">Eventos asociados a tu cuenta</h2>
            <table class="table is-fullwidth is-striped">
              <thead><tr><th>Fecha</th><th>Accion</th><th>Estado</th><th>Detalle</th></tr></thead>
              <tbody>
                <tr v-for="log in userActivityLogs" :key="log.id">
                  <td>{{ new Date(log.createdAt).toLocaleString() }}</td>
                  <td>{{ log.action }}</td>
                  <td><span class="tag" :class="badgeClass(log.status)">{{ log.status }}</span></td>
                  <td>{{ log.details || "-" }}</td>
                </tr>
                <tr v-if="userActivityLogs.length === 0"><td colspan="4">Sin actividad reciente.</td></tr>
              </tbody>
            </table>
          </section>

          <div v-if="isSecurity" class="profile-card">
            <h2 class="title is-5">Recuperacion de contrasenas</h2>
            <table class="table is-fullwidth is-striped">
              <thead><tr><th>Usuario</th><th>Estado</th><th>Intentos</th><th></th></tr></thead>
              <tbody>
                <tr v-for="user in users" :key="user.id">
                  <td>{{ user.username }}</td>
                  <td>{{ user.passwordResetRequired ? "pendiente" : (user.isActive ? "activa" : "desactivada") }}</td>
                  <td>{{ user.failedAttempts }}</td>
                  <td><button class="button is-small is-warning is-light" @click="requestPasswordReset(user)">Recuperar</button></td>
                </tr>
              </tbody>
            </table>
            <div v-if="temporaryPassword" class="notification is-info is-light">
              Contrasena temporal para <strong>{{ temporaryPassword.username }}</strong>:
              <code>{{ temporaryPassword.value }}</code>
            </div>
          </div>
        </section>

        <section v-if="activeTab === 'soc'" class="panel-box soc-panel">
          <div class="is-flex is-align-items-center is-justify-content-space-between mb-4">
            <div>
              <p class="heading">Security Center</p>
              <h2 class="title is-3 mb-1">{{ activeSecurityTabLabel }}</h2>
            </div>
            <div class="buttons">
              <button class="button is-light" @click="loadSecurityCenter">Actualizar</button>
              <button class="button is-primary" @click="exportSocReport">Exportar informe SOC</button>
            </div>
          </div>

          <nav class="security-tabs">
            <button
              v-for="item in securityTabs"
              :key="item.key"
              class="security-tab"
              :class="{ active: securityTab === item.key }"
              type="button"
              @click="selectSecurityTab(item.key)"
            >
              {{ item.label }}
            </button>
          </nav>

          <div v-if="securityTab === 'soc-dashboard'">
          <div v-if="socMetrics" class="soc-threat" :class="`threat-${socMetrics.threatLevel.toLowerCase()}`">
            <span>Threat Level</span>
            <strong>{{ socMetrics.threatLevel }}</strong>
          </div>

          <div v-if="socMetrics" class="stats-grid mt-4">
            <div class="stat-card"><p class="heading">Usuarios totales</p><p class="title is-4">{{ socCards.totalUsers }}</p></div>
            <div class="stat-card"><p class="heading">Usuarios activos</p><p class="title is-4">{{ socCards.activeUsers }}</p></div>
            <div class="stat-card is-info"><p class="heading">Sesiones registradas</p><p class="title is-4">{{ socCards.sessionsRegistered }}</p></div>
            <div class="stat-card"><p class="heading">Logs de hoy</p><p class="title is-4">{{ socCards.logsToday }}</p></div>
            <div class="stat-card is-warning"><p class="heading">Intentos fallidos</p><p class="title is-4">{{ socCards.failedAttempts }}</p></div>
            <div class="stat-card is-danger"><p class="heading">Accesos denegados</p><p class="title is-4">{{ socCards.deniedAccess }}</p></div>
            <div class="stat-card is-danger"><p class="heading">Login sospechoso</p><p class="title is-4">{{ socCards.suspiciousLogins }}</p></div>
            <div class="stat-card is-danger"><p class="heading">Recursos restringidos</p><p class="title is-4">{{ socCards.restrictedResources }}</p></div>
            <div class="stat-card is-info"><p class="heading">MFA activado</p><p class="title is-4">{{ socCards.mfaEnabled }}</p></div>
          </div>

          <div v-if="socMetrics" class="soc-grid mt-4">
            <section class="soc-widget">
              <h3 class="title is-5">Alertas recientes</h3>
              <div v-for="alert in socMetrics.alerts" :key="alert.id" class="soc-alert">
                <span class="tag" :class="badgeClass(alert.severity, 'severity')">{{ alert.severity }}</span>
                <div>
                  <p class="has-text-weight-semibold">{{ alert.eventType }} · {{ alert.actor }}</p>
                  <p class="is-size-7">{{ new Date(alert.createdAt).toLocaleString() }} · {{ alert.action }} · {{ alert.details || "-" }}</p>
                </div>
              </div>
              <p v-if="socMetrics.alerts.length === 0">Sin alertas relevantes recientes.</p>
            </section>

            <section class="soc-widget">
              <h3 class="title is-5">Distribucion de severidad</h3>
              <div v-for="bar in socChartBars" :key="bar.level" class="soc-bar-row">
                <span>{{ bar.level }}</span>
                <div class="soc-bar-track"><div class="soc-bar" :class="`bar-${bar.level.toLowerCase()}`" :style="{ width: bar.width }"></div></div>
                <strong>{{ bar.count }}</strong>
              </div>
            </section>
          </div>

          <div v-if="socMetrics" class="mt-4">
            <h3 class="title is-5">Actividad reciente</h3>
            <table class="table is-fullwidth is-striped">
              <thead><tr><th>Fecha</th><th>Usuario</th><th>Accion</th><th>Estado</th><th>IP</th><th>Geo</th><th>Detalle</th></tr></thead>
              <tbody>
                <tr v-for="activity in socMetrics.recentActivity" :key="activity.id">
                  <td>{{ new Date(activity.createdAt).toLocaleString() }}</td>
                  <td>{{ activity.actor }}</td>
                  <td>{{ activity.action }}</td>
                  <td><span class="tag" :class="badgeClass(activity.status)">{{ activity.status }}</span></td>
                  <td>{{ activity.ip || "-" }}</td>
                  <td>{{ activity.geoLabel || "-" }}</td>
                  <td>{{ activity.details || "-" }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div v-if="socMetrics" class="mt-4">
            <h3 class="title is-5">Eventos de seguridad destacados</h3>
            <table class="table is-fullwidth is-striped">
              <thead><tr><th>Evento</th><th>Nivel</th><th>Fecha</th><th>Usuario</th><th>Accion</th><th>Detalle</th></tr></thead>
              <tbody>
                <tr v-for="event in socMetrics.securityEvents" :key="event.id">
                  <td>{{ event.eventType }}</td>
                  <td><span class="tag" :class="badgeClass(event.severity, 'severity')">{{ event.severity }}</span></td>
                  <td>{{ new Date(event.createdAt).toLocaleString() }}</td>
                  <td>{{ event.actor }}</td>
                  <td>{{ event.action }}</td>
                  <td>{{ event.details || "-" }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          </div>
        </section>

        <section v-if="activeTab === 'profile'" class="panel-box">
          <h2 class="title is-4">Perfil</h2>
          <div v-if="profile" class="profile-grid">
            <div><p class="heading">Usuario</p><p>{{ profile.username }}</p></div>
            <div><p class="heading">Rol</p><span class="tag" :class="badgeClass(profile.role, 'role')">{{ profile.role }}</span></div>
            <div><p class="heading">Email</p><p>{{ profile.email || "-" }}</p></div>
            <div><p class="heading">Ultimo login</p><p>{{ profile.lastLoginAt ? new Date(profile.lastLoginAt).toLocaleString() : "-" }}</p></div>
            <div><p class="heading">MFA</p><span class="tag" :class="profile.twoFactorEnabled ? 'is-success' : 'is-light'">{{ profile.twoFactorEnabled ? "activado" : "desactivado" }}</span></div>
            <div><p class="heading">Grupos</p><span v-for="group in profile.Groups || []" :key="group.id" class="tag is-link is-light mr-1">{{ group.name }}</span><span v-if="!(profile.Groups || []).length">-</span></div>
          </div>

          <form class="columns mt-4" @submit.prevent="changePassword">
            <div class="column"><input v-model="passwordChange.currentPassword" class="input" type="password" placeholder="contrasena actual" required /></div>
            <div class="column"><input v-model="passwordChange.newPassword" class="input" type="password" placeholder="nueva contrasena segura" required /></div>
            <div class="column is-narrow"><button class="button is-primary">Cambiar</button></div>
          </form>
        </section>

        <section v-if="activeTab === 'users'" class="panel-box">
          <h2 class="title is-4">Usuarios</h2>
          <table class="table is-fullwidth is-striped">
            <thead><tr><th>ID</th><th>Usuario</th><th>Email</th><th>Rol</th><th>Estado</th><th>MFA</th><th>Grupos</th><th></th></tr></thead>
            <tbody>
              <tr v-for="user in users" :key="user.id">
                <td>{{ user.id }}</td>
                <td>{{ user.username }}</td>
                <td>{{ user.email || "-" }}</td>
                <td>
                  <div class="select is-small">
                    <select v-model="user.role" :disabled="isProtectedAdmin(user)" @change="updateUser(user)">
                      <option>user</option>
                      <option>security</option>
                      <option disabled>admin</option>
                    </select>
                  </div>
                </td>
                <td><label class="checkbox"><input v-model="user.isActive" type="checkbox" :disabled="isProtectedAdmin(user)" @change="updateUser(user)" /> <span class="tag" :class="user.isActive ? 'is-success' : 'is-danger'">{{ user.isActive ? "activa" : "desactivada" }}</span></label></td>
                <td><span class="tag" :class="user.twoFactorEnabled ? 'is-success' : 'is-light'">{{ user.twoFactorEnabled ? "si" : "no" }}</span></td>
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
                <div v-if="resourceForm.kind === 'file'" class="field">
                  <input class="input" type="file" @change="selectUploadFile" />
                  <p class="help">Se puede subir cualquier formato. Solo los TXT se editan desde la aplicacion.</p>
                </div>
                <div v-if="!isAdmin && shareableGroups.length > 0" class="field">
                  <label class="label">Compartir acceso con</label>
                  <label
                    v-for="group in shareableGroups"
                    :key="group.id"
                    class="checkbox resource-share-option"
                  >
                    <input v-model="resourceForm.sharedGroupIds" type="checkbox" :value="group.id" />
                    {{ group.name }}
                  </label>
                  <p class="help">Los grupos seleccionados tendran lectura y escritura. Si no eliges ninguno, solo tu y admin podreis verlo.</p>
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
                  <p class="control">
                    <span class="select">
                      <select v-model="resourceForm.classification">
                        <option value="public">Publico</option>
                        <option value="internal">Interno</option>
                        <option value="confidential">Confidencial</option>
                        <option value="restricted">Restringido</option>
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
                  <span v-if="resource.id" class="tag" :class="badgeClass(resource.classification, 'classification')">{{ resource.classification }}</span>
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
                      {{ selectedResource.kind }} · {{ selectedResource.disk?.size ?? "-" }} B · permisos {{ accessLabelFor(selectedResource) }} · {{ selectedResource.classification }}
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

                    <div v-if="selectedResource.kind === 'file' && isSelectedTextFile" class="field">
                      <label class="label">Contenido</label>
                      <textarea v-model="fileContent" class="textarea local-file-editor" :readonly="!canWriteSelectedResource"></textarea>
                      <button v-if="canWriteSelectedResource" class="button is-primary mt-2" @click="saveContent">Guardar contenido</button>
                    </div>
                    <div v-else-if="selectedResource.kind === 'file'" class="notification is-info is-light">
                      Este fichero no es TXT. Puedes almacenarlo, renombrarlo o eliminarlo si tienes escritura, pero no editar su contenido desde la aplicacion.
                    </div>
                  </div>

                  <div v-if="canManageSelectedPermissions" class="column is-5">
                    <h4 class="title is-6">Permisos del recurso</h4>
                    <form class="resource-permission-form" @submit.prevent="savePermission">
                      <div class="field">
                        <div class="select is-fullwidth">
                          <select v-model="permissionForm.identityType" disabled>
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
                      <div class="field">
                        <input v-model="permissionForm.expiresAt" class="input" type="datetime-local" />
                        <p class="help">Opcional: si expira, el acceso se deniega.</p>
                      </div>
                      <button class="button is-primary is-fullwidth">Guardar permiso</button>
                    </form>

                    <table class="table is-fullwidth is-striped mt-3">
                      <thead><tr><th>Identidad</th><th>R</th><th>W</th><th>Expira</th><th></th></tr></thead>
                      <tbody>
                        <tr v-for="permission in selectedPermissions" :key="permission.id">
                          <td>{{ permission.identity?.name || `${permission.identityType} #${permission.identityId}` }}</td>
                          <td>{{ permission.canRead ? "si" : "no" }}</td>
                          <td>{{ permission.canWrite ? "si" : "no" }}</td>
                          <td>{{ permission.expiresAt ? new Date(permission.expiresAt).toLocaleString() : "-" }}</td>
                          <td><button class="button is-small is-danger is-light" @click="deletePermission(permission)">Borrar</button></td>
                        </tr>
                        <tr v-if="selectedPermissions.length === 0"><td colspan="5">Sin permisos explicitos.</td></tr>
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

        <section v-if="activeTab === 'soc' && securityTab === 'attack-lab'" class="panel-box attack-lab">
          <div class="is-flex is-align-items-center is-justify-content-space-between mb-4">
            <div>
              <p class="heading">Attack simulation</p>
              <h2 class="title is-4 mb-0">Simulacion visual de ataque bloqueado</h2>
            </div>
            <div class="buttons">
              <a class="button is-light" href="/api/docs/openapi.json" target="_blank">OpenAPI</a>
              <a class="button is-light" href="/api/docs/postman.json" target="_blank">Postman</a>
            </div>
          </div>

          <form class="columns" @submit.prevent="simulateAttack">
            <div class="column is-3">
              <div class="select is-fullwidth">
                <select v-model="attackSimulation.attackType">
                  <option value="path_traversal">Path traversal</option>
                  <option value="brute_force">Brute force</option>
                  <option value="permission_probe">Permission probe</option>
                  <option value="token_tamper">Token tampering</option>
                </select>
              </div>
            </div>
            <div class="column">
              <input v-model="attackSimulation.target" class="input" placeholder="../../.env" />
            </div>
            <div class="column is-narrow">
              <button class="button is-danger" :class="{ 'is-loading': attackSimulation.loading }">Lanzar simulacion</button>
            </div>
          </form>

          <div v-if="attackSimulation.result" class="attack-result">
            <div class="attack-verdict">
              <span>{{ attackSimulation.result.title }}</span>
              <strong>{{ attackSimulation.result.verdict }}</strong>
              <em>{{ attackSimulation.result.severity }}</em>
            </div>
            <div class="attack-payload">
              <p class="heading">Payload capturado</p>
              <code>{{ attackSimulation.result.payload }}</code>
            </div>
            <div class="attack-timeline">
              <div v-for="item in attackSimulation.result.timeline" :key="item.step" class="attack-step">
                <span></span>
                <div>
                  <strong>{{ item.step }}</strong>
                  <p>{{ item.status }}</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section v-if="activeTab === 'soc' && securityTab === 'sessions'" class="panel-box">
          <h2 class="title is-4">Sesiones</h2>
          <table class="table is-fullwidth is-striped">
            <thead><tr><th>Fecha</th><th>Usuario</th><th>IP</th><th>Geo</th><th>Riesgo</th><th>User-Agent</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              <tr v-for="session in sessions" :key="session.id">
                <td>{{ new Date(session.createdAt).toLocaleString() }}</td>
                <td>{{ session.User?.username || auth.user.username }}</td>
                <td>{{ session.ip || "-" }}</td>
                <td>{{ session.geoLabel || "-" }}</td>
                <td>
                  <span class="tag" :class="session.suspicious ? 'is-danger' : 'is-success'">
                    {{ session.suspicious ? `sospechoso ${session.riskScore}` : "normal" }}
                  </span>
                  <p v-if="session.suspiciousReason" class="is-size-7">{{ session.suspiciousReason }}</p>
                </td>
                <td class="is-size-7">{{ session.userAgentLabel || session.userAgent || "-" }}</td>
                <td><span class="tag" :class="session.revokedAt ? 'is-danger' : 'is-success'">{{ session.revokedAt ? "revocada" : "activa" }}</span></td>
                <td><button v-if="!session.revokedAt" class="button is-small is-danger is-light" @click="revokeSession(session)">Revocar</button></td>
              </tr>
              <tr v-if="sessions.length === 0"><td colspan="8">Sin sesiones registradas todavia.</td></tr>
            </tbody>
          </table>
        </section>

        <section v-if="activeTab === 'soc' && securityTab === 'requests'" class="panel-box">
          <h2 class="title is-4">Solicitudes de acceso</h2>
          <form class="columns" @submit.prevent="createAccessRequest">
            <div class="column">
              <div class="select is-fullwidth">
                <select v-model.number="accessRequestForm.resourceId" required>
                  <option disabled value="">Recurso</option>
                  <option v-for="resource in persistedResources" :key="resource.id" :value="resource.id">{{ resource.path }}</option>
                </select>
              </div>
            </div>
            <div class="column is-2">
              <div class="select is-fullwidth">
                <select v-model="accessRequestForm.action">
                  <option value="read">read</option>
                  <option value="write">write</option>
                </select>
              </div>
            </div>
            <div class="column"><input v-model="accessRequestForm.reason" class="input" placeholder="motivo opcional" /></div>
            <div class="column is-narrow"><button class="button is-primary">Solicitar</button></div>
          </form>
          <table class="table is-fullwidth is-striped">
            <thead><tr><th>Fecha</th><th>Usuario</th><th>Recurso</th><th>Accion</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              <tr v-for="request in accessRequests" :key="request.id">
                <td>{{ new Date(request.createdAt).toLocaleString() }}</td>
                <td>{{ request.User?.username || auth.user.username }}</td>
                <td>{{ request.Resource?.path || request.resourceId }}</td>
                <td>{{ request.action }}</td>
                <td><span class="tag" :class="badgeClass(request.status)">{{ request.status }}</span></td>
                <td>
                  <div v-if="isAdmin && request.status === 'pending'" class="buttons">
                    <button class="button is-small is-success is-light" @click="decideAccessRequest(request, 'approved')">Aprobar</button>
                    <button class="button is-small is-danger is-light" @click="decideAccessRequest(request, 'rejected')">Rechazar</button>
                  </div>
                </td>
              </tr>
              <tr v-if="accessRequests.length === 0"><td colspan="6">No hay solicitudes.</td></tr>
            </tbody>
          </table>
        </section>

        <section v-if="activeTab === 'soc' && securityTab === 'alerts'" class="panel-box">
          <h2 class="title is-4">Alertas de seguridad</h2>
          <table class="table is-fullwidth is-striped">
            <thead><tr><th>Fecha</th><th>Actor</th><th>Evento</th><th>Estado</th><th>Detalle</th></tr></thead>
            <tbody>
              <tr v-for="alert in alerts" :key="alert.id">
                <td>{{ new Date(alert.createdAt).toLocaleString() }}</td>
                <td>{{ alert.actor }}</td>
                <td>{{ alert.action }}</td>
                <td><span class="tag" :class="badgeClass(alert.status)">{{ alert.status }}</span></td>
                <td>{{ alert.details }}</td>
              </tr>
              <tr v-if="alerts.length === 0"><td colspan="5">Sin alertas recientes.</td></tr>
            </tbody>
          </table>
        </section>

        <section v-if="activeTab === 'soc' && securityTab === 'security-settings'" class="panel-box">
          <div class="is-flex is-align-items-center is-justify-content-space-between mb-4">
            <div>
              <p class="heading">Politica IAM demo</p>
              <h2 class="title is-4 mb-0">Configuracion de seguridad</h2>
            </div>
            <button class="button is-light" @click="loadSecuritySettings">Recargar</button>
          </div>

          <form class="settings-grid" @submit.prevent="saveSecuritySettings">
            <label class="field">
              <span class="label">Intentos maximos</span>
              <input v-model.number="securitySettings.maxFailedAttempts" class="input" type="number" min="2" max="20" :disabled="!isAdmin" />
            </label>
            <label class="field">
              <span class="label">Minutos de bloqueo</span>
              <input v-model.number="securitySettings.lockMinutes" class="input" type="number" min="1" max="120" :disabled="!isAdmin" />
            </label>
            <label class="field">
              <span class="label">Longitud minima</span>
              <input v-model.number="securitySettings.passwordMinLength" class="input" type="number" min="8" max="64" :disabled="!isAdmin" />
            </label>
            <label class="checkbox setting-toggle"><input v-model="securitySettings.requireUppercase" type="checkbox" :disabled="!isAdmin" /> Mayuscula</label>
            <label class="checkbox setting-toggle"><input v-model="securitySettings.requireLowercase" type="checkbox" :disabled="!isAdmin" /> Minuscula</label>
            <label class="checkbox setting-toggle"><input v-model="securitySettings.requireNumber" type="checkbox" :disabled="!isAdmin" /> Numero</label>
            <label class="checkbox setting-toggle"><input v-model="securitySettings.requireSymbol" type="checkbox" :disabled="!isAdmin" /> Simbolo</label>
            <label class="checkbox setting-toggle"><input v-model="securitySettings.mfaRequired" type="checkbox" :disabled="!isAdmin" /> MFA obligatorio</label>
            <div class="settings-actions">
              <button class="button is-primary" :disabled="!isAdmin">Guardar configuracion</button>
            </div>
          </form>
        </section>

        <section v-if="activeTab === 'soc' && securityTab === 'logs'" class="panel-box">
          <div class="is-flex is-align-items-center is-justify-content-space-between mb-3">
            <h2 class="title is-4 mb-0">Actividad</h2>
            <button v-if="isAdmin || isSecurity" class="button is-light" @click="exportLogsCsv">Exportar CSV</button>
          </div>
          <form class="log-filters" @submit.prevent="applyLogFilters">
            <input v-model="logFilters.user" class="input" placeholder="usuario" />
            <input v-model="logFilters.action" class="input" placeholder="accion" />
            <input v-model="logFilters.status" class="input" placeholder="estado" />
            <input v-model="logFilters.date" class="input" type="date" />
            <input v-model="logFilters.search" class="input" placeholder="buscar" />
            <button class="button is-primary">Filtrar</button>
          </form>
          <table class="table is-fullwidth is-striped">
            <thead><tr><th>Fecha</th><th>Actor</th><th>Accion</th><th>Estado</th><th>Detalle</th></tr></thead>
            <tbody>
              <tr v-for="log in logs" :key="log.id">
                <td>{{ new Date(log.createdAt).toLocaleString() }}</td>
                <td>{{ log.actor }}</td>
                <td>{{ log.action }}</td>
                <td><span class="tag" :class="badgeClass(log.status)">{{ log.status }}</span></td>
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
const stats = ref({});
const alerts = ref([]);
const sessions = ref([]);
const accessRequests = ref([]);
const profile = ref(null);
const socMetrics = ref(null);
const tasks = ref([]);
const securityTab = ref("soc-dashboard");
const accessResult = ref(null);
const attackSimulation = reactive({
  attackType: "path_traversal",
  target: "../../.env",
  loading: false,
  result: null,
});
const selectedResource = ref(null);
const fileContent = ref("");
const resourceRoot = ref("");
const temporaryPassword = ref(null);
const passwordChange = reactive({ currentPassword: "", newPassword: "" });
const taskForm = reactive({ text: "", dueDate: "" });
const logFilters = reactive({ user: "", action: "", status: "", date: "", search: "" });
const securitySettings = reactive({
  maxFailedAttempts: 5,
  lockMinutes: 5,
  passwordMinLength: 8,
  requireUppercase: true,
  requireLowercase: true,
  requireNumber: true,
  requireSymbol: true,
  mfaRequired: false,
});

const isAdmin = computed(() => auth.user?.role === "admin");
const isSecurity = computed(() => auth.user?.role === "security");
const canManageCatalog = computed(() => auth.user?.role === "admin");
const canUseSimulator = computed(() => isAdmin.value);
const tabs = computed(() => [
  { key: "overview", label: "Resumen" },
  ...(isAdmin.value ? [{ key: "users", label: "Usuarios" }] : []),
  ...(!isSecurity.value ? [{ key: "groups", label: "Grupos" }] : []),
  ...(!isSecurity.value ? [{ key: "resources", label: "Recursos" }] : []),
  ...(canUseSimulator.value ? [{ key: "simulator", label: "Simulador" }] : []),
  ...(isAdmin.value || isSecurity.value ? [{ key: "soc", label: "Security Center" }] : []),
]);
const securityTabs = computed(() => [
  { key: "soc-dashboard", label: "Dashboard SOC" },
  { key: "logs", label: "Logs" },
  { key: "sessions", label: "Sesiones" },
  { key: "alerts", label: "Alertas" },
  ...(isAdmin.value ? [{ key: "requests", label: "Solicitudes" }] : []),
  { key: "attack-lab", label: "Attack Lab" },
  { key: "security-settings", label: "Configuracion" },
]);
const activeSecurityTabLabel = computed(
  () => securityTabs.value.find((item) => item.key === securityTab.value)?.label || "Security Center",
);

const groupForm = reactive({ name: "", description: "" });
const membership = reactive({ userId: "", groupId: "" });
const resourceForm = reactive({
  name: "",
  kind: "file",
  fileType: "",
  contentBase64: "",
  sharedGroupIds: [],
  classification: "internal",
});
const renameForm = reactive({ name: "" });
const permissionForm = reactive({
  identityType: "group",
  identityId: "",
  canRead: true,
  canWrite: false,
  expiresAt: "",
});
const accessForm = reactive({ userId: "", resourceId: "", action: "read" });
const accessRequestForm = reactive({ resourceId: "", action: "read", reason: "" });

const sortedResources = computed(() =>
  [...resources.value].sort((left, right) => {
    if (left.path === right.path) return 0;
    return left.path.localeCompare(right.path);
  }),
);
const persistedResources = computed(() => resources.value.filter((resource) => resource.id));
const permissionTargets = computed(() => groups.value);
const shareableGroups = computed(() => {
  if (isAdmin.value) return [];
  return groups.value.filter((group) =>
    (group.Users || []).some((member) => member.id === auth.user?.id),
  );
});
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
const isSelectedTextFile = computed(() => isTextFile(selectedResource.value));
const canManageSelectedPermissions = computed(
  () => (!selectedResource.value?.isPrivate || isAdmin.value) && (canManageCatalog.value || !!selectedResource.value?.access?.isOwner),
);
const socCards = computed(() => socMetrics.value?.cards || {});
const socSeverityCounts = computed(() => {
  const counts = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
  for (const event of socMetrics.value?.securityEvents || []) {
    counts[event.severity] = (counts[event.severity] || 0) + 1;
  }
  return counts;
});
const socChartBars = computed(() =>
  Object.entries(socSeverityCounts.value).map(([level, count]) => ({
    level,
    count,
    width: `${Math.min(100, count * 12 + (count > 0 ? 10 : 0))}%`,
  })),
);
const profileUser = computed(() => profile.value || auth.user || {});
const profileGroups = computed(() => profileUser.value.Groups || []);
const profileInitial = computed(() => String(profileUser.value.username || "?").slice(0, 1).toUpperCase());
const lastLoginLabel = computed(() =>
  profileUser.value.lastLoginAt ? new Date(profileUser.value.lastLoginAt).toLocaleString() : "-",
);
const pendingTasks = computed(() => tasks.value.filter((task) => !task.completed));
const completedTasks = computed(() => tasks.value.filter((task) => task.completed));
const userActivityLogs = computed(() =>
  logs.value
    .filter((log) => log.actor === profileUser.value.username)
    .slice(0, 8),
);

async function loadAll() {
  message.value = "";
  try {
    const logsRequest = loadLogs();
    const statsRequest = http.get("/logs/stats");
    const profileRequest = http.get("/auth/profile");
    const tasksRequest = http.get("/tasks");
    const sessionsRequest = http.get("/sessions");
    const requestsRequest = isSecurity.value ? Promise.resolve({ data: { requests: [] } }) : http.get("/access-requests");
    const alertsRequest = (isAdmin.value || isSecurity.value) ? http.get("/logs/alerts") : Promise.resolve({ data: { alerts: [] } });
    const dataRequests = isSecurity.value
      ? [http.get("/users")]
      : [
        http.get("/resources"),
        http.get("/users"),
        http.get("/groups"),
        http.get("/permissions"),
      ];

    const [logsRes, statsRes, profileRes, tasksRes, sessionsRes, requestsRes, alertsRes, firstDataRes, usersRes, groupsRes, permissionsRes] = await Promise.all([
      logsRequest,
      statsRequest,
      profileRequest,
      tasksRequest,
      sessionsRequest,
      requestsRequest,
      alertsRequest,
      ...dataRequests,
    ]);
    logs.value = logsRes.data.logs;
    stats.value = statsRes.data.stats;
    profile.value = profileRes.data.user;
    tasks.value = tasksRes.data.tasks;
    sessions.value = sessionsRes.data.sessions;
    accessRequests.value = requestsRes.data.requests;
    alerts.value = alertsRes.data.alerts;

    if (isSecurity.value) {
      resources.value = [];
      resourceRoot.value = "";
      users.value = firstDataRes.data.users;
      groups.value = [];
      permissions.value = [];
    } else {
      resources.value = firstDataRes.data.resources;
      resourceRoot.value = firstDataRes.data.root;
      users.value = usersRes.data.users;
      groups.value = groupsRes.data.groups;
      permissions.value = permissionsRes.data.permissions;
    }

    if (!tabs.value.some((tab) => tab.key === activeTab.value)) {
      activeTab.value = "overview";
    }
    if (!securityTabs.value.some((tab) => tab.key === securityTab.value)) {
      securityTab.value = "soc-dashboard";
    }

    refreshSelected();
    if (activeTab.value === "soc") {
      await loadSecurityCenter();
    }
    if (activeTab.value === "soc" && securityTab.value === "security-settings") {
      await loadSecuritySettings();
    }
  } catch (err) {
    message.value = err.response?.data?.message || "No se pudieron cargar los datos";
  }
}

async function selectTab(key) {
  activeTab.value = key;
  if (key === "soc") {
    await loadSecurityCenter();
  }
}

async function selectSecurityTab(key) {
  securityTab.value = key;
  if (key === "soc-dashboard") {
    await loadSecurityCenter();
  }
  if (key === "security-settings") {
    await loadSecuritySettings();
  }
}

async function loadSecurityCenter() {
  if (!isAdmin.value && !isSecurity.value) return;
  try {
    const { data } = await http.get("/security-center/metrics");
    socMetrics.value = data.metrics;
  } catch (err) {
    message.value = err.response?.data?.message || "No se pudo cargar el Security Center";
  }
}

async function loadSecuritySettings() {
  if (!isAdmin.value && !isSecurity.value) return;
  try {
    const { data } = await http.get("/security-center/settings");
    Object.assign(securitySettings, data.settings);
  } catch (err) {
    message.value = err.response?.data?.message || "No se pudo cargar la configuracion";
  }
}

async function saveSecuritySettings() {
  try {
    const { data } = await http.patch("/security-center/settings", { ...securitySettings });
    Object.assign(securitySettings, data.settings);
    message.value = "Configuracion de seguridad actualizada";
    await loadSecurityCenter();
  } catch (err) {
    message.value = err.response?.data?.message || "No se pudo guardar la configuracion";
  }
}

function exportSocReport() {
  window.open("/api/security-center/report.csv", "_blank");
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
  if (resource.id && resource.kind === "file" && isTextFile(resource)) {
    try {
      const { data } = await http.get(`/resources/${resource.id}/content`);
      fileContent.value = data.content;
    } catch (err) {
      message.value = err.response?.data?.message || "No se pudo leer el fichero";
    }
  }
}

function isTextFile(resource) {
  if (!resource || resource.kind !== "file") return false;
  return resource.fileType === "text/plain" || resource.name?.toLowerCase().endsWith(".txt");
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      resolve(result.includes(",") ? result.split(",").pop() : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function selectUploadFile(event) {
  const [file] = event.target.files || [];
  if (!file) {
    resourceForm.fileType = "";
    resourceForm.contentBase64 = "";
    return;
  }

  resourceForm.name = resourceForm.name || file.name;
  resourceForm.fileType = file.type || "application/octet-stream";
  resourceForm.contentBase64 = await readFileAsBase64(file);
}

async function createResource() {
  if (!canCreateResource.value) return;

  try {
    await http.post("/resources", {
      name: resourceForm.name,
      kind: resourceForm.kind,
      parentId: createParent.value?.id || null,
      fileType: resourceForm.kind === "file" ? resourceForm.fileType || null : null,
      contentBase64: resourceForm.kind === "file" ? resourceForm.contentBase64 || null : null,
      sharedGroupIds: [...resourceForm.sharedGroupIds],
      classification: resourceForm.classification,
      content: "",
    });
    resourceForm.name = "";
    resourceForm.fileType = "";
    resourceForm.contentBase64 = "";
    resourceForm.sharedGroupIds = [];
    resourceForm.classification = "internal";
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
  if (!selectedResource.value?.id || !isSelectedTextFile.value) return;
  try {
    await http.put(`/resources/${selectedResource.value.id}/content`, { content: fileContent.value });
    await loadAll();
  } catch (err) {
    message.value = err.response?.data?.message || "No se pudo guardar el contenido";
  }
}

async function requestPasswordReset(user) {
  try {
    const { data } = await http.post(`/users/${user.id}/password-reset`);
    temporaryPassword.value = { username: user.username, value: data.temporaryPassword };
    await loadAll();
  } catch (err) {
    message.value = err.response?.data?.message || "No se pudo generar la recuperacion";
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
  try {
    await http.delete(`/users/${user.id}`);
    await loadAll();
  } catch (err) {
    message.value = err.response?.data?.message || "No se pudo borrar el usuario";
  }
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
  try {
    await http.post("/permissions", {
      identityType: "group",
      identityId: permissionForm.identityId,
      canRead: permissionForm.canRead,
      canWrite: permissionForm.canWrite,
      expiresAt: permissionForm.expiresAt ? new Date(permissionForm.expiresAt).toISOString() : null,
      resourceId: selectedResource.value.id,
    });
    permissionForm.identityId = "";
    permissionForm.expiresAt = "";
    await loadAll();
  } catch (err) {
    message.value = err.response?.data?.message || "No se pudo guardar el permiso";
  }
}

async function deletePermission(permission) {
  try {
    await http.delete(`/permissions/${permission.id}`);
    await loadAll();
  } catch (err) {
    message.value = err.response?.data?.message || "No se pudo borrar el permiso";
  }
}

async function checkAccess() {
  const { data } = await http.post("/permissions/check", { ...accessForm });
  accessResult.value = data;
  await loadAll();
}

async function simulateAttack() {
  attackSimulation.loading = true;
  attackSimulation.result = null;
  try {
    const { data } = await http.post("/security-center/simulate-attack", {
      attackType: attackSimulation.attackType,
      target: attackSimulation.target,
    });
    attackSimulation.result = data.simulation;
    await loadAll();
  } catch (err) {
    message.value = err.response?.data?.message || "No se pudo simular el ataque";
  } finally {
    attackSimulation.loading = false;
  }
}

async function loadLogs() {
  const params = Object.fromEntries(
    Object.entries(logFilters).filter(([, value]) => value !== ""),
  );
  return http.get("/logs", { params });
}

async function applyLogFilters() {
  const { data } = await loadLogs();
  logs.value = data.logs;
}

function exportLogsCsv() {
  const params = new URLSearchParams(
    Object.fromEntries(Object.entries(logFilters).filter(([, value]) => value !== "")),
  );
  window.open(`/api/logs/export.csv?${params.toString()}`, "_blank");
}

function focusPasswordChange() {
  document.querySelector("#password-change input")?.focus();
  document.getElementById("password-change")?.scrollIntoView({ behavior: "smooth", block: "center" });
}

function jumpToActivity() {
  document.getElementById("profile-activity")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function formatDate(value) {
  return new Date(`${value}T00:00:00`).toLocaleDateString();
}

async function createTask() {
  try {
    const { data } = await http.post("/tasks", {
      text: taskForm.text,
      dueDate: taskForm.dueDate || null,
    });
    tasks.value = [data.task, ...tasks.value];
    taskForm.text = "";
    taskForm.dueDate = "";
    await applyLogFilters();
  } catch (err) {
    message.value = err.response?.data?.message || firstValidationError(err) || "No se pudo crear la tarea";
  }
}

async function toggleTask(task) {
  try {
    const { data } = await http.patch(`/tasks/${task.id}`, { completed: !task.completed });
    tasks.value = tasks.value.map((item) => (item.id === data.task.id ? data.task : item));
    await applyLogFilters();
  } catch (err) {
    message.value = err.response?.data?.message || "No se pudo actualizar la tarea";
    await loadAll();
  }
}

async function deleteTask(task) {
  try {
    await http.delete(`/tasks/${task.id}`);
    tasks.value = tasks.value.filter((item) => item.id !== task.id);
    await applyLogFilters();
  } catch (err) {
    message.value = err.response?.data?.message || "No se pudo eliminar la tarea";
  }
}

async function changePassword() {
  try {
    await http.post("/auth/change-password", {
      currentPassword: passwordChange.currentPassword,
      newPassword: passwordChange.newPassword,
    });
    passwordChange.currentPassword = "";
    passwordChange.newPassword = "";
    message.value = "Contrasena actualizada";
  } catch (err) {
    message.value = err.response?.data?.message || firstValidationError(err) || "No se pudo cambiar la contrasena";
  }
}

async function createAccessRequest() {
  try {
    await http.post("/access-requests", { ...accessRequestForm });
    accessRequestForm.resourceId = "";
    accessRequestForm.action = "read";
    accessRequestForm.reason = "";
    await loadAll();
  } catch (err) {
    message.value = err.response?.data?.message || "No se pudo crear la solicitud";
  }
}

async function decideAccessRequest(request, status) {
  try {
    await http.patch(`/access-requests/${request.id}`, { status });
    await loadAll();
  } catch (err) {
    message.value = err.response?.data?.message || "No se pudo resolver la solicitud";
  }
}

async function revokeSession(session) {
  const confirmed = window.confirm(`Revocar la sesion #${session.id}?`);
  if (!confirmed) return;
  try {
    await http.patch(`/sessions/${session.id}/revoke`);
    await loadAll();
    if (activeTab.value === "soc") await loadSecurityCenter();
  } catch (err) {
    message.value = err.response?.data?.message || "No se pudo revocar la sesion";
  }
}

function firstValidationError(err) {
  const fieldErrors = err.response?.data?.errors?.fieldErrors || {};
  return Object.values(fieldErrors).flat()[0] || "";
}

function badgeClass(value, type = "status") {
  if (type === "role") {
    return value === "admin" ? "is-danger" : value === "security" ? "is-warning" : "is-info";
  }
  if (type === "severity") {
    return {
      LOW: "is-success",
      MEDIUM: "is-warning",
      HIGH: "is-danger",
      CRITICAL: "is-black",
    }[value] || "is-light";
  }
  if (type === "classification") {
    return {
      public: "is-success",
      internal: "is-info",
      confidential: "is-warning",
      restricted: "is-danger",
    }[value] || "is-light";
  }
  return ["SUCCESS", "ALLOWED", "approved", "activa"].includes(value)
    ? "is-success"
    : ["DENIED", "FAILED", "USER_BLOCKED", "rejected"].includes(value)
      ? "is-danger"
      : "is-warning";
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
