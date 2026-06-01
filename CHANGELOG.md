# vite-plugin-icons-spritesheet

## 3.1.0

### Minor Changes

- aad1b5b: Add `oxfmt` as a formatter option and sort SVG files in a case-insensitive manner (#40, #42)

### Patch Changes

- Fix infinite hang when the configured formatter binary is not installed — the spawn now resolves with the original content on ENOENT instead of never settling (#39)
