---
description: Native ESM import rules and module settings
applyTo: "**/*"
---

## ESM rules

The package is `"type": "module"`, compiled with `module: nodenext`. Every relative import needs its `.js` extension, even from a `.ts` file:

```ts
import { AppService } from './app.service.js';
```

`pnpm exec nest g ...` already emits them — keep that style when writing files by hand; a missing extension fails `nest build` with a "Relative import paths need explicit file extensions" error. `import.meta.url` replaces `__dirname`. Top-level `await` is available and used in `src/main.ts`.
