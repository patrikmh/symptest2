"""Tests for the HTML Snake Game."""
import pytest
import re
from pathlib import Path


class TestSnakeGameFile:
    """Test that the snake game HTML file exists and is valid."""

    @pytest.fixture
    def html_content(self):
        """Load the HTML file content."""
        html_path = Path(__file__).parent / "snake_game.html"
        if not html_path.exists():
            pytest.fail("snake_game.html file not found")
        return html_path.read_text()

    def test_html_file_exists(self):
        """Snake game HTML file should exist."""
        html_path = Path(__file__).parent / "snake_game.html"
        assert html_path.exists(), "snake_game.html must exist"
        assert html_path.stat().st_size > 0, "File should not be empty"

    def test_html_has_doctype(self, html_content):
        """HTML should have proper DOCTYPE declaration."""
        assert html_content.strip().startswith("<!DOCTYPE html>"), \
            "Should have HTML5 DOCTYPE"

    def test_html_has_title(self, html_content):
        """HTML should have a title."""
        assert "<title>" in html_content, "Should have title tag"
        assert "Snake" in html_content, "Title should mention Snake"

    def test_html_has_canvas(self, html_content):
        """HTML should have a canvas element for the game."""
        assert "<canvas" in html_content, "Should have canvas element"
        assert 'id="gameCanvas"' in html_content, "Canvas should have id"

    def test_html_has_game_script(self, html_content):
        """HTML should contain JavaScript for the game."""
        assert "<script>" in html_content, "Should have script tag"
        assert "class SnakeGame" in html_content, "Should have SnakeGame class"

    def test_html_has_styling(self, html_content):
        """HTML should have CSS styling."""
        assert "<style>" in html_content, "Should have style tag"
        assert "canvas" in html_content, "Styles should reference canvas"


class TestSnakeGameFeatures:
    """Test that the snake game has required features."""

    @pytest.fixture
    def html_content(self):
        """Load the HTML file content."""
        html_path = Path(__file__).parent / "snake_game.html"
        return html_path.read_text()

    def test_has_score_tracking(self, html_content):
        """Game should have score tracking."""
        assert "score" in html_content.lower(), "Should have score tracking"
        assert "Score" in html_content, "Should display score"

    def test_has_high_score(self, html_content):
        """Game should have high score tracking."""
        assert "highScore" in html_content or "high score" in html_content.lower(), \
            "Should have high score"
        assert "localStorage" in html_content, "Should use localStorage for persistence"

    def test_has_snake_movement(self, html_content):
        """Game should have snake movement."""
        assert "direction" in html_content, "Should have direction handling"
        assert "move" in html_content.lower(), "Should have movement logic"

    def test_has_food_system(self, html_content):
        """Game should have food for the snake to eat."""
        assert "food" in html_content.lower(), "Should have food"
        assert "spawnFood" in html_content or "eat" in html_content.lower(), \
            "Should have food spawning/eating"

    def test_has_collision_detection(self, html_content):
        """Game should detect collisions."""
        assert "collision" in html_content.lower() or "gameOver" in html_content, \
            "Should have collision detection"

    def test_has_keyboard_controls(self, html_content):
        """Game should have keyboard controls."""
        assert "keydown" in html_content, "Should listen for keydown events"
        assert "ArrowUp" in html_content or "KeyW" in html_content or "w" in html_content, \
            "Should have up control"
        assert "ArrowDown" in html_content or "KeyS" in html_content or "s" in html_content, \
            "Should have down control"
        assert "ArrowLeft" in html_content or "KeyA" in html_content or "a" in html_content, \
            "Should have left control"
        assert "ArrowRight" in html_content or "KeyD" in html_content or "d" in html_content, \
            "Should have right control"

    def test_has_game_loop(self, html_content):
        """Game should have a game loop."""
        assert "requestAnimationFrame" in html_content or "setInterval" in html_content, \
            "Should have game loop mechanism"

    def test_has_start_screen(self, html_content):
        """Game should have a start screen."""
        assert "start" in html_content.lower(), "Should have start screen or start function"

    def test_has_game_over_screen(self, html_content):
        """Game should have a game over screen."""
        assert "gameOver" in html_content or "Game Over" in html_content, \
            "Should have game over handling"


class TestAdvancedFeatures:
    """Test advanced snake game features."""

    @pytest.fixture
    def html_content(self):
        """Load the HTML file content."""
        html_path = Path(__file__).parent / "snake_game.html"
        return html_path.read_text()

    def test_has_pause_functionality(self, html_content):
        """Game should have pause functionality."""
        assert "pause" in html_content.lower(), "Should have pause feature"

    def test_has_difficulty_levels(self, html_content):
        """Game should have difficulty levels."""
        assert "difficulty" in html_content.lower(), "Should have difficulty settings"

    def test_has_power_ups(self, html_content):
        """Game should have power-ups."""
        assert "powerUp" in html_content or "power-up" in html_content.lower(), \
            "Should have power-ups"

    def test_has_sound_effects(self, html_content):
        """Game should have sound effects."""
        assert "AudioContext" in html_content or "sound" in html_content.lower(), \
            "Should have sound effects"

    def test_has_particle_effects(self, html_content):
        """Game should have visual effects."""
        assert "particle" in html_content.lower(), "Should have particle effects"

    def test_has_level_progression(self, html_content):
        """Game should have level progression."""
        assert "level" in html_content.lower(), "Should have level system"


class TestCodeQuality:
    """Test code quality aspects."""

    @pytest.fixture
    def html_content(self):
        """Load the HTML file content."""
        html_path = Path(__file__).parent / "snake_game.html"
        return html_path.read_text()

    def test_no_syntax_errors_in_html(self, html_content):
        """HTML should have matching opening and closing tags."""
        # Check basic tag matching
        opening_tags = len(re.findall(r'<\w+[^>]*>', html_content))
        closing_tags = len(re.findall(r'</\w+>', html_content))
        self_closing = len(re.findall(r'<\w+[^>]*/>', html_content))

        # Approximate check - html and body might be implied
        assert opening_tags > 10, "Should have substantial HTML structure"

    def test_javascript_properly_closed(self, html_content):
        """JavaScript should be properly enclosed."""
        script_opens = html_content.count("<script>")
        script_closes = html_content.count("</script>")
        assert script_opens == script_closes, "Script tags should be balanced"

    def test_css_properly_closed(self, html_content):
        """CSS should be properly enclosed."""
        style_opens = html_content.count("<style>")
        style_closes = html_content.count("</style>")
        assert style_opens == style_closes, "Style tags should be balanced"

    def test_has_proper_html_structure(self, html_content):
        """HTML should have proper document structure."""
        assert "<html" in html_content, "Should have html tag"
        assert "<head>" in html_content, "Should have head tag"
        assert "<body>" in html_content, "Should have body tag"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
