"""Unit tests for parser helpers (no model weights required)."""

from __future__ import annotations

import unittest

from mock_marks import mock_marks
from parser import sort_reading_order, xyxy_pixels_to_normalized


class ParserHelpersTest(unittest.TestCase):
    def test_xyxy_pixels_to_normalized(self) -> None:
        result = xyxy_pixels_to_normalized(100, 200, 300, 400, 1000, 1000)
        self.assertEqual(result, (0.1, 0.2, 0.2, 0.2))

    def test_xyxy_rejects_tiny_boxes(self) -> None:
        self.assertIsNone(xyxy_pixels_to_normalized(10, 10, 10.5, 20, 1000, 1000))

    def test_sort_reading_order(self) -> None:
        marks = mock_marks(6, 0.0)
        ordered = sort_reading_order(marks)
        ys = [m.y for m in ordered]
        self.assertEqual(ys, sorted(ys))

    def test_mock_marks_respect_confidence(self) -> None:
        marks = mock_marks(6, 0.9)
        self.assertLessEqual(len(marks), 1)


if __name__ == "__main__":
    unittest.main()
