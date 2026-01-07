#!/usr/bin/env python3
"""Team Analytics Module for Claude Code Log.

This module provides team-level analytics for super admins to analyze
usage patterns, productivity, and performance across team members.

Data Source: Shared directory (Google Drive synced folder)
"""

import csv
import json
from collections import defaultdict
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from pydantic import BaseModel

from .cache import CacheManager, ProjectCache, SessionCacheData, get_library_version


class MemberStats(BaseModel):
    """Statistics for a single team member."""

    member_id: str
    member_name: str

    # Usage statistics
    total_sessions: int = 0
    total_messages: int = 0
    total_input_tokens: int = 0
    total_output_tokens: int = 0
    total_cache_creation_tokens: int = 0
    total_cache_read_tokens: int = 0

    # Project statistics
    project_count: int = 0
    projects: List[str] = []

    # Timeline
    first_activity: Optional[str] = None
    last_activity: Optional[str] = None
    active_days: int = 0

    # Productivity metrics
    avg_sessions_per_day: float = 0.0
    avg_messages_per_session: float = 0.0
    avg_tokens_per_session: float = 0.0


class DailyActivity(BaseModel):
    """Daily activity data for timeline visualization."""

    date: str
    member_id: str
    sessions: int = 0
    messages: int = 0
    input_tokens: int = 0
    output_tokens: int = 0


class TeamAnalytics(BaseModel):
    """Complete team analytics report."""

    generated_at: str
    data_source: str

    # Team overview
    total_members: int = 0
    total_projects: int = 0
    total_sessions: int = 0
    total_messages: int = 0
    total_input_tokens: int = 0
    total_output_tokens: int = 0

    # Date range
    earliest_activity: Optional[str] = None
    latest_activity: Optional[str] = None

    # Member statistics
    members: Dict[str, MemberStats] = {}

    # Daily activity timeline
    daily_activities: List[DailyActivity] = []

    # Rankings (member_id -> rank)
    productivity_ranking: List[Tuple[str, int]] = []  # By total messages
    token_usage_ranking: List[Tuple[str, int]] = []   # By total tokens


class TeamAnalyticsManager:
    """Manager for team analytics operations."""

    def __init__(self, shared_data_dir: Path, role: str = "admin"):
        """Initialize team analytics manager.

        Args:
            shared_data_dir: Path to shared data directory (Google Drive synced)
            role: User role - must be "admin" or "super_admin" to access
        """
        self.shared_data_dir = shared_data_dir
        self.role = role
        self._members_data: Dict[str, MemberStats] = {}
        self._daily_activities: Dict[str, Dict[str, DailyActivity]] = {}  # date -> member_id -> activity

    def is_authorized(self) -> bool:
        """Check if current role has access to team analytics."""
        return self.role in ["admin", "super_admin"]

    def discover_members(self) -> List[str]:
        """Discover team members from shared data directory.

        Expected directory structure:
        shared_data_dir/
        ├── member1/
        │   └── projects/
        │       ├── project1/
        │       │   └── *.jsonl
        │       └── project2/
        │           └── *.jsonl
        ├── member2/
        │   └── projects/
        │       └── ...
        └── ...

        Returns:
            List of member directory names
        """
        if not self.shared_data_dir.exists():
            return []

        members = []
        for item in self.shared_data_dir.iterdir():
            if item.is_dir() and not item.name.startswith("."):
                # Check if this directory contains projects
                projects_dir = item / "projects"
                if projects_dir.exists():
                    members.append(item.name)
                # Also check if directly contains JSONL files (flat structure)
                elif list(item.glob("**/*.jsonl")):
                    members.append(item.name)

        return sorted(members)

    def analyze_member(self, member_id: str) -> Optional[MemberStats]:
        """Analyze a single team member's data.

        Args:
            member_id: Member directory name

        Returns:
            MemberStats for the member, or None if not found
        """
        member_dir = self.shared_data_dir / member_id
        if not member_dir.exists():
            return None

        stats = MemberStats(
            member_id=member_id,
            member_name=member_id,  # Can be customized with a mapping file
        )

        # Find all project directories
        projects_dir = member_dir / "projects"
        if projects_dir.exists():
            project_dirs = [d for d in projects_dir.iterdir() if d.is_dir() and not d.name.startswith(".")]
        else:
            # Flat structure - each subdirectory is a project
            project_dirs = [d for d in member_dir.iterdir() if d.is_dir() and not d.name.startswith(".")]

        active_dates: set[str] = set()
        all_timestamps: List[str] = []

        for project_dir in project_dirs:
            # Try to load cached data first
            cache_manager = CacheManager(project_dir, get_library_version())
            project_cache = cache_manager.get_cached_project_data()

            if project_cache and project_cache.sessions:
                stats.projects.append(project_dir.name)
                stats.project_count += 1

                # Aggregate from cached sessions
                for session_id, session_data in project_cache.sessions.items():
                    if session_data.message_count > 0:
                        stats.total_sessions += 1
                        stats.total_messages += session_data.message_count
                        stats.total_input_tokens += session_data.total_input_tokens
                        stats.total_output_tokens += session_data.total_output_tokens
                        stats.total_cache_creation_tokens += session_data.total_cache_creation_tokens
                        stats.total_cache_read_tokens += session_data.total_cache_read_tokens

                        # Track timestamps
                        if session_data.first_timestamp:
                            all_timestamps.append(session_data.first_timestamp)
                            try:
                                dt = datetime.fromisoformat(session_data.first_timestamp.replace("Z", "+00:00"))
                                active_dates.add(dt.strftime("%Y-%m-%d"))
                            except Exception:
                                pass
                        if session_data.last_timestamp:
                            all_timestamps.append(session_data.last_timestamp)
            else:
                # No cache - analyze JSONL files directly
                jsonl_files = list(project_dir.glob("*.jsonl"))
                if jsonl_files:
                    stats.projects.append(project_dir.name)
                    stats.project_count += 1

                    for jsonl_file in jsonl_files:
                        file_stats = self._analyze_jsonl_file(jsonl_file)
                        stats.total_sessions += file_stats.get("sessions", 0)
                        stats.total_messages += file_stats.get("messages", 0)
                        stats.total_input_tokens += file_stats.get("input_tokens", 0)
                        stats.total_output_tokens += file_stats.get("output_tokens", 0)

                        for ts in file_stats.get("timestamps", []):
                            all_timestamps.append(ts)
                            try:
                                dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
                                active_dates.add(dt.strftime("%Y-%m-%d"))
                            except Exception:
                                pass

        # Calculate timeline
        if all_timestamps:
            sorted_timestamps = sorted(all_timestamps)
            stats.first_activity = sorted_timestamps[0]
            stats.last_activity = sorted_timestamps[-1]

        stats.active_days = len(active_dates)

        # Calculate productivity metrics
        if stats.active_days > 0:
            stats.avg_sessions_per_day = stats.total_sessions / stats.active_days
        if stats.total_sessions > 0:
            stats.avg_messages_per_session = stats.total_messages / stats.total_sessions
            stats.avg_tokens_per_session = (stats.total_input_tokens + stats.total_output_tokens) / stats.total_sessions

        self._members_data[member_id] = stats
        return stats

    def _analyze_jsonl_file(self, jsonl_path: Path) -> Dict[str, Any]:
        """Analyze a single JSONL file for basic statistics.

        Args:
            jsonl_path: Path to JSONL file

        Returns:
            Dictionary with sessions, messages, tokens, timestamps
        """
        stats: Dict[str, Any] = {
            "sessions": 0,
            "messages": 0,
            "input_tokens": 0,
            "output_tokens": 0,
            "timestamps": [],
        }

        session_ids: set[str] = set()

        try:
            with open(jsonl_path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        entry = json.loads(line)
                        entry_type = entry.get("type", "")

                        if entry_type in ["user", "assistant"]:
                            stats["messages"] += 1

                            session_id = entry.get("sessionId", "")
                            if session_id:
                                session_ids.add(session_id)

                            timestamp = entry.get("timestamp", "")
                            if timestamp:
                                stats["timestamps"].append(timestamp)

                            # Extract token usage from assistant messages
                            if entry_type == "assistant":
                                message = entry.get("message", {})
                                usage = message.get("usage", {})
                                if usage:
                                    stats["input_tokens"] += usage.get("input_tokens", 0) or 0
                                    stats["output_tokens"] += usage.get("output_tokens", 0) or 0
                    except json.JSONDecodeError:
                        continue

        except Exception as e:
            print(f"Warning: Failed to analyze {jsonl_path}: {e}")

        stats["sessions"] = len(session_ids)
        return stats

    def analyze_team(self) -> TeamAnalytics:
        """Analyze all team members and generate complete analytics.

        Returns:
            Complete TeamAnalytics report
        """
        if not self.is_authorized():
            raise PermissionError("Unauthorized: Team analytics requires admin or super_admin role")

        members = self.discover_members()

        analytics = TeamAnalytics(
            generated_at=datetime.now().isoformat(),
            data_source=str(self.shared_data_dir),
        )

        all_timestamps: List[str] = []

        for member_id in members:
            member_stats = self.analyze_member(member_id)
            if member_stats:
                analytics.members[member_id] = member_stats
                analytics.total_members += 1
                analytics.total_projects += member_stats.project_count
                analytics.total_sessions += member_stats.total_sessions
                analytics.total_messages += member_stats.total_messages
                analytics.total_input_tokens += member_stats.total_input_tokens
                analytics.total_output_tokens += member_stats.total_output_tokens

                if member_stats.first_activity:
                    all_timestamps.append(member_stats.first_activity)
                if member_stats.last_activity:
                    all_timestamps.append(member_stats.last_activity)

        # Set date range
        if all_timestamps:
            sorted_timestamps = sorted(all_timestamps)
            analytics.earliest_activity = sorted_timestamps[0]
            analytics.latest_activity = sorted_timestamps[-1]

        # Calculate rankings
        # Productivity ranking (by total messages)
        productivity_sorted = sorted(
            analytics.members.items(),
            key=lambda x: x[1].total_messages,
            reverse=True
        )
        analytics.productivity_ranking = [
            (member_id, rank + 1)
            for rank, (member_id, _) in enumerate(productivity_sorted)
        ]

        # Token usage ranking (by total tokens)
        token_sorted = sorted(
            analytics.members.items(),
            key=lambda x: x[1].total_input_tokens + x[1].total_output_tokens,
            reverse=True
        )
        analytics.token_usage_ranking = [
            (member_id, rank + 1)
            for rank, (member_id, _) in enumerate(token_sorted)
        ]

        return analytics

    def export_to_json(self, analytics: TeamAnalytics, output_path: Path) -> None:
        """Export analytics to JSON file.

        Args:
            analytics: TeamAnalytics to export
            output_path: Path to output JSON file
        """
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(analytics.model_dump(), f, indent=2)

    def export_to_csv(self, analytics: TeamAnalytics, output_path: Path) -> None:
        """Export member statistics to CSV file.

        Args:
            analytics: TeamAnalytics to export
            output_path: Path to output CSV file
        """
        fieldnames = [
            "member_id",
            "member_name",
            "total_sessions",
            "total_messages",
            "total_input_tokens",
            "total_output_tokens",
            "total_cache_creation_tokens",
            "total_cache_read_tokens",
            "project_count",
            "active_days",
            "avg_sessions_per_day",
            "avg_messages_per_session",
            "avg_tokens_per_session",
            "first_activity",
            "last_activity",
            "productivity_rank",
            "token_usage_rank",
        ]

        # Build ranking lookup
        productivity_rank = {m: r for m, r in analytics.productivity_ranking}
        token_rank = {m: r for m, r in analytics.token_usage_ranking}

        with open(output_path, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()

            for member_id, stats in analytics.members.items():
                row = {
                    "member_id": stats.member_id,
                    "member_name": stats.member_name,
                    "total_sessions": stats.total_sessions,
                    "total_messages": stats.total_messages,
                    "total_input_tokens": stats.total_input_tokens,
                    "total_output_tokens": stats.total_output_tokens,
                    "total_cache_creation_tokens": stats.total_cache_creation_tokens,
                    "total_cache_read_tokens": stats.total_cache_read_tokens,
                    "project_count": stats.project_count,
                    "active_days": stats.active_days,
                    "avg_sessions_per_day": round(stats.avg_sessions_per_day, 2),
                    "avg_messages_per_session": round(stats.avg_messages_per_session, 2),
                    "avg_tokens_per_session": round(stats.avg_tokens_per_session, 2),
                    "first_activity": stats.first_activity or "",
                    "last_activity": stats.last_activity or "",
                    "productivity_rank": productivity_rank.get(member_id, 0),
                    "token_usage_rank": token_rank.get(member_id, 0),
                }
                writer.writerow(row)


def format_tokens(tokens: int) -> str:
    """Format token count for display.

    Args:
        tokens: Token count

    Returns:
        Formatted string (e.g., "1.2M", "500K", "1,234")
    """
    if tokens >= 1_000_000:
        return f"{tokens / 1_000_000:.1f}M"
    elif tokens >= 1_000:
        return f"{tokens / 1_000:.1f}K"
    else:
        return f"{tokens:,}"


def generate_dashboard_html(analytics: TeamAnalytics, output_path: Path, csv_path: Optional[Path] = None, json_path: Optional[Path] = None) -> None:
    """Generate HTML dashboard from analytics data.

    Args:
        analytics: TeamAnalytics data
        output_path: Path to output HTML file
        csv_path: Optional path to CSV file for download link
        json_path: Optional path to JSON file for download link
    """
    from jinja2 import Environment, FileSystemLoader

    # Get template directory
    template_dir = Path(__file__).parent / "templates"
    env = Environment(loader=FileSystemLoader(str(template_dir)))

    # Add format_tokens to template globals
    env.globals["format_tokens"] = format_tokens

    template = env.get_template("admin_dashboard.html")

    # Sort members by productivity (total messages)
    members_sorted = sorted(
        analytics.members.items(),
        key=lambda x: x[1].total_messages,
        reverse=True
    )

    # Calculate estimated cost
    estimated_cost = calculate_cost_estimate(
        analytics.total_input_tokens,
        analytics.total_output_tokens
    )

    # Format timestamps
    earliest_formatted = None
    latest_formatted = None
    if analytics.earliest_activity:
        try:
            dt = datetime.fromisoformat(analytics.earliest_activity.replace("Z", "+00:00"))
            earliest_formatted = dt.strftime("%Y-%m-%d %H:%M")
        except Exception:
            earliest_formatted = analytics.earliest_activity
    if analytics.latest_activity:
        try:
            dt = datetime.fromisoformat(analytics.latest_activity.replace("Z", "+00:00"))
            latest_formatted = dt.strftime("%Y-%m-%d %H:%M")
        except Exception:
            latest_formatted = analytics.latest_activity

    # Render template
    html_content = template.render(
        generated_at=datetime.fromisoformat(analytics.generated_at).strftime("%Y-%m-%d %H:%M:%S"),
        data_source=analytics.data_source,
        total_members=analytics.total_members,
        total_projects=analytics.total_projects,
        total_sessions=analytics.total_sessions,
        total_messages=analytics.total_messages,
        total_input_tokens=analytics.total_input_tokens,
        total_output_tokens=analytics.total_output_tokens,
        estimated_cost=estimated_cost,
        earliest_activity=earliest_formatted,
        latest_activity=latest_formatted,
        members=analytics.members,
        members_sorted=members_sorted,
        productivity_ranking=analytics.productivity_ranking,
        token_usage_ranking=analytics.token_usage_ranking,
        csv_path=str(csv_path.name) if csv_path else None,
        json_path=str(json_path.name) if json_path else None,
    )

    with open(output_path, "w", encoding="utf-8") as f:
        f.write(html_content)


def calculate_cost_estimate(input_tokens: int, output_tokens: int, model: str = "claude-3-sonnet") -> float:
    """Calculate estimated cost based on token usage.

    Args:
        input_tokens: Total input tokens
        output_tokens: Total output tokens
        model: Model name for pricing

    Returns:
        Estimated cost in USD
    """
    # Pricing per 1M tokens (approximate, varies by model)
    pricing = {
        "claude-3-opus": {"input": 15.0, "output": 75.0},
        "claude-3-sonnet": {"input": 3.0, "output": 15.0},
        "claude-3-haiku": {"input": 0.25, "output": 1.25},
        "claude-3.5-sonnet": {"input": 3.0, "output": 15.0},
    }

    model_pricing = pricing.get(model, pricing["claude-3-sonnet"])

    input_cost = (input_tokens / 1_000_000) * model_pricing["input"]
    output_cost = (output_tokens / 1_000_000) * model_pricing["output"]

    return round(input_cost + output_cost, 2)
