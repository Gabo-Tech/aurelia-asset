# Third-Party Notices

Aurelia Asset includes or depends on the following open-source software.
See each project's license for full terms.

## Application dependencies (npm)

| Component                       | License           | Notes                       |
| ------------------------------- | ----------------- | --------------------------- |
| React, React DOM                | MIT               | UI framework                |
| TanStack Router / Start / Query | MIT               | Routing, SSR, data fetching |
| Vite                            | MIT               | Build tool                  |
| Tailwind CSS                    | MIT               | Styling                     |
| Radix UI / shadcn-ui patterns   | MIT               | Accessible UI primitives    |
| Recharts                        | MIT               | Charts                      |
| D3 (sankey, shape)              | BSD-3-Clause      | Sankey diagram              |
| Lucide React                    | ISC               | Icons                       |
| Zod                             | MIT               | Schema validation           |
| i18next                         | MIT               | Internationalization        |
| jsPDF, jspdf-autotable          | MIT               | PDF export                  |
| date-fns                        | MIT               | Date utilities              |
| Tauri API (`@tauri-apps/api`)   | Apache-2.0 OR MIT | Desktop/mobile bridge       |

Dev tooling includes ESLint, Prettier, TypeScript (all permissive licenses).

The Vite config uses `@lovable.dev/vite-tanstack-config` (MIT) as a convenience
wrapper around standard TanStack Start plugins.

## Native dependencies (Rust / Tauri)

| Component              | License           | Notes                |
| ---------------------- | ----------------- | -------------------- |
| Tauri v2               | Apache-2.0 OR MIT | Desktop/mobile shell |
| serde / serde_json     | Apache-2.0 OR MIT | Serialization        |
| llama-cpp-2 (optional) | MIT               | Local LLM backend    |
| sherpa-onnx (optional) | Apache-2.0        | Local STT/TTS        |

## User-downloaded models (not bundled)

These are downloaded separately by the user and governed by their own licenses:

| Model                       | Typical license |
| --------------------------- | --------------- |
| Qwen2.5 GGUF (Hugging Face) | Apache-2.0      |
| Sherpa-ONNX speech models   | Apache-2.0      |
| ONNX Runtime (via Sherpa)   | MIT             |

## Fonts

| Font              | License                   | Source           |
| ----------------- | ------------------------- | ---------------- |
| Playfair Display  | SIL Open Font License 1.1 | Google Fonts CDN |
| Plus Jakarta Sans | SIL Open Font License 1.1 | Google Fonts CDN |

## Brand assets

Application icons and logo images in `public/` and `src-tauri/icons/` are
original assets by GABO, distributed under the same AGPL-3.0-or-later terms as
the project (see [NOTICE](./NOTICE)).

## Generating a full license inventory

```bash
npx license-checker --production --summary
cd src-tauri && cargo install cargo-license && cargo license
```

Run these before releases to verify no unexpected copyleft or proprietary
dependencies were introduced.
