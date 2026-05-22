import unittest

from backend.app.aliyun_ocr import split_answer_text


class SplitAnswerTextTests(unittest.TestCase):
    def test_merges_extra_ocr_rows_by_expected_answer_lengths(self):
        payload = {
            "prism_wordsInfo": [
                {"word": "眼", "x": 20, "y": 10, "height": 20},
                {"word": "睛", "x": 22, "y": 42, "height": 20},
                {"word": "天气", "x": 20, "y": 90, "height": 20},
                {"word": "小河", "x": 20, "y": 140, "height": 20},
            ]
        }

        answers = split_answer_text(payload, ["眼睛", "天气", "小河"])

        self.assertEqual(answers, ["眼睛", "天气", "小河"])


if __name__ == "__main__":
    unittest.main()
