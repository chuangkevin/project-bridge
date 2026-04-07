# Mobile UI Adaptation (v1)

## Problem Statement
`project-bridge` 原本僅針對桌面端設計，手機開啟時介面混亂且難以操作。使用者希望在手機上能著重於「顧問模式」進行對話與原型檢閱。

## Proposed Solution
引入響應式佈局與手機專屬導航：
1. **Layout**: 使用 `window.innerWidth` 偵測環境，切換單欄模式。
2. **Navigation**: 增加手機底部導航列（對話、預覽、專案列表）。
3. **Focus**: 手機版預設進入「顧問對話」模式，隱藏複雜編輯工具。

## Success Criteria
- [x] 手機瀏覽時自動隱藏側邊欄與多餘工具。
- [x] 能透過底部導航流暢切換對話與原型預覽。
- [x] 底部導航適配 iOS 安全區域。
