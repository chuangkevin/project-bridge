## ADDED Requirements

### Requirement: 無架構圖時自動建立
系統 SHALL 在使用者儲存 mapping 時，若專案沒有架構圖（arch_data 為空），自動從 data-page 建立架構資料。

#### Scenario: 自動建立 ArchNodes
- **WHEN** 專案的 arch_data 為空或 null，且使用者儲存第一筆 mapping
- **THEN** 系統 SHALL 從原型 HTML 解析所有 data-page，為每個頁面建立一個 ArchNode（type: 'page'），以 grid layout 自動排列位置

#### Scenario: 自動建立後的 arch_data 結構
- **WHEN** 架構圖自動建立完成
- **THEN** arch_data SHALL 包含 `type: 'page'`、nodes（每個 data-page 一個）、edges（根據 mapping 的 navigationTarget 建立）

### Requirement: 有架構圖時同步 ArchEdges
系統 SHALL 在 mapping 儲存時，自動在架構圖中新增或更新對應的 ArchEdge。

#### Scenario: 新增導航 edge
- **WHEN** 使用者為元素設定導航目標，且架構圖中沒有對應的 edge（source + target + triggerBridgeId 組合不存在）
- **THEN** 系統 SHALL 在 arch_data.edges 中新增一條 ArchEdge，包含 source（所屬頁面 node id）、target（目標頁面 node id）、triggerBridgeId、triggerLabel

#### Scenario: 更新導航 edge
- **WHEN** 使用者修改元素的導航目標，且架構圖中已有該 triggerBridgeId 的 edge
- **THEN** 系統 SHALL 更新該 edge 的 target 為新的目標頁面 node id

#### Scenario: 移除導航 edge
- **WHEN** 使用者清除元素的導航目標
- **THEN** 系統 SHALL 移除架構圖中 triggerBridgeId 匹配的 edge

### Requirement: ArchEdge 多對多支援
ArchEdge 資料模型 SHALL 支援多對多的頁面導航關係。

#### Scenario: 同一頁面多個出口
- **WHEN** 頁面 A 有 3 個按鈕分別導航到 B、C、D
- **THEN** arch_data.edges SHALL 包含 3 條 edge，每條有不同的 triggerBridgeId

#### Scenario: 同一 source-target 多個觸發元素
- **WHEN** 頁面 A 有 2 個按鈕都導航到頁面 B
- **THEN** arch_data.edges SHALL 包含 2 條 edge（source=A, target=B），以不同的 triggerBridgeId 區分

### Requirement: ArchEdge 擴充欄位
ArchEdge 介面 SHALL 新增 triggerBridgeId 和 triggerLabel 欄位。

#### Scenario: 欄位定義
- **WHEN** ArchEdge 被建立或更新
- **THEN** edge SHALL 包含 `triggerBridgeId: string | null`（觸發元素的 bridge_id）和 `triggerLabel: string | null`（元素的文字內容，用於架構圖顯示）

#### Scenario: 既有 edge 相容
- **WHEN** 專案有既有的 ArchEdges（無 trigger 欄位）
- **THEN** 這些 edge SHALL 繼續正常運作，triggerBridgeId 和 triggerLabel 視為 null
