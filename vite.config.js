/* The build, and the dev server's extra hand.

   `base: "./"` is what lets a built deck be opened from anywhere: a
   domain root, a project page at username.github.io/my-deck/, a folder
   on a drive. Vite's default writes absolute asset paths, which are
   right at a root and a 404 everywhere else — and the deck's own
   picture paths are already relative, so the assets were the only
   thing standing between a build and a sub-path.

   Two plugins exist only while `vite` is running. The first lets the
   editor beside the wall write what it edits back into the deck file
   (tools/deck-editor.js). The second is the hosted server, mounted
   beside it at /home, /edit and /d, so the hosted wall can be worked
   on with hot reload (server/vite.js). */

import { deckEditor } from "./tools/deck-editor.js";
import { hosted } from "./server/vite.js";

export default {
  base: "./",
  /* The port is 5173 unless the environment says otherwise — a tool
     that starts the server beside another one hands it a free port in
     PORT, and Vite would otherwise pick its own and tell nobody. */
  server: { port: Number(process.env.PORT) || 5173 },
  build: {
    /* Two pages: the wall, and the presenter window that opens beside
       it. They share nothing but a BroadcastChannel, which is the point
       — the presenter page must not wait on three.js to tell you what
       you meant to say. */
    rollupOptions: {
      input: {
        index: "index.html",
        present: "present.html",
      },
    },
  },
  plugins: [deckEditor(), hosted()],
};
