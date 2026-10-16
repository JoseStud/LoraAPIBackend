"""Configuration settings for the application."""

from __future__ import annotations

from typing import ClassVar, List, Optional, Sequence

from pydantic import Field, ValidationError, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Manages application settings loaded from the environment."""

    model_config = SettingsConfigDict(
        env_prefix="", case_sensitive=False, extra="ignore"
    )

    JOB_DEADLINE_MARGIN_SECONDS: ClassVar[int] = 30
    """How long before RQ's job timeout the runner's own deadline expires.

    Leaves the runner time to interrupt the backend, record the timeout and
    send the webhook before RQ's backstop fires.
    """

    REQUIRED_PRODUCTION_SETTINGS: ClassVar[Sequence[str]] = (
        "DATABASE_URL",
        "REDIS_URL",
        "SDNEXT_BASE_URL",
    )

    # General environment management
    ENVIRONMENT: str = "development"

    # Database URL (override default sqlite). Example: postgresql+psycopg://user:pw@host:5432/db
    DATABASE_URL: Optional[str] = None
    API_KEY: Optional[str] = None

    # Backend API configuration
    BACKEND_HOST: str = "0.0.0.0"
    BACKEND_PORT: int = 8000
    BACKEND_URL: Optional[str] = None  # Full URL override if needed

    # Redis URL for worker queue (optional)
    REDIS_URL: Optional[str] = None

    # Directory to scan for LoRA files and metadata (inside container)
    IMPORT_PATH: Optional[str] = "/app/loras"
    # Poll interval (seconds) for the importer when running in polling mode
    IMPORT_POLL_SECONDS: int = 10
    # Optional glob-style patterns (relative to IMPORT_PATH) to skip during import
    IMPORT_IGNORE_PATTERNS: List[str] = Field(default_factory=list)
    # Importer bootstrap behaviour
    IMPORT_ON_STARTUP: bool = False
    IMPORT_ON_STARTUP_FORCE_RESYNC: bool = False
    IMPORT_ON_STARTUP_DRY_RUN: bool = False

    # System health thresholds and runtime diagnostics
    SYSTEM_QUEUE_WARNING_ACTIVE: Optional[int] = 5
    SYSTEM_QUEUE_WARNING_FAILED: Optional[int] = 0
    SYSTEM_IMPORTER_STALE_HOURS: Optional[int] = 24

    # SDNext Integration Settings
    SDNEXT_BASE_URL: Optional[str] = None  # e.g., "http://localhost:7860"
    SDNEXT_USERNAME: Optional[str] = None  # for --auth mode
    SDNEXT_PASSWORD: Optional[str] = None  # for --auth mode
    SDNEXT_TIMEOUT: int = 120  # request timeout in seconds
    # Seconds between ticks of the API's job progress monitor, which reads job
    # state and SD.Next's progress for the progress WebSocket.
    SDNEXT_POLL_INTERVAL: float = Field(default=2.0, gt=0)
    SDNEXT_DEFAULT_STEPS: int = 20
    SDNEXT_DEFAULT_SAMPLER: str = "DPM++ 2M"
    SDNEXT_DEFAULT_CFG_SCALE: float = 7.0
    SDNEXT_OUTPUT_DIR: Optional[str] = None  # local storage for generated images
    # Command run (and awaited) before each SD.Next generation, e.g. to free the
    # GPU by pausing desktop effects: "gamemode-toggle on". Failures are logged.
    SDNEXT_PRE_GENERATE_COMMAND: Optional[str] = None
    SDNEXT_PRE_GENERATE_TIMEOUT: int = 30  # seconds

    # Outbound webhook fired when a queued generation job finishes (e.g. an n8n
    # Webhook node). Unset disables it. The token is sent in the header named
    # by JOB_WEBHOOK_TOKEN_HEADER so the receiver can reject other callers.
    JOB_WEBHOOK_URL: Optional[str] = None
    JOB_WEBHOOK_TOKEN: Optional[str] = None
    JOB_WEBHOOK_TOKEN_HEADER: str = "X-LoRA-Manager-Token"
    JOB_WEBHOOK_TIMEOUT: float = Field(default=5.0, gt=0)

    # How long one attempt of a delivery job may run. Three limits derive
    # from it, each strictly inside the next (see job_deadline_seconds):
    #   1. the runner's own deadline, JOB_DEADLINE_MARGIN_SECONDS earlier: the
    #      runner interrupts the generation backend and fails the job with
    #      "Delivery timed out" (not retried), in RQ workers and in-process;
    #   2. RQ's job timeout (this value), a hard backstop for a runner stuck
    #      outside the event loop; the runner still records the timeout;
    #   3. job recovery fails a job "running" for longer than this value
    #      (measured from its claim, so after RQ's timeout has fired): its
    #      runner is gone (worker killed, API restarted mid-job).
    # Unset derives it from the SDNext timeouts plus a margin.
    JOB_RUNNING_TIMEOUT_SECONDS: Optional[int] = Field(default=None, gt=0)
    # How often the API looks for such jobs; 0 checks only at startup.
    JOB_RECOVERY_INTERVAL_SECONDS: int = Field(default=60, ge=0)
    # How long POST /generation/generate and /generation/compose-and-generate
    # wait for their queued job to finish before answering 504 with the job id
    # (the job keeps running). Unset allows one job ahead in the queue plus
    # this one: twice JOB_RUNNING_TIMEOUT_SECONDS.
    GENERATION_WAIT_TIMEOUT_SECONDS: Optional[int] = Field(default=None, gt=0)
    # RQ retries of a queued job whose runner raised: a transient generation
    # failure (SDNext unreachable or timing out, HTTP 429/5xx, no images
    # returned) or a crash. A generation that failed for good (bad request,
    # unsaved images) and a timed-out job are not retried. Retry n waits
    # DELIVERY_RETRY_INTERVAL_SECONDS * 2**(n-1); an interval above 0 needs
    # the worker's scheduler (`rq worker --with-scheduler`). 0 retries
    # disables retrying. In-process jobs (no Redis) are never retried.
    DELIVERY_MAX_RETRIES: int = Field(default=2, ge=0)
    DELIVERY_RETRY_INTERVAL_SECONDS: int = Field(default=10, ge=0)

    # Generation polling intervals (milliseconds)
    GENERATION_QUEUE_POLL_INTERVAL_MS: int = Field(default=2_000, gt=0)
    GENERATION_WEBSOCKET_RETRY_INTERVAL_MS: int = Field(default=3_000, gt=0)
    GENERATION_SYSTEM_STATUS_POLL_INTERVAL_MS: int = Field(default=10_000, gt=0)

    # CORS settings for backend API
    CORS_ORIGINS: List[str] = Field(
        default_factory=lambda: [
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://localhost:8000",
            "http://127.0.0.1:8000",
        ],
    )
    CORS_ALLOW_CREDENTIALS: bool = True

    @field_validator("ENVIRONMENT", mode="before")
    @classmethod
    def _normalise_environment(cls, value: str | None) -> str:
        """Normalise the ENVIRONMENT value and ensure it is supported."""
        if value is None or (isinstance(value, str) and not value.strip()):
            return "development"

        if not isinstance(value, str):
            raise TypeError("ENVIRONMENT must be a string")

        normalised = value.strip().lower()
        if normalised not in {"development", "production", "test"}:
            raise ValueError(
                "ENVIRONMENT must be one of: development, test, production"
            )
        return normalised

    @model_validator(mode="after")
    def _require_production_settings(self) -> "Settings":
        """Enforce required settings when running in production."""
        if self.ENVIRONMENT != "production":
            return self

        missing = []
        for attr in self.REQUIRED_PRODUCTION_SETTINGS:
            value = getattr(self, attr, None)
            if value is None:
                missing.append(attr)
                continue
            if isinstance(value, str) and not value.strip():
                missing.append(attr)

        if missing:
            joined = ", ".join(sorted(missing))
            raise ValueError(
                f"Missing required configuration for production environment: {joined}",
            )

        return self

    @property
    def job_running_timeout_seconds(self) -> int:
        """Return how long a job may run before it is treated as interrupted."""
        if self.JOB_RUNNING_TIMEOUT_SECONDS is not None:
            return self.JOB_RUNNING_TIMEOUT_SECONDS
        return self.SDNEXT_TIMEOUT + self.SDNEXT_PRE_GENERATE_TIMEOUT + 120

    @property
    def rq_job_timeout_seconds(self) -> int:
        """Return RQ's job timeout: the hard backstop for one attempt.

        Never above :attr:`job_running_timeout_seconds`, so job recovery does
        not fail a job that RQ still lets run.
        """
        return self.job_running_timeout_seconds

    @property
    def job_deadline_seconds(self) -> float:
        """Return how long the runner lets one attempt run before timing it out.

        Strictly below :attr:`rq_job_timeout_seconds`, by
        ``JOB_DEADLINE_MARGIN_SECONDS`` (at most half the timeout), so the
        runner's deadline fires first and RQ's timeout is only a backstop.
        """
        timeout = self.rq_job_timeout_seconds
        return timeout - min(self.JOB_DEADLINE_MARGIN_SECONDS, timeout / 2)

    @property
    def generation_wait_timeout_seconds(self) -> int:
        """Return how long a blocking generation request waits for its job."""
        if self.GENERATION_WAIT_TIMEOUT_SECONDS is not None:
            return self.GENERATION_WAIT_TIMEOUT_SECONDS
        return 2 * self.job_running_timeout_seconds

    @property
    def delivery_retry_intervals(self) -> List[int]:
        """Return the delay in seconds before each RQ retry of a delivery job."""
        base = self.DELIVERY_RETRY_INTERVAL_SECONDS
        return [base * 2**attempt for attempt in range(self.DELIVERY_MAX_RETRIES)]

    @property
    def get_backend_url(self) -> str:
        """Get the backend URL, with automatic construction if not explicitly set."""
        if self.BACKEND_URL:
            return self.BACKEND_URL.rstrip("/")
        return f"http://{self.BACKEND_HOST}:{self.BACKEND_PORT}"

    @classmethod
    def from_env(cls) -> "Settings":
        """Load settings from the environment, surfacing validation errors."""
        try:
            return cls()
        except ValidationError as exc:  # pragma: no cover - defensive re-raise
            details = []
            for error in exc.errors():
                location = "->".join(str(part) for part in error.get("loc", ())) or "?"
                message = error.get("msg", "Invalid configuration")
                details.append(f"{location}: {message}")

            error_message = "Invalid application configuration:\n" + "\n".join(details)
            raise RuntimeError(error_message) from exc


settings = Settings.from_env()
