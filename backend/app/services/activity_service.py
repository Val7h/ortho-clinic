"""
Activity Logging Service

Logs all user actions for audit trail and compliance
"""

from sqlalchemy.orm import Session
from datetime import datetime
from typing import Optional, Dict, Any
from models.user_settings import ActivityLog
import logging

logger = logging.getLogger(__name__)


def log_activity(
    db: Session,
    user_id: int,
    action: str,
    resource_type: Optional[str] = None,
    resource_id: Optional[str] = None,
    old_value: Optional[Dict[str, Any]] = None,
    new_value: Optional[Dict[str, Any]] = None,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None,
    description: Optional[str] = None
) -> ActivityLog:
    """
    Log a user activity

    Args:
        db: Database session
        user_id: User ID
        action: Action performed (e.g., 'password_changed', 'profile_updated')
        resource_type: Type of resource affected (e.g., 'user', 'api_key')
        resource_id: ID of the resource affected
        old_value: Previous value (for updates)
        new_value: New value (for updates)
        ip_address: IP address of the request
        user_agent: User agent string
        description: Human-readable description of the action

    Returns:
        ActivityLog: The created activity log entry
    """
    activity = ActivityLog(
        user_id=user_id,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        old_value=old_value,
        new_value=new_value,
        ip_address=ip_address,
        user_agent=user_agent,
        description=description,
        created_at=datetime.utcnow()
    )

    db.add(activity)

    # Log to application logger as well
    logger.info(
        f"Activity: {action} | User: {user_id} | Resource: {resource_type}/{resource_id} | IP: {ip_address}"
    )

    return activity


def get_activity_log(
    db: Session,
    user_id: int,
    limit: int = 50,
    offset: int = 0,
    action: Optional[str] = None,
    resource_type: Optional[str] = None
) -> tuple:
    """
    Get activity log for a user

    Args:
        db: Database session
        user_id: User ID
        limit: Max results to return
        offset: Offset for pagination
        action: Filter by action type
        resource_type: Filter by resource type

    Returns:
        tuple: (total_count, activities)
    """
    query = db.query(ActivityLog).filter(
        ActivityLog.user_id == user_id
    )

    if action:
        query = query.filter(ActivityLog.action == action)

    if resource_type:
        query = query.filter(ActivityLog.resource_type == resource_type)

    total = query.count()
    activities = query.order_by(
        ActivityLog.created_at.desc()
    ).limit(limit).offset(offset).all()

    return total, activities


def cleanup_old_activities(db: Session, days_to_keep: int = 90) -> int:
    """
    Delete activity logs older than specified days (for compliance/privacy)

    Args:
        db: Database session
        days_to_keep: Number of days to retain

    Returns:
        int: Number of records deleted
    """
    from datetime import timedelta

    cutoff_date = datetime.utcnow() - timedelta(days=days_to_keep)

    result = db.query(ActivityLog).filter(
        ActivityLog.created_at < cutoff_date
    ).delete()

    db.commit()

    logger.info(f"Cleaned up {result} old activity logs")

    return result
