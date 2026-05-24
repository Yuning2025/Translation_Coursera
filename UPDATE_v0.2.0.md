# 更新说明 v0.2.0

> 发布日期：2026-05-24

## 修复

### 🐛 长视频（2h+）英文字幕轨道加载不完整

**问题**：对于超过 2 小时的视频，浏览器 `TextTrack.cues` API 惰性加载机制导致字幕 cues 未完全就绪即被读取，造成字幕缺失或残缺。

**修复**：新增直接 fetch WebVTT 源文件的方案，绕过浏览器惰性加载：
- 新增 `parseVttTimestamp()` — WebVTT 时间戳解析器（支持 `HH:MM:SS.mmm` / `MM:SS.mmm` 格式）
- 新增 `parseVttContent()` — 完整 WebVTT 格式解析器（支持 cue 标识符行、跳过 NOTE/STYLE 块、剥离 VTT 内联标签）
- 新增 `fetchEnglishCuesFromVtt()` — 查找页面 `<track>` 元素，优先英文轨道，fetch 其 `src` 指向的 VTT 文件并解析
- `attachTrackWatcher()` 优先尝试 VTT 直取，成功则一举拿到全部字幕；失败静默回退到原有 TextTrack API 路径

### 🐛 关闭按钮无法彻底关闭插件

**问题**：点击「关闭」后 overlay 被移除，但动画循环 `tick()` 每帧调用 `ensureOverlay()` 导致 overlay 立即重建；且 `MutationObserver`、`ResizeObserver`、事件监听器等未清理。

**修复**：
- `STATE` 新增 `closed` 标志位
- `tick()` 首行检查 `closed` 标志，为 true 时直接 return
- `closeOverlay()` 完整清理所有 Observer 和事件监听器

### 🐛 最小化后无法拖动

**问题**：`onDragStart()` 中显式判断 `is-minimized` 类名后 return，阻断了最小化状态下的拖拽。

**修复**：移除该阻断判断，最小化圆形按钮现在可自由拖动。

## 技术细节

| 文件 | 变更 |
|------|------|
| `content.js` | +125 行（VTT 解析 + 关闭/拖动修复） |
| `manifest.json` | 版本号 0.1.0 → 0.2.0 |

## 升级方式

1. 拉取最新代码
2. Chrome 扩展管理页 (`chrome://extensions/`) 点击「刷新」按钮
3. 刷新 Coursera 页面即可生效
