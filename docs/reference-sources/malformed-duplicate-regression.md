# Malformed duplicate regression

This regression protects the importer invariant that every recoverable non-empty source row identity participates in duplicate detection, even when the row also fails parsing or required-column mapping.

A rejected row keeps one error entry. Its original failure remains the primary `code`; duplicate status is represented by `relatedCodes` and the machine-readable `duplicate_identity_all_occurrences_rejected` reason. Summary reason counts may therefore overlap without inflating `rejectedCount`.
