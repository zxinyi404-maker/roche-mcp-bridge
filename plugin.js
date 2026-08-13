/*
 * 标准 MCP 插件 for Roche v1.1.0
 * -------------------------------------------------------------
 * 支持标准 MCP 协议（Model Context Protocol）
 * 美化升级：现代化 UI、毛玻璃效果、平滑动画
 */
(function () {
  "use strict";

  const PLUGIN_ID = "standard-mcp";
  const APP_ID = "mcp-manager";
  const VERSION = "1.1.0";

  const STORAGE_KEY_SERVERS = "mcp_servers";
  const STORAGE_KEY_PROXY = "mcp_proxy_url";

  // ==================== 工具函数 ====================

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

  async function saveConfig(roche, config) {
    try {
      await roche.storage.set(STORAGE_KEY_SERVERS, JSON.stringify(config.servers));
      await roche.storage.set(STORAGE_KEY_PROXY, config.proxyUrl);
      localStorage.setItem(STORAGE_KEY_SERVERS, JSON.stringify(config.servers));
      localStorage.setItem(STORAGE_KEY_PROXY, config.proxyUrl);
      return true;
    } catch (e) {
      console.error("[MCP] 保存配置失败:", e);
      return false;
    }
  }

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
      throw new Error(`代理请求失败: ${response.status}`);
    }

    return response;
  }

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

  function buildUI(state, container, roche) {
    container.innerHTML = `
      <div class="mcp-app">
        <!-- 顶部导航栏 -->
        <div class="mcp-header">
          <button class="mcp-back-btn" id="back-btn">
            <span class="material-icons">arrow_back</span>
          </button>
          <h1 class="mcp-title">MCP 服务器</h1>
          <div class="mcp-header-spacer"></div>
        </div>

        <!-- 主内容区 -->
        <div class="mcp-content">
          <!-- CORS 代理配置卡片 -->
          <div class="mcp-card mcp-card-gradient">
            <div class="mcp-card-header">
              <span class="material-icons mcp-card-icon">cloud_sync</span>
              <h2>CORS 代理</h2>
            </div>
            <p class="mcp-card-desc">用于转发 MCP 请求，解决浏览器跨域限制</p>
            <div class="mcp-input-row">
              <input
                type="text"
                id="proxy-url"
                class="mcp-input"
                value="${state.config.proxyUrl}"
                placeholder="https://mcp.littlephone.top/proxy"
              />
              <button id="save-proxy" class="mcp-btn mcp-btn-primary">
                <span class="material-icons">check</span>
              </button>
            </div>
          </div>

          <!-- MCP 服务器列表 -->
          <div class="mcp-card">
            <div class="mcp-card-header">
              <span class="material-icons mcp-card-icon">dns</span>
              <h2>MCP 服务器</h2>
              <button id="add-server" class="mcp-btn-icon">
                <span class="material-icons">add_circle</span>
              </button>
            </div>
            <div id="server-list" class="mcp-server-list">
              ${state.config.servers.length === 0
                ? '<div class="mcp-empty"><span class="material-icons">dns</span><p>还没有配置服务器</p><span class="mcp-hint-text">点击右上角添加</span></div>'
                : state.config.servers.map((s, i) => renderServerCard(s, i)).join('')
              }
            </div>
          </div>

          <!-- 可用工具列表 -->
          <div class="mcp-card">
            <div class="mcp-card-header">
              <span class="material-icons mcp-card-icon">build</span>
              <h2>可用工具</h2>
              <button id="refresh-tools" class="mcp-btn-icon">
                <span class="material-icons">refresh</span>
              </button>
            </div>
            <div id="tools-list" class="mcp-tools-list">
              <div class="mcp-empty-small">
                <span class="material-icons">refresh</span>
                <p>点击右上角刷新加载工具</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    bindEvents(state, container, roche);
  }

  function renderServerCard(server, index) {
    const statusClass = server.connected ? 'connected' : 'disconnected';
    const statusIcon = server.connected ? 'check_circle' : 'error';
    const statusText = server.connected ? '已连接' : '未连接';

    return `
      <div class="mcp-server-card mcp-server-${statusClass}">
        <div class="mcp-server-status-badge">
          <span class="material-icons">${statusIcon}</span>
          ${statusText}
        </div>
        <h3 class="mcp-server-name">${escapeHtml(server.name)}</h3>
        <p class="mcp-server-url">${escapeHtml(server.url)}</p>
        ${server.toolCount !== undefined
          ? `<div class="mcp-server-tools"><span class="material-icons">build</span> ${server.toolCount} 个工具</div>`
          : ''
        }
        <div class="mcp-server-actions">
          <button class="mcp-action-btn mcp-btn-test" data-index="${index}">
            <span class="material-icons">flash_on</span>
            测试
          </button>
          <button class="mcp-action-btn mcp-btn-edit" data-index="${index}">
            <span class="material-icons">edit</span>
            编辑
          </button>
          <button class="mcp-action-btn mcp-btn-delete" data-index="${index}">
            <span class="material-icons">delete</span>
            删除
          </button>
        </div>
      </div>
    `;
  }

  function bindEvents(state, container, roche) {
    // 返回按钮
    const backBtn = container.querySelector("#back-btn");
    if (backBtn) {
      backBtn.onclick = () => {
        if (window.history.length > 1) {
          window.history.back();
        } else {
          // Roche 的返回逻辑
          if (roche.app && roche.app.close) {
            roche.app.close(APP_ID);
          }
        }
      };
    }

    // 保存代理
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

    // 刷新工具
    const refreshToolsBtn = container.querySelector("#refresh-tools");
    if (refreshToolsBtn) {
      refreshToolsBtn.onclick = () => refreshTools(state, container, roche);
    }

    // 服务器操作
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

  function showServerDialog(state, container, roche, editIndex = null) {
    const isEdit = editIndex !== null;
    const server = isEdit ? state.config.servers[editIndex] : { name: "", url: "", auth: "" };

    const dialog = document.createElement("div");
    dialog.className = "mcp-dialog-overlay";
    dialog.innerHTML = `
      <div class="mcp-dialog">
        <div class="mcp-dialog-header">
          <h2>${isEdit ? '编辑' : '添加'}服务器</h2>
          <button class="mcp-dialog-close" id="dialog-close">
            <span class="material-icons">close</span>
          </button>
        </div>
        <div class="mcp-dialog-content">
          <div class="mcp-form-group">
            <label>
              <span class="material-icons">label</span>
              名称
            </label>
            <input type="text" id="server-name" class="mcp-input" value="${escapeHtml(server.name)}" placeholder="例如: Ombre Brain" />
          </div>

          <div class="mcp-form-group">
            <label>
              <span class="material-icons">link</span>
              服务器地址
            </label>
            <input type="text" id="server-url" class="mcp-input" value="${escapeHtml(server.url)}" placeholder="https://example.com/mcp" />
          </div>

          <div class="mcp-form-group">
            <label>
              <span class="material-icons">vpn_key</span>
              认证信息（可选）
            </label>
            <input type="text" id="server-auth" class="mcp-input" value="${escapeHtml(server.auth || '')}" placeholder="Bearer token 或留空" />
          </div>
        </div>
        <div class="mcp-dialog-actions">
          <button id="dialog-cancel" class="mcp-btn mcp-btn-secondary">取消</button>
          <button id="dialog-save" class="mcp-btn mcp-btn-primary">${isEdit ? '保存' : '添加'}</button>
        </div>
      </div>
    `;

    document.body.appendChild(dialog);

    // 动画进入
    requestAnimationFrame(() => {
      dialog.classList.add("mcp-dialog-show");
    });

    // 绑定事件
    dialog.querySelector("#dialog-close").onclick = () => closeDialog(dialog);
    dialog.querySelector("#dialog-cancel").onclick = () => closeDialog(dialog);

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
      closeDialog(dialog);
      buildUI(state, container, roche);
      roche.toast(isEdit ? "服务器已更新" : "服务器已添加", "success");
    };

    dialog.onclick = (e) => {
      if (e.target === dialog) closeDialog(dialog);
    };
  }

  function closeDialog(dialog) {
    dialog.classList.remove("mcp-dialog-show");
    setTimeout(() => dialog.remove(), 300);
  }

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
        roche.toast(`✅ ${server.name} 连接成功！发现 ${result.toolCount} 个工具`, "success");
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

  async function refreshTools(state, container, roche) {
    const toolsList = container.querySelector("#tools-list");
    toolsList.innerHTML = '<div class="mcp-loading"><div class="mcp-spinner"></div><p>加载中...</p></div>';

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
      toolsList.innerHTML = '<div class="mcp-empty-small"><span class="material-icons">build</span><p>没有发现可用工具</p></div>';
    } else {
      toolsList.innerHTML = allTools.map(tool => `
        <div class="mcp-tool-card">
          <div class="mcp-tool-icon">
            <span class="material-icons">extension</span>
          </div>
          <div class="mcp-tool-info">
            <h4 class="mcp-tool-name">${escapeHtml(tool.name)}</h4>
            <p class="mcp-tool-desc">${escapeHtml(tool.description || '无描述')}</p>
            <span class="mcp-tool-server">${escapeHtml(tool.serverName)}</span>
          </div>
        </div>
      `).join('');
    }

    roche.toast(`发现 ${allTools.length} 个工具`, "success");
  }

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

    chat: {
      tools: []
    },

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
          addStyles();
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
      /* 全局样式 */
      .mcp-app {
        height: 100vh;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        overflow: hidden;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }

      /* 顶部导航 */
      .mcp-header {
        position: sticky;
        top: 0;
        left: 0;
        right: 0;
        height: 60px;
        background: rgba(255, 255, 255, 0.95);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        display: flex;
        align-items: center;
        padding: 0 16px;
        z-index: 100;
        box-shadow: 0 2px 20px rgba(0, 0, 0, 0.1);
        padding-top: env(safe-area-inset-top);
      }

      .mcp-back-btn {
        width: 40px;
        height: 40px;
        border: none;
        background: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        transition: all 0.2s;
        color: #333;
      }

      .mcp-back-btn:hover {
        background: rgba(0, 0, 0, 0.05);
      }

      .mcp-back-btn:active {
        transform: scale(0.95);
      }

      .mcp-title {
        flex: 1;
        text-align: center;
        font-size: 18px;
        font-weight: 600;
        color: #333;
        margin: 0;
      }

      .mcp-header-spacer {
        width: 40px;
      }

      /* 主内容区 */
      .mcp-content {
        height: calc(100vh - 60px - env(safe-area-inset-top));
        overflow-y: auto;
        -webkit-overflow-scrolling: touch;
        padding: 20px 16px;
        padding-bottom: calc(20px + env(safe-area-inset-bottom));
      }

      /* 卡片 */
      .mcp-card {
        background: rgba(255, 255, 255, 0.95);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        border-radius: 20px;
        padding: 24px;
        margin-bottom: 20px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
        animation: slideUp 0.4s ease-out;
      }

      .mcp-card-gradient {
        background: linear-gradient(135deg, rgba(102, 126, 234, 0.15) 0%, rgba(118, 75, 162, 0.15) 100%);
        border: 2px solid rgba(255, 255, 255, 0.5);
      }

      @keyframes slideUp {
        from {
          opacity: 0;
          transform: translateY(20px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      .mcp-card-header {
        display: flex;
        align-items: center;
        margin-bottom: 16px;
        gap: 12px;
      }

      .mcp-card-icon {
        color: #667eea;
        font-size: 28px;
      }

      .mcp-card-header h2 {
        flex: 1;
        margin: 0;
        font-size: 20px;
        font-weight: 600;
        color: #333;
      }

      .mcp-card-desc {
        color: #666;
        font-size: 14px;
        margin: 0 0 16px 0;
        line-height: 1.5;
      }

      /* 输入框 */
      .mcp-input-row {
        display: flex;
        gap: 12px;
      }

      .mcp-input {
        flex: 1;
        padding: 12px 16px;
        border: 2px solid rgba(102, 126, 234, 0.2);
        border-radius: 12px;
        font-size: 14px;
        background: rgba(255, 255, 255, 0.8);
        transition: all 0.2s;
        outline: none;
      }

      .mcp-input:focus {
        border-color: #667eea;
        background: white;
        box-shadow: 0 0 0 4px rgba(102, 126, 234, 0.1);
      }

      /* 按钮 */
      .mcp-btn {
        padding: 12px 24px;
        border: none;
        border-radius: 12px;
        cursor: pointer;
        font-size: 14px;
        font-weight: 500;
        transition: all 0.2s;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
      }

      .mcp-btn:active {
        transform: scale(0.95);
      }

      .mcp-btn-primary {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
      }

      .mcp-btn-primary:hover {
        box-shadow: 0 6px 20px rgba(102, 126, 234, 0.5);
      }

      .mcp-btn-secondary {
        background: #f0f0f0;
        color: #333;
      }

      .mcp-btn-icon {
        width: 40px;
        height: 40px;
        padding: 0;
        border: none;
        background: none;
        cursor: pointer;
        color: #667eea;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
      }

      .mcp-btn-icon:hover {
        background: rgba(102, 126, 234, 0.1);
      }

      .mcp-btn-icon:active {
        transform: scale(0.9);
      }

      /* 服务器列表 */
      .mcp-server-list {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
        gap: 16px;
        margin-top: 16px;
      }

      .mcp-server-card {
        position: relative;
        background: white;
        border-radius: 16px;
        padding: 20px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
        transition: all 0.3s;
        border: 2px solid transparent;
      }

      .mcp-server-card:hover {
        transform: translateY(-4px);
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
      }

      .mcp-server-connected {
        border-color: #4CAF50;
        background: linear-gradient(135deg, rgba(76, 175, 80, 0.05) 0%, rgba(102, 187, 106, 0.05) 100%);
      }

      .mcp-server-disconnected {
        border-color: #ff9800;
        background: linear-gradient(135deg, rgba(255, 152, 0, 0.05) 0%, rgba(255, 193, 7, 0.05) 100%);
      }

      .mcp-server-status-badge {
        position: absolute;
        top: 16px;
        right: 16px;
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 4px 12px;
        border-radius: 20px;
        font-size: 12px;
        font-weight: 500;
        background: #4CAF50;
        color: white;
      }

      .mcp-server-disconnected .mcp-server-status-badge {
        background: #ff9800;
      }

      .mcp-server-status-badge .material-icons {
        font-size: 16px;
      }

      .mcp-server-name {
        margin: 0 0 8px 0;
        font-size: 18px;
        font-weight: 600;
        color: #333;
        padding-right: 80px;
      }

      .mcp-server-url {
        font-size: 12px;
        color: #666;
        word-break: break-all;
        margin: 0 0 12px 0;
        line-height: 1.4;
      }

      .mcp-server-tools {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 13px;
        color: #667eea;
        margin-bottom: 16px;
        font-weight: 500;
      }

      .mcp-server-tools .material-icons {
        font-size: 18px;
      }

      .mcp-server-actions {
        display: flex;
        gap: 8px;
      }

      .mcp-action-btn {
        flex: 1;
        padding: 8px;
        border: none;
        border-radius: 10px;
        cursor: pointer;
        font-size: 12px;
        font-weight: 500;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 4px;
        transition: all 0.2s;
      }

      .mcp-action-btn .material-icons {
        font-size: 16px;
      }

      .mcp-btn-test {
        background: #2196F3;
        color: white;
      }

      .mcp-btn-test:hover {
        background: #1976D2;
      }

      .mcp-btn-edit {
        background: #FF9800;
        color: white;
      }

      .mcp-btn-edit:hover {
        background: #F57C00;
      }

      .mcp-btn-delete {
        background: #f44336;
        color: white;
      }

      .mcp-btn-delete:hover {
        background: #d32f2f;
      }

      /* 工具列表 */
      .mcp-tools-list {
        display: grid;
        gap: 12px;
        margin-top: 16px;
      }

      .mcp-tool-card {
        display: flex;
        gap: 16px;
        background: white;
        border-radius: 12px;
        padding: 16px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
        transition: all 0.2s;
      }

      .mcp-tool-card:hover {
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        transform: translateX(4px);
      }

      .mcp-tool-icon {
        width: 48px;
        height: 48px;
        border-radius: 12px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        flex-shrink: 0;
      }

      .mcp-tool-icon .material-icons {
        font-size: 24px;
      }

      .mcp-tool-info {
        flex: 1;
        min-width: 0;
      }

      .mcp-tool-name {
        margin: 0 0 4px 0;
        font-size: 16px;
        font-weight: 600;
        color: #333;
      }

      .mcp-tool-desc {
        margin: 0 0 8px 0;
        font-size: 13px;
        color: #666;
        line-height: 1.4;
      }

      .mcp-tool-server {
        display: inline-block;
        padding: 2px 8px;
        border-radius: 12px;
        background: rgba(102, 126, 234, 0.1);
        color: #667eea;
        font-size: 11px;
        font-weight: 500;
      }

      /* 空状态 */
      .mcp-empty {
        text-align: center;
        padding: 60px 20px;
        color: #999;
      }

      .mcp-empty .material-icons {
        font-size: 64px;
        color: #ddd;
        margin-bottom: 16px;
      }

      .mcp-empty p {
        margin: 0 0 8px 0;
        font-size: 16px;
        font-weight: 500;
      }

      .mcp-hint-text {
        font-size: 13px;
        color: #bbb;
      }

      .mcp-empty-small {
        text-align: center;
        padding: 40px 20px;
        color: #999;
      }

      .mcp-empty-small .material-icons {
        font-size: 48px;
        color: #ddd;
        margin-bottom: 12px;
      }

      .mcp-empty-small p {
        margin: 0;
        font-size: 14px;
      }

      /* 加载动画 */
      .mcp-loading {
        text-align: center;
        padding: 40px;
      }

      .mcp-spinner {
        width: 40px;
        height: 40px;
        margin: 0 auto 16px;
        border: 4px solid rgba(102, 126, 234, 0.2);
        border-top-color: #667eea;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
      }

      @keyframes spin {
        to { transform: rotate(360deg); }
      }

      .mcp-loading p {
        color: #999;
        font-size: 14px;
      }

      /* 对话框 */
      .mcp-dialog-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
        opacity: 0;
        transition: opacity 0.3s;
        padding: 20px;
      }

      .mcp-dialog-overlay.mcp-dialog-show {
        opacity: 1;
      }

      .mcp-dialog {
        background: white;
        border-radius: 24px;
        width: 100%;
        max-width: 500px;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        transform: scale(0.9) translateY(20px);
        transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
        overflow: hidden;
      }

      .mcp-dialog-show .mcp-dialog {
        transform: scale(1) translateY(0);
      }

      .mcp-dialog-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 24px 24px 0 24px;
      }

      .mcp-dialog-header h2 {
        margin: 0;
        font-size: 22px;
        font-weight: 600;
        color: #333;
      }

      .mcp-dialog-close {
        width: 36px;
        height: 36px;
        padding: 0;
        border: none;
        background: none;
        cursor: pointer;
        color: #999;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
      }

      .mcp-dialog-close:hover {
        background: #f0f0f0;
        color: #333;
      }

      .mcp-dialog-content {
        padding: 24px;
      }

      .mcp-form-group {
        margin-bottom: 20px;
      }

      .mcp-form-group:last-child {
        margin-bottom: 0;
      }

      .mcp-form-group label {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 8px;
        font-size: 14px;
        font-weight: 500;
        color: #555;
      }

      .mcp-form-group label .material-icons {
        font-size: 18px;
        color: #667eea;
      }

      .mcp-form-group .mcp-input {
        width: 100%;
        box-sizing: border-box;
      }

      .mcp-dialog-actions {
        display: flex;
        gap: 12px;
        padding: 0 24px 24px 24px;
      }

      .mcp-dialog-actions .mcp-btn {
        flex: 1;
      }

      /* 移动端适配 */
      @media (max-width: 768px) {
        .mcp-server-list {
          grid-template-columns: 1fr;
        }

        .mcp-dialog {
          max-width: none;
          width: 100%;
          margin: 0;
          border-radius: 24px 24px 0 0;
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
        }

        .mcp-dialog-overlay.mcp-dialog-show .mcp-dialog {
          transform: translateY(0);
        }

        .mcp-dialog-overlay:not(.mcp-dialog-show) .mcp-dialog {
          transform: translateY(100%);
        }
      }
    `;

    document.head.appendChild(style);
  }

  function removeStyles() {
    const style = document.getElementById("mcp-styles");
    if (style) style.remove();
  }

})();
