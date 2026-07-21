from __future__ import annotations

import hashlib
import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path
from types import ModuleType

ROOT = Path(__file__).resolve().parents[2]
PIPELINE = ROOT / "scripts" / "project-naer-top-1000.py"
SUMMARY = ROOT / "scripts" / "summarize-naer-reading-coverage.py"


def load_module(name: str, path: Path) -> ModuleType:
    specification = importlib.util.spec_from_file_location(name, path)
    if specification is None or specification.loader is None:
        raise RuntimeError(f"cannot load module: {path}")
    module = importlib.util.module_from_spec(specification)
    sys.modules[specification.name] = module
    specification.loader.exec_module(module)
    return module


class NaerTop1000LineEndingTest(unittest.TestCase):
    def setUp(self) -> None:
        self.pipeline = load_module("project_naer_top_1000_line_endings", PIPELINE)
        self.summary = load_module("summarize_naer_line_endings", SUMMARY)
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)

    def test_artifact_bytes_and_checksums_are_line_ending_invariant(self) -> None:
        lf = self.root / "lf.json"
        crlf = self.root / "crlf.json"
        lf.write_bytes(b'{"rows": []}\n')
        crlf.write_bytes(b'{"rows": []}\r\n')

        self.pipeline.canonicalize_text_file(lf)
        self.pipeline.canonicalize_text_file(crlf)

        expected = b'{"rows": []}\r\n'
        self.assertEqual(lf.read_bytes(), expected)
        self.assertEqual(crlf.read_bytes(), expected)
        self.assertEqual(self.summary.sha256_file(lf), self.summary.sha256_file(crlf))
        self.assertEqual(
            self.summary.sha256_file(lf),
            hashlib.sha256(expected).hexdigest(),
        )


if __name__ == "__main__":
    unittest.main()
