#!/usr/bin/env python3
"""Tests for the Team Analytics module."""

import json
import tempfile
from pathlib import Path

import pytest

from claude_code_log.team_analytics import (
    MemberStats,
    TeamAnalytics,
    TeamAnalyticsManager,
    calculate_cost_estimate,
    format_tokens,
    generate_dashboard_html,
)


@pytest.fixture
def temp_team_dir():
    """Create a temporary team data directory with test data."""
    with tempfile.TemporaryDirectory() as temp_dir:
        team_path = Path(temp_dir)

        # Create member directories with sample data
        # Member 1
        member1_dir = team_path / "member1" / "projects" / "project1"
        member1_dir.mkdir(parents=True)

        # Create JSONL file with test data
        jsonl_data = [
            {
                "type": "user",
                "sessionId": "session-1",
                "timestamp": "2025-01-01T10:00:00Z",
                "uuid": "user-1",
                "message": {"role": "user", "content": "Hello"},
                "parentUuid": None,
                "isSidechain": False,
                "userType": "human",
                "cwd": "/test",
                "version": "1.0.0",
            },
            {
                "type": "assistant",
                "sessionId": "session-1",
                "timestamp": "2025-01-01T10:01:00Z",
                "uuid": "assistant-1",
                "message": {
                    "id": "msg-1",
                    "type": "message",
                    "role": "assistant",
                    "model": "claude-3-sonnet",
                    "content": [{"type": "text", "text": "Hello!"}],
                    "usage": {
                        "input_tokens": 100,
                        "output_tokens": 50,
                        "cache_creation_input_tokens": 0,
                        "cache_read_input_tokens": 0,
                    },
                },
                "parentUuid": "user-1",
                "isSidechain": False,
                "userType": "human",
                "cwd": "/test",
                "version": "1.0.0",
            },
        ]

        jsonl_file = member1_dir / "test.jsonl"
        with open(jsonl_file, "w") as f:
            for entry in jsonl_data:
                f.write(json.dumps(entry) + "\n")

        # Member 2
        member2_dir = team_path / "member2" / "projects" / "project2"
        member2_dir.mkdir(parents=True)

        jsonl_data2 = [
            {
                "type": "user",
                "sessionId": "session-2",
                "timestamp": "2025-01-02T10:00:00Z",
                "uuid": "user-2",
                "message": {"role": "user", "content": "Test"},
                "parentUuid": None,
                "isSidechain": False,
                "userType": "human",
                "cwd": "/test2",
                "version": "1.0.0",
            },
            {
                "type": "assistant",
                "sessionId": "session-2",
                "timestamp": "2025-01-02T10:01:00Z",
                "uuid": "assistant-2",
                "message": {
                    "id": "msg-2",
                    "type": "message",
                    "role": "assistant",
                    "model": "claude-3-sonnet",
                    "content": [{"type": "text", "text": "Response!"}],
                    "usage": {
                        "input_tokens": 200,
                        "output_tokens": 100,
                        "cache_creation_input_tokens": 0,
                        "cache_read_input_tokens": 0,
                    },
                },
                "parentUuid": "user-2",
                "isSidechain": False,
                "userType": "human",
                "cwd": "/test2",
                "version": "1.0.0",
            },
        ]

        jsonl_file2 = member2_dir / "test2.jsonl"
        with open(jsonl_file2, "w") as f:
            for entry in jsonl_data2:
                f.write(json.dumps(entry) + "\n")

        yield team_path


class TestMemberStats:
    """Test cases for MemberStats model."""

    def test_member_stats_defaults(self):
        """Test MemberStats default values."""
        stats = MemberStats(member_id="test", member_name="Test User")
        assert stats.member_id == "test"
        assert stats.member_name == "Test User"
        assert stats.total_sessions == 0
        assert stats.total_messages == 0
        assert stats.total_input_tokens == 0
        assert stats.total_output_tokens == 0
        assert stats.project_count == 0
        assert stats.projects == []

    def test_member_stats_with_values(self):
        """Test MemberStats with custom values."""
        stats = MemberStats(
            member_id="user1",
            member_name="User One",
            total_sessions=10,
            total_messages=100,
            total_input_tokens=5000,
            total_output_tokens=2500,
            project_count=3,
            projects=["proj1", "proj2", "proj3"],
        )
        assert stats.total_sessions == 10
        assert stats.total_messages == 100
        assert stats.total_input_tokens == 5000


class TestTeamAnalyticsManager:
    """Test cases for TeamAnalyticsManager."""

    def test_init(self, temp_team_dir):
        """Test TeamAnalyticsManager initialization."""
        manager = TeamAnalyticsManager(temp_team_dir, role="admin")
        assert manager.shared_data_dir == temp_team_dir
        assert manager.role == "admin"

    def test_is_authorized_admin(self, temp_team_dir):
        """Test authorization for admin role."""
        manager = TeamAnalyticsManager(temp_team_dir, role="admin")
        assert manager.is_authorized() is True

    def test_is_authorized_super_admin(self, temp_team_dir):
        """Test authorization for super_admin role."""
        manager = TeamAnalyticsManager(temp_team_dir, role="super_admin")
        assert manager.is_authorized() is True

    def test_is_not_authorized_user(self, temp_team_dir):
        """Test authorization denied for regular user."""
        manager = TeamAnalyticsManager(temp_team_dir, role="user")
        assert manager.is_authorized() is False

    def test_discover_members(self, temp_team_dir):
        """Test discovering team members."""
        manager = TeamAnalyticsManager(temp_team_dir, role="admin")
        members = manager.discover_members()
        assert len(members) == 2
        assert "member1" in members
        assert "member2" in members

    def test_discover_members_empty_dir(self):
        """Test discovering members in empty directory."""
        with tempfile.TemporaryDirectory() as temp_dir:
            manager = TeamAnalyticsManager(Path(temp_dir), role="admin")
            members = manager.discover_members()
            assert members == []

    def test_discover_members_nonexistent_dir(self):
        """Test discovering members in non-existent directory."""
        manager = TeamAnalyticsManager(Path("/nonexistent/path"), role="admin")
        members = manager.discover_members()
        assert members == []

    def test_analyze_member(self, temp_team_dir):
        """Test analyzing a single member."""
        manager = TeamAnalyticsManager(temp_team_dir, role="admin")
        stats = manager.analyze_member("member1")

        assert stats is not None
        assert stats.member_id == "member1"
        assert stats.total_messages == 2
        assert stats.total_sessions == 1
        assert stats.total_input_tokens == 100
        assert stats.total_output_tokens == 50
        assert stats.project_count == 1

    def test_analyze_member_not_found(self, temp_team_dir):
        """Test analyzing non-existent member."""
        manager = TeamAnalyticsManager(temp_team_dir, role="admin")
        stats = manager.analyze_member("nonexistent")
        assert stats is None

    def test_analyze_team(self, temp_team_dir):
        """Test analyzing entire team."""
        manager = TeamAnalyticsManager(temp_team_dir, role="admin")
        analytics = manager.analyze_team()

        assert analytics.total_members == 2
        assert analytics.total_projects == 2
        assert analytics.total_messages == 4
        assert analytics.total_sessions == 2
        assert analytics.total_input_tokens == 300
        assert analytics.total_output_tokens == 150

    def test_analyze_team_unauthorized(self, temp_team_dir):
        """Test that unauthorized users cannot analyze team."""
        manager = TeamAnalyticsManager(temp_team_dir, role="user")
        with pytest.raises(PermissionError):
            manager.analyze_team()

    def test_export_to_json(self, temp_team_dir):
        """Test exporting analytics to JSON."""
        manager = TeamAnalyticsManager(temp_team_dir, role="admin")
        analytics = manager.analyze_team()

        output_path = temp_team_dir / "test_output.json"
        manager.export_to_json(analytics, output_path)

        assert output_path.exists()
        with open(output_path) as f:
            data = json.load(f)
        assert data["total_members"] == 2

    def test_export_to_csv(self, temp_team_dir):
        """Test exporting analytics to CSV."""
        manager = TeamAnalyticsManager(temp_team_dir, role="admin")
        analytics = manager.analyze_team()

        output_path = temp_team_dir / "test_output.csv"
        manager.export_to_csv(analytics, output_path)

        assert output_path.exists()
        content = output_path.read_text()
        assert "member_id" in content
        assert "member1" in content
        assert "member2" in content


class TestFormatTokens:
    """Test cases for format_tokens function."""

    def test_format_small_tokens(self):
        """Test formatting small token counts."""
        assert format_tokens(100) == "100"
        assert format_tokens(999) == "999"

    def test_format_thousands(self):
        """Test formatting thousands of tokens."""
        assert format_tokens(1000) == "1.0K"
        assert format_tokens(5500) == "5.5K"
        assert format_tokens(999999) == "1000.0K"

    def test_format_millions(self):
        """Test formatting millions of tokens."""
        assert format_tokens(1000000) == "1.0M"
        assert format_tokens(5500000) == "5.5M"


class TestCalculateCostEstimate:
    """Test cases for calculate_cost_estimate function."""

    def test_cost_estimate_sonnet(self):
        """Test cost estimate for Claude 3 Sonnet."""
        cost = calculate_cost_estimate(1_000_000, 500_000, "claude-3-sonnet")
        # Input: 1M * $3/1M = $3
        # Output: 0.5M * $15/1M = $7.5
        # Total: $10.5
        assert cost == 10.5

    def test_cost_estimate_opus(self):
        """Test cost estimate for Claude 3 Opus."""
        cost = calculate_cost_estimate(1_000_000, 500_000, "claude-3-opus")
        # Input: 1M * $15/1M = $15
        # Output: 0.5M * $75/1M = $37.5
        # Total: $52.5
        assert cost == 52.5

    def test_cost_estimate_haiku(self):
        """Test cost estimate for Claude 3 Haiku."""
        cost = calculate_cost_estimate(1_000_000, 500_000, "claude-3-haiku")
        # Input: 1M * $0.25/1M = $0.25
        # Output: 0.5M * $1.25/1M = $0.625
        # Total: $0.875 -> rounded to $0.88
        assert cost == 0.88

    def test_cost_estimate_default_model(self):
        """Test cost estimate with default model."""
        cost = calculate_cost_estimate(100_000, 50_000)
        # Uses claude-3-sonnet by default
        # Input: 0.1M * $3/1M = $0.3
        # Output: 0.05M * $15/1M = $0.75
        # Total: $1.05
        assert cost == 1.05


class TestGenerateDashboardHtml:
    """Test cases for generate_dashboard_html function."""

    def test_generate_dashboard(self, temp_team_dir):
        """Test generating HTML dashboard."""
        manager = TeamAnalyticsManager(temp_team_dir, role="admin")
        analytics = manager.analyze_team()

        output_path = temp_team_dir / "dashboard.html"
        generate_dashboard_html(analytics, output_path)

        assert output_path.exists()
        content = output_path.read_text()
        assert "Team Analytics Dashboard" in content
        assert "member1" in content
        assert "member2" in content

    def test_generate_dashboard_with_export_links(self, temp_team_dir):
        """Test generating dashboard with CSV/JSON links."""
        manager = TeamAnalyticsManager(temp_team_dir, role="admin")
        analytics = manager.analyze_team()

        csv_path = temp_team_dir / "report.csv"
        json_path = temp_team_dir / "report.json"

        # Create empty files for reference
        csv_path.touch()
        json_path.touch()

        output_path = temp_team_dir / "dashboard.html"
        generate_dashboard_html(analytics, output_path, csv_path, json_path)

        content = output_path.read_text()
        assert "report.csv" in content
        assert "report.json" in content
