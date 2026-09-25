# IMPERIUM 手機驗證紀錄

正式版本的三種手機尺寸均通過完整觸控回歸檢查。這次以 Three.js Game UI Designer 與 QA Release 流程調整手機操作，保留既有棋規、模型、動畫與桌面操作。

## 變更

- 直向以底部回合資訊搭配大型工具按鈕；橫向將工具移到棋盤左側，資訊留在右側。棋盤依可用空間自動完整入鏡。
- 支援點棋子選取、點合法格移動／吃子、重點同一棋子取消，以及獨立「取消」按鈕。
- 拖曳以整段手勢的最大位移判斷；拖出再回原點不會誤下棋。雙指縮放、觸控取消、失去焦點後均清理輸入狀態。
- 手機工具與升變按鈕至少 44 px；設定標籤提供整行觸控區域。加入 viewport-fit、動態視窗高度與四邊 safe-area 留白。小螢幕設定視窗可捲動，四個升變選項保持可達。
- 設定提供基本／加強光影，切換不會重新載入棋局。光影模組由主工作整合，本次以實際觸控驗證其操作。

## 正式版本實測

預覽：http://127.0.0.1:5194。瀏覽器為本機 Chrome，觸控使用 touchscreen.tap 與 CDP Input.dispatchTouchEvent，沒有以滑鼠代替觸控。

| 尺寸 | 檢查通過 | 最小工具按鈕 | 被 UI 擋住的棋格 | 實際 pointer 類型 |
| --- | --- | --- | --- | --- |
| 390 × 844 | 12 / 12 | 44 px | 0 | touch |
| 844 × 390 | 12 / 12 | 44 px | 0 | touch |
| 360 × 640 | 12 / 12 | 44 px | 0 | touch |

每個尺寸均測試：合法開局 e4、d5、exd5 與完整吃子電影；悔棋恢復棋子；同棋取消與取消按鈕；拖曳返回起點；双指張合；touchCancel 後繼續點選；換邊／全景；基本／加強光影不重開棋局；減少動態；四個升變選項並實際升后；設定內新局確認；直橫向來回切換後仍能選棋。第一個觸控也成功解鎖 AudioContext。

所有 64 格在全景下均可直接觸控，沒有被工具列或資訊面板遮住；沒有水平溢出。Console／page errors：0。

建置：npm run build 通過。既有桌面規則／互動測試亦涵蓋非法步拒絕、王車易位、吃過路兵、騎士升變、被釘住的棋子、將死、重開、悔棋，以及音效解鎖；結果另存 artifacts/release-check/playtest.json。

## 畫面

- [390 × 844 直向棋盤](390x844-board.png) · [合法吃子範圍](390x844-capture-choice.png) · [設定](390x844-settings.png)
- [844 × 390 橫向棋盤](844x390-board.png) · [升變](844x390-promotion.png) · [電影鏡頭](844x390-cinematic.png)
- [360 × 640 小螢幕棋盤](360x640-board.png) · [合法吃子範圍](360x640-capture-choice.png) · [升變](360x640-promotion.png)
- [完整測試 JSON](mobile-playtest.json)

## 執行方式與限制

以 TEST_URL 指向正式預覽後執行 node tests/mobile-release.mjs；既有 npm test 也接受 TEST_URL。手機互動屬於完整支援，但此證據是 Chrome 手機尺寸與觸控模擬。尚未驗證實體 iPhone／Android 的瀏覽器工具列、瀏海安全區、Safari 差異、溫度與 GPU 效能。safe-area 已由 CSS 處理，模擬環境的 inset 為零，不能視為實體瀏海機測量。未執行任何 git 提交、遠端倉庫建立或發布。
