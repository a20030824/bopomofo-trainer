# NAER 通用詞頻表 1141208 結構檢查

狀態：已使用使用者提供的官方 XLSX 在本機完成。原始 workbook 不提交至 repository。

## Provenance

- 檔名：`通用詞頻表 - 定稿1141208.xlsx`
- 版本：`1141208`
- 大小：`17,303,267` bytes
- SHA-256：`bfd3b73938e115ae39a44c5e11c97135c09939cf598157cb2fe0b33c4302de75`
- 工作表：`通用詞頻表`
- Used range：`A1:L163702`
- 資料列：`163,701`
- 重新散布狀態：`local-only-pending-license-review`

## 寨際欄位

| 欄 | 原始表頭 | 判定用途 |
|---|---|---|
| A | 綜合／序位 | 版本內唯一、連續的一般序位；與版本組合作為來源列識別 |
| B | 詞 | 詞形 |
| C | 書面語／詞頻 | 書面語原始次數 |
| D | 書面語／每百萬詞頻 | `commonness-v1.writtenPerMillion` |
| E | 書面語／序位 | 診斷資料 |
| F | 口語／詞頻 | 口語原始次數 |
| G | 口語／每百萬詞頻 | `commonness-v1.spokenPerMillion` |
| H | 口語／序位 | 診斷資料 |
| I | 新聞／詞頻 | 新聞原始次數 |
| J | 新聞／每百萬詞頻 | 保留為來源診斷，不進 v1 分數 |
| K | 新聞／序位 | 診斷資料 |
| L | 每百萬詞頻（平均） | `D、G、J` 的算術平均，不進 v1 分數 |

`L = (D + G + J) / 3` 對全部 163,701 列成立，誤差只來自浮點表示；資料亦依 L 非遞增排序。

## 結構與品質

- 1 張可見工作表，沒有公式、合併儲存格、隱藏列、超連結或空白資料列。
- B 欄共有 163,701 個唯一詞形，沒有重複詞形或完全重複資料列。
- 全部詞形都是純漢字。
- 詞長分布：1 字 6,017、2 字 94,589、3 字 51,236、4 字 10,107、5 字以上 1,752。
- 所有 12 欄在資料列中都存在；數值欄沒有 malformed value。
- 觀察到的數值 0：書面語 1,418、口語 67,784、新聞 443。這些是**觀察到的 0**，不是缺值。
- 推回的 corpus token totals：書面語 251,890,695、口語 21,317,573、新聞 226,481,864。

## Adapter 決策

這份 workbook **足以支援第一版 commonness score**：

```text
sourceRowId        = "1141208:" + A
catalog lexical key = NFC(trim(B))
spokenPerMillion   = G
writtenPerMillion  = D
```

`J` 是獨立的新聞 domain；`L` 是三個 domain 的等權平均。`commonness-v1` 已明確定義為口語 60%、書面語 40%，所以第一版不把 J 或 L 偷渡進 score。兩欄仍保留在來源結構與診斷輸出中。

Workbook 沒有讀音、詞性、動詞配價、等級或 domain 標記。因此：

- 只在一個詞形明確對應一個 catalog entry 時自動建立 evidence；
- 同詞形若對應多個讀音／catalog identities，必須排入人工 review；
- 不用 NAER 自動產生讀音、詞性或文法角色；
- 數值 0 原樣保留，不能轉成 `null`。

## #44 結論

#44 的結構阻塞已解除。剩餘不確定性不妨礙 v1 adapter：

1. 官方重新散布授權仍未確認，因此不提交 workbook 或 bulk rows；
2. A 欄只保證在 `1141208` 版本內穩定，來源列 ID 必須包含版本；
3. workbook 沒有讀音，異音／異體映射仍需 catalog-side reviewed identity。
