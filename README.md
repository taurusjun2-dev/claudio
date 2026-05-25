# Claudio — 个人 AI 电台

> 读懂你的听歌习惯，像 DJ 那样播报，根据时间、天气、心情自动选歌。

## 开箱即用

下载安装包，双击启动。首次使用在「设置」tab 填入 API Key 即可。

## 架构

```
用户语料 (user/) + DeepSeek 等 LLM + 网易云音乐 + 浏览器内置 TTS
        |
     Electron 桌面应用  -->  内置播放器
```

- **LLM**：通过 OpenAI 兼容 API 选歌（默认 DeepSeek）
- **音乐**：网易云音乐非官方 API，获取直链 MP3
- **TTS**：浏览器内置 Web Speech API，零依赖、开箱即用
- **桌面**：Electron 打包，支持 macOS / Windows

## 开发

```bash
npm install
npm run dev     # 开发模式（自动打开 DevTools）
npm start       # 启动 Electron 应用
```

## 构建

```bash
npm run build:mac    # macOS .dmg
npm run build:win    # Windows .exe
npm run build        # 两者
```

## 个性化配置

编辑 `user/` 目录下的文件，让 Claudio 了解你的口味：

| 文件 | 说明 |
|------|------|
| `user/taste.md` | 喜欢/不喜欢的风格、近期在循环的歌、暂时不想听的歌 |
| `user/routines.md` | 日常作息节律（工作日/周末各时段的音乐偏好） |
| `user/mood-rules.md` | 天气、情绪与音乐风格的映射规则 |
| `user/playlists.json` | 收藏歌单（早晨/专注/深夜等场景） |

## 使用方式

1. 打开「设置」tab，填入 LLM API Key 并保存
2. 打开「对话」tab，输入想听的内容，例如：
   - `来一首适合现在的`
   - `来一首梶浦由记`
   - `来点有节奏感的`
3. DJ 会选歌并用语音播报，歌曲自动入队播放
4. 队列播完后自动续歌，保持连贯播放

### 快捷指令

| 输入 | 效果 |
|------|------|
| `下一首` / `skip` | 跳到下一首 |
| `暂停` / `pause` | 暂停播放 |
| `继续` / `resume` | 继续播放 |

## 定时播报

服务启动后自动开启：

- **07:00** 规划今天的音乐日程
- **09:00** 早间播报
- **每小时（09:00-22:00）** 根据当前时间和天气自动推歌入队
