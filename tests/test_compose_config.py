"""Validate deployment configuration without starting containers or services."""
import json
import os
from pathlib import Path
import shlex
import shutil
import subprocess
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
COMPOSE = shlex.split(os.environ.get("COMPOSE_COMMAND", "docker compose"))


class ComposeConfigTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if not COMPOSE or not shutil.which(COMPOSE[0]):
            raise unittest.SkipTest("Docker Compose CLI is not installed")
        result = subprocess.run(COMPOSE + ["version"], capture_output=True)
        if result.returncode:
            raise unittest.SkipTest("Docker Compose CLI is not available")

    def compose(self, values=None, env_file=None):
        # Do not inherit developer/production credentials or a local deploy/.env.
        env = {k: os.environ[k] for k in ("PATH", "HOME", "SYSTEMROOT") if k in os.environ}
        env.update(values or {})
        with tempfile.TemporaryDirectory() as folder:
            empty_env = Path(folder) / "empty.env"
            empty_env.write_text("")
            return subprocess.run(
                COMPOSE + ["--env-file", str(env_file or empty_env),
                           "-f", str(ROOT / "deploy/docker-compose.yml"),
                           "config", "--format", "json"],
                env=env, capture_output=True, text=True,
            )

    def test_each_password_is_required_even_when_empty(self):
        for name in ("POSTGRES_PASSWORD", "MINIO_ROOT_PASSWORD"):
            for empty in (False, True):
                with self.subTest(name=name, empty=empty):
                    values = {"POSTGRES_PASSWORD": "test-only-db", "MINIO_ROOT_PASSWORD": "test-only-storage"}
                    if empty:
                        values[name] = ""
                    else:
                        del values[name]
                    result = self.compose(values)
                    self.assertNotEqual(result.returncode, 0)
                    self.assertIn(name, result.stderr)

    def test_example_cannot_start_without_passwords(self):
        result = self.compose(env_file=ROOT / "deploy/.env.example")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("POSTGRES_PASSWORD", result.stderr)

    def test_credentials_and_default_port_bindings(self):
        result = self.compose({"POSTGRES_PASSWORD": "test-only-db", "MINIO_ROOT_PASSWORD": "test-only-storage"})
        self.assertEqual(result.returncode, 0, result.stderr)
        services = json.loads(result.stdout)["services"]
        self.assertEqual(services["postgres"]["environment"]["POSTGRES_PASSWORD"], "test-only-db")
        self.assertIn(":test-only-db@postgres:", services["backend"]["environment"]["DATABASE_URL"])
        self.assertEqual(services["backend"]["environment"]["S3_SECRET_ACCESS_KEY"], "test-only-storage")
        self.assertEqual(services["minio"]["environment"]["MINIO_ROOT_PASSWORD"], "test-only-storage")
        for name in ("backend", "frontend", "minio"):
            for port in services[name]["ports"]:
                self.assertEqual(port["host_ip"], "127.0.0.1")
        for name in ("postgres", "redis"):
            self.assertFalse(services[name].get("ports"))

    def test_frontend_override_keeps_admin_ports_local(self):
        result = self.compose({"POSTGRES_PASSWORD": "test-only-db", "MINIO_ROOT_PASSWORD": "test-only-storage",
                               "FRONTEND_BIND_HOST": "0.0.0.0", "FRONTEND_PORT": "8080"})
        self.assertEqual(result.returncode, 0, result.stderr)
        services = json.loads(result.stdout)["services"]
        self.assertEqual(services["frontend"]["ports"][0]["host_ip"], "0.0.0.0")
        self.assertEqual(str(services["frontend"]["ports"][0]["published"]), "8080")
        for name in ("backend", "minio"):
            self.assertTrue(all(p["host_ip"] == "127.0.0.1" for p in services[name]["ports"]))


if __name__ == "__main__":
    unittest.main()
