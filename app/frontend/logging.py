"""Configure logging for the frontend application.

Set up structured logging for the LoRA Manager frontend application.
Provide JSON output for production and human-readable format for development.
"""

import logging
import logging.config
import sys
from datetime import datetime
from typing import Optional

from app.frontend.config import get_settings

settings = get_settings()


class JSONFormatter(logging.Formatter):
    """Implement a custom JSON formatter for structured logging."""
    
    def format(self, record: logging.LogRecord) -> str:
        """Format log record as JSON."""
        import json
        
        # Base log entry
        log_entry = {
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "module": record.module,
            "function": record.funcName,
            "line": record.lineno,
        }
        
        # Add exception info if present
        if record.exc_info:
            log_entry["exception"] = self.formatException(record.exc_info)
        
        # Add extra fields from log record
        if hasattr(record, '__dict__'):
            for key, value in record.__dict__.items():
                if key not in {
                    'name', 'msg', 'args', 'levelname', 'levelno', 'pathname',
                    'filename', 'module', 'lineno', 'funcName', 'created',
                    'msecs', 'relativeCreated', 'thread', 'threadName',
                    'processName', 'process', 'message', 'exc_info',
                    'exc_text', 'stack_info', 'getMessage',
                }:
                    log_entry[key] = value
        
        return json.dumps(log_entry, default=str)


class ColoredFormatter(logging.Formatter):
    """Implement a colored formatter for development console output."""
    
    # ANSI color codes
    COLORS = {
        'DEBUG': '\033[36m',     # Cyan
        'INFO': '\033[32m',      # Green
        'WARNING': '\033[33m',   # Yellow
        'ERROR': '\033[31m',     # Red
        'CRITICAL': '\033[35m',  # Magenta
        'RESET': '\033[0m',       # Reset
    }
    
    def format(self, record: logging.LogRecord) -> str:
        """Format log record with colors."""
        # Add color to level name
        level_color = self.COLORS.get(record.levelname, '')
        reset_color = self.COLORS['RESET']
        
        # Format timestamp
        timestamp = datetime.fromtimestamp(record.created).strftime('%H:%M:%S.%f')[:-3]
        
        # Format the message
        message = record.getMessage()
        
        # Add exception info if present
        if record.exc_info:
            message += '\n' + self.formatException(record.exc_info)
        
        # Create formatted log line
        formatted = (
            f"{timestamp} | "
            f"{level_color}{record.levelname:<8}{reset_color} | "
            f"{record.name:<20} | "
            f"{message}"
        )
        
        # Add extra fields if present
        extra_fields = []
        if hasattr(record, '__dict__'):
            for key, value in record.__dict__.items():
                if key not in {
                    'name', 'msg', 'args', 'levelname', 'levelno', 'pathname',
                    'filename', 'module', 'lineno', 'funcName', 'created',
                    'msecs', 'relativeCreated', 'thread', 'threadName',
                    'processName', 'process', 'message', 'exc_info',
                    'exc_text', 'stack_info', 'getMessage',
                } and not key.startswith('_'):
                    extra_fields.append(f"{key}={value}")
        
        if extra_fields:
            formatted += f" | {' '.join(extra_fields)}"
        
        return formatted


def setup_logging(
    level: Optional[str] = None,
    format_type: Optional[str] = None,
    log_file: Optional[str] = None,
) -> None:
    """Configure logging settings.
    
    Args:
        level: Log level (DEBUG, INFO, WARNING, ERROR, CRITICAL)
        format_type: Format type ('json' or 'colored')
        log_file: Optional log file path

    """
    # Use settings defaults if not provided
    if level is None:
        level = settings.log_level
    if format_type is None:
        format_type = 'json' if settings.enable_json_logging else 'colored'
    
    # Configure root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(getattr(logging, level.upper()))
    
    # Clear existing handlers
    root_logger.handlers.clear()
    
    # Console handler
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(getattr(logging, level.upper()))
    
    if format_type == 'json':
        console_handler.setFormatter(JSONFormatter())
    else:
        console_handler.setFormatter(ColoredFormatter())
    
    root_logger.addHandler(console_handler)
    
    # File handler (optional)
    if log_file:
        file_handler = logging.FileHandler(log_file)
        file_handler.setLevel(getattr(logging, level.upper()))
        file_handler.setFormatter(JSONFormatter())  # Always use JSON for files
        root_logger.addHandler(file_handler)
    
    # Configure specific loggers
    configure_logger_levels()
    
    # Log startup message
    logger = logging.getLogger(__name__)
    logger.info(
        "Logging configured",
        extra={
            "level": level,
            "format": format_type,
            "file": log_file,
            "json_logging": format_type == 'json',
        },
    )


def configure_logger_levels() -> None:
    """Configure specific logger levels."""
    # Reduce noise from external libraries
    logging.getLogger("uvicorn").setLevel(logging.WARNING)
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    
    # Set application loggers to appropriate levels
    if settings.debug_mode:
        logging.getLogger("app").setLevel(logging.DEBUG)
        logging.getLogger("app.frontend").setLevel(logging.DEBUG)
    else:
        logging.getLogger("app").setLevel(logging.INFO)
        logging.getLogger("app.frontend").setLevel(logging.INFO)


def get_logger(name: str) -> logging.Logger:
    """Get logger with consistent configuration.
    
    Args:
        name: Logger name
        
    Returns:
        Configured logger instance

    """
    return logging.getLogger(name)


def log_request(
    method: str,
    path: str,
    status_code: int,
    duration_ms: float,
    user_agent: Optional[str] = None,
    ip_address: Optional[str] = None,
) -> None:
    """Log HTTP request in structured format.
    
    Args:
        method: HTTP method
        path: Request path
        status_code: Response status code
        duration_ms: Request duration in milliseconds
        user_agent: User agent string
        ip_address: Client IP address

    """
    logger = get_logger("app.frontend.access")
    
    log_data = {
        "type": "http_request",
        "method": method,
        "path": path,
        "status_code": status_code,
        "duration_ms": round(duration_ms, 2),
        "user_agent": user_agent,
        "ip_address": ip_address,
    }
    
    # Determine log level based on status code
    if status_code >= 500:
        logger.error(f"{method} {path} - {status_code}", extra=log_data)
    elif status_code >= 400:
        logger.warning(f"{method} {path} - {status_code}", extra=log_data)
    else:
        logger.info(f"{method} {path} - {status_code}", extra=log_data)


def log_backend_request(
    method: str,
    url: str,
    status_code: int,
    duration_ms: float,
    request_id: Optional[str] = None,
    error: Optional[str] = None,
) -> None:
    """Log backend request in structured format.
    
    Args:
        method: HTTP method
        url: Backend URL
        status_code: Response status code
        duration_ms: Request duration in milliseconds
        request_id: Request correlation ID
        error: Error message if request failed

    """
    logger = get_logger("app.frontend.backend")
    
    log_data = {
        "type": "backend_request",
        "method": method,
        "url": url,
        "status_code": status_code,
        "duration_ms": round(duration_ms, 2),
        "request_id": request_id,
        "error": error,
    }
    
    # Determine log level
    if error or status_code >= 500:
        logger.error(f"Backend {method} {url} - {status_code}", extra=log_data)
    elif status_code >= 400:
        logger.warning(f"Backend {method} {url} - {status_code}", extra=log_data)
    else:
        logger.debug(f"Backend {method} {url} - {status_code}", extra=log_data)


def log_cache_operation(
    operation: str,
    cache_name: str,
    key: str,
    hit: bool = False,
    ttl: Optional[int] = None,
) -> None:
    """Log cache operations for debugging.
    
    Args:
        operation: Cache operation (get, set, delete, etc.)
        cache_name: Name of the cache
        key: Cache key
        hit: Whether it was a cache hit (for get operations)
        ttl: TTL value (for set operations)

    """
    logger = get_logger("app.frontend.cache")
    
    log_data = {
        "type": "cache_operation",
        "operation": operation,
        "cache": cache_name,
        "key": key,
        "hit": hit,
        "ttl": ttl,
    }
    
    if operation == "get":
        if hit:
            logger.debug(f"Cache HIT: {cache_name}:{key}", extra=log_data)
        else:
            logger.debug(f"Cache MISS: {cache_name}:{key}", extra=log_data)
    else:
        logger.debug(f"Cache {operation.upper()}: {cache_name}:{key}", extra=log_data)


# Initialize logging on module import
if not logging.getLogger().handlers:  # Only setup if not already configured
    setup_logging()
