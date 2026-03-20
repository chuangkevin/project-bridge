## ADDED Requirements

### Requirement: Export endpoint accepts framework choice and returns zip
The server SHALL provide a `POST /api/projects/:id/export` endpoint that accepts `{ framework: "react" | "vue3" | "nextjs" | "nuxt3" | "html" }` in the request body. The endpoint SHALL retrieve the latest prototype HTML for the project, convert it to the specified framework, and return a zip file as a binary stream with `Content-Type: application/zip` and `Content-Disposition: attachment; filename="project-export.zip"`.

#### Scenario: Export React project
- **WHEN** POST `/api/projects/:id/export` with `{ framework: "react" }` and the project has a generated prototype
- **THEN** the response is a zip file containing: `package.json` (with react, react-dom, react-router-dom dependencies), `src/App.jsx`, `src/pages/*.jsx` (one per prototype page), `src/styles/*.module.css`, and `src/router.jsx`

#### Scenario: Export with no prototype returns error
- **WHEN** POST `/api/projects/:id/export` and the project has no generated prototype
- **THEN** the response status is 400 with error message "No prototype available for export"

#### Scenario: Invalid framework returns error
- **WHEN** POST `/api/projects/:id/export` with `{ framework: "angular" }`
- **THEN** the response status is 400 with error message listing supported frameworks

### Requirement: Page splitting into separate components
The export service SHALL split the prototype HTML by `data-page` attributes, creating one component file per page. Each component SHALL contain the page's HTML structure converted to the target framework's syntax (JSX for React/Next.js, SFC template for Vue/Nuxt).

#### Scenario: Multi-page prototype splits correctly
- **WHEN** the prototype has `data-page="home"`, `data-page="login"`, and `data-page="dashboard"`
- **THEN** the export produces 3 component files: Home, Login, Dashboard (with framework-appropriate file extensions)

### Requirement: CSS extraction into separate files
The export service SHALL extract inline styles and `<style>` blocks from the prototype into separate CSS files. For React, these SHALL be CSS Modules (`.module.css`). For Vue/Nuxt, styles SHALL be in the SFC `<style scoped>` block. Design tokens (colors, fonts, spacing used more than once) SHALL be extracted into CSS custom properties in a shared variables file.

#### Scenario: Inline styles become CSS modules for React
- **WHEN** exporting to React and a page has inline styles `style="color: #3B82F6; padding: 16px"`
- **THEN** the styles appear as classes in a `.module.css` file and the JSX references them via `className={styles.xxx}`

#### Scenario: Design tokens extracted as CSS variables
- **WHEN** the prototype uses `#3B82F6` in 5+ places
- **THEN** a shared CSS file defines `--color-primary: #3B82F6` and component styles reference the variable

### Requirement: Navigation conversion to framework router
The export service SHALL convert all `showPage('X')` calls into framework-appropriate router navigation. For React/Next.js: `useNavigate()` or `<Link to="/x">`. For Vue/Nuxt: `useRouter().push('/x')` or `<NuxtLink to="/x">`. For Plain HTML: `<a href="x.html">`. The router configuration file SHALL define routes matching all page names.

#### Scenario: showPage calls become React router navigation
- **WHEN** exporting to React and the prototype has `onclick="showPage('dashboard')"`
- **THEN** the JSX uses `onClick={() => navigate('/dashboard')}` and the router defines a `/dashboard` route

#### Scenario: Plain HTML uses anchor links
- **WHEN** exporting to HTML and the prototype has `showPage('login')`
- **THEN** the output uses `<a href="login.html">` and creates a separate `login.html` file

### Requirement: Project skeleton with valid configuration
Each framework export SHALL include a complete project skeleton: `package.json` with correct dependencies and scripts, framework configuration file (e.g., `vite.config.js`, `next.config.js`, `nuxt.config.ts`), entry point, and a README with setup instructions. The project SHALL be runnable with `npm install && npm run dev` after extraction.

#### Scenario: Next.js export has valid project structure
- **WHEN** exporting to Next.js
- **THEN** the zip contains `package.json` (with next, react, react-dom), `next.config.js`, `pages/_app.jsx`, `pages/index.jsx`, and `pages/*.jsx` for each prototype page

#### Scenario: Vue 3 export has valid project structure
- **WHEN** exporting to Vue 3
- **THEN** the zip contains `package.json` (with vue, vue-router, vite), `vite.config.js`, `src/App.vue`, `src/router/index.js`, and `src/views/*.vue` for each prototype page

### Requirement: Client export UI with framework selector
The client SHALL display an export dropdown button in the prototype preview toolbar. The dropdown SHALL list all 5 supported frameworks with icons/labels. Selecting a framework SHALL trigger the export request and download the resulting zip file. A loading indicator SHALL be shown during export.

#### Scenario: User exports to React
- **WHEN** the user clicks the export dropdown, selects "React", and the export completes
- **THEN** a zip file named "project-export.zip" is downloaded to the user's browser

#### Scenario: Loading state during export
- **WHEN** the user selects a framework and the export is in progress
- **THEN** the dropdown shows a spinner/loading indicator and the button is disabled until the download starts
