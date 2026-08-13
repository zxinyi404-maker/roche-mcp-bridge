/*
 * 标准 MCP 插件 for Roche
 * -------------------------------------------------------------
 * 支持标准 MCP 协议（Model Context Protocol）
 *
 * 功能：
 *   - 管理多个 MCP 服务器（添加/删除/编辑）
 *   - 自动发现工具（tools/list）
 *   - 动态注册工具到 Roche
 *   - 支持任意 MCP 服务器（Ombre Brain, 文件系统, 数据库等）
 *
 * 架构：
 *   Roche 前端 → Claude API → 工具调用 → MCP 客户端 → MCP 服务器
 *
 * v1.0: 初始版本 - 服务器管理 + 工具发现
 */
(function () {
  "use strict";

  const PLUGIN_ID = "standard-mcp";
  const APP_ID = "mcp-manager";
  const VERSION = "1.0.0";

  // 存储键
  const STORAGE_KEY_SERVERS = "mcp_servers";
  const STORAGE_KEY_PROXY = "mcp_proxy_url";

  // ==================== 工具函数 ====================

  /**
   * 从存储加载配置
   */
  async function loadConfig(roche) {
    try {
      const servers = await roche.storage.get(STORAGE_KEY_SERVERS);
      const proxyUrl = await roche.storage.get(STORAGE_KEY_PROXY);
      return {
        servers: servers ? JSON.parse(servers) : [],
        proxyUrl: proxyUrl || "https://mcp.littlephone.top/proxy"
      };
    } catch (e) {
      console.error("[MCP] 加载配置失败:", e);
      return {
        servers: [],
        proxyUrl: "https://mcp.littlephone.top/proxy"
      };
    }
  }

  /**
   * 保存配置到存储
   */
  async function saveConfig(roche, config) {
    try {
      await roche.storage.set(STORAGE_KEY_SERVERS, JSON.stringify(config.servers));
      await roche.storage.set(STORAGE_KEY_PROXY, config.proxyUrl);
      // 双写到 localStorage（兼容性）
      localStorage.setItem(STORAGE_KEY_SERVERS, JSON.stringify(config.servers));
      localStorage.setItem(STORAGE_KEY_PROXY, config.proxyUrl);
      return true;
    } catch (e) {
      console.error("[MCP] 保存配置失败:", e);
      return false;
    }
  }

  /**
   * 通过 CORS 代理发送请求
   */
  async function proxyRequest(proxyUrl, targetUrl, options = {}) {
    const payload = {
      url: targetUrl,
      method: options.method || "POST",
      headers: options.headers || { "Content-Type": "application/json" },
      body: options.body || null
    };

    const response = await fetch(proxyUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`代理请求失败: ${response.status} ${response.statusText}`);
    }

    return response;
  }

  /**
   * 调用 MCP 服务器（JSON-RPC 2.0）
   */
  async function callMCP(proxyUrl, serverUrl, method, params = {}) {
    const rpcPayload = {
      jsonrpc: "2.0",
      id: Date.now(),
      method: method,
      params: params
    };

    try {
      const response = await proxyRequest(proxyUrl, serverUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rpcPayload)
      });

      const data = await response.json();

      if (data.error) {
        throw new Error(`MCP 错误: ${data.error.message}`);
      }

      return data.result;
    } catch (e) {
      console.error(`[MCP] 调用 ${method} 失败:`, e);
      throw e;
    }
  }

  /**
   * 测试 MCP 服务器连接
   */
  async function testMCPServer(proxyUrl, serverUrl) {
    try {
      const result = await callMCP(proxyUrl, serverUrl, "tools/list");
      return {
        success: true,
        toolCount: result.tools ? result.tools.length : 0,
        tools: result.tools || []
      };
    } catch (e) {
      return {
        success: false,
        error: e.message
      };
    }
  }

  // ==================== UI 构建 ====================

  /**
   * 构建主界面
   */
  function buildUI(state, container, roche) {
    container.innerHTML = `
      <div class="mcp-manager">
        <div class="mcp-header">
          <h2>🔌 MCP 服务器管理</h2>
          <p class="mcp-subtitle">管理你的 Model Context Protocol 服务器</p>
        </div>

        <!-- CORS 代理配置 -->
        <div class="mcp-section">
          <h3>⚙️ CORS 代理地址</h3>
          <div class="mcp-input-group">
            <input
              type="text"
              id="proxy-url"
              class="mcp-input"
              value="${state.config.proxyUrl}"
              placeholder="https://mcp.littlephone.top/proxy"
            />
            <button id="save-proxy" class="mcp-btn mcp-btn-primary">保存</button>
          </div>
          <p class="mcp-hint">用于转发 MCP 请求，解决浏览器跨域限制</p>
        </div>

        <!-- MCP 服务器列表 -->
        <div class="mcp-section">
          <div class="mcp-section-header">
            <h3>🖥️ MCP 服务器</h3>
            <button id="add-server" class="mcp-btn mcp-btn-success">+ 添加服务器</button>
          </div>
          <div id="server-list" class="mcp-server-list">
            ${state.config.servers.length === 0
              ? '<div class="mcp-empty">还没有配置 MCP 服务器<br/>点击上方按钮添加</div>'
              : state.config.servers.map((s, i) => renderServerCard(s, i)).join('')
            }
          </div>
        </div>

        <!-- 可用工具列表 -->
        <div class="mcp-section">
          <div class="mcp-section-header">
            <h3>🔧 可用工具</h3>
            <button id="refresh-tools" class="mcp-btn">🔄 刷新</button>
          </div>
          <div id="tools-list" class="mcp-tools-list">
            <div class="mcp-hint">点击"刷新"加载所有服务器的工具</div>
          </div>
        </div>
      </div>
    `;

    // 绑定事件
    bindEvents(state, container, roche);
  }

  /**
   * 渲染服务器卡片
   */
  function renderServerCard(server, index) {
    const statusClass = server.connected ? 'connected' : 'disconnected';
    const statusText = server.connected ? '已连接' : '未连接';

    return `
      <div class="mcp-server-card ${statusClass}">
        <div class="mcp-server-header">
          <span class="mcp-server-name">${escapeHtml(server.name)}</span>
          <span class="mcp-server-status">${statusText}</span>
        </div>
        <div class="mcp-server-url">${escapeHtml(server.url)}</div>
        ${server.toolCount !== undefined
          ? `<div class="mcp-server-tools">工具数: ${server.toolCount}</div>`
          : ''
        }
        <div class="mcp-server-actions">
          <button class="mcp-btn-small mcp-btn-test" data-index="${index}">测试</button>
          <button class="mcp-btn-small mcp-btn-edit" data-index="${index}">编辑</button>
          <button class="mcp-btn-small mcp-btn-delete" data-index="${index}">删除</button>
        </div>
      </div>
    `;
  }

  /**
   * 绑定事件
   */
  function bindEvents(state, container, roche) {
    // 保存代理地址
    const saveProxyBtn = container.querySelector("#save-proxy");
    if (saveProxyBtn) {
      saveProxyBtn.onclick = async () => {
        const proxyInput = container.querySelector("#proxy-url");
        state.config.proxyUrl = proxyInput.value.trim();
        await saveConfig(roche, state.config);
        roche.toast("代理地址已保存", "success");
      };
    }

    // 添加服务器
    const addServerBtn = container.querySelector("#add-server");
    if (addServerBtn) {
      addServerBtn.onclick = () => showServerDialog(state, container, roche);
    }

    // 刷新工具列表
    const refreshToolsBtn = container.querySelector("#refresh-tools");
    if (refreshToolsBtn) {
      refreshToolsBtn.onclick = () => refreshTools(state, container, roche);
    }

    // 服务器操作按钮
    container.querySelectorAll(".mcp-btn-test").forEach(btn => {
      btn.onclick = () => testServer(state, container, roche, parseInt(btn.dataset.index));
    });

    container.querySelectorAll(".mcp-btn-edit").forEach(btn => {
      btn.onclick = () => showServerDialog(state, container, roche, parseInt(btn.dataset.index));
    });

    container.querySelectorAll(".mcp-btn-delete").forEach(btn => {
      btn.onclick = () => deleteServer(state, container, roche, parseInt(btn.dataset.index));
    });
  }

  /**
   * 显示服务器编辑对话框
   */
  function showServerDialog(state, container, roche, editIndex = null) {
    const isEdit = editIndex !== null;
    const server = isEdit ? state.config.servers[editIndex] : { name: "", url: "", auth: "" };

    const dialog = document.createElement("div");
    dialog.className = "mcp-dialog-overlay";
    dialog.innerHTML = `
      <div class="mcp-dialog">
        <h3>${isEdit ? '编辑' : '添加'} MCP 服务器</h3>
        <div class="mcp-form">
          <label>名称</label>
          <input type="text" id="server-name" class="mcp-input" value="${escapeHtml(server.name)}" placeholder="例如: Ombre Brain" />

          <label>服务器地址</label>
          <input type="text" id="server-url" class="mcp-input" value="${escapeHtml(server.url)}" placeholder="https://example.com/mcp" />

          <label>认证信息（可选）</label>
          <input type="text" id="server-auth" class="mcp-input" value="${escapeHtml(server.auth || '')}" placeholder="Bearer token 或留空" />
        </div>
        <div class="mcp-dialog-actions">
          <button id="dialog-cancel" class="mcp-btn">取消</button>
          <button id="dialog-save" class="mcp-btn mcp-btn-primary">${isEdit ? '保存' : '添加'}</button>
        </div>
      </div>
    `;

    document.body.appendChild(dialog);

    // 绑定事件
    dialog.querySelector("#dialog-cancel").onclick = () => dialog.remove();
    dialog.querySelector("#dialog-save").onclick = async () => {
      const name = dialog.querySelector("#server-name").value.trim();
      const url = dialog.querySelector("#server-url").value.trim();
      const auth = dialog.querySelector("#server-auth").value.trim();

      if (!name || !url) {
        roche.toast("请填写名称和地址", "error");
        return;
      }

      const newServer = { name, url, auth, connected: false };

      if (isEdit) {
        state.config.servers[editIndex] = newServer;
      } else {
        state.config.servers.push(newServer);
      }

      await saveConfig(roche, state.config);
      dialog.remove();
      buildUI(state, container, roche);
      roche.toast(isEdit ? "服务器已更新" : "服务器已添加", "success");
    };

    // 点击遮罩关闭
    dialog.onclick = (e) => {
      if (e.target === dialog) dialog.remove();
    };
  }

  /**
   * 测试服务器
   */
  async function testServer(state, container, roche, index) {
    const server = state.config.servers[index];
    roche.toast(`正在测试 ${server.name}...`, "info");

    try {
      const result = await testMCPServer(state.config.proxyUrl, server.url);

      if (result.success) {
        server.connected = true;
        server.toolCount = result.toolCount;
        await saveConfig(roche, state.config);
        buildUI(state, container, roche);
        roche.toast(`✅ ${server.name} 连接成功，发现 ${result.toolCount} 个工具`, "success");
      } else {
        server.connected = false;
        delete server.toolCount;
        await saveConfig(roche, state.config);
        buildUI(state, container, roche);
        roche.toast(`❌ ${server.name} 连接失败: ${result.error}`, "error");
      }
    } catch (e) {
      roche.toast(`测试失败: ${e.message}`, "error");
    }
  }

  /**
   * 删除服务器
   */
  async function deleteServer(state, container, roche, index) {
    const server = state.config.servers[index];
    const confirmed = await roche.confirm(`确定删除服务器 "${server.name}" 吗？`);

    if (confirmed) {
      state.config.servers.splice(index, 1);
      await saveConfig(roche, state.config);
      buildUI(state, container, roche);
      roche.toast("服务器已删除", "success");
    }
  }

  /**
   * 刷新工具列表
   */
  async function refreshTools(state, container, roche) {
    const toolsList = container.querySelector("#tools-list");
    toolsList.innerHTML = '<div class="mcp-loading">加载中...</div>';

    const allTools = [];

    for (const server of state.config.servers) {
      try {
        const result = await callMCP(state.config.proxyUrl, server.url, "tools/list");
        const tools = result.tools || [];

        tools.forEach(tool => {
          allTools.push({
            serverName: server.name,
            ...tool
          });
        });
      } catch (e) {
        console.error(`[MCP] 从 ${server.name} 获取工具失败:`, e);
      }
    }

    if (allTools.length === 0) {
      toolsList.innerHTML = '<div class="mcp-empty">没有发现可用工具</div>';
    } else {
      toolsList.innerHTML = allTools.map(tool => `
        <div class="mcp-tool-card">
          <div class="mcp-tool-header">
            <span class="mcp-tool-name">${escapeHtml(tool.name)}</span>
            <span class="mcp-tool-server">${escapeHtml(tool.serverName)}</span>
          </div>
          <div class="mcp-tool-desc">${escapeHtml(tool.description || '无描述')}</div>
        </div>
      `).join('');
    }

    roche.toast(`发现 ${allTools.length} 个工具`, "success");
  }

  /**
   * HTML 转义
   */
  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  // ==================== 插件注册 ====================

  window.RochePlugin.register({
    id: PLUGIN_ID,
    name: "MCP 服务器",
    version: VERSION,
    description: "支持标准 MCP 协议，连接任意 MCP 服务器",

    // 聊天工具（动态填充）
    chat: {
      tools: []
      // 稍后通过 registerTools() 动态添加
    },

    // UI 应用
    apps: [
      {
        id: APP_ID,
        name: "MCP 管理",
        icon: "settings_input_component",
        async mount(container, roche) {
          const config = await loadConfig(roche);
          const state = {
            config: config,
            roche: roche
          };

          container.__mcpState = state;

          // 添加样式
          addStyles();

          // 构建 UI
          buildUI(state, container, roche);
        },
        async unmount(container, roche) {
          container.__mcpState = null;
          removeStyles();
          container.replaceChildren();
        }
      }
    ]
  });

  // ==================== 样式 ====================

  function addStyles() {
    if (document.getElementById("mcp-styles")) return;

    const style = document.createElement("style");
    style.id = "mcp-styles";
    style.textContent = `
      .mcp-manager {
        padding: 20px;
        max-width: 900px;
        margin: 0 auto;
      }

      .mcp-header {
        margin-bottom: 30px;
        text-align: center;
      }

      .mcp-header h2 {
        margin: 0 0 10px 0;
        font-size: 28px;
        color: #333;
      }

      .mcp-subtitle {
        color: #666;
        margin: 0;
      }

      .mcp-section {
        background: white;
        border-radius: 12px;
        padding: 20px;
        margin-bottom: 20px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      }

      .mcp-section h3 {
        margin: 0 0 15px 0;
        font-size: 18px;
        color: #333;
      }

      .mcp-section-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 15px;
      }

      .mcp-input-group {
        display: flex;
        gap: 10px;
      }

      .mcp-input {
        flex: 1;
        padding: 10px;
        border: 1px solid #ddd;
        border-radius: 6px;
        font-size: 14px;
      }

      .mcp-btn {
        padding: 10px 20px;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-size: 14px;
        background: #f0f0f0;
        color: #333;
        transition: all 0.2s;
      }

      .mcp-btn:hover {
        background: #e0e0e0;
      }

      .mcp-btn-primary {
        background: #2196F3;
        color: white;
      }

      .mcp-btn-primary:hover {
        background: #1976D2;
      }

      .mcp-btn-success {
        background: #4CAF50;
        color: white;
      }

      .mcp-btn-success:hover {
        background: #45a049;
      }

      .mcp-hint {
        color: #999;
        font-size: 12px;
        margin-top: 5px;
      }

      .mcp-server-list {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
        gap: 15px;
      }

      .mcp-server-card {
        background: #f9f9f9;
        border: 2px solid #ddd;
        border-radius: 8px;
        padding: 15px;
        transition: all 0.2s;
      }

      .mcp-server-card.connected {
        border-color: #4CAF50;
        background: #f1f8f4;
      }

      .mcp-server-card.disconnected {
        border-color: #ff9800;
        background: #fff8f0;
      }

      .mcp-server-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 10px;
      }

      .mcp-server-name {
        font-weight: bold;
        font-size: 16px;
      }

      .mcp-server-status {
        font-size: 12px;
        padding: 3px 8px;
        border-radius: 12px;
        background: #4CAF50;
        color: white;
      }

      .mcp-server-card.disconnected .mcp-server-status {
        background: #ff9800;
      }

      .mcp-server-url {
        font-size: 12px;
        color: #666;
        word-break: break-all;
        margin-bottom: 8px;
      }

      .mcp-server-tools {
        font-size: 13px;
        color: #555;
        margin-bottom: 10px;
      }

      .mcp-server-actions {
        display: flex;
        gap: 8px;
      }

      .mcp-btn-small {
        padding: 6px 12px;
        font-size: 12px;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        background: white;
        color: #333;
        transition: all 0.2s;
      }

      .mcp-btn-test {
        background: #2196F3;
        color: white;
      }

      .mcp-btn-edit {
        background: #FF9800;
        color: white;
      }

      .mcp-btn-delete {
        background: #f44336;
        color: white;
      }

      .mcp-empty {
        text-align: center;
        color: #999;
        padding: 40px;
        line-height: 1.6;
      }

      .mcp-tools-list {
        display: grid;
        gap: 10px;
      }

      .mcp-tool-card {
        background: #f9f9f9;
        border: 1px solid #ddd;
        border-radius: 6px;
        padding: 12px;
      }

      .mcp-tool-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 5px;
      }

      .mcp-tool-name {
        font-weight: bold;
        font-size: 14px;
      }

      .mcp-tool-server {
        font-size: 12px;
        color: #666;
        background: #e0e0e0;
        padding: 2px 8px;
        border-radius: 10px;
      }

      .mcp-tool-desc {
        font-size: 13px;
        color: #666;
      }

      .mcp-loading {
        text-align: center;
        color: #999;
        padding: 20px;
      }

      /* 对话框 */
      .mcp-dialog-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0,0,0,0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
      }

      .mcp-dialog {
        background: white;
        border-radius: 12px;
        padding: 24px;
        width: 90%;
        max-width: 500px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.3);
      }

      .mcp-dialog h3 {
        margin: 0 0 20px 0;
        font-size: 20px;
      }

      .mcp-form label {
        display: block;
        margin-bottom: 5px;
        font-size: 14px;
        font-weight: 500;
        color: #555;
      }

      .mcp-form input {
        width: 100%;
        padding: 10px;
        margin-bottom: 15px;
        border: 1px solid #ddd;
        border-radius: 6px;
        font-size: 14px;
        box-sizing: border-box;
      }

      .mcp-dialog-actions {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
        margin-top: 20px;
      }
    `;

    document.head.appendChild(style);
  }

  function removeStyles() {
    const style = document.getElementById("mcp-styles");
    if (style) style.remove();
  }

})();
