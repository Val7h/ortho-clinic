"""
Public API v1 — root router

Assembles all sub-routers and applies the deprecation header mechanism.
Mount this with: app.include_router(public_api_v1_router)

Versioning strategy:
  - URL path: /api/v1/<resource>
  - When a v2 is released, this module will add X-Deprecated-At to all responses.
  - Future versions live in api/v2/ with their own router.
"""

from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Callable

from fastapi import APIRouter, Request, Response
from fastapi.routing import APIRoute

from api.v1.appointments  import router as appointments_router
from api.v1.api_keys_portal import router as api_keys_router
from api.v1.patients      import router as patients_router
from api.v1.webhooks      import router as webhooks_router

# ---------------------------------------------------------------------------
# Deprecation marker (set when v2 is live)
# ---------------------------------------------------------------------------

# Set V1_DEPRECATED_AT to an ISO-8601 date string when v2 is released.
# Example: V1_DEPRECATED_AT=2027-01-01T00:00:00Z
_DEPRECATED_AT = os.getenv("V1_DEPRECATED_AT", "")


class VersionedRoute(APIRoute):
    """Custom route class that injects versioning/deprecation headers."""

    def get_route_handler(self) -> Callable:
        original = super().get_route_handler()

        async def handler(request: Request) -> Response:
            response: Response = await original(request)
            # Version header on every v1 response
            response.headers["X-API-Version"] = "1"
            # Deprecation header when v1 is sunset
            if _DEPRECATED_AT:
                response.headers["X-Deprecated-At"] = _DEPRECATED_AT
                response.headers["Deprecation"] = _DEPRECATED_AT
                response.headers["Sunset"] = _DEPRECATED_AT
                response.headers["Link"] = (
                    '</api/v2/>; rel="successor-version"'
                )
            return response

        return handler


# ---------------------------------------------------------------------------
# Assemble router
# ---------------------------------------------------------------------------

public_api_v1_router = APIRouter(
    route_class=VersionedRoute,
    responses={
        401: {"description": "Authentication required (RFC 7807)"},
        403: {"description": "Insufficient scope (RFC 7807)"},
        422: {"description": "Validation error (RFC 7807)"},
        429: {"description": "Rate limit exceeded (RFC 7807)"},
    },
)

public_api_v1_router.include_router(patients_router)
public_api_v1_router.include_router(appointments_router)
public_api_v1_router.include_router(webhooks_router)
public_api_v1_router.include_router(api_keys_router)


# ---------------------------------------------------------------------------
# /api/v1/ meta endpoint
# ---------------------------------------------------------------------------

@public_api_v1_router.get(
    "/api/v1/",
    tags=["Public API — Meta"],
    summary="API v1 info",
    include_in_schema=True,
)
async def api_v1_info():
    """Return API version metadata and available resources."""
    info = {
        "version":     "1",
        "status":      "deprecated" if _DEPRECATED_AT else "stable",
        "base_url":    "/api/v1",
        "docs_url":    "https://docs.orthoclinic.com/api/v1",
        "resources": [
            {"path": "/api/v1/patients",     "methods": ["GET", "POST"]},
            {"path": "/api/v1/patients/{id}","methods": ["GET"]},
            {"path": "/api/v1/appointments", "methods": ["GET", "POST"]},
            {"path": "/api/v1/availability", "methods": ["GET"]},
            {"path": "/api/v1/webhooks",                                   "methods": ["GET", "POST"]},
            {"path": "/api/v1/webhooks/{id}",                              "methods": ["GET", "PATCH", "DELETE"]},
            {"path": "/api/v1/webhooks/{id}/test",                         "methods": ["POST"]},
            {"path": "/api/v1/webhooks/{id}/deliveries",                   "methods": ["GET"]},
            {"path": "/api/v1/webhooks/{id}/dead-letters",                 "methods": ["GET"]},
            {"path": "/api/v1/webhooks/{id}/dead-letters/{dl_id}/replay",  "methods": ["POST"]},
            {"path": "/api/v1/webhooks/events/catalogue",                  "methods": ["GET"]},
            {"path": "/api/v1/api-keys",     "methods": ["GET", "POST"]},
            {"path": "/api/v1/api-keys/{id}","methods": ["DELETE"]},
            {"path": "/api/v1/api-keys/{id}/rotate", "methods": ["POST"]},
        ],
    }
    if _DEPRECATED_AT:
        info["deprecated_at"] = _DEPRECATED_AT
        info["successor"]     = "/api/v2/"
    return info


# ---------------------------------------------------------------------------
# /api/v1/scopes — canonical scope catalogue
# ---------------------------------------------------------------------------

SCOPE_CATALOGUE = [
    {"scope": "patients:read",    "description": "Read patient records", "sensitive": False},
    {"scope": "patients:write",   "description": "Create and update patients", "sensitive": False},
    {"scope": "appointments:read","description": "Read appointments and availability", "sensitive": False},
    {"scope": "appointments:write","description":"Create and cancel appointments", "sensitive": False},
    {"scope": "webhooks:read",    "description": "List registered webhooks", "sensitive": False},
    {"scope": "webhooks:write",   "description": "Register and delete webhooks", "sensitive": False},
    {"scope": "api_keys:manage",  "description": "Create, rotate, and revoke API keys", "sensitive": True},
    {"scope": "admin",            "description": "Full access to all resources", "sensitive": True},
]


@public_api_v1_router.get(
    "/api/v1/scopes",
    tags=["Public API — Meta"],
    summary="Scope catalogue",
)
async def list_scopes():
    """Return all available OAuth scopes for the public API."""
    return {"scopes": SCOPE_CATALOGUE}
