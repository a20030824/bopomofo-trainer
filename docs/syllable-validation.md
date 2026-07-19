# Syllable validation notes

The parser requires each source syllable to contain a Bopomofo body followed by one explicit numeric tone (`1`–`5`). First tone is therefore data, not an omitted mark.

## V1 boundary

The validator answers a deliberately narrow question:

> Is this a supported standalone syllable body for the Phase 1 pure-Han catalog format?

It does not claim to model every theoretically possible Mandarin sound. The Phase 1 source format assumes one standalone syllable per Han character, so attached erhua forms and official table cells without a standalone catalog character remain outside this validator.

The implementation uses explicit zero-initial rimes and per-initial rime sets. This is stricter than checking only the shape `initial → medial → final`: plausible-looking but unsupported combinations such as `ㄅㄩㄥ`, `ㄐㄨㄥ`, and `ㄕㄨㄥ` are rejected.

## References and audit

The validation approach follows the Ministry of Education's *國語注音符號手冊*, whose Mandarin syllable table distinguishes present combinations, absent combinations, and sounds without a corresponding character:

- https://language.moe.gov.tw/001/Upload/files/site_content/M0001/juyin/html_ch/index.html

The inventory was additionally checked against entries in the Ministry of Education *Revised Mandarin Chinese Dictionary*. That audit caught uncommon standalone forms that a high-frequency word sample did not exercise, including:

- `ㄉㄣ` — `㩐`
- `ㄋㄨㄣ` — `黁`
- `ㄌㄛ` — neutral-tone `咯`
- `ㄌㄩㄢ` — `攣`, as in `痙攣`
- `ㄧㄛ` — `唷`
- `ㄧㄞ` — `崖`

`ㄋㄧㄚ` is intentionally not accepted as a standalone Phase 1 body because the current format has no representation for attached erhua such as `ㄋㄧㄚㄦ`. Supporting that category requires a separate source and tokenization decision rather than silently treating it as an ordinary character syllable.

The local table is an independently written program representation, not a copied image or transcription of the Ministry manual.

This parser validates supported syllable form only. It does not prove that a particular Chinese word has the supplied pronunciation; word-level reading provenance and review remain a separate catalog responsibility.
