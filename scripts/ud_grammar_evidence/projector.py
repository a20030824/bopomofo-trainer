from __future__ import annotations

import json
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Mapping

from .common import (
    ADAPTER_VERSION,
    DEFAULT_CANDIDATES,
    EVIDENCE_SCHEMA_VERSION,
    EXPECTED_CANDIDATE_CANONICAL_SHA256,
    EXPECTED_CANDIDATE_COUNT,
    EXPECTED_FILES,
    MIXED_VALENCY_MIN_COUNT,
    MIXED_VALENCY_MIN_SHARE,
    OBJECT_RELATIONS,
    SCHEMA_GAP_UPOS,
    SIGNIFICANT_UPOS_MIN_COUNT,
    SIGNIFICANT_UPOS_MIN_SHARE,
    SOURCE_ID,
    SOURCE_LICENSE,
    SOURCE_RELEASE,
    SOURCE_REPOSITORY,
    STRUCTURAL_RELATIONS,
    SUBJECT_RELATIONS,
    SUPPORTED_UPOS,
    VALENCY_RELATIONS,
    Candidate,
    Observation,
    SourceStats,
    Token,
    canonical_digest,
    canonical_json,
    canonical_text_sha256,
    iter_sentences,
    load_candidates,
    sha256_file,
    sorted_counter,
    validate_source_file,
)


def relation_base(deprel: str) -> str:
    return deprel.split(":", 1)[0]


def head_direction(token: Token, parent: Token | None) -> str:
    if token.head == 0 or parent is None:
        return "root"
    return "head-left" if parent.identifier < token.identifier else "head-right"


def child_direction(parent: Token, child: Token) -> str:
    return "child-left" if child.identifier < parent.identifier else "child-right"


def surface_position(index: int, total: int) -> str:
    if total <= 1:
        return "singleton"
    if index == 0:
        return "initial"
    if index == total - 1:
        return "final"
    return "medial"


def relation_signature(counter: Counter[str]) -> str:
    if not counter:
        return "none"
    return "|".join(f"{key}={counter[key]}" for key in sorted(counter))


def skeleton_node(
    token: Token,
    dependents: Mapping[int, list[Token]],
    *,
    direction: str,
    remaining_depth: int,
    visited: frozenset[int],
) -> dict[str, Any]:
    node: dict[str, Any] = {
        "upos": token.upos,
        "relation": relation_base(token.deprel),
        "direction": direction,
    }
    if remaining_depth <= 0 or token.identifier in visited:
        return node
    next_visited = visited | {token.identifier}
    children = [
        skeleton_node(
            child,
            dependents,
            direction=child_direction(token, child),
            remaining_depth=remaining_depth - 1,
            visited=next_visited,
        )
        for child in sorted(
            dependents.get(token.identifier, []),
            key=lambda item: (item.identifier, item.upos, item.deprel),
        )
        if child.identifier not in next_visited
    ]
    if children:
        node["children"] = children
    return node


def record_sentence(
    sentence: list[Token],
    split: str,
    candidate_set: set[str],
    observations: dict[str, Observation],
    stats: SourceStats,
) -> None:
    dependents: dict[int, list[Token]] = defaultdict(list)
    tokens_by_id = {token.identifier: token for token in sentence}
    ordered_sentence = sorted(sentence, key=lambda item: item.identifier)
    position_by_id = {
        token.identifier: index for index, token in enumerate(ordered_sentence)
    }
    for token in sentence:
        dependents[token.head].append(token)

    for token in sentence:
        if token.form not in candidate_set:
            continue
        stats.candidate_match_count += 1
        stats.observed_candidates.add(token.form)
        observation = observations[token.form]
        observation.occurrence_count += 1
        observation.source_occurrences[split] += 1
        observation.upos[token.upos] += 1
        observation.xpos[token.xpos] += 1
        observation.deprel[token.deprel] += 1
        if token.feats != "_":
            for feature in token.feats.split("|"):
                observation.features[feature] += 1

        parent = tokens_by_id.get(token.head)
        observation.parent_upos[parent.upos if parent is not None else "ROOT"] += 1
        observation.head_directions[head_direction(token, parent)] += 1
        observation.surface_positions[
            surface_position(position_by_id[token.identifier], len(ordered_sentence))
        ] += 1

        token_dependents = sorted(
            dependents.get(token.identifier, []),
            key=lambda item: (item.identifier, item.upos, item.deprel),
        )
        child_relation_counter: Counter[str] = Counter()
        valency_counter: Counter[str] = Counter()
        for child in token_dependents:
            base = relation_base(child.deprel)
            child_relation_counter[base] += 1
            observation.child_relations[base] += 1
            observation.child_direction_relations[
                f"{child_direction(token, child)}:{base}"
            ] += 1
            if base in VALENCY_RELATIONS:
                valency_counter[base] += 1
                observation.valency_relations[base] += 1
            if base in STRUCTURAL_RELATIONS:
                observation.construction_relations[f"child:{base}"] += 1
        own_relation = relation_base(token.deprel)
        if own_relation in STRUCTURAL_RELATIONS:
            observation.construction_relations[f"self:{own_relation}"] += 1
        observation.child_relation_multisets[
            relation_signature(child_relation_counter)
        ] += 1
        observation.valency_signatures[relation_signature(valency_counter)] += 1
        observation.anonymous_skeletons[canonical_json(skeleton_node(
            token,
            dependents,
            direction=head_direction(token, parent),
            remaining_depth=3,
            visited=frozenset(),
        ))] += 1

        if token.head == 0 or token.deprel == "root":
            observation.root_count += 1
        if token.lemma == "_":
            observation.lemma_missing_count += 1
        else:
            observation.lemmas.add(token.lemma)
            if token.lemma == token.form:
                observation.lemma_agreement_count += 1
            else:
                observation.lemma_mismatch_count += 1

        if token.upos != "VERB":
            continue
        observation.verbal_occurrence_count += 1
        subjects = [
            item for item in token_dependents
            if relation_base(item.deprel) in SUBJECT_RELATIONS
        ]
        objects = [
            item for item in token_dependents
            if relation_base(item.deprel) in OBJECT_RELATIONS
        ]
        has_subject = bool(subjects)
        has_object = bool(objects)
        observation.with_subject_dependent_count += int(has_subject)
        observation.with_object_dependent_count += int(has_object)
        observation.with_subject_and_object_dependent_count += int(has_subject and has_object)
        observation.without_object_dependent_count += int(not has_object)
        observation.subject_dependent_token_count += len(subjects)
        observation.object_dependent_token_count += len(objects)


def dominant_upos(observation: Observation) -> list[str]:
    if not observation.upos:
        return []
    maximum = max(observation.upos.values())
    return sorted(tag for tag, count in observation.upos.items() if count == maximum)


def significant_upos(observation: Observation) -> list[str]:
    if observation.occurrence_count == 0:
        return []
    return sorted(
        tag for tag, count in observation.upos.items()
        if count >= SIGNIFICANT_UPOS_MIN_COUNT
        and count / observation.occurrence_count >= SIGNIFICANT_UPOS_MIN_SHARE
    )


def observed_object_frame(observation: Observation) -> str:
    if observation.verbal_occurrence_count == 0:
        return "not-observed-as-verb"
    if observation.with_object_dependent_count and observation.without_object_dependent_count:
        return "mixed-object-evidence"
    if observation.with_object_dependent_count:
        return "object-bearing-only"
    return "objectless-only"


def mixed_object_evidence_is_significant(observation: Observation) -> bool:
    total = observation.verbal_occurrence_count
    if total == 0:
        return False
    object_count = observation.with_object_dependent_count
    objectless_count = observation.without_object_dependent_count
    return (
        object_count >= MIXED_VALENCY_MIN_COUNT
        and objectless_count >= MIXED_VALENCY_MIN_COUNT
        and object_count / total >= MIXED_VALENCY_MIN_SHARE
        and objectless_count / total >= MIXED_VALENCY_MIN_SHARE
    )


def skeleton_rows(observation: Observation) -> list[dict[str, Any]]:
    return [
        {"count": observation.anonymous_skeletons[key], "skeleton": json.loads(key)}
        for key in sorted(observation.anonymous_skeletons)
    ]


def evidence_row(candidate: Candidate, observation: Observation) -> dict[str, Any]:
    row: dict[str, Any] = {
        "generalRank": candidate.general_rank,
        "text": candidate.text,
        "observed": observation.occurrence_count > 0,
        "occurrenceCount": observation.occurrence_count,
    }
    if observation.occurrence_count == 0:
        return row
    row.update({
        "sourceOccurrenceCounts": sorted_counter(observation.source_occurrences),
        "uposCounts": sorted_counter(observation.upos),
        "dominantUpos": dominant_upos(observation),
        "xposCounts": sorted_counter(observation.xpos),
        "dependencyRelationCounts": sorted_counter(observation.deprel),
        "parentUposCounts": sorted_counter(observation.parent_upos),
        "headDirectionCounts": sorted_counter(observation.head_directions),
        "surfacePositionCounts": sorted_counter(observation.surface_positions),
        "childRelationCounts": sorted_counter(observation.child_relations),
        "childDirectionRelationCounts": sorted_counter(
            observation.child_direction_relations
        ),
        "childRelationMultisetCounts": sorted_counter(
            observation.child_relation_multisets
        ),
        "valencyRelationCounts": sorted_counter(observation.valency_relations),
        "valencySignatureCounts": sorted_counter(observation.valency_signatures),
        "constructionRelationCounts": sorted_counter(
            observation.construction_relations
        ),
        "anonymousDependencySkeletons": skeleton_rows(observation),
        "lemmaDiagnostics": {
            "agreementCount": observation.lemma_agreement_count,
            "mismatchCount": observation.lemma_mismatch_count,
            "missingCount": observation.lemma_missing_count,
            "distinctObservedLemmaCount": len(observation.lemmas),
        },
    })
    if observation.features:
        row["morphologicalFeatureCounts"] = sorted_counter(observation.features)
    if observation.root_count:
        row["rootCount"] = observation.root_count
    if observation.verbal_occurrence_count:
        row["verbEvidence"] = {
            "verbalOccurrenceCount": observation.verbal_occurrence_count,
            "withSubjectDependentCount": observation.with_subject_dependent_count,
            "withObjectDependentCount": observation.with_object_dependent_count,
            "withSubjectAndObjectDependentCount": observation.with_subject_and_object_dependent_count,
            "withoutObjectDependentCount": observation.without_object_dependent_count,
            "subjectDependentTokenCount": observation.subject_dependent_token_count,
            "objectDependentTokenCount": observation.object_dependent_token_count,
            "observedObjectFrame": observed_object_frame(observation),
        }
    return row


def rank_bucket_summary(
    candidates: list[Candidate], observations: dict[str, Observation]
) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    for start, end in ((1, 100), (101, 250), (251, 500), (501, 1_000)):
        selected = [item for item in candidates if start <= item.general_rank <= end]
        observed = sum(observations[item.text].occurrence_count > 0 for item in selected)
        result.append({
            "startRank": start,
            "endRank": end,
            "candidateCount": len(selected),
            "observedCandidateCount": observed,
            "unseenCandidateCount": len(selected) - observed,
            "matchedOccurrenceCount": sum(
                observations[item.text].occurrence_count for item in selected
            ),
        })
    return result


def project(
    candidate_path: Path,
    source_dir: Path,
    *,
    expected_candidate_count: int = EXPECTED_CANDIDATE_COUNT,
    expected_candidate_checksum: str = EXPECTED_CANDIDATE_CANONICAL_SHA256,
    expected_files: Mapping[str, Mapping[str, Any]] = EXPECTED_FILES,
) -> tuple[dict[str, Any], dict[str, Any]]:
    candidates = load_candidates(
        candidate_path,
        expected_candidate_count,
        expected_candidate_checksum,
    )
    candidate_set = {item.text for item in candidates}
    observations = {text: Observation() for text in candidate_set}
    source_stats: list[SourceStats] = []
    for filename in expected_files:
        path = source_dir / filename
        if not path.is_file():
            raise ValueError(f"missing UD source file: {path}")
        split = validate_source_file(path, expected_files)
        stats = SourceStats(filename, split, path.stat().st_size, sha256_file(path))
        for sentence in iter_sentences(path, stats):
            record_sentence(sentence, split, candidate_set, observations, stats)
        source_stats.append(stats)

    rows = [evidence_row(item, observations[item.text]) for item in candidates]
    evidence_core = {
        "schemaVersion": EVIDENCE_SCHEMA_VERSION,
        "candidateCount": len(candidates),
        "rows": rows,
    }
    evidence = {
        "adapterVersion": ADAPTER_VERSION,
        "schemaVersion": EVIDENCE_SCHEMA_VERSION,
        "source": {
            "sourceId": SOURCE_ID,
            "release": SOURCE_RELEASE,
            "repository": SOURCE_REPOSITORY,
            "license": SOURCE_LICENSE,
            "files": [{
                "filename": stats.filename,
                "split": stats.split,
                "byteSize": stats.byte_size,
                "checksumSha256": stats.checksum_sha256,
                "sentenceCount": stats.sentence_count,
                "syntacticTokenCount": stats.syntactic_token_count,
                "multiwordTokenLineCount": stats.multiword_token_line_count,
                "emptyNodeLineCount": stats.empty_node_line_count,
                "candidateMatchCount": stats.candidate_match_count,
                "observedCandidateCount": len(stats.observed_candidates),
            } for stats in source_stats],
            "redistributionBoundary": (
                "complete CoNLL-U files and source sentences remain local; committed "
                "outputs contain only aggregate anonymous syntax evidence for the "
                "pinned NAER top-1,000 candidate identities"
            ),
        },
        "candidateSource": {
            "path": DEFAULT_CANDIDATES.as_posix(),
            "canonicalChecksumSha256": canonical_text_sha256(candidate_path),
        },
        **evidence_core,
        "determinismDigest": canonical_digest(evidence_core),
        "policy": {
            "exactMatchField": "FORM",
            "automaticProductGrammarRoleAssignment": "forbidden",
            "dictionaryGlossInference": "forbidden",
            "sourceSentenceEmission": "forbidden",
            "nonCandidateLexicalStringEmission": "forbidden",
            "anonymousSkeletonMaximumDepth": 3,
        },
    }

    total_upos: Counter[str] = Counter()
    dominant_counts: Counter[str] = Counter()
    total_dependencies: Counter[str] = Counter()
    total_parent_upos: Counter[str] = Counter()
    total_valency: Counter[str] = Counter()
    total_constructions: Counter[str] = Counter()
    for item in candidates:
        observation = observations[item.text]
        total_upos.update(observation.upos)
        dominant_counts.update(dominant_upos(observation))
        total_dependencies.update(observation.deprel)
        total_parent_upos.update(observation.parent_upos)
        total_valency.update(observation.valency_relations)
        total_constructions.update(observation.construction_relations)

    review_queue: list[dict[str, Any]] = []
    reason_counts: Counter[str] = Counter()
    for item in candidates:
        observation = observations[item.text]
        reasons: list[str] = []
        significant = significant_upos(observation)
        if observation.occurrence_count == 0:
            reasons.append("unseen-in-treebank")
        if len(significant) > 1:
            reasons.append("mixed-upos-evidence")
        if mixed_object_evidence_is_significant(observation):
            reasons.append("mixed-object-frame-evidence")
        if reasons:
            reason_counts.update(reasons)
            review_queue.append({
                "generalRank": item.general_rank,
                "text": item.text,
                "reasons": reasons,
                "occurrenceCount": observation.occurrence_count,
                "significantUpos": significant,
                "verbObjectFrame": observed_object_frame(observation),
            })

    observed_count = sum(item.occurrence_count > 0 for item in observations.values())
    coverage_core = {
        "schemaVersion": EVIDENCE_SCHEMA_VERSION,
        "candidateCount": len(candidates),
        "observedCandidateCount": observed_count,
        "unseenCandidateCount": len(candidates) - observed_count,
        "matchedOccurrenceCount": sum(item.occurrence_count for item in observations.values()),
        "rankBuckets": rank_bucket_summary(candidates, observations),
        "supportedUpos": list(SUPPORTED_UPOS),
        "totalUposOccurrenceCounts": sorted_counter(total_upos),
        "dominantUposCandidateCounts": sorted_counter(dominant_counts),
        "totalDependencyRelationCounts": sorted_counter(total_dependencies),
        "totalParentUposCounts": sorted_counter(total_parent_upos),
        "totalValencyRelationCounts": sorted_counter(total_valency),
        "totalConstructionRelationCounts": sorted_counter(total_constructions),
        "lemmaDiagnostics": {
            "agreementCount": sum(item.lemma_agreement_count for item in observations.values()),
            "mismatchCount": sum(item.lemma_mismatch_count for item in observations.values()),
            "missingCount": sum(item.lemma_missing_count for item in observations.values()),
            "candidateCountWithMismatch": sum(
                item.lemma_mismatch_count > 0 for item in observations.values()
            ),
        },
        "reviewPolicy": {
            "mixedUpos": {
                "minimumCountPerCategory": SIGNIFICANT_UPOS_MIN_COUNT,
                "minimumOccurrenceSharePerCategory": SIGNIFICANT_UPOS_MIN_SHARE,
            },
            "mixedObjectFrame": {
                "minimumCountPerFrame": MIXED_VALENCY_MIN_COUNT,
                "minimumVerbOccurrenceSharePerFrame": MIXED_VALENCY_MIN_SHARE,
            },
        },
        "reviewReasonCounts": sorted_counter(reason_counts),
        "reviewCandidateCount": len(review_queue),
        "reviewQueue": review_queue,
        "schemaGapAudit": {
            "legacyProductGrammarRoleSnapshot": "grammar-role-v1",
            "legacyUposWithoutDedicatedTemplateSlot": list(SCHEMA_GAP_UPOS),
            "formalSyntaxSnapshot": "mandarin-formal-grammar-v1",
            "formalSyntaxUnsupportedUpos": [],
            "dominantCandidateCountsForLegacyGapCategories": {
                tag: dominant_counts[tag] for tag in SCHEMA_GAP_UPOS if dominant_counts[tag]
            },
            "interpretationBoundary": (
                "UPOS and dependency evidence create formal syntax profiles only; "
                "they do not assign meaning, semantic roles, or plausibility"
            ),
        },
    }
    coverage = {
        "adapterVersion": ADAPTER_VERSION,
        "schemaVersion": EVIDENCE_SCHEMA_VERSION,
        "sourceId": SOURCE_ID,
        "release": SOURCE_RELEASE,
        "evidenceDigest": evidence["determinismDigest"],
        **coverage_core,
        "determinismDigest": canonical_digest(coverage_core),
    }
    return evidence, coverage
