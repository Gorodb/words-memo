# Words: website

The web version of the Words app: the same folders, sets, words, rules, study modes, flashcards and "Study words" game as the phone app, with a desktop layout (sidebar) and a phone layout (bottom tabs).

Stack: React 19, Redux Toolkit (RTK Query), React Router, Tailwind CSS 4, Vite. TypeScript throughout.

## How it works

- **The words live on the server.** The site is a client of the backend (`backend/`, see its README for the routes). Every action is an API call: creating folders, sets, words and rules, editing translations, marking words learned, reordering, importing. The server applies the same rules as the app: orderings, pin limits, cascades and backup merging.
- **An account is required.** The site opens on the sign-in page; an unknown email offers to create the account. The browser keeps only the session token and two preferences (theme, active language) in `localStorage`. No words are stored in the browser.
- **Same account as the phone.** The site writes the same rows the phones sync, so a word added here appears on the phone after its next sync, and the other way round.
- **Redux**: `src/api/api.ts` is the RTK Query API. Lists are cached and refetched after every change that affects them (and when the tab regains focus). `src/store/` holds the auth and settings slices; `store/actions.ts` wraps the mutations for menus and dialogs.
- **Study games** run in the browser: the session reducers are copied from the app (`src/features/study/`). Their results (Learned, flashcard swipes, "Study words" results) are saved through the API.
- **Dictionaries**: the word form suggests German and English words with their forms, and their Russian translations. It warns about words you already have, including other forms ("isst" ↔ "essen"). All of this comes from the Wiktionary dictionaries on the server.
- **Sharing**: Export / Import use the app's backup files. "Share code" creates a code on the server, and `https://<your-domain>/s/ABCD-EFGH` opens the import with the code filled in.

```
src/
  api/            RTK Query API (all server calls) and response types
  app/            router, sign-in page, layout (sidebar / bottom tabs), theme
  pages/          one folder per section: folders, sets, languages, settings, study
  store/          Redux store: auth + settings slices, actions for event handlers
  features/       study reducers, Markdown parser, speech, backup texts (pure parts shared with the app)
  domain/         types and domain helpers (copied from the app)
  ui/             dialogs (alert, menu, form with suggestions, reader), form presets, Markdown, buttons
server.cjs        production server for dist/ (no dependencies)
```

## Development

Run the backend first: `cd backend && docker compose up -d db && npm run start:dev`. That's the API on http://localhost:3000. Put the dictionaries in `backend/dictionaries/` or set `DICTIONARIES_DIR` to get suggestions.

```sh
cd web
npm install
npm run dev          # http://localhost:5173, talks to http://localhost:3000
npm test             # vitest: the study reducers and the Markdown parser
npm run typecheck
```

The API address is fixed at build time from `VITE_SYNC_API_URL` (see `.env.example`). Without it, `npm run dev` uses `http://localhost:3000` and a production build uses `https://api.recallico.com`. The backend allows browser requests from any origin (`app.enableCors()`).

## Deploy to cPanel as a Node.js app

You need a cPanel account with **Setup Node.js App** (CloudLinux Node.js Selector / Phusion Passenger) and Node.js 22. The domain must already point at the hosting.

The site is built on your computer. The server only runs `server.cjs`, a small static file server with no npm dependencies, so you don't have to run `npm install` on the host.

### 1. Build

On your computer:

```sh
cd web
npm install
# The backend the site talks to (HTTPS). Skip this line for the default.
echo VITE_SYNC_API_URL=https://api.example.com > .env.production.local
npm run build
```

`npm run build` type-checks and writes the site to `dist/`. To try the production build locally, run `npm start` and open http://localhost:3000.

### 2. Upload

You upload these three items:

```
dist/           the built site
server.cjs      the startup file
package.json
```

1. Pack them into a zip. On Windows, run `tar -a -c -f words-web.zip dist server.cjs package.json` in `web/`. On macOS / Linux, run `zip -r words-web.zip dist server.cjs package.json`.
2. cPanel → **File Manager**: create a folder **outside** `public_html`, for example `/home/<cpuser>/words-web`.
3. Open that folder, **Upload** the zip, then right-click it → **Extract**. The folder should now contain `dist/`, `server.cjs` and `package.json`. Delete the zip.

FTP/SFTP or `scp` work too.

### 3. Create the Node.js app

cPanel → **Setup Node.js App** → **Create Application**:

| Field | Value |
|---|---|
| Node.js version | 22.x |
| Application mode | Production |
| Application root | `words-web` (the folder from step 2, relative to your home directory) |
| Application URL | your domain, e.g. `words.example.com`, with the path left empty |
| Application startup file | `server.cjs` |

Leave the environment variables empty: Passenger chooses the port itself, so don't set `PORT`. Click **Create**. You don't need **Run NPM Install**, because the server has no dependencies. Then click **Restart** if the app isn't running yet.

cPanel writes an `.htaccess` with the Passenger settings into the domain's document root (e.g. `public_html` or `public_html/words.example.com`). Keep that file. Don't put other files in that document root: Apache serves real files from there before Passenger sees the request.

### 4. HTTPS

cPanel → **SSL/TLS Status** → select the domain → **Run AutoSSL**, if it doesn't have a certificate yet. The site should be served over HTTPS:

- the sync server URL is HTTPS;
- clipboard and share features need a secure page;
- browsers keep data more reliably for HTTPS sites.

To redirect plain http to https, open cPanel → **Domains** and turn on **Force HTTPS Redirect** for the domain.

### 5. Check

- `https://words.example.com/health` returns `{"ok":true}`.
- `https://words.example.com/` opens the site. Reload on a deep link such as `/sets` to check that it still loads. The server answers every app route with `index.html`.
- The sign-in page reaches the backend. If it says "No connection to the server", check `VITE_SYNC_API_URL` in the build and that the API domain has a valid certificate.

### Updating

1. Run `npm run build` again on your computer.
2. Upload the new `dist/` and replace the old one. Upload `server.cjs` too if it changed.
3. Click **Restart** in **Setup Node.js App**. You can also create `tmp/restart.txt` in the application root, which makes Passenger restart on the next request.

Built files have hashed names and are cached for a year, and `index.html` is always revalidated. Visitors get the new version on their next page load.

### Troubleshooting

- **"Missing …/dist/index.html"** in the app's `stderr.log` (in the application root): `dist/` wasn't uploaded or ended up in a subfolder. The application root must contain `dist/index.html` directly.
- **The default cPanel page or a 404 instead of the site:** an `index.html` or other files in the domain's document root are served before Passenger. Remove them and keep only the `.htaccess` cPanel created.
- **503 / "Web application could not be started":** check that the Node.js version is 22 and the startup file is `server.cjs`, then read `stderr.log`. If you have SSH or **Terminal**, the app page shows the command to enter its environment. There `node server.cjs` should print `Words web app on http://localhost:3000` (stop it with Ctrl+C; Passenger runs the real one).
- **Signed out after switching domain or http ↔ https:** the session is stored per origin (scheme + domain). Sign in again; the words are on the server. To avoid it, use one address and redirect the others to it.
