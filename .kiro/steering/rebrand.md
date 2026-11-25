---
inclusion: always
---
# Rebrand rules: this repo is Demail, a fork of Warmbly

- The product is **Demail**. CLI `demail`, operator CLI `demailctl`. Never write "Warmbly" in new code, UI text, emails, docs or commit messages.
- When you touch a file that still says Warmbly / warmbly / warmblyctl, rename it in the same change if safe; otherwise list it in `docs/REBRAND_TODO.md`.
- The assistant name "Remie" will be replaced; until a name is chosen use "Demail Assistant".
- The warmup filter marker / tag text must differ from Warmbly's so Demail pools never mix with real Warmbly instances.
- Keep `LICENSE` (Apache-2.0) and every existing copyright header. `NOTICE` must keep: "Based on Warmbly © 2026 Mindroot Ltd."
- Do not use the Warmbly name or logo anywhere in the product; Apache-2.0 grants no trademark rights.
- Go module path and import paths: rename only in a dedicated spec task, all at once, with `go build ./...` green afterwards.
