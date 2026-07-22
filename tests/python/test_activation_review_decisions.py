from __future__ import annotations

import csv
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))

import validate_activation_review_decisions as validator  # noqa: E402


FIRST_APPROVED_TEXTS = {
    "我",
    "他",
    "你",
    "她",
    "它",
    "自己",
    "他們",
    "地方",
    "孩子",
    "一樣",
    "不會",
}
SECOND_APPROVED_TEXTS = {
    "重要",
    "美國",
    "中國",
    "政府",
    "社會",
    "世界",
    "活動",
    "公司",
    "民眾",
    "不同",
    "關係",
    "能夠",
    "不能",
    "事情",
    "最後",
    "國家",
    "方式",
    "必須",
    "走",
    "環境",
}
SECOND_HELD_TEXTS = {"名", "認為", "其", "件", "請"}
THIRD_APPROVED_TEXTS = {
    "文化", "大陸", "大學", "目前", "部分", "日本", "未來", "學校", "經濟",
    "當時", "過程", "感覺", "結果", "後來", "機會", "故事", "變成", "先生",
    "同時", "市場", "中心", "狀況", "身體", "生命", "歷史", "電影", "人員",
    "家庭", "經驗", "能力", "政治", "企業", "總統", "進入",
}
THIRD_HELD_TEXTS = {
    "無法", "指出", "條", "放", "其中", "使", "決定", "國際", "項", "起來",
    "誰", "隻", "令", "是否", "塊", "小時",
}


class ActivationReviewDecisionsTest(unittest.TestCase):
    def load_decisions(self) -> list[dict[str, str]]:
        return validator.load_csv(
            validator.DEFAULT_DECISIONS,
            validator.DECISION_FIELDS,
        )

    def load_second_decisions(self) -> list[dict[str, str]]:
        return validator.load_csv(
            validator.SECOND_DECISIONS,
            validator.DECISION_FIELDS,
        )

    def load_third_decisions(self) -> list[dict[str, str]]:
        return validator.load_csv(
            validator.THIRD_DECISIONS,
            validator.DECISION_FIELDS,
        )

    def active_catalog_texts(self) -> tuple[set[str], set[str]]:
        with (ROOT / "data/source/words.sample.csv").open(
            "r", encoding="utf-8-sig", newline=""
        ) as source:
            active_words = {row["text"] for row in csv.DictReader(source)}
        with (ROOT / "data/source/grammar.sample.csv").open(
            "r", encoding="utf-8-sig", newline=""
        ) as source:
            active_grammar = {row["text"] for row in csv.DictReader(source)}
        return active_words, active_grammar

    def write_decisions(
        self,
        path: Path,
        decisions: list[dict[str, str]],
    ) -> None:
        with path.open("w", encoding="utf-8", newline="") as destination:
            writer = csv.DictWriter(
                destination,
                fieldnames=validator.DECISION_FIELDS,
                lineterminator="\n",
            )
            writer.writeheader()
            writer.writerows(decisions)

    def test_first_committed_decisions_validate(self) -> None:
        result = validator.validate_files()
        self.assertEqual(result["reviewedCount"], 25)
        self.assertEqual(result["approvedCount"], 11)
        self.assertEqual(result["heldCount"], 14)
        self.assertEqual(
            result["determinismDigest"],
            validator.EXPECTED_DECISION_DIGEST,
        )

    def test_second_committed_decisions_validate(self) -> None:
        result = validator.validate_second_files()
        self.assertEqual(result["reviewedCount"], 25)
        self.assertEqual(result["approvedCount"], 20)
        self.assertEqual(result["heldCount"], 5)
        self.assertEqual(
            result["determinismDigest"],
            validator.SECOND_EXPECTED_DECISION_DIGEST,
        )

    def test_third_committed_decisions_validate(self) -> None:
        result = validator.validate_third_files()
        self.assertEqual(result["reviewedCount"], 50)
        self.assertEqual(result["approvedCount"], 34)
        self.assertEqual(result["heldCount"], 16)
        self.assertEqual(
            result["determinismDigest"],
            validator.THIRD_EXPECTED_DECISION_DIGEST,
        )

    def test_all_committed_decisions_validate_without_duplicate_pipeline(self) -> None:
        result = validator.validate_all_files()
        self.assertEqual(result["reviewedCount"], 100)
        self.assertEqual(result["approvedCount"], 65)
        self.assertEqual(result["heldCount"], 35)
        self.assertEqual(
            [item["name"] for item in result["slices"]],
            ["orders-1-25", "orders-26-50", "orders-51-100"],
        )

    def test_approved_identity_sets_are_explicit(self) -> None:
        first_approved = {
            row["text"]
            for row in self.load_decisions()
            if row["decision"] == "approved-existing-schema"
        }
        second_approved = {
            row["text"]
            for row in self.load_second_decisions()
            if row["decision"] == "approved-existing-schema"
        }
        second_held = {
            row["text"]
            for row in self.load_second_decisions()
            if row["decision"] != "approved-existing-schema"
        }
        third_approved = {
            row["text"]
            for row in self.load_third_decisions()
            if row["decision"] == "approved-existing-schema"
        }
        third_held = {
            row["text"]
            for row in self.load_third_decisions()
            if row["decision"] != "approved-existing-schema"
        }
        self.assertEqual(first_approved, FIRST_APPROVED_TEXTS)
        self.assertEqual(second_approved, SECOND_APPROVED_TEXTS)
        self.assertEqual(second_held, SECOND_HELD_TEXTS)
        self.assertEqual(third_approved, THIRD_APPROVED_TEXTS)
        self.assertEqual(third_held, THIRD_HELD_TEXTS)

    def test_review_decisions_match_activation_boundaries(self) -> None:
        first_decisions = self.load_decisions()
        first_held = {
            row["text"]
            for row in first_decisions
            if row["decision"] != "approved-existing-schema"
        }
        active_words, active_grammar = self.active_catalog_texts()

        self.assertEqual(active_words, active_grammar)
        self.assertTrue(FIRST_APPROVED_TEXTS.issubset(active_words))
        self.assertTrue(SECOND_APPROVED_TEXTS.issubset(active_words))
        self.assertTrue(THIRD_APPROVED_TEXTS.issubset(active_words))
        self.assertTrue(first_held.isdisjoint(active_words))
        self.assertTrue(SECOND_HELD_TEXTS.isdisjoint(active_words))
        self.assertTrue(SECOND_HELD_TEXTS.isdisjoint(active_grammar))
        self.assertTrue(THIRD_HELD_TEXTS.isdisjoint(active_words))
        self.assertTrue(THIRD_HELD_TEXTS.isdisjoint(active_grammar))

    def test_validator_rejects_latent_annotation_on_held_row(self) -> None:
        decisions = self.load_second_decisions()
        held = next(
            row for row in decisions if row["decision"] != "approved-existing-schema"
        )
        held["roles"] = "subject"
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "decisions.csv"
            self.write_decisions(path, decisions)
            with self.assertRaisesRegex(ValueError, "held row contains latent"):
                validator.validate_second_files(decisions_path=path)

    def test_validator_rejects_identity_drift(self) -> None:
        decisions = self.load_second_decisions()
        decisions[0]["general_rank"] = "999"
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "decisions.csv"
            self.write_decisions(path, decisions)
            with self.assertRaisesRegex(ValueError, "identity mismatch"):
                validator.validate_second_files(decisions_path=path)

    def test_validator_rejects_wrong_intransitive_annotation(self) -> None:
        decisions = self.load_second_decisions()
        walk = next(row for row in decisions if row["text"] == "走")
        walk["roles"] = "verb"
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "decisions.csv"
            self.write_decisions(path, decisions)
            with self.assertRaisesRegex(
                ValueError,
                "intransitive frame requires intransitive-predicate",
            ):
                validator.validate_second_files(decisions_path=path)

    def test_validator_rejects_wrong_transitive_annotation(self) -> None:
        decisions = self.load_third_decisions()
        enter = next(row for row in decisions if row["text"] == "進入")
        enter["roles"] = "verb"
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "decisions.csv"
            self.write_decisions(path, decisions)
            with self.assertRaisesRegex(
                ValueError,
                "transitive frame requires transitive-predicate",
            ):
                validator.validate_third_files(decisions_path=path)

    def test_validator_rejects_latent_annotation_on_third_held_row(self) -> None:
        decisions = self.load_third_decisions()
        held = next(
            row for row in decisions if row["decision"] != "approved-existing-schema"
        )
        held["roles"] = "subject"
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "decisions.csv"
            self.write_decisions(path, decisions)
            with self.assertRaisesRegex(ValueError, "held row contains latent"):
                validator.validate_third_files(decisions_path=path)


if __name__ == "__main__":
    unittest.main()
