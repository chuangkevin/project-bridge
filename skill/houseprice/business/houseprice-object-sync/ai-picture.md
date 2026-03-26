# AI 圖片處理（AIPictureJob）

> **來源專案**：`Tasks.Buy.BusinessCase`（背景 Job）、`WebService.BusinessCase`（API）

## 業務概念

AI美裝 = AI 自動裝潢照片。經紀人上傳物件原始照片，選擇風格（現代/北歐/工業等）和格局（客廳/臥室等），系統呼叫 AI 產生美裝後的圖片。

**前提**：必須購買 AI美裝 廣告額度才能使用，每個物件最多 10 張。

---

## 處理流程

```
經紀人在 007 平台上傳照片 + 選風格/格局
  → WebService.BusinessCase 建立 AI_Picture 紀錄（Status=Decorating）
  → 呼叫 Tasks 服務排入背景 Job
  → 逐張處理：
    1. 下載原圖 → Base64
    2. POST 到 RoomGPT AI 服務（srvroomgpt1.evertrust.com.tw:9090）
    3. 加浮水印
    4. 上傳到 FPS（檔案服務）
    5. 更新 AI_Picture（Status=Completed, DecorateUrl=結果URL）
  → 整批完成後 → 結轉到 C 端 ES + 重算排序
  → 第一批完成後 → LINE 通知經紀人
```

---

## 圖片狀態 (PictureStatusEnum)

| 值 | 狀態 | 說明 |
|----|------|------|
| 0 | Decorating | AI 處理中 |
| 1 | Completed | 完成 |
| 2 | Failed | 失敗 |
| 3 | Redecorate | 重新美裝中 |

### 狀態流轉

```
Decorating → Completed（成功）
Decorating → Failed（失敗）
任意狀態 → Redecorate → Decorating（經紀人要求重做）
```

---

## 批次機制

圖片以 `CreateDateTime` 分批。同一次上傳的圖片 CreateDateTime 相同 = 同一批。

- **整批完成**：該批所有圖片都不是 Decorating/Redecorate → 觸發 C 端結轉
- **第一批完成**：該物件最早的一批全部完成 → 觸發 LINE 通知

重新美裝（Redecorate）或替換照片會重設 CreateDateTime = 產生新批次。

---

## C 端結轉

整批完成後：
1. 取出 Status=Completed 的圖片
2. 寫入 ES `buy_business_case` 的 `aIPictureInfo` 欄位
3. 重算 SortPriority（AI美裝 = 權重 1，需要有 Completed 的圖片才算）

---

## 自動清理

### 孤兒圖片清理（每小時）

AI_Picture 紀錄存在，但原始照片（AdaptedWebCasePicture）已被刪除 → 刪除 AI_Picture。

判斷條件：`LEFT JOIN AdaptedWebCasePicture ON PictureUrl 比對 → PictureUrl IS NULL`

### 閒置圖片重試

Status 為 Decorating/Redecorate 超過 **10 分鐘**未處理 → 自動重新排入處理。

判斷條件：
- 有 AckTime：`DATEADD(MINUTE, 10, AckTime) < NOW`
- 無 AckTime：`DATEADD(MINUTE, 10, UpdateDateTime) < NOW`

AckTime = Hangfire 開始處理時設定，用於追蹤實際開始時間。

---

## 涉及的 Table

| Table | 用途 |
|-------|------|
| **AI_Picture** | AI 圖片主檔（Sid, AdaptedWebCaseSid, PictureUrl, DecorateUrl, Style, LayoutType, Status, AckTime, CreateDateTime） |
| **AdaptedWebCasePicture** | 原始照片（孤兒檢測用） |
| **AdaptedWebCaseAdvertisements** | 檢查 AI美裝 廣告是否過期 |

## 外部服務

| 服務 | 用途 |
|------|------|
| **RoomGPT** (`srvroomgpt1.evertrust.com.tw:9090`) | AI 美裝處理 |
| **FPS** | 圖片上傳/儲存 |
| **LINE HPB2B** | 第一批完成通知經紀人 |

---

## 業務規則

- AI美裝廣告過期 → 不能建立新圖片，也不能重新美裝
- 每個物件最多 10 張 AI 圖片
- 浮水印在上傳 FPS 前加入
- SortPriority 計算需要 Status=Completed（不是有廣告就算）
- Redecorate/Replace 會重設 AckTime + CreateDateTime（產生新批次 + 重設閒置計時器）
