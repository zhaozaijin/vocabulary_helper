import io
import logging
import unittest

from fastapi.testclient import TestClient

from backend.app.main import app


class ApiLoggingTests(unittest.TestCase):
    def test_request_log_includes_method_path_status_and_duration(self):
        stream = io.StringIO()
        handler = logging.StreamHandler(stream)
        logger = logging.getLogger("vocabulary_helper.api")
        logger.addHandler(handler)
        logger.setLevel(logging.INFO)
        logger.propagate = False
        try:
            with TestClient(app) as client:
                response = client.get("/api/health")
            self.assertEqual(response.status_code, 200)
        finally:
            logger.removeHandler(handler)

        log_output = stream.getvalue()
        self.assertIn("method=GET", log_output)
        self.assertIn("path=/api/health", log_output)
        self.assertIn("status=200", log_output)
        self.assertIn("duration_ms=", log_output)


if __name__ == "__main__":
    unittest.main()
