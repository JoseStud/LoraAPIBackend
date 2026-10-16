# LoRA Manager wiki

A contributor's guide to how LoRA Manager is put together: what runs where,
how a request becomes a generated image, and where to make a change.

LoRA Manager is a single-user tool for managing LoRA adapters (the small
fine-tuning files used with Stable Diffusion) and queuing image generation on an
external [SDNext](https://github.com/vladmandic/sdnext) install. It is a
FastAPI + SQLModel backend with an RQ worker, and a Vue 3 + Pinia SPA.

> **Rules vs. explanations.** [`AGENTS.md`](../../AGENTS.md) holds the rules
> every change must follow (definition of done, invariants, regression matrix).
> This wiki explains the code behind those rules and links back to them. When
> the two disagree, `AGENTS.md` and the code win; fix the wiki.

## Pages

| Page | Read it when you want to… |
| --- | --- |
| [Getting started](Getting-Started.md) | Run the stack locally, find the ports, make a first change |
| [Architecture](Architecture.md) | See the processes, entry points and how a request flows through them |
| [Backend](Backend.md) | Find your way around `backend/`: routers, the service container, error handling |
| [Generation pipeline](Generation-Pipeline.md) | Follow a generation job from `POST` to saved PNG: queue, worker, statuses, retries, cancel, recovery |
| [Data model and migrations](Data-Model.md) | Know the tables and add a schema change safely |
| [Frontend](Frontend.md) | Find your way around the SPA: features, boundaries, the generation orchestrator, HTTP |
| [Recommendations](Recommendations.md) | Work on embeddings, similarity search or the optional ML stack |
| [Library import and archives](Library-Import.md) | Understand how adapters get into the database, and export/import/backups |
| [Configuration](Configuration.md) | Look up an environment variable |
| [Testing and CI](Testing-and-CI.md) | Know what `npm run ci:check` runs and how to write tests that fit |
| [Contributing recipes](Contributing.md) | Add an endpoint, a service, a migration, a poller or a feature export the expected way |
| [Troubleshooting](Troubleshooting.md) | Fix a common local problem |
| [Glossary](Glossary.md) | Decode a term (delivery, binding, claim, `output://`, …) |

## Suggested reading paths

- **First day:** Getting started → Architecture → Glossary.
- **Backend change:** Backend → Generation pipeline (if it touches jobs) →
  Data model → Testing and CI.
- **Frontend change:** Frontend → the
  [ADR 007](../architecture/adr-generation-orchestrator-thin-facade.md) module
  map (if it touches generation) → Testing and CI.

## Other documentation

The wiki links to these rather than repeating them:

- [README](../../README.md): demo, quick start, security model.
- [Backend feature demonstration](../BACKEND_DEMO.md) and
  [walkthrough](../DEMO_WALKTHROUGH.md).
- [API contract](../contract.md): endpoint-by-endpoint reference.
- [Developer guide](../DEVELOPMENT.md).
- [Testing guide](../../tests/README.md).
- [Custom SDNext setup](../CUSTOM_SETUP.md),
  [PostgreSQL setup](../POSTGRES_SETUP.md),
  [ROCm troubleshooting](../ROCM_TROUBLESHOOTING.md),
  [n8n integration](../N8N_INTEGRATION.md).
- [WebSocket implementation](../WEBSOCKET_IMPLEMENTATION.md).
- [Recommendation model design](../RECOMMENDATION_MODEL_DESIGN.md) (design
  document; the code implements a subset).
- [JSON import flow](../../JSON_IMPORT_FLOW.md).
- Frontend: [ADR 007](../architecture/adr-generation-orchestrator-thin-facade.md),
  [effect scope ownership playbook](../frontend/effect-scope-ownership-playbook.md),
  [generation architecture acceptance checklist](../frontend/generation-architecture-acceptance.md),
  [orchestrator store contract](../frontend/generation-orchestrator.md),
  [orchestrator façade contract](../frontend/generation-orchestrator-facade.md).
- [Release notes](../RELEASE_NOTES.md).

## Keeping the wiki current

The wiki lives in the repository so it changes in the same PR as the code it
describes. If your PR moves a file, renames a service or changes behaviour a
page describes, update the page. Pages reference code by path; a quick check
for dead references is:

```bash
grep -rhoE '\]\(\.\./\.\./[^)#]+' docs/wiki | sed 's/](\.\.\/\.\.\///' | sort -u | while read -r p; do [ -e "$p" ] || echo "missing: $p"; done
```

Describe the code as it is. Status reports and plans belong in issues and PRs,
not here.
