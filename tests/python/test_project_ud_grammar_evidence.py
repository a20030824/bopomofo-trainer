from __future__ import annotations

import csv
import hashlib
import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))

import ud_grammar_evidence as adapter  # noqa: E402


def write_candidates(path: Path, texts: list[str]) -> None:
    with path.open("w", encoding="utf-8", newline="\n") as destination:
        writer = csv.DictWriter(
            destination,
            fieldnames=[
                "text", "status", "naer_general_rank", "written_per_million",
                "spoken_per_million", "provenance_ids",
            ],
        )
        writer.writeheader()
        for rank, text in enumerate(texts, start=1):
            writer.writerow({
                "text": text,
                "status": "provisional",
                "naer_general_rank": rank,
                "written_per_million": rank,
                "spoken_per_million": rank,
                "provenance_ids": "fixture",
            })


def token(
    identifier: int,
    form: str,
    lemma: str,
    upos: str,
    xpos: str,
    head: int,
    deprel: str,
    feats: str = "_",
) -> str:
    return "\t".join([
        str(identifier), form, lemma, upos, xpos, feats, str(head), deprel, "_", "_"
    ])


def sentence(lines: list[str], identifier: str) -> str:
    return f"# sent_id = {identifier}\n" + "\n".join(lines) + "\n\n"


class ProjectUdGrammarEvidenceTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.candidates = self.root / "candidates.csv"
        self.source_dir = self.root / "ud"
        self.source_dir.mkdir()
        write_candidates(self.candidates, ["甲", "乙", "丙"])
        train = "".join([
            sentence([
                token(1, "我", "我", "PRON", "PN", 2, "nsubj"),
                token(2, "甲", "甲", "VERB", "VV", 0, "root"),
                token(3, "乙", "乙", "NOUN", "NN", 2, "obj"),
            ], "s1"),
            sentence([
                token(1, "甲", "甲", "VERB", "VV", 0, "root"),
                token(2, "乙", "乙", "NOUN", "NN", 1, "obj"),
            ], "s2"),
            sentence([
                token(1, "甲", "甲", "VERB", "VV", 0, "root"),
                token(2, "乙", "別", "ADJ", "JJ", 1, "advmod"),
            ], "s3"),
            sentence([
                token(1, "甲", "甲", "VERB", "VV", 0, "root"),
                token(2, "乙", "別", "ADJ", "JJ", 1, "advmod"),
            ], "s4"),
        ])
        files = {
            "zh_gsd-ud-train.conllu": train,
            "zh_gsd-ud-dev.conllu": "",
            "zh_gsd-ud-test.conllu": "",
        }
        self.expected_files = {}
        for filename, content in files.items():
            path = self.source_dir / filename
            path.write_text(content, encoding="utf-8", newline="\n")
            data = path.read_bytes()
            self.expected_files[filename] = {
                "split": filename.removeprefix("zh_gsd-ud-").removesuffix(".conllu"),
                "byteSize": len(data),
                "sha256": hashlib.sha256(data).hexdigest(),
            }
        self.candidate_checksum = adapter.canonical_text_sha256(self.candidates)

    def project(self, checksum: str | None = None):
        return adapter.project(
            self.candidates,
            self.source_dir,
            expected_candidate_count=3,
            expected_candidate_checksum=checksum or self.candidate_checksum,
            expected_files=self.expected_files,
        )

    def test_projects_anonymous_full_syntax_evidence(self) -> None:
        evidence, coverage = self.project()
        rows = {row["text"]: row for row in evidence["rows"]}
        self.assertEqual(evidence["schemaVersion"], adapter.EVIDENCE_SCHEMA_VERSION)
        self.assertEqual(coverage["schemaVersion"], adapter.EVIDENCE_SCHEMA_VERSION)
        self.assertEqual(coverage["observedCandidateCount"], 2)
        self.assertEqual(coverage["unseenCandidateCount"], 1)
        self.assertEqual(coverage["matchedOccurrenceCount"], 8)
        self.assertEqual(
            rows["甲"]["verbEvidence"]["observedObjectFrame"],
            "mixed-object-evidence",
        )
        self.assertEqual(rows["甲"]["verbEvidence"]["withObjectDependentCount"], 2)
        self.assertEqual(rows["甲"]["verbEvidence"]["withoutObjectDependentCount"], 2)
        self.assertEqual(rows["甲"]["parentUposCounts"], {"ROOT": 4})
        self.assertEqual(rows["甲"]["headDirectionCounts"], {"root": 4})
        self.assertEqual(rows["甲"]["surfacePositionCounts"], {"initial": 3, "medial": 1})
        self.assertEqual(
            rows["甲"]["childRelationCounts"],
            {"advmod": 2, "nsubj": 1, "obj": 2},
        )
        self.assertEqual(
            rows["甲"]["valencySignatureCounts"],
            {"none": 2, "nsubj=1|obj=1": 1, "obj=1": 1},
        )
        self.assertEqual(rows["乙"]["uposCounts"], {"ADJ": 2, "NOUN": 2})
        profiles = {
            row["upos"]: row for row in rows["乙"]["syntaxProfileEvidence"]
        }
        self.assertEqual(profiles["ADJ"]["occurrenceCount"], 2)
        self.assertEqual(profiles["ADJ"]["dependencyRelationCounts"], {"advmod": 2})
        self.assertEqual(profiles["NOUN"]["occurrenceCount"], 2)
        self.assertEqual(profiles["NOUN"]["dependencyRelationCounts"], {"obj": 2})
        self.assertEqual(rows["乙"]["parentUposCounts"], {"VERB": 4})
        self.assertEqual(rows["乙"]["headDirectionCounts"], {"head-left": 4})
        self.assertEqual(rows["乙"]["lemmaDiagnostics"]["mismatchCount"], 2)
        self.assertFalse(rows["丙"]["observed"])
        review = {row["text"]: row["reasons"] for row in coverage["reviewQueue"]}
        self.assertEqual(review["甲"], ["mixed-object-frame-evidence"])
        self.assertEqual(review["乙"], ["mixed-upos-evidence"])
        self.assertEqual(review["丙"], ["unseen-in-treebank"])
        serialized = json.dumps({"evidence": evidence, "coverage": coverage}, ensure_ascii=False)
        self.assertNotIn("# sent_id", serialized)
        self.assertNotIn("我", serialized)
        self.assertNotIn("別", serialized)
        self.assertIn('"anonymousDependencySkeletons"', serialized)
        self.assertIn('"syntaxProfileEvidence"', serialized)
        self.assertIn('"upos": "VERB"', serialized)

    def test_rejects_candidate_checksum_drift(self) -> None:
        with self.assertRaisesRegex(ValueError, "candidate CSV canonical checksum mismatch"):
            self.project("0" * 64)

    def test_rejects_unknown_upos(self) -> None:
        path = self.source_dir / "zh_gsd-ud-train.conllu"
        content = sentence([token(1, "甲", "甲", "UNKNOWN", "XX", 0, "root")], "bad")
        path.write_text(content, encoding="utf-8", newline="\n")
        data = path.read_bytes()
        expected = dict(self.expected_files)
        expected[path.name] = {
            "split": "train",
            "byteSize": len(data),
            "sha256": hashlib.sha256(data).hexdigest(),
        }
        with self.assertRaisesRegex(ValueError, "unsupported UPOS"):
            adapter.project(
                self.candidates,
                self.source_dir,
                expected_candidate_count=3,
                expected_candidate_checksum=self.candidate_checksum,
                expected_files=expected,
            )

    def test_write_json_is_lf_stable(self) -> None:
        path = self.root / "output.json"
        adapter.write_json(path, {"text": "甲", "rows": [1, 2]})
        content = path.read_bytes()
        self.assertNotIn(b"\r\n", content)
        self.assertTrue(content.endswith(b"\n"))

if __name__ == "__main__":
    unittest.main()
