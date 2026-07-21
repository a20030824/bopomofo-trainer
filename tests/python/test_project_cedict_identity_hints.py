from __future__ import annotations

import csv
import hashlib
import importlib.util
import json
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path
from types import ModuleType

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts" / "project-cedict-identity-hints.py"


def load_adapter() -> ModuleType:
    specification = importlib.util.spec_from_file_location("project_cedict_identity_hints", SCRIPT)
    if specification is None or specification.loader is None:
        raise RuntimeError(f"cannot load adapter: {SCRIPT}")
    module = importlib.util.module_from_spec(specification)
    sys.modules[specification.name] = module
    specification.loader.exec_module(module)
    return module


def fixture_candidates(path: Path, texts: list[str]) -> None:
    with path.open("w", encoding="utf-8", newline="") as destination:
        writer = csv.DictWriter(destination, fieldnames=["text", "status"])
        writer.writeheader()
        for text in texts:
            writer.writerow({"text": text, "status": "provisional"})


def fixture_concised(path: Path, candidates: list[str], accepted: list[str]) -> None:
    payload = {
        "adapterVersion": "moe-concised-reading-adapter-v1",
        "source": {"sourceVersion": "2014_20260626"},
        "candidateSet": {
            "entryCount": len(candidates),
            "normalizedTextCount": len(set(candidates)),
        },
        "rows": [{"lookupText": text} for text in accepted],
        "diagnostics": {},
    }
    path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")


def fixture_revised(path: Path, fallback_candidates: list[str], accepted: list[str]) -> None:
    payload = {
        "adapterVersion": "moe-revised-reading-fallback-adapter-v1",
        "source": {"sourceVersion": "2015_20260625"},
        "fallbackBasis": {"fallbackCandidateTexts": fallback_candidates},
        "rows": [{"lookupText": text} for text in accepted],
        "diagnostics": {},
    }
    path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")


def source_checksum(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


class ProjectCedictIdentityHintsTest(unittest.TestCase):
    def setUp(self) -> None:
        self.adapter = load_adapter()
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.dictionary = self.root / "cedict.u8"
        self.candidates = self.root / "candidates.csv"
        self.concised = self.root / "concised.json"
        self.revised = self.root / "revised.json"

    def project(self, candidates: list[str], concised: list[str], revised: list[str]) -> dict:
        fixture_candidates(self.candidates, candidates)
        fixture_concised(self.concised, candidates, concised)
        fallback = [text for text in candidates if text not in concised]
        fixture_revised(self.revised, fallback, revised)
        return self.adapter.project_identity_hints(
            self.dictionary,
            source_checksum(self.dictionary),
            "fixture-v1",
            self.candidates,
            self.concised,
            self.revised,
        )

    def test_parses_v1_and_v2_and_targets_only_moe_unresolved(self) -> None:
        self.dictionary.write_text(
            "# fixture\n"
            "台灣 台湾 [Tai2 wan1] /Taiwan/\n"
            "很好 很好 [[hen3hao3]] /very good/\n"
            "已解 已解 [[yi3jie3]] /resolved already/\n",
            encoding="utf-8",
        )
        payload = self.project(["台灣", "很好", "已解"], ["已解"], [])

        self.assertEqual(payload["resolutionBasis"]["cedictTargetTexts"], ["台灣", "很好"])
        records = {row["lookupText"]: row["records"][0] for row in payload["rows"]}
        self.assertEqual(records["台灣"]["formatVersion"], 1)
        self.assertEqual(records["很好"]["formatVersion"], 2)
        self.assertEqual(payload["source"]["format"]["v1EntryCount"], 1)
        self.assertEqual(payload["source"]["format"]["v2EntryCount"], 2)
        self.assertNotIn("已解", payload["resolutionBasis"]["cedictTargetTexts"])

    def test_emits_alias_variant_classifier_and_name_hints(self) -> None:
        self.dictionary.write_text(
            "台灣 台湾 [[Tai2wan1]] /Taiwan/CL:個|个[ge4]/\n"
            "臺灣 台湾 [[Tai2wan1]] /variant of 台灣|台湾[Tai2wan1]/\n",
            encoding="utf-8",
        )
        payload = self.project(["台湾", "臺灣"], [], [])
        rows = {row["lookupText"]: row for row in payload["rows"]}

        simplified = rows["台湾"]["records"]
        self.assertEqual(len(simplified), 2)
        self.assertTrue(all("simplified" in record["matchKinds"] for record in simplified))
        self.assertEqual(
            {record["canonicalTraditionalHint"] for record in simplified},
            {"台灣", "臺灣"},
        )
        self.assertTrue(any(record["hasClassifierHint"] for record in simplified))
        self.assertTrue(all(record["properNameHint"] for record in simplified))
        self.assertEqual(
            rows["臺灣"]["records"][0]["variantTargets"],
            [{"traditional": "台灣", "simplified": "台湾", "pinyin": "Tai2wan1"}],
        )

    def test_keeps_multiple_pinyin_records_ambiguous(self) -> None:
        self.dictionary.write_text(
            "東西 东西 [[dong1xi1]] /east and west/\n"
            "東西 东西 [[dong1xi5]] /thing; stuff/\n",
            encoding="utf-8",
        )
        payload = self.project(["東西"], [], [])

        self.assertEqual(payload["rows"][0]["status"], "ambiguous-records")
        self.assertEqual(
            [record["pinyin"] for record in payload["rows"][0]["records"]],
            ["dong1xi1", "dong1xi5"],
        )
        self.assertEqual(payload["diagnostics"]["ambiguousRecordTexts"], ["東西"])

    def test_does_not_emit_english_definitions(self) -> None:
        secret = "sensitive gloss that must not be copied"
        self.dictionary.write_text(
            f"看到 看到 [[kan4dao4]] /{secret}/\n",
            encoding="utf-8",
        )
        rendered = json.dumps(self.project(["看到"], [], []), ensure_ascii=False)
        self.assertNotIn(secret, rendered)

    def test_rejects_checksum_mismatch(self) -> None:
        self.dictionary.write_text("看到 看到 [[kan4dao4]] /to see/\n", encoding="utf-8")
        fixture_candidates(self.candidates, ["看到"])
        fixture_concised(self.concised, ["看到"], [])
        fixture_revised(self.revised, ["看到"], [])
        with self.assertRaisesRegex(ValueError, "checksum"):
            self.adapter.project_identity_hints(
                self.dictionary,
                "0" * 64,
                "fixture-v1",
                self.candidates,
                self.concised,
                self.revised,
            )

    def test_reads_single_data_member_from_zip(self) -> None:
        archive_path = self.root / "cedict.zip"
        with zipfile.ZipFile(archive_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            archive.writestr("README.txt.md", "ignored")
            archive.writestr("cedict_ts.u8", "看到 看到 [[kan4dao4]] /to see/\n")
        fixture_candidates(self.candidates, ["看到"])
        fixture_concised(self.concised, ["看到"], [])
        fixture_revised(self.revised, ["看到"], [])

        payload = self.adapter.project_identity_hints(
            archive_path,
            source_checksum(archive_path),
            "fixture-zip",
            self.candidates,
            self.concised,
            self.revised,
        )
        self.assertEqual(payload["source"]["archiveMember"], "cedict_ts.u8")
        self.assertEqual(payload["rows"][0]["lookupText"], "看到")

    def test_output_is_deterministic(self) -> None:
        self.dictionary.write_text(
            "很好 很好 [[hen3hao3]] /very good/\n"
            "看到 看到 [[kan4dao4]] /to see/\n",
            encoding="utf-8",
        )
        first = self.project(["看到", "很好"], [], [])
        second = self.project(["看到", "很好"], [], [])
        self.assertEqual(
            json.dumps(first, ensure_ascii=False, sort_keys=True),
            json.dumps(second, ensure_ascii=False, sort_keys=True),
        )


if __name__ == "__main__":
    unittest.main()
