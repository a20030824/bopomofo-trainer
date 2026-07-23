# 注音輸入訓練器

[![CI](https://github.com/a20030824/bopomofo-trainer/actions/workflows/check.yml/badge.svg)](https://github.com/a20030824/bopomofo-trainer/actions/workflows/check.yml)
[![Deploy Pages](https://github.com/a20030824/bopomofo-trainer/actions/workflows/deploy-pages.yml/badge.svg)](https://github.com/a20030824/bopomofo-trainer/actions/workflows/deploy-pages.yml)

一個在瀏覽器中運作、資料留在本機的繁體中文注音鍵盤訓練雛型。它不把詞隨機串起來，而是先推導正式句法結構，再依句法相容性、詞頻與有限的學習紀錄填入詞槽。

**[開啟線上雛型](https://a20030824.github.io/bopomofo-trainer/)**

## 現在能做什麼

- 使用標準注音鍵盤配置進行逐音節輸入練習。
- 從 1,786 筆審核詞條中生成練習內容，其中 1,776 筆用於練習、10 筆保留作評量。
- 以正式句法骨架和 2,691 個執行期句法 profile 產生題目。
- 以常用度為主要選詞依據，錯誤與乾淨輸入時間只提供有上限的調整。
- 將進度、測量與 pilot history 保存在瀏覽器 localStorage。
- 可匯出／匯入完整 JSON 備份，跨裝置帶走進度與自適應設定。
- 可分別調整錯誤與慢速訊號的選題影響，總加權仍維持 1.5× 上限。
- 使用固定 seed 重現相同 catalog 與進度下的選題結果。
- 按 `F8` 暫時跳到下一個預覽題，不會寫入假進度。

> 目前保證的是句法 profile 與句型規則相容，不保證每一句都具備自然的語意搭配。這是雛型現階段刻意保留的界線。

## 句子怎麼產生

```text
正式句法規則
    ↓ 推導句子形狀
相容詞槽
    ↓ 句法 profile 過濾
常用度 + 有上限的學習權重
    ↓ seeded weighted selection
完整練習句
```

產品路徑沒有內建完整句子 template，也不會退回任意詞列或單詞 fallback。打包時會先套用 fail-closed 句法合法清單；缺少合法 profile 的詞條不會進入網站 catalog。

## 本機執行

需要 Node.js 22 與 Python 3.12。

```bash
npm ci
npm run dev
```

Vite 啟動後，開啟終端顯示的本機網址即可。

## 驗證

```bash
npm run check
```

這會依序執行 TypeScript typecheck、快速 Vitest、Python source-adapter 測試、catalog 驗證與 production build。

目前 catalog 驗證涵蓋 1,786 個詞條、3,267 個音節與 42 個注音 token。

## 主要目錄

```text
src/app/          瀏覽器介面與鍵盤輸入
src/product/      練習、評量、進度與 session
src/curriculum/   選題、權重與句子生成入口
src/syntax/       正式句法推導、profile 與合法性檢查
data/source/      目前啟用的審核 catalog
data/grammar/     網站使用的句法合法清單與精簡 profiles
scripts/          catalog、讀音與句法生成工具
tests/            TypeScript 與 Python 驗證
docs/             架構、政策、證據與歷史研究文件
```

## 設計原則

- 詞頻決定可用範圍與主要抽樣權重。
- 學習者訊號必須有足夠樣本、可解釋且有權重上限。
- 實際按錯的 token 不會反過來獲得課程權重。
- transition 不跨越音節或詞條邊界。
- 句法合法性先於選題評分。
- 評量詞不更新訓練估計。
- 模擬只能驗證內部行為與可重現性，不能證明真實學習效果。

## 文件

- [正式句法系統](docs/formal-syntax-system.md)
- [正式句法實作狀態](docs/formal-syntax-implementation-status.md)
- [選題政策](docs/frequency-first-utterance-policy.md)
- [架構](docs/architecture.md)
- [領域模型](docs/domain-model.md)
- [測量政策](docs/measurement-policy.md)
- [Roadmap](docs/roadmap.md)
- [架構決策](docs/decisions/)

## GitHub Pages

合併到 `main` 後，[Pages workflow](.github/workflows/deploy-pages.yml) 會以 repository 子路徑建置 Vite，並部署 `dist/`。也可以從 Actions 頁面手動觸發部署。
