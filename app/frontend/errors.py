"""Provide error handling utilities.

Maintain consistent error handling and fallback rendering
for the LoRA Manager frontend application.
"""

import logging
from typing import Any, Dict, Optional, Union

from fastapi import Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.templating import Jinja2Templates
from pydantic import ValidationError

from app.frontend.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class FrontendError(Exception):
    """Represent the base exception for frontend errors."""

    def __init__(
        self,
        message: str,
        status_code: int = 500,
        details: Optional[Dict] = None,
    ):
        """Initialize the frontend error."""
        self.message = message
        self.status_code = status_code
        self.details = details or {}
        super().__init__(self.message)


class BackendConnectionError(FrontendError):
    """Represent an error when the backend is unreachable."""

    def __init__(
        self,
        message: str = "Backend service unavailable",
        details: Optional[Dict] = None,
    ):
        """Initialize a backend connection error."""
        super().__init__(message, status_code=502, details=details)


class ValidationFailedError(FrontendError):
    """Represent an error for validation failures."""

    def __init__(
        self,
        message: str = "Validation failed",
        validation_errors: Optional[Dict] = None,
    ):
        """Initialize a validation failure error."""
        details = {"validation_errors": validation_errors or {}}
        super().__init__(message, status_code=400, details=details)


def format_validation_errors(validation_error: ValidationError) -> Dict[str, str]:
    """Format Pydantic validation errors for display.

    Args:
        validation_error: Pydantic ValidationError instance

    Returns:
        Dictionary mapping field names to error messages

    """
    formatted_errors = {}

    for error in validation_error.errors():
        field_path = ".".join(str(loc) for loc in error["loc"])
        error_msg = error["msg"]

        # Make error messages more user-friendly
        if error["type"] == "value_error.missing":
            error_msg = "This field is required"
        elif error["type"] == "type_error.float":
            error_msg = "Must be a valid number"
        elif error["type"] == "type_error.integer":
            error_msg = "Must be a valid integer"
        elif error["type"] == "value_error.number.not_gt":
            limit = error.get("ctx", {}).get("limit_value", 0)
            error_msg = f"Must be greater than {limit}"
        elif error["type"] == "value_error.number.not_le":
            limit = error.get("ctx", {}).get("limit_value", 1)
            error_msg = f"Must be less than or equal to {limit}"
        elif error["type"] == "value_error.str.regex":
            error_msg = "Invalid format"

        formatted_errors[field_path] = error_msg

    return formatted_errors


def render_error_fallback(
    request: Request,
    templates: Jinja2Templates,
    template_name: str,
    error: Union[str, Exception],
    fallback_data: Optional[Dict] = None,
    status_code: int = 500,
) -> HTMLResponse:
    """Render error fallback template with consistent context.

    Args:
        request: FastAPI Request object
        templates: Jinja2Templates instance
        template_name: Template to render
        error: Error message or exception
        fallback_data: Fallback data to include in template
        status_code: HTTP status code

    Returns:
        HTMLResponse with error template

    """
    # Prepare error context
    error_message = str(error) if error else "An unexpected error occurred"

    context = {
        "request": request,
        "error": error_message,
        "status_code": status_code,
        "fallback_mode": True,
        "debug_mode": settings.debug_mode,
        **(fallback_data or {}),
    }

    # Add additional context for specific error types
    if isinstance(error, FrontendError):
        context.update({
            "error_details": error.details,
            "error_type": error.__class__.__name__,
        })
        status_code = error.status_code

    # Log the error for observability
    logger.warning(
        f"Rendering error fallback for {template_name}",
        extra={
            "template": template_name,
            "error": error_message,
            "status_code": status_code,
            "path": str(request.url.path),
        },
    )

    try:
        return templates.TemplateResponse(
            template_name,
            context,
            status_code=status_code,
        )
    except Exception as template_error:
        # If template rendering fails, return minimal error response
        logger.error(f"Template rendering failed: {template_error}")
        return HTMLResponse(
            content=f"""
            <div class="error-fallback">
                <h1>Error {status_code}</h1>
                <p>{error_message}</p>
                <p><small>Template: {template_name}</small></p>
            </div>
            """,
            status_code=status_code,
        )


def create_htmx_error_response(
    request: Request,
    templates: Jinja2Templates,
    error: Union[str, Exception],
    partial_template: str = "partials/error.html",
    retarget: Optional[str] = None,
) -> HTMLResponse:
    """Create HTMX-compatible error response.

    Args:
        request: FastAPI Request object
        templates: Jinja2Templates instance
        error: Error message or exception
        partial_template: Template for error partial
        retarget: HTMX retarget selector

    Returns:
        HTMLResponse with HTMX headers and error partial

    """
    error_message = str(error) if error else "An error occurred"

    context = {
        "request": request,
        "error": error_message,
        "is_htmx": True,
    }

    # Add validation errors if available
    if isinstance(error, ValidationFailedError):
        context["validation_errors"] = error.details.get("validation_errors", {})

    headers = {}

    # Add HTMX response headers
    if retarget:
        headers["HX-Retarget"] = retarget

    # Add error class to trigger styling
    headers["HX-Trigger-After-Swap"] = "errorOccurred"

    try:
        # Determine status code based on error type
        if isinstance(error, FrontendError):
            status_code = getattr(error, "status_code", 500)
        else:
            status_code = 500

        return templates.TemplateResponse(
            partial_template,
            context,
            headers=headers,
            status_code=status_code,
        )
    except Exception as template_error:
        logger.error(f"Error partial rendering failed: {template_error}")
        return HTMLResponse(
            content=f'<div class="error-message">{error_message}</div>',
            headers=headers,
            status_code=500,
        )


def create_json_error_response(
    error: Union[str, Exception],
    status_code: Optional[int] = None,
) -> JSONResponse:
    """Create JSON error response for API endpoints.

    Args:
        error: Error message or exception
        status_code: HTTP status code (auto-detected for FrontendError)

    Returns:
        JSONResponse with error details

    """
    error_message = str(error) if error else "An error occurred"

    # Determine status code
    if status_code is None:
        if isinstance(error, FrontendError):
            status_code = error.status_code
        else:
            status_code = 500

    response_data = {
        "error": True,
        "message": error_message,
        "status_code": status_code,
    }

    # Add additional details for frontend errors
    if isinstance(error, FrontendError):
        response_data.update({
            "error_type": error.__class__.__name__,
            "details": error.details,
        })

    return JSONResponse(
        content=response_data,
        status_code=status_code,
    )


def handle_backend_error(
    request: Request,
    templates: Jinja2Templates,
    backend_status: int,
    backend_error: str,
    template_name: str,
    fallback_data: Optional[Dict] = None,
) -> HTMLResponse:
    """Handle backend service errors with appropriate fallbacks.

    Args:
        request: FastAPI Request object
        templates: Jinja2Templates instance
        backend_status: Backend HTTP status code
        backend_error: Backend error message
        template_name: Template to render with fallback
        fallback_data: Fallback data for template

    Returns:
        HTMLResponse with fallback content

    """
    # Map backend status codes to frontend responses
    if backend_status == 404:
        error_message = "Requested resource not found"
        status_code = 404
    elif backend_status == 503:
        error_message = "Backend service temporarily unavailable"
        status_code = 503
    elif backend_status >= 500:
        error_message = "Backend service error"
        status_code = 502
    else:
        error_message = f"Backend error: {backend_error}"
        status_code = 502

    return render_error_fallback(
        request=request,
        templates=templates,
        template_name=template_name,
        error=error_message,
        fallback_data=fallback_data,
        status_code=status_code,
    )


def log_error_with_context(
    error: Exception,
    context: Dict[str, Any],
    level: str = "error",
) -> None:
    """Log error with additional context for debugging.

    Args:
        error: Exception to log
        context: Additional context information
        level: Log level (error, warning, info)

    """
    log_data = {
        "error_type": error.__class__.__name__,
        "error_message": str(error),
        **context,
    }

    log_method = getattr(logger, level, logger.error)
    log_method(
        f"{error.__class__.__name__}: {str(error)}",
        extra=log_data,
    )


# Decorator for consistent error handling in route handlers
def handle_route_errors(fallback_template: str, fallback_data: Optional[Dict] = None):
    """Provide a decorator for consistent error handling in route handlers.

    Args:
        fallback_template: Template to render on error
        fallback_data: Default fallback data

    """

    def decorator(func):
        async def wrapper(request: Request, *args, **kwargs):
            try:
                return await func(request, *args, **kwargs)
            except Exception as e:
                # Get templates from function's module or create minimal one
                templates = kwargs.get("templates")
                if not templates:
                    from fastapi.templating import Jinja2Templates

                    templates = Jinja2Templates(directory="app/frontend/templates")

                log_error_with_context(
                    error=e,
                    context={
                        "route": func.__name__,
                        "path": str(request.url.path),
                        "method": request.method,
                    },
                )

                return render_error_fallback(
                    request=request,
                    templates=templates,
                    template_name=fallback_template,
                    error=e,
                    fallback_data=fallback_data,
                )

        return wrapper

    return decorator
