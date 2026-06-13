"""
RFC 7807 Problem Details error helpers — OrthoClinic Public API v1

Every error returned by /api/v1/* uses this schema so integrators get a
consistent, machine-readable payload across all endpoints.

Reference: https://www.rfc-editor.org/rfc/rfc7807
"""

from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import Request
from fastapi.responses import JSONResponse

DOCS_BASE = "https://docs.orthoclinic.com/errors"


# ---------------------------------------------------------------------------
# Error type catalogue
# ---------------------------------------------------------------------------

class ErrorType:
    VALIDATION       = f"{DOCS_BASE}/validation-error"
    AUTHENTICATION   = f"{DOCS_BASE}/authentication-error"
    AUTHORIZATION    = f"{DOCS_BASE}/authorization-error"
    NOT_FOUND        = f"{DOCS_BASE}/not-found"
    CONFLICT         = f"{DOCS_BASE}/conflict"
    RATE_LIMITED     = f"{DOCS_BASE}/rate-limit-exceeded"
    INTERNAL         = f"{DOCS_BASE}/internal-error"
    INVALID_API_KEY  = f"{DOCS_BASE}/invalid-api-key"
    SCOPE_DENIED     = f"{DOCS_BASE}/scope-denied"
    WEBHOOK_FAILED   = f"{DOCS_BASE}/webhook-delivery-failed"


# ---------------------------------------------------------------------------
# Builder
# ---------------------------------------------------------------------------

def problem(
    *,
    status: int,
    error_type: str,
    title: str,
    detail: str,
    instance: str,
    request_id: str,
    extra: Optional[Dict[str, Any]] = None,
) -> JSONResponse:
    """Return an RFC 7807 JSON response."""
    body: Dict[str, Any] = {
        "type":       error_type,
        "title":      title,
        "status":     status,
        "detail":     detail,
        "instance":   instance,
        "request_id": request_id,
    }
    if extra:
        body.update(extra)
    return JSONResponse(
        status_code=status,
        content=body,
        headers={"Content-Type": "application/problem+json"},
    )


# ---------------------------------------------------------------------------
# Shortcut factories
# ---------------------------------------------------------------------------

def err_validation(request: Request, detail: str, field: Optional[str] = None) -> JSONResponse:
    extra = {"field": field} if field else None
    return problem(
        status=422,
        error_type=ErrorType.VALIDATION,
        title="Validation Error",
        detail=detail,
        instance=str(request.url.path),
        request_id=getattr(request.state, "request_id", ""),
        extra=extra,
    )


def err_auth(request: Request, detail: str = "Authentication required") -> JSONResponse:
    return problem(
        status=401,
        error_type=ErrorType.AUTHENTICATION,
        title="Authentication Error",
        detail=detail,
        instance=str(request.url.path),
        request_id=getattr(request.state, "request_id", ""),
    )


def err_forbidden(request: Request, detail: str, scope: Optional[str] = None) -> JSONResponse:
    extra = {"required_scope": scope} if scope else None
    return problem(
        status=403,
        error_type=ErrorType.SCOPE_DENIED,
        title="Authorization Error",
        detail=detail,
        instance=str(request.url.path),
        request_id=getattr(request.state, "request_id", ""),
        extra=extra,
    )


def err_not_found(request: Request, resource: str, resource_id: Any) -> JSONResponse:
    return problem(
        status=404,
        error_type=ErrorType.NOT_FOUND,
        title="Not Found",
        detail=f"{resource} with id '{resource_id}' was not found.",
        instance=str(request.url.path),
        request_id=getattr(request.state, "request_id", ""),
        extra={"resource": resource, "id": resource_id},
    )


def err_conflict(request: Request, detail: str) -> JSONResponse:
    return problem(
        status=409,
        error_type=ErrorType.CONFLICT,
        title="Conflict",
        detail=detail,
        instance=str(request.url.path),
        request_id=getattr(request.state, "request_id", ""),
    )


def err_rate_limit(request: Request, retry_after: int = 60) -> JSONResponse:
    return problem(
        status=429,
        error_type=ErrorType.RATE_LIMITED,
        title="Rate Limit Exceeded",
        detail=(
            f"You have exceeded the allowed request rate. "
            f"Retry after {retry_after} seconds."
        ),
        instance=str(request.url.path),
        request_id=getattr(request.state, "request_id", ""),
        extra={"retry_after_seconds": retry_after},
    )


def err_internal(request: Request, detail: str = "An unexpected error occurred.") -> JSONResponse:
    return problem(
        status=500,
        error_type=ErrorType.INTERNAL,
        title="Internal Server Error",
        detail=detail,
        instance=str(request.url.path),
        request_id=getattr(request.state, "request_id", ""),
    )
