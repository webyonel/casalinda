# Casa Linda · Panel de Administración

Panel de administración del catálogo de **Casa Linda · Hogar y más**, conectado a Supabase.

Este proyecto contiene la pieza administrativa del sitio (login, CRUD de productos, gestión de categorías y pedidos). La web-catálogo pública, basada en el mismo diseño, vive en la carpeta hermana `Casa Linda HTML/` y se sirve desde GitHub Pages.

---

## ¿Qué hace el sitio público?

El flujo que ve el cliente final es:

1. **Explora el catálogo** de productos (cocina, baño, cuarto, sala, iluminación, decoración).
2. **Selecciona** las piezas que quiere y las cantidades.
3. **Rellena un formulario** con sus datos de envío (nombre, teléfono, dirección).
4. **Se abre WhatsApp** con un mensaje ya compuesto que incluye:
   - Productos elegidos y sus precios.
   - Cantidades y subtotal.
   - Datos del formulario (nombre, teléfono, dirección).
5. El negocio recibe el pedido por WhatsApp y gestiona la entrega.

El panel de administración (este repo) es la herramienta interna para mantener ese catálogo: altas, bajas, cambios de precio, stock, categorías y pedidos recibidos.

---

## Stack

- **Frontend:** Astro 7 + TypeScript.
- **Estilos:** CSS del catálogo original adaptado a componentes `.astro` (mismas variables, tipografías y paleta).
- **Backend / DB:** Supabase (Postgres + Auth + Storage).
- **Despliegue:** GitHub Pages (sitio estático).
- **Canal de pedidos:** WhatsApp (deep link `wa.me` con mensaje prellenado).

> **Nota sobre GitHub Pages:** al ser hosting estático, no hay servidor propio. Toda la lógica corre en el navegador. Por eso Supabase se consume con su SDK JS desde el cliente y la seguridad se delega en **Row Level Security (RLS)**.

---

## Estructura del proyecto

```
casa-linda/
├── public/              # assets estáticos servidos tal cual
├── src/
│   ├── assets/          # imágenes, logos, fuentes locales
│   ├── components/      # componentes .astro reutilizables
│   ├── layouts/         # layouts base de página
│   ├── pages/           # rutas del sitio (file-based routing)
│   ├── db/              # cliente Supabase y helpers
│   └── styles/          # CSS global / variables
├── astro.config.mjs     # config Astro (output, integraciones, base path)
├── tsconfig*.json
└── package.json
```

La carpeta `Casa Linda HTML/` (fuera de este repo) contiene la versión HTML/CSS/JS del catálogo público, que sirve como **referencia de diseño** y como punto de partida para el frontend público si en el futuro se migra a Astro.

---

## Configuración local

1. Clonar e instalar dependencias:

   ```bash
   pnpm install
   ```

2. Crear un proyecto en [Supabase](https://supabase.com) y obtener:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

3. Crear un archivo `.env.local` (no se commitea):

   ```
   VITE_SUPABASE_URL=https://<tu-proyecto>.supabase.co
   VITE_SUPABASE_ANON_KEY=<tu-anon-key>
   ```

4. Levantar el dev server (en background, según `CLAUDE.md`):

   ```bash
   astro dev --background
   ```

   Gestionar con `astro dev stop`, `astro dev status` y `astro dev logs`.

5. Build de producción:

   ```bash
   pnpm build
   pnpm preview
   ```

---

## Supabase · esquema y seguridad

El esquema mínimo esperado en Postgres:

- `categorias` (id, nombre, slug, orden, activa)
- `productos` (id, nombre, descripcion, precio, stock, categoria_id, imagenes[], activo)
- `pedidos` (id, created_at, cliente_nombre, cliente_telefono, direccion, total, estado, payload jsonb)
- `pedido_items` (id, pedido_id, producto_id, cantidad, precio_unitario)

### Row Level Security (obligatorio)

La clave anónima se publica en el cliente (es público por diseño). La **única barrera** son las políticas RLS:

| Tabla | SELECT | INSERT | UPDATE | DELETE |
| --- | --- | --- | --- | --- |
| `productos` | público (catálogo) | solo admins | solo admins | solo admins |
| `categorias` | público | solo admins | solo admins | solo admins |
| `pedidos` | solo admins | público (formulario) | solo admins | solo admins |

Identidad de admin = usuario autenticado con rol `admin` en `auth.users.app_metadata` (o tabla `profiles`). Verificar en cada policy con un `auth.jwt() ->> 'role' = 'admin'`.

### Storage

Las imágenes de producto se suben a un bucket `productos/` con políticas equivalentes: lectura pública, escritura solo admin.

---

## Despliegue en GitHub Pages

1. En `astro.config.mjs`, ajustar el `base` al nombre del repo y dejar `output: 'static'`:

   ```js
   // @ts-check
   import { defineConfig } from 'astro/config';

   export default defineConfig({
     base: '/nombre-del-repo/',
     output: 'static',
   });
   ```

2. Build:

   ```bash
   pnpm build
   ```

3. Publicar el contenido de `dist/` en la rama `gh-pages` (manual, con `gh-pages`, o vía GitHub Actions). Con `output: 'static'` no hace falta adaptador; si más adelante se quiere SSR/admin autenticado, se añade `@astrojs/node` o similar.

4. Definir las variables de entorno como **GitHub Secrets** y exponerlas en el build (no committed al repo). En Astro las `VITE_*` se siguen usando para lo del cliente; en build estático se inyectan en tiempo de compilación.

> El panel de administración y el catálogo público comparten el mismo repo / misma build: `index.html` es el catálogo y `admin.html` (o una ruta dedicada) es el panel. Asegúrate de ocultar la URL del admin fuera del index público.

---

## Convenciones del proyecto

- **Tipografías:** Playfair Display (titulares) + Inter (texto), heredadas del catálogo HTML.
- **Paleta:** color principal `#3D3F8B` (morado corporativo), dorado en logo, neutros cálidos.
- **Componentes:** seguir el patrón visual de `Casa Linda HTML/styles.css`; no introducir frameworks de UI.
- **TypeScript estricto:** activado vía `astro/tsconfigs/strict`.
- **Estructura del admin:** shell estático + cliente JS vanilla (sin React/Vue). Render por `cloneNode` de `<template>`s (no `innerHTML` con datos del backend).

---

## Scripts

| Comando | Descripción |
| --- | --- |
| `astro dev --background` | Dev server con HMR en `http://localhost:4321/admin` (gestión con `astro dev stop/status/logs`) |
| `pnpm build` | Compila a `dist/` (listo para GH Pages) |
| `pnpm preview` | Sirve el build localmente para verificar |

---

## Estructura del código del admin

```
src/
├── components/admin/        # UI estática (login, header, form, modals, templates)
├── lib/
│   ├── supabase.ts          # Singleton browser client (env PUBLIC_*)
│   ├── types.ts             # Tipos sincronizados con la DB
│   ├── shared/              # Helpers genéricos (dom, format, ui)
│   └── admin/               # auth, products, orders, categories, storage, shell
├── pages/
│   ├── index.astro          # Redirect → /admin
│   └── admin.astro          # Shell del panel (carga CSS + script cliente)
└── styles/
    ├── tokens.css           # Variables CSS (paleta + tipografía)
    ├── base.css             # Reset, btn, field, modal, toast
    ├── admin.css            # Login, header, form, grid, cards
    └── admin-extensions.css # Tabs, pedidos, dialogs
```

---

## Bootstrap del admin

La primera vez, hay que crear el usuario administrador y marcarlo con el rol:

1. **Crear usuario** en el dashboard de Supabase → *Authentication → Users → Add user* (email + password).
2. **Asignar el rol admin** ejecutando en el *SQL Editor*:

   ```sql
   update auth.users
   set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
                          || '{"role":"admin"}'::jsonb
   where email = 'TU_EMAIL@correo.com';
   ```

3. **Cerrar sesión y volver a iniciar** en el panel (`/admin`) para que el JWT incluya el claim `role`. El claim vive en `app_metadata`, nunca en `user_metadata` (esa la puede editar el cliente).

Si tu usuario ya estaba creado antes de ejecutar el UPDATE y el login sigue fallando con "Tu cuenta no tiene permisos de administrador", fuerza el refresh del JWT cerrando sesión y volviendo a entrar.

---

## Esquema de Supabase

Las migraciones viven como código en `supabase/migrations/` (no commiteadas todavía a este repo; ver "Pendiente"). En el Supabase del proyecto están aplicadas:

- **Tablas:** `categorias`, `productos`, `pedidos`, `pedido_items`.
- **Función:** `public.is_admin()` — devuelve `true` si `auth.jwt() ->> 'role' = 'admin'`.
- **RLS:** habilitada en las 4 tablas. Productos/categorías: SELECT público si `activo`/`activa`; escritura solo admin. Pedidos: SELECT admin, INSERT público, UPDATE admin.
- **Storage:** bucket `productos` (público, 5 MB máx, mime `image/{png,jpeg,webp,gif}`). Escritura solo admin.

### Categorías

Las **6 categorías son fijas** (cocina, bano, cuarto, sala, iluminarias, decoraciones). Se siembran en la migración `0002_seed.sql`. No hay CRUD ni reorden — el `<select>` del formulario de producto se llena leyendo esta tabla.

---

## Pendiente

- [x] Esquema de Supabase + RLS + Storage.
- [x] Login admin (Supabase Auth + email/password).
- [x] CRUD de productos con upload múltiple de imágenes a Storage.
- [x] Categorías sembradas (fijas, sin CRUD).
- [x] Bandeja de pedidos con cambio de estado y vista de detalle.
- [ ] Auditoría (`admin_audit_log`).
- [ ] Migración del catálogo público (`Casa Linda HTML/index.html`) a este repo.
- [ ] Optimización de imágenes / thumbnails.
- [ ] Política de backup de la base de datos.
- [ ] SEO y Open Graph del catálogo público.
