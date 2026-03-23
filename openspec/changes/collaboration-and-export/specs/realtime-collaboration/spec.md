## ADDED Requirements

### Requirement: WebSocket 連線管理
系統 SHALL 在現有 Express HTTP 伺服器上整合 Socket.io，提供 WebSocket 連線服務。前端 SHALL 在使用者進入專案頁面時自動建立 Socket.io 連線，離開時自動斷開。連線斷開後 SHALL 自動嘗試重新連線。

#### Scenario: 使用者進入專案頁面時建立連線
- **WHEN** 使用者開啟專案頁面
- **THEN** 前端 SHALL 自動建立 Socket.io 連線至伺服器

#### Scenario: 使用者離開專案頁面時斷開連線
- **WHEN** 使用者離開專案頁面（導航至其他頁面或關閉分頁）
- **THEN** 前端 SHALL 發送 `leave-room` 事件並斷開 Socket.io 連線

#### Scenario: 連線意外中斷後自動重連
- **WHEN** WebSocket 連線因網路問題中斷
- **THEN** Socket.io SHALL 自動嘗試重新連線，重連成功後 SHALL 重新加入原本的房間

### Requirement: 房間管理
系統 SHALL 為每個專案維護一個獨立的 Socket.io 房間。使用者開啟專案時 SHALL 自動加入該專案的房間，離開時 SHALL 自動退出房間。房間名稱 SHALL 使用專案 ID 作為識別。

#### Scenario: 使用者加入專案房間
- **WHEN** 使用者開啟專案頁面並發送 `join-room` 事件（包含 `projectId` 和 `user` 資訊）
- **THEN** 伺服器 SHALL 將該使用者的 socket 加入以 `projectId` 命名的房間
- **THEN** 伺服器 SHALL 為該使用者自動分配一個顯示色彩
- **THEN** 伺服器 SHALL 向房間內所有成員廣播更新後的 `presence-update` 事件

#### Scenario: 使用者離開專案房間
- **WHEN** 使用者發送 `leave-room` 事件或 socket 斷線
- **THEN** 伺服器 SHALL 將該使用者從房間移除
- **THEN** 伺服器 SHALL 向房間內剩餘成員廣播更新後的 `presence-update` 事件

#### Scenario: 同一使用者在多個分頁開啟同一專案
- **WHEN** 同一使用者在多個瀏覽器分頁開啟同一專案
- **THEN** 每個分頁 SHALL 各自建立獨立的 socket 連線並加入同一房間
- **THEN** 在線狀態列表中該使用者 SHALL 僅顯示一次

### Requirement: 游標同步
系統 SHALL 將每位使用者的滑鼠位置即時廣播給同一房間的其他成員。前端 SHALL 以 50ms 為間隔節流 `cursor-move` 事件的發送頻率。其他使用者的游標 SHALL 以帶有名稱標籤和自動分配色彩的浮動標記顯示。

#### Scenario: 使用者移動滑鼠時廣播游標位置
- **WHEN** 使用者在原型預覽區域移動滑鼠
- **THEN** 前端 SHALL 以最高 50ms 一次的頻率發送 `cursor-move` 事件（包含 `x`, `y` 座標）
- **THEN** 伺服器 SHALL 將此事件轉發給同一房間的其他成員（不含發送者）

#### Scenario: 顯示其他使用者的游標
- **WHEN** 前端收到其他使用者的 `cursor-move` 事件
- **THEN** 前端 SHALL 在對應座標位置顯示該使用者的游標標記
- **THEN** 游標標記 SHALL 包含使用者名稱標籤和自動分配的色彩

#### Scenario: 使用者離開時移除游標
- **WHEN** 某位使用者離開房間或斷線
- **THEN** 前端 SHALL 移除該使用者的游標標記

### Requirement: 在線狀態顯示
系統 SHALL 在專案頁面的 header 區域顯示目前在線的使用者列表。列表 SHALL 包含每位使用者的頭像（或名稱首字母）和名稱，以及自動分配的識別色彩。

#### Scenario: 顯示在線使用者列表
- **WHEN** 使用者在專案頁面中
- **THEN** header 區域 SHALL 顯示目前在同一房間中的所有使用者
- **THEN** 每位使用者 SHALL 以頭像或名稱首字母圓形標記顯示，附帶自動分配色彩

#### Scenario: 使用者加入時更新列表
- **WHEN** 新使用者加入專案房間
- **THEN** 所有在線使用者的在線狀態列表 SHALL 即時更新，顯示新加入的使用者

#### Scenario: 使用者離開時更新列表
- **WHEN** 使用者離開專案房間
- **THEN** 所有在線使用者的在線狀態列表 SHALL 即時更新，移除已離開的使用者

### Requirement: 標注即時同步
當任何使用者新增、編輯或刪除標注時，系統 SHALL 將變更即時同步至同一房間的所有其他成員。前端 SHALL 採用樂觀更新策略：本地操作立即生效，同時發送至伺服器。衝突解決策略為 Last Write Wins。

#### Scenario: 新增標注時同步至其他使用者
- **WHEN** 使用者新增一個標注
- **THEN** 前端 SHALL 立即在本地顯示該標注（樂觀更新）
- **THEN** 前端 SHALL 發送 `annotation-change` 事件（`action: 'create'`）至伺服器
- **THEN** 伺服器 SHALL 將標注寫入資料庫並廣播給房間內其他成員
- **THEN** 其他成員的前端 SHALL 即時顯示新標注

#### Scenario: 編輯標注時同步至其他使用者
- **WHEN** 使用者編輯一個現有標注
- **THEN** 前端 SHALL 立即在本地更新該標注
- **THEN** 前端 SHALL 發送 `annotation-change` 事件（`action: 'update'`）至伺服器
- **THEN** 伺服器 SHALL 更新資料庫並廣播給房間內其他成員

#### Scenario: 刪除標注時同步至其他使用者
- **WHEN** 使用者刪除一個標注
- **THEN** 前端 SHALL 立即在本地移除該標注
- **THEN** 前端 SHALL 發送 `annotation-change` 事件（`action: 'delete'`）至伺服器
- **THEN** 伺服器 SHALL 從資料庫刪除並廣播給房間內其他成員

#### Scenario: Last Write Wins 衝突解決
- **WHEN** 兩位使用者幾乎同時編輯同一個標注
- **THEN** 伺服器 SHALL 以最後收到的變更為準寫入資料庫
- **THEN** 伺服器 SHALL 將最終結果廣播至所有成員，確保最終一致性

### Requirement: AI 生成鎖定機制
系統 SHALL 對每個專案實施 AI 生成操作的互斥鎖定。同一時間僅允許一位使用者觸發 AI 生成。鎖定狀態 SHALL 透過 WebSocket 即時廣播給所有房間成員。鎖定 SHALL 設有 5 分鐘的自動釋放超時。

#### Scenario: 使用者取得生成鎖定
- **WHEN** 使用者嘗試觸發 AI 生成且該專案目前未被鎖定
- **THEN** 伺服器 SHALL 授予該使用者鎖定
- **THEN** 伺服器 SHALL 向房間所有成員廣播 `generation-lock-update` 事件（`locked: true`, `lockedBy` 包含使用者資訊）
- **THEN** 其他使用者的 AI 生成按鈕 SHALL 變為停用狀態並顯示「使用者 X 正在生成中...」

#### Scenario: 使用者嘗試取得已被鎖定的生成權限
- **WHEN** 使用者嘗試觸發 AI 生成但該專案已被其他使用者鎖定
- **THEN** 伺服器 SHALL 拒絕該請求
- **THEN** 前端 SHALL 顯示提示訊息，告知目前由誰持有鎖定

#### Scenario: 生成完成後釋放鎖定
- **WHEN** AI 生成操作完成（成功或失敗）
- **THEN** 伺服器 SHALL 自動釋放該專案的鎖定
- **THEN** 伺服器 SHALL 向房間所有成員廣播 `generation-lock-update` 事件（`locked: false`）

#### Scenario: 鎖定超時自動釋放
- **WHEN** 生成鎖定持續超過 5 分鐘未被釋放
- **THEN** 伺服器 SHALL 自動釋放該鎖定
- **THEN** 伺服器 SHALL 向房間所有成員廣播鎖定已釋放

#### Scenario: 持有鎖定的使用者斷線
- **WHEN** 持有生成鎖定的使用者 socket 斷線
- **THEN** 伺服器 SHALL 自動釋放該使用者持有的鎖定
- **THEN** 伺服器 SHALL 向房間剩餘成員廣播鎖定已釋放
