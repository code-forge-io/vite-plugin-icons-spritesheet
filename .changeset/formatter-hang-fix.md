---
"vite-plugin-icons-spritesheet": patch
---

Fix infinite hang when the configured formatter binary is not installed — the spawn now resolves with the original content on ENOENT instead of never settling (#39)
