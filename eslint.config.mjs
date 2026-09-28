import { defineConfig } from "eslint/config";
import next from "eslint-config-next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig([
    {
        // Must be its own object containing ONLY `ignores` to act as a global
        // ignore in flat config. Placed alongside `extends` it does nothing.
        ignores: [
            // Untracked AI Studio / Netlify CLI export leftovers. Not source -
            // it vendors a whole Deno stdlib and was failing lint with ~20
            // parse errors from vendored third-party code.
            ".netlify/**",
            // Stray untracked one-off dev script at the repo root.
            "replace.js",
            // Tracked stray root dev script, saved as UTF-16LE so the parser
            // can't read it. Not app source.
            "check.js",
        ],
    },
    {
        extends: [...next],
    },
]);
