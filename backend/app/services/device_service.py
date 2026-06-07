"""
Device Detection Service

Detects device and browser information from User-Agent
"""

from typing import Dict, Optional
import re


def detect_device(user_agent: str) -> Dict[str, Optional[str]]:
    """
    Detect device type and information from User-Agent

    Args:
        user_agent: User-Agent header string

    Returns:
        dict: Device information with keys:
            - device_type: 'desktop' | 'mobile' | 'tablet'
            - device_name: Human-readable device name
            - os: Operating system
            - browser: Browser name
    """
    if not user_agent:
        return {
            "device_type": "unknown",
            "device_name": None,
            "os": None,
            "browser": None
        }

    user_agent_lower = user_agent.lower()

    # Detect device type
    device_type = "desktop"
    if re.search(r'(android|webos|iphone|ipad|ipod)', user_agent_lower):
        device_type = "mobile"
        if re.search(r'(ipad|android)', user_agent_lower):
            device_type = "tablet"

    # Detect OS
    os_name = detect_os(user_agent)

    # Detect browser
    browser = detect_browser(user_agent)

    # Build device name
    device_name = None
    if "iphone" in user_agent_lower:
        device_name = "iPhone"
    elif "ipad" in user_agent_lower:
        device_name = "iPad"
    elif "android" in user_agent_lower:
        device_name = "Android Device"
    elif "windows" in user_agent_lower:
        device_name = "Windows PC"
    elif "mac" in user_agent_lower:
        device_name = "Mac"
    elif "linux" in user_agent_lower:
        device_name = "Linux"

    return {
        "device_type": device_type,
        "device_name": device_name,
        "os": os_name,
        "browser": browser
    }


def detect_os(user_agent: str) -> Optional[str]:
    """Detect operating system from User-Agent"""
    user_agent_lower = user_agent.lower()

    if "windows" in user_agent_lower:
        if "windows nt 10.0" in user_agent_lower:
            return "Windows 10"
        elif "windows nt 11" in user_agent_lower:
            return "Windows 11"
        return "Windows"
    elif "mac" in user_agent_lower:
        return "macOS"
    elif "iphone" in user_agent_lower:
        return "iOS"
    elif "ipad" in user_agent_lower:
        return "iPadOS"
    elif "android" in user_agent_lower:
        return "Android"
    elif "linux" in user_agent_lower:
        return "Linux"
    elif "x11" in user_agent_lower:
        return "Unix"

    return None


def detect_browser(user_agent: str) -> Optional[str]:
    """Detect browser from User-Agent"""
    user_agent_lower = user_agent.lower()

    # Chrome (must be before Safari, as Chrome also contains Safari)
    if "edg/" in user_agent_lower:
        match = re.search(r'edg/(\d+)', user_agent_lower)
        if match:
            return f"Microsoft Edge {match.group(1)}"
        return "Microsoft Edge"

    # Chrome
    if "chrome/" in user_agent_lower:
        match = re.search(r'chrome/(\d+)', user_agent_lower)
        if match:
            return f"Chrome {match.group(1)}"
        return "Chrome"

    # Firefox
    if "firefox/" in user_agent_lower:
        match = re.search(r'firefox/(\d+)', user_agent_lower)
        if match:
            return f"Firefox {match.group(1)}"
        return "Firefox"

    # Safari
    if "safari/" in user_agent_lower and "chrome/" not in user_agent_lower:
        match = re.search(r'version/(\d+)', user_agent_lower)
        if match:
            return f"Safari {match.group(1)}"
        return "Safari"

    # Opera
    if "opera/" in user_agent_lower or "opr/" in user_agent_lower:
        match = re.search(r'opr/(\d+)', user_agent_lower)
        if match:
            return f"Opera {match.group(1)}"
        return "Opera"

    # Internet Explorer
    if "trident/" in user_agent_lower:
        match = re.search(r'rv:(\d+)', user_agent_lower)
        if match:
            return f"Internet Explorer {match.group(1)}"
        return "Internet Explorer"

    return None


def get_device_name_for_session(device_type: str, browser: str, os: str) -> str:
    """
    Generate a human-readable device name for a session

    Args:
        device_type: Type of device
        browser: Browser name
        os: Operating system

    Returns:
        str: Human-readable device name
    """
    if device_type == "mobile":
        return f"{browser} on {os}"
    elif device_type == "tablet":
        return f"{browser} on {os} (Tablet)"
    else:
        return f"{browser} on {os}"
