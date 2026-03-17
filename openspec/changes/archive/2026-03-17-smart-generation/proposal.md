## Why

目前系統只能「生成 UI」，但使用者有三種更智慧的需求：(1) 想問問題而不是生成（例如「這個欄位的規則是什麼？」），(2) 規格文件裡有圖片時應自動抓取美術風格而不是忽略，(3) 當規格描述多個頁面/層級時應該一次生成完整的多頁面原型而不是單一畫面。這三個功能讓系統從「生成工具」升級為「智慧協作夥伴」。

## What Changes

### 功能 1：Q&A 回應模式
- AI 自動辨識訊息意圖：是「問問題」還是「生成 UI」
- 問問題時：直接回覆文字答案，不生成 HTML，不覆蓋現有原型
- 生成 UI 時：維持現有行為
- 對話紀錄中，問答訊息和生成訊息有不同的視覺樣式

### 功能 2：規格文件參考圖美術風格自動偵測
- 上傳 PDF/PPT/Word 時，若文件內含圖片，自動提取並用 Vision API 分析美術風格
- 在對話面板出現「美術風格」提示卡，顯示偵測到的風格摘要
- 提供 Switch：「套用美術風格至生成」（預設關閉）
- Switch 開啟時，美術風格描述注入 AI prompt（獨立於 Design Profile）
- Switch 可隨時開關，不影響 Design Profile

### 功能 3：多頁面層級設計
- AI 分析規格，偵測是否有多個頁面/畫面（例如：登入頁 → 首頁 → 設定頁）
- 若偵測到層級，生成包含完整導覽的多頁面 HTML（單一 HTML 檔，用 JS 管理頁面切換）
- 原型預覽區上方新增「頁面導覽列」，顯示所有頁面，可點擊切換
- 設計師的 Design Profile 套用至所有頁面

## Capabilities

### New Capabilities
- `qa-response-mode`: 意圖辨識 + 問答回應，不覆蓋原型
- `art-style-detection`: 規格文件圖片提取 + Vision 美術風格分析 + 套用 Switch
- `multi-page-prototype`: 多頁面偵測 + 生成帶導覽的多頁面 HTML

### Modified Capabilities
- `ai-chat-generation`: 整合意圖辨識、美術風格注入、多頁面生成指令

## Impact

- **Backend**: 新增意圖分類邏輯、PDF/PPT 圖片提取服務、多頁面生成 prompt 策略
- **Database**: 新增 `art_style_preferences` 表（per project switch 狀態 + 分析結果）
- **Frontend**: 對話視覺差異化（問答 vs 生成）、美術風格提示卡 + Switch、頁面導覽列
