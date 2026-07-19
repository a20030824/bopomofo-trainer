# Syllable validation notes

The parser requires each source syllable to contain a Bopomofo body followed by one explicit numeric tone (`1`–`5`). First tone is therefore data, not an omitted mark.

Legal bodies are validated against explicit zero-initial rimes and per-initial rime sets. This is stricter than checking only the order `initial → medial → final`: combinations that have a plausible shape but are absent from Mandarin, such as `ㄅㄩㄥ` or `ㄐㄨㄥ`, are rejected.

The validation approach follows the Ministry of Education's *國語注音符號手冊*, whose Mandarin syllable table identifies blank cells as absent combinations:

- https://language.moe.gov.tw/001/Upload/files/site_content/M0001/juyin/html_ch/index.html

The local table is an independently written program representation, not a copied image or transcription of the manual. Rare zero-initial forms `ㄧㄛ` and `ㄧㄞ` are retained so the parser does not silently narrow the official inventory to only high-frequency modern vocabulary.

This parser validates phonotactic form. It does not prove that a particular Chinese word has the supplied pronunciation; word-level reading provenance and review remain a separate catalog responsibility.
