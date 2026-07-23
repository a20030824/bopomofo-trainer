# 注音輸入訓練器

[![CI](https://github.com/a20030824/bopomofo-trainer/actions/workflows/check.yml/badge.svg)](https://github.com/a20030824/bopomofo-trainer/actions/workflows/check.yml)
[![Deploy Pages](https://github.com/a20030824/bopomofo-trainer/actions/workflows/deploy-pages.yml/badge.svg)](https://github.com/a20030824/bopomofo-trainer/actions/workflows/deploy-pages.yml)

一個在瀏覽器中運作、資料留在本機的繁體中文注音鍵盤訓練雛型。它以常用詞為基礎，記住真正按錯或明顯卡住的注音，讓這些弱點在後續題目中更常出現；句法規則負責讓練習內容維持可讀，而不是任意拼接詞語。

**[開啟線上雛型](https://a20030824.github.io/bopomofo-trainer/)**

## 現在能做什麼

- 使用標準注音鍵盤配置進行逐音節輸入練習。
- 從審核過的常用詞中產生練習內容，另保留一小部分作評量。
- 分別記錄目標注音的錯誤與乾淨輸入時間，用來調整後續選題。
- 可調整錯誤與慢速訊號的影響，常用度仍是選詞基礎。
- 將進度、量測與練習紀錄保存在瀏覽器，也能匯出或匯入完整存檔。
- 以句法規則限制詞槽，避免產生任意詞列。
- 使用固定 seed 重現相同 catalog 與進度下的選題結果。
- 按 `F8` 暫時跳到下一個預覽題，不會寫入假進度。

> 目前保證的是句法 profile 與句型規則相容，不保證每一句都具備自然的語意搭配。這是雛型現階段刻意保留的界線。

## 錯誤怎麼影響下一題

```text
常用度建立基礎權重
        ＋
目標注音的錯誤紀錄
        ＋
乾淨輸入的慢速訊號
        ↓
有限度提高弱點出現機率
        ↓
在句法相容的候選中選出下一題
```

只有題目原本要求的注音會累積錯誤；使用者誤按的另一顆鍵不會反過來獲得權重。慢速訊號只採用沒有錯誤或輸入干擾的樣本。學習紀錄不會直接指定整句，而是輕推含有容易出錯注音或按鍵轉換的合法候選。

## 句子怎麼產生

句法生成只負責約束句形與詞槽；選題核心仍是常用度加學習權重。缺少相容句法資料的詞不會進入網站題庫。

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
