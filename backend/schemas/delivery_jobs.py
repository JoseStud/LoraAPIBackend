"""Typed payloads stored on a delivery job's ``params`` and ``result`` columns.

``DeliveryJob.params`` and ``DeliveryJob.result`` are JSON text columns.
:class:`DeliveryJobParams` and :class:`DeliveryJobResult` are the only way the
backend writes or reads them: ``DeliveryJobMapper`` serialises through
:meth:`StoredPayload.to_json` and parses with :meth:`StoredPayload.parse_json`,
and every consumer works with the typed fields instead of probing dict keys.

Both models are lenient so that every row ever written still loads:

* unknown keys are kept as extras and written back unchanged (non-generation
  deliveries store their own keys, such as the HTTP backend's ``host``);
* a declared field holding a value of the wrong type reads as ``None`` instead
  of failing the row;
* legacy spellings are normalised on read (see :class:`DeliveryJobResult`).

``to_payload()`` returns the keys that were stored (or passed in), so a row
written today reads back and dumps to the same dict.
"""

from __future__ import annotations

import json
from typing import Any, Dict, List, Mapping, Optional, Self, Union

from pydantic import (
    BaseModel,
    ConfigDict,
    ValidationError,
    field_validator,
    model_validator,
)

from backend.utils.progress import to_progress_fraction

__all__ = ["DeliveryJobParams", "DeliveryJobResult", "StoredPayload"]


def _string_or_none(value: Any) -> Optional[str]:
    return value if isinstance(value, str) else None


def _dict_or_none(value: Any) -> Optional[Dict[str, Any]]:
    return dict(value) if isinstance(value, dict) else None


def _first_text(*values: Optional[str]) -> Optional[str]:
    """Return the first non-empty string among ``values``."""
    for value in values:
        if value:
            return value
    return None


class StoredPayload(BaseModel):
    """Base for a JSON object stored in a delivery job column."""

    model_config = ConfigDict(extra="allow", frozen=True)

    @classmethod
    def coerce(cls, value: Union[Self, Mapping[str, Any], None]) -> Self:
        """Return ``value`` as this model; a mapping is validated, ``None`` is empty."""
        if isinstance(value, cls):
            return value
        if value is None:
            return cls()
        return cls.model_validate(dict(value))

    @classmethod
    def parse_json(cls, raw: Optional[str]) -> Optional[Self]:
        """Parse a stored column value.

        Returns ``None`` for an empty column, malformed JSON and JSON that is
        not an object.
        """
        if not raw:
            return None
        try:
            data = json.loads(raw)
        except (TypeError, ValueError):
            return None
        if not isinstance(data, dict):
            return None
        try:
            return cls.model_validate(data)
        except ValidationError:  # pragma: no cover - every field is lenient
            return None

    def to_payload(self) -> Dict[str, Any]:
        """Return the stored keys (declared and extra) as a plain dict."""
        return self.model_dump(exclude_unset=True)

    def to_json(self) -> str:
        """Serialise :meth:`to_payload` for the database column."""
        return json.dumps(self.to_payload())


class DeliveryJobParams(StoredPayload):
    """The ``params`` a delivery job was created with.

    Generation jobs (``GenerationCoordinator.schedule_generation_job``) store
    ``generation_params``, ``backend``, ``mode``, ``save_images``,
    ``return_format`` and optionally ``client_ref``. Other deliveries store
    their backend's own keys, which stay extras. Rows from before the
    ``generation_params`` envelope hold the generation fields at the top level;
    :meth:`generation_fields` covers both shapes.
    """

    generation_params: Optional[Dict[str, Any]] = None
    backend: Optional[str] = None
    mode: Optional[str] = None
    save_images: Optional[bool] = None
    return_format: Optional[str] = None
    client_ref: Optional[str] = None

    @field_validator("generation_params", mode="before")
    @classmethod
    def _lenient_dict(cls, value: Any) -> Optional[Dict[str, Any]]:
        return _dict_or_none(value)

    @field_validator("backend", "mode", "return_format", "client_ref", mode="before")
    @classmethod
    def _lenient_string(cls, value: Any) -> Optional[str]:
        return _string_or_none(value)

    @field_validator("save_images", mode="before")
    @classmethod
    def _truthy(cls, value: Any) -> Optional[bool]:
        return None if value is None else bool(value)

    def generation_fields(self) -> Dict[str, Any]:
        """Return the generation parameters as a new dict.

        That is ``generation_params`` when stored, otherwise every stored key
        (legacy rows kept the generation fields at the top level).
        """
        if self.generation_params is not None:
            return dict(self.generation_params)
        return self.to_payload()


class DeliveryJobResult(StoredPayload):
    """The ``result`` a delivery job's runner, cancel or recovery stored.

    Written today:

    * generation success or failure: ``SDNextGenerationResult.model_dump()``
      (``job_id``, ``status``, ``images``, ``progress``, ``error_message``,
      ``generation_info``);
    * a runner exception: ``error_message`` (plus ``retries_left`` when RQ
      retries the job);
    * cancel: ``{"status": "cancelled"}``; job recovery and a rejected
      enqueue: ``status`` ``failed`` and ``error_message``;
    * other delivery backends: ``status`` (a string, or the HTTP status code)
      and ``detail``, plus their own extra keys.

    Normalised on read, for rows written before the keys were settled:

    * ``error`` → ``error_message`` when ``error_message`` is missing or
      empty (the runner wrote ``error`` until this model existed); otherwise
      ``error`` stays an extra key;
    * ``progress`` → a fraction in ``[0, 1]`` via
      :func:`~backend.utils.progress.to_progress_fraction` (legacy rows held
      percentages);
    * ``generation_info`` stored as a JSON string → the decoded object;
    * non-string ``images`` entries are dropped.
    """

    status: Optional[Union[str, int]] = None
    images: Optional[List[str]] = None
    progress: Optional[float] = None
    error_message: Optional[str] = None
    message: Optional[str] = None
    detail: Optional[str] = None
    generation_info: Optional[Dict[str, Any]] = None
    retries_left: Optional[int] = None
    image_url: Optional[str] = None
    thumbnail_url: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def _fold_legacy_error(cls, data: Any) -> Any:
        """Read a legacy ``error`` key as ``error_message`` when that is unset."""
        if not isinstance(data, dict):
            return data
        legacy = data.get("error")
        current = data.get("error_message")
        if not isinstance(legacy, str) or (isinstance(current, str) and current):
            return data
        folded = {key: value for key, value in data.items() if key != "error"}
        folded["error_message"] = legacy
        return folded

    @field_validator("status", mode="before")
    @classmethod
    def _lenient_status(cls, value: Any) -> Optional[Union[str, int]]:
        if isinstance(value, bool):
            return None
        return value if isinstance(value, (str, int)) else None

    @field_validator("images", mode="before")
    @classmethod
    def _string_images(cls, value: Any) -> Optional[List[str]]:
        if not isinstance(value, list):
            return None
        return [item for item in value if isinstance(item, str)]

    @field_validator("progress", mode="before")
    @classmethod
    def _progress_fraction(cls, value: Any) -> Optional[float]:
        return to_progress_fraction(value)

    @field_validator(
        "error_message",
        "message",
        "detail",
        "image_url",
        "thumbnail_url",
        mode="before",
    )
    @classmethod
    def _lenient_string(cls, value: Any) -> Optional[str]:
        return _string_or_none(value)

    @field_validator("generation_info", mode="before")
    @classmethod
    def _decode_generation_info(cls, value: Any) -> Optional[Dict[str, Any]]:
        if isinstance(value, str):
            try:
                value = json.loads(value)
            except ValueError:
                return None
        return _dict_or_none(value)

    @field_validator("retries_left", mode="before")
    @classmethod
    def _lenient_int(cls, value: Any) -> Optional[int]:
        if isinstance(value, bool) or not isinstance(value, int):
            return None
        return value

    @property
    def status_message(self) -> Optional[str]:
        """Informational text: ``message``, else ``detail``."""
        return _first_text(self.message, self.detail)

    @property
    def failure_message(self) -> Optional[str]:
        """Why the job failed: ``error_message``, else ``detail``, else ``message``.

        Other delivery backends report failures in ``detail``.
        """
        return _first_text(self.error_message, self.detail, self.message)
