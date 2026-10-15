# n8n integration

LoRA Manager can tell an n8n workflow (or any HTTP receiver) when a queued
generation finishes, so the workflow can fetch the image and carry on.

## Configure

Set these in `.env.docker` (or the environment of the API and worker):

| Variable | Default | Meaning |
| --- | --- | --- |
| `JOB_WEBHOOK_URL` | unset | URL to POST to, e.g. an n8n Webhook node's production URL. Unset disables the webhook. |
| `JOB_WEBHOOK_TOKEN` | unset | Shared secret sent in the token header so the receiver can reject other callers. |
| `JOB_WEBHOOK_TOKEN_HEADER` | `X-LoRA-Manager-Token` | Header that carries the token. |
| `JOB_WEBHOOK_TIMEOUT` | `5` | Seconds to wait for the receiver. |

The worker sends the webhook after it stores the job's final status. A slow,
failing or unreachable receiver is logged and never affects the job.

## Queue a job

```bash
curl -X POST "http://HOST:8000/api/v1/generation/queue-generation?client_ref=my-flow-42" \
  -H "X-API-Key: $API_KEY" -H "Content-Type: application/json" \
  -d '{"prompt": "a castle at dusk"}'
```

`client_ref` is optional (up to 200 characters). It is stored with the job and
echoed back in the webhook, so a workflow can match the callback to its own
run. The response contains the job id as `delivery_id`.

## Webhook request

A `POST` with the headers `X-LoRA-Manager-Event: generation.finished` and the
token header, and a JSON body:

```json
{
  "event": "generation.finished",
  "job_id": "3f2c…",
  "status": "succeeded",
  "prompt": "a castle at dusk",
  "backend": "sdnext",
  "client_ref": "my-flow-42",
  "generation_params": {"prompt": "a castle at dusk", "steps": 20},
  "image_count": 1,
  "download_path": "/api/v1/generation/results/3f2c…/download",
  "error": null,
  "finished_at": "2026-10-14T18:00:00+00:00"
}
```

- `status` is `succeeded` or `failed`. Jobs that will be retried send nothing
  until their final attempt.
- The body never contains image data. On success, download the image from
  `download_path` on the same host, with the `X-API-Key` header.
- On failure, `download_path` is `null` and `error` holds the message (at most
  500 characters), when there is one.

## In n8n

1. Add a **Webhook** node (method `POST`) and copy its production URL into
   `JOB_WEBHOOK_URL`.
2. Check the token header in an **IF** node, or with the Webhook node's header
   authentication, against `JOB_WEBHOOK_TOKEN`.
3. Add an **HTTP Request** node that GETs `http://HOST:8000{{ $json.body.download_path }}`
   with the `X-API-Key` header and the response format set to *File*.

The API key and the webhook token are shared secrets on a trusted LAN, not
real authentication (see "Security model" in the README).
