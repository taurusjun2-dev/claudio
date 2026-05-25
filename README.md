# Claudio — 个人 AI 电台

> 读懂你的听歌习惯，像 DJ 那样播报，根据时间、天气、心情自动选歌。

---

## 架构概览

```
用户语料 (user/) + DeepSeek/LiteLLM + 网易云音乐 + edge-tts
        |
    本地 Node.js 服务  -->  PWA 播放器
```

- **LLM**：通过 DeepSeek 或 LiteLLM，每次播放前根据上下文选歌
- **音乐**：网易云音乐非官方 API，获取直链 MP3
- **TTS**：edge-tts（微软 Edge 语音引擎），免费无需 API key
- **前端**：PWA，可安装为桌面 App

---

## 环境要求

- Node.js 22+
- Python 3（用于 edge-tts）

---

## 安装

```bash
# 1. 克隆项目
git clone https://github.com/taurusjun2-dev/claudio.git
cd claudio

# 2. 安装依赖
npm install --ignore-scripts

# 3. 安装 edge-tts
pip3 install edge-tts

# 4. 配置环境变量
cp .env.template .env
# 编辑 .env，填入必要配置
```

---

## 配置说明（.env）

| 配置项 | 说明 | 示例 |
|--------|------|------|
| `LITELLM_URL` | LLM 服务地址 | `https://api.deepseek.com/v1` |
| `LITELLM_API_KEY` | API Key | `sk-xxx` |
| `LITELLM_MODEL` | 模型名称 | `deepseek-chat` |
| `LITELLM_MAX_TOKENS` | 最大 token 数 | `4000` |
| `TTS_VOICE` | 语音音色（见下方列表） | `zh-CN-XiaoyiNeural` |
| `EDGE_TTS_BIN` | edge-tts 可执行路径 | `/usr/local/bin/edge-tts` |
| `WEATHER_CITY` | 天气城市（影响选歌） | `Shanghai` |
| `PORT` | 服务端口 | `8080` |

### 查看 edge-tts 路径

```bash
which edge-tts
# 如果找不到，通常在：
# macOS: ~/Library/Python/3.x/bin/edge-tts
# Linux: ~/.local/bin/edge-tts
```

### 可用中文音色

```bash
edge-tts --list-voices | grep zh-CN
```

推荐：
- `zh-CN-XiaoyiNeural`（女声，温柔）
- `zh-CN-XiaoxiaoNeural`（女声，活泼）
- `zh-CN-YunjianNeural`（男声，浑厚）

---

## 个性化配置

编辑 `user/` 目录下的文件，让 Claudio 了解你的口味：

| 文件 | 说明 |
|------|------|
| `user/taste.md` | 喜欢/不喜欢的风格、近期在循环的歌、暂时不想听的歌 |
| `user/routines.md` | 日常作息节律（工作日/周末各时段的音乐偏好） |
| `user/mood-rules.md` | 天气、情绪与音乐风格的映射规则 |
| `user/playlists.json` | 收藏歌单（早晨/专注/深夜等场景） |

---

## 启动

```bash
npm start
```

访问 `http://localhost:8080`

### 安装为桌面 App（PWA）

Chrome 地址栏右侧点击安装图标，即可将 Claudio 安装为独立 App 窗口。

---

## 使用方式

1. 打开「对话」tab，输入想听的内容，例如：
   - `来一首适合现在的`
   - `来一首梶浦由记`
   - `来点有节奏感的`
2. DJ 会选歌并用语音播报，歌曲自动入队播放
3. 队列播完后自动续歌，保持连贯播放

### 快捷指令

| 输入 | 效果 |
|------|------|
| `下一首` / `skip` | 跳到下一首 |
| `暂停` / `pause` | 暂停播放 |
| `继续` / `resume` | 继续播放 |

---

## 定时播报

服务启动后自动开启：

- **07:00** 规划今天的音乐日程
- **09:00** 早间播报
- **每小时（09:00-22:00）** 根据当前时间和天气自动推歌入队
