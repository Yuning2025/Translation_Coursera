# Coursera 中文字幕悬浮翻译器

这是一个 Chrome 扩展，在 Coursera 视频页面读取英文字幕轨道，通过 DeepSeek API 翻译为中文，并以悬浮字幕的形式实时显示。

## 功能
- 读取 Coursera 英文字幕轨道并翻译成中文
- 悬浮字幕可拖拽、可缩放、可调节字体大小
- 全屏播放时字幕保持显示
- API Key 本地保存（仅保存在浏览器本地）

## 部署与使用
1. 克隆或下载项目到本地
2. 打开 Chrome，进入 `chrome://extensions/`
3. 右上角开启“开发者模式”
4. 点击“加载已解压的扩展程序”，选择项目目录
5. 进入 Coursera 课程视频页面
6. 点击“设置”，输入并保存 DeepSeek API Key
7. 点击“开始翻译”，等待“中文字幕已加载”提示后播放视频

## DeepSeek API 配置
- 接口地址: `https://api.deepseek.com/chat/completions`
- 模型: `deepseek-chat`
- 需要在页面内输入 API Key（仅保存在 Chrome 本地存储）

## 文件说明
- `manifest.json`: 扩展入口与权限配置
- `content.js`: 核心逻辑（字幕读取、翻译、显示）
- `content.css`: 悬浮字幕样式

## 常见问题
- 没有字幕轨道: 请确保 Coursera 英文字幕已开启
- 翻译不触发: 请确认已保存 API Key，并点击“开始翻译”

## 许可
按需自行添加 LICENSE 文件
