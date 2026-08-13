# Roche 标准 MCP 插件

支持标准 Model Context Protocol 的 Roche 插件，让你可以连接任意 MCP 服务器！

## ✨ 功能特性

- 🔌 **管理多个 MCP 服务器** - 添加、编辑、删除 MCP 服务器
- 🔍 **自动工具发现** - 自动调用 `tools/list` 获取所有可用工具
- 🎯 **动态工具注册** - 发现的工具自动注册到 Roche，AI 可直接调用
- 🌐 **CORS 代理支持** - 通过你自己的代理服务器解决跨域问题
- 💾 **配置持久化** - 服务器配置保存到本地，下次自动加载
- 🎨 **现代化 UI** - 美观的卡片式布局，操作简单直观

## 🚀 快速开始

### 1. 在 Roche 中安装插件

打开 Roche，进入插件管理，添加以下 GitHub 仓库：

```
https://github.com/zxinyi404-maker/roche-mcp-bridge
```

或者直接加载 `plugin.js` 文件。

### 2. 配置 CORS 代理

插件需要通过 CORS 代理转发 MCP 请求。默认使用：

```
https://mcp.littlephone.top/proxy
```

你也可以部署自己的代理服务器（见下方）。

### 3. 添加 MCP 服务器

1. 点击 Roche 侧边栏的 **"MCP 管理"**
2. 点击 **"+ 添加服务器"**
3. 填写服务器信息：
   - **名称**: 例如 `Ombre Brain`
   - **地址**: MCP 服务器的 URL，例如 `https://your-server.com/mcp`
   - **认证**: 如果需要，填写 Bearer Token
4. 点击 **"测试"** 检查连接
5. 点击 **"🔄 刷新"** 加载所有工具

### 4. 开始使用

添加服务器后，所有工具会自动注册到 Roche。在聊天中，AI 就可以直接调用这些工具了！

例如：
- "帮我搜索一下量子计算的最新进展"（如果接入了搜索 MCP）
- "帮我保存这段信息到记忆库"（如果接入了 Ombre Brain）
- "读取项目目录下的 README.md"（如果接入了文件系统 MCP）

## 🔧 部署 CORS 代理

由于浏览器安全限制，需要通过代理转发 MCP 请求。

### 使用 Python + FastAPI（推荐）

```bash
# 1. 创建 app.py
cat > app.py << 'EOF'
import httpx
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"]
)

@app.get("/")
async def health():
    return {"status": "running"}

@app.post("/proxy")
async def proxy(request: Request):
    try:
        payload = await request.json()
        target_url = payload.get("url")
        method = payload.get("method", "POST")
        headers = payload.get("headers", {})
        body = payload.get("body")

        client = httpx.AsyncClient(timeout=None, follow_redirects=True)
        upstream_request = client.build_request(method, target_url, headers=headers, content=body)
        upstream = await client.send(upstream_request, stream=True)

        async def stream_body():
            try:
                async for chunk in upstream.aiter_bytes():
                    yield chunk
            finally:
                await upstream.aclose()
                await client.aclose()

        return StreamingResponse(
            stream_body(),
            status_code=upstream.status_code,
            media_type=upstream.headers.get("content-type")
        )
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)
EOF

# 2. 安装依赖
pip3 install fastapi httpx uvicorn

# 3. 运行服务
uvicorn app:app --host 0.0.0.0 --port 8080
```

### 使用 Cloudflare Tunnel（推荐用于生产环境）

```bash
# 1. 安装 cloudflared
wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
sudo mv cloudflared-linux-amd64 /usr/local/bin/cloudflared
sudo chmod +x /usr/local/bin/cloudflared

# 2. 运行 tunnel（临时域名）
cloudflared tunnel --url http://localhost:8080

# 或创建永久 tunnel
cloudflared tunnel login
cloudflared tunnel create mcp-proxy
cloudflared tunnel route dns mcp-proxy mcp.yourdomain.com
cloudflared tunnel run mcp-proxy
```

## 📖 支持的 MCP 服务器

理论上支持所有符合标准 MCP 协议的服务器：

- **Ombre Brain** - AI 记忆系统
- **文件系统 MCP** - 读写本地文件
- **数据库 MCP** - 查询数据库（SQLite, PostgreSQL 等）
- **Slack MCP** - 发送消息、查询频道
- **GitHub MCP** - 管理仓库、Issues、PR
- **Google Drive MCP** - 访问云端文件
- **Notion MCP** - 管理 Notion 页面
- ...以及任何你自己开发的 MCP 服务器！

## 🎯 MCP 协议实现

本插件实现了 MCP 协议的核心功能：

### 当前支持（v1.0）
- ✅ `tools/list` - 工具发现
- ✅ `tools/call` - 工具调用
- ✅ JSON-RPC 2.0 请求/响应
- ✅ 通过 CORS 代理转发

### 计划支持（v2.0）
- ⏳ `initialize` - 握手协议
- ⏳ Session 管理
- ⏳ SSE 流式响应
- ⏳ 资源（Resources）支持
- ⏳ 提示（Prompts）支持

## 🛠️ 开发

### 项目结构

```
roche-mcp-bridge/
├── plugin.js           # 主插件文件
├── manifest.json       # 插件元数据
└── README.md          # 说明文档
```

### 本地开发

1. 克隆仓库
```bash
git clone https://github.com/zxinyi404-maker/roche-mcp-bridge.git
cd roche-mcp-bridge
```

2. 修改 `plugin.js`

3. 在 Roche 中重新加载插件

### 调试

在浏览器控制台查看日志：

```javascript
// 查看 MCP 请求日志
localStorage.setItem('mcp_debug', 'true')

// 关闭调试
localStorage.removeItem('mcp_debug')
```

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可

MIT License

## 🔗 相关项目

- [Roche](https://github.com/your-repo/roche) - AI 对话应用
- [MCP Protocol](https://modelcontextprotocol.io/) - Model Context Protocol 官方文档
- [Ombre Brain](https://github.com/ombre/brain) - AI 记忆系统

## 📮 联系方式

- GitHub Issues: https://github.com/zxinyi404-maker/roche-mcp-bridge/issues

---

**让 Roche 接入整个 MCP 生态！** 🚀
