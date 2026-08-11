# Roche MCP 工具桥接插件 v2.0.1

让主聊天 AI 按需调用 ECS MCP 服务器工具，实现智能搜索、批量查询、深度分析等功能。

## ✨ 特性

### 🤖 主聊天集成
- **自动工具调用**：AI 根据对话内容自动选择合适的 MCP 工具
- **无感接入**：用户无需手动触发，AI 会在需要时自动调用
- **多种工具**：搜索、批量搜索、深度搜索、连接测试

### 🛠️ 可用工具

| 工具 | 说明 | 使用场景 |
|------|------|----------|
| `mcp_search` | 搜索信息 | 实时信息查询、事实核查、资料检索 |
| `mcp_batch_search` | 批量搜索 | 对比多个主题、并行查询多个问题 |
| `mcp_deep_search` | 深度搜索 | 全面了解主题、生成详细报告 |
| `mcp_echo` | 测试连接 | 诊断服务器连接问题 |

### 📊 管理功能
- **设置界面**：配置服务器地址、启用/禁用桥接
- **服务器测试**：一键测试 MCP 服务器连接状态
- **缓存统计**：查看服务器缓存命中率、清空缓存
- **调用历史**：记录最近 100 次工具调用，展示最近 20 条

## 📥 安装

### 方法 1：通过 manifest（推荐）

1. 在 Roche 中打开**插件管理**
2. 点击**安装插件**
3. 粘贴以下链接：

```
https://raw.githubusercontent.com/zxinyi404-maker/roche-mcp-bridge/main/manifest.json
```

4. 点击**安装**

### 方法 2：直接安装 JS

粘贴此链接（不推荐，更新时需要重新安装）：

```
https://raw.githubusercontent.com/zxinyi404-maker/roche-mcp-bridge/main/mcp-bridge.js
```

## ⚙️ 配置

### 1. 打开 MCP 设置

安装后，在 Roche 桌面或应用列表中找到 **MCP 设置**，点击打开。

### 2. 配置服务器地址

默认地址：`http://182.92.218.147:3000`

如果你使用自己的 MCP 服务器，修改为你的服务器地址。

### 3. 启用桥接

确保 **启用 MCP 桥接** 选项已勾选。

### 4. 测试连接

点击 **测试连接** 按钮，确认服务器正常响应。

### 5. 保存设置

点击 **保存设置** 按钮。

## 🚀 使用方法

### 自动调用（推荐）

直接在主聊天中对话，AI 会自动判断何时需要调用 MCP 工具：

**示例 1：信息查询**
```
你：Claude Opus 5 有哪些新特性？
AI：[自动调用 mcp_search 搜索最新信息]
```

**示例 2：对比分析**
```
你：对比一下 GPT-4、Claude 3.5 和 Gemini Pro 的特点
AI：[自动调用 mcp_batch_search 并行搜索多个主题]
```

**示例 3：深度研究**
```
你：帮我详细了解一下量子计算的发展现状
AI：[自动调用 mcp_deep_search 进行深度搜索和分析]
```

### 查看调用历史

1. 打开 **MCP 设置**
2. 滚动到 **调用历史** 区域
3. 查看最近的工具调用记录、参数和结果

## 🏗️ 服务器要求

### ECS MCP 服务器需要提供以下 API 端点：

| 端点 | 方法 | 说明 |
|------|------|------|
| `/mcp/echo` | POST | 测试连接 |
| `/mcp/search_with_cache` | POST | 带缓存的搜索 |
| `/mcp/batch_search` | POST | 批量搜索 |
| `/mcp/deep_search` | POST | 深度搜索 |
| `/mcp/cache_stats` | GET | 缓存统计 |
| `/mcp/clear_cache` | POST | 清空缓存 |

### 请求格式示例

**搜索：**
```json
POST /mcp/search_with_cache
{
  "query": "搜索关键词"
}
```

**批量搜索：**
```json
POST /mcp/batch_search
{
  "queries": ["关键词1", "关键词2", "关键词3"]
}
```

**深度搜索：**
```json
POST /mcp/deep_search
{
  "query": "搜索主题",
  "depth": 3
}
```

## 📝 开发说明

### 项目结构

```
roche-mcp-bridge/
├── manifest.json          # 插件清单
├── mcp-bridge.js         # 插件主文件
└── README.md             # 说明文档
```

### 本地开发

1. 修改 `mcp-bridge.js`
2. 推送到 GitHub
3. 在 Roche 中卸载旧版本
4. 重新安装新版本

### 版本更新

更新插件时需要修改三处版本号：
1. `manifest.json` 中的 `version`
2. `mcp-bridge.js` 顶部注释中的版本号
3. `mcp-bridge.js` 中 `window.RochePlugin.register` 的 `version`

## 🔧 故障排查

### 问题 1：AI 没有调用工具

**可能原因：**
- MCP 桥接未启用
- 服务器地址配置错误
- AI 判断当前对话不需要工具

**解决方法：**
1. 打开 **MCP 设置**，确认已启用
2. 点击 **测试连接**，确认服务器可访问
3. 尝试明确要求 AI 搜索信息

### 问题 2：工具调用失败

**可能原因：**
- 服务器未启动
- 网络连接问题
- 服务器 API 返回错误

**解决方法：**
1. 检查 **调用历史**，查看错误信息
2. 手动测试服务器 API：
   ```bash
   curl -X POST http://你的服务器地址:3000/mcp/echo \
     -H "Content-Type: application/json" \
     -d '{"message":"test"}'
   ```
3. 查看服务器日志

### 问题 3：缓存过期或不准确

**解决方法：**
1. 打开 **MCP 设置**
2. 点击 **清空服务器缓存**
3. 重新调用工具

## 📄 许可

MIT License

## 🔗 相关资源

- **GitHub 仓库**：https://github.com/zxinyi404-maker/roche-mcp-bridge
- **MCP 服务器**：http://182.92.218.147:3000
- **Roche 插件文档**：参考本地开发文档

## 📧 反馈与支持

如有问题或建议，请在 GitHub 提 Issue。
