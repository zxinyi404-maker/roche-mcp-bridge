/*
 * 标准 MCP 插件 for Roche v1.2.0
 * -------------------------------------------------------------
 * 支持标准 MCP 协议（Model Context Protocol）
 * 美化升级：参考 Twitter 插件风格 - 简洁、优雅、扁平化
 */
(function () {
  "use strict";

  const PLUGIN_ID = "standard-mcp";
  const APP_ID = "mcp-manager";
  const VERSION = "1.2.0";

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
        <div class="mcp-top-bar">
          <button class="mcp-back-btn" id="back-btn">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M15 18L9 12L15 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
          <h1 class="mcp-top-title">MCP 服务器</h1>
          <button class="mcp-close-btn" id="close-btn" title="关闭">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </div>

        <!-- 主内容区 -->
        <div class="mcp-content">

          <!-- CORS 代理配置 -->
          <div class="mcp-section">
            <div class="mcp-section-header">
              <svg class="mcp-section-icon" width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" stroke="currentColor" stroke-width="2"/>
                <path d="M2 12H22" stroke="currentColor" stroke-width="2"/>
                <path d="M12 2C14.5013 4.73835 15.9228 8.29203 16 12C15.9228 15.708 14.5013 19.2616 12 22C9.49872 19.2616 8.07725 15.708 8 12C8.07725 8.29203 9.49872 4.73835 12 2Z" stroke="currentColor" stroke-width="2"/>
              </svg>
              <h2>CORS 代理地址</h2>
            </div>
            <p class="mcp-section-desc">用于转发 MCP 请求，解决浏览器跨域限制</p>
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
          </div>

          <!-- MCP 服务器列表 -->
          <div class="mcp-section">
            <div class="mcp-section-header">
              <svg class="mcp-section-icon" width="20" height="20" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="3" width="7" height="7" rx="1" stroke="currentColor" stroke-width="2"/>
                <rect x="14" y="3" width="7" height="7" rx="1" stroke="currentColor" stroke-width="2"/>
                <rect x="14" y="14" width="7" height="7" rx="1" stroke="currentColor" stroke-width="2"/>
                <rect x="3" y="14" width="7" height="7" rx="1" stroke="currentColor" stroke-width="2"/>
              </svg>
              <h2>MCP 服务器</h2>
              <button id="add-server" class="mcp-icon-btn">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M12 5V19M5 12H19" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                </svg>
              </button>
            </div>
            <div id="server-list" class="mcp-server-list">
              ${state.config.servers.length === 0
                ? `<div class="mcp-empty">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                      <rect x="3" y="3" width="7" height="7" rx="1"/>
                      <rect x="14" y="3" width="7" height="7" rx="1"/>
                      <rect x="14" y="14" width="7" height="7" rx="1"/>
                      <rect x="3" y="14" width="7" height="7" rx="1"/>
                    </svg>
                    <p>还没有配置 MCP 服务器</p>
                    <span class="mcp-empty-hint">点击右上角 + 添加服务器</span>
                  </div>`
                : state.config.servers.map((s, i) => renderServerCard(s, i)).join('')
              }
            </div>
          </div>

          <!-- 可用工具列表 -->
          <div class="mcp-section">
            <div class="mcp-section-header">
              <svg class="mcp-section-icon" width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              <h2>可用工具</h2>
              <button id="refresh-tools" class="mcp-icon-btn">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M21.5 2V8M21.5 8H15.5M21.5 8L18 4.5C16.5 3 14.5 2 12 2C6.5 2 2 6.5 2 12C2 17.5 6.5 22 12 22C17 22 21 18.5 21.8 14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </button>
            </div>
            <div id="tools-list" class="mcp-tools-list">
              <div class="mcp-empty-small">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path d="M21.5 2V8M21.5 8H15.5M21.5 8L18 4.5C16.5 3 14.5 2 12 2C6.5 2 2 6.5 2 12C2 17.5 6.5 22 12 22C17 22 21 18.5 21.8 14" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
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
    const statusText = server.connected ? '已连接' : '未连接';
    const statusColor = server.connected ? '#00ba7c' : '#f91880';

    return `
      <div class="mcp-server-card mcp-server-${statusClass}">
        <div class="mcp-server-header">
          <div class="mcp-server-info">
            <h3 class="mcp-server-name">${escapeHtml(server.name)}</h3>
            <p class="mcp-server-url">${escapeHtml(server.url)}</p>
          </div>
          <div class="mcp-server-status" style="color: ${statusColor}">
            <svg width="8" height="8" viewBox="0 0 8 8">
              <circle cx="4" cy="4" r="4" fill="currentColor"/>
            </svg>
            ${statusText}
          </div>
        </div>
        ${server.toolCount !== undefined
          ? `<div class="mcp-server-tools">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
              </svg>
              ${server.toolCount} 个工具
            </div>`
          : ''
        }
        <div class="mcp-server-actions">
          <button class="mcp-action-btn mcp-action-test" data-index="${index}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
            </svg>
            测试
          </button>
          <button class="mcp-action-btn mcp-action-edit" data-index="${index}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
            编辑
          </button>
          <button class="mcp-action-btn mcp-action-delete" data-index="${index}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
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
          if (roche.app && roche.app.close) {
            roche.app.close(APP_ID);
          }
        }
      };
    }

    // 关闭按钮
    const closeBtn = container.querySelector("#close-btn");
    if (closeBtn) {
      closeBtn.onclick = () => {
        if (roche.app && roche.app.close) {
          roche.app.close(APP_ID);
        } else if (window.history.length > 1) {
          window.history.back();
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
    container.querySelectorAll(".mcp-action-test").forEach(btn => {
      btn.onclick = () => testServer(state, container, roche, parseInt(btn.dataset.index));
    });

    container.querySelectorAll(".mcp-action-edit").forEach(btn => {
      btn.onclick = () => showServerDialog(state, container, roche, parseInt(btn.dataset.index));
    });

    container.querySelectorAll(".mcp-action-delete").forEach(btn => {
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
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div class="mcp-dialog-body">
          <div class="mcp-form-item">
            <label>服务器名称</label>
            <input type="text" id="server-name" class="mcp-input" value="${escapeHtml(server.name)}" placeholder="例如: Ombre Brain" />
          </div>
          <div class="mcp-form-item">
            <label>服务器地址</label>
            <input type="text" id="server-url" class="mcp-input" value="${escapeHtml(server.url)}" placeholder="https://example.com/mcp" />
          </div>
          <div class="mcp-form-item">
            <label>认证信息 <span class="mcp-label-optional">(可选)</span></label>
            <input type="text" id="server-auth" class="mcp-input" value="${escapeHtml(server.auth || '')}" placeholder="Bearer token 或留空" />
          </div>
        </div>
        <div class="mcp-dialog-footer">
          <button id="dialog-cancel" class="mcp-btn mcp-btn-secondary">取消</button>
          <button id="dialog-save" class="mcp-btn mcp-btn-primary">${isEdit ? '保存' : '添加'}</button>
        </div>
      </div>
    `;

    document.body.appendChild(dialog);

    requestAnimationFrame(() => {
      dialog.classList.add("mcp-dialog-show");
    });

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
    toolsList.innerHTML = `
      <div class="mcp-loading">
        <div class="mcp-spinner"></div>
        <p>正在加载工具...</p>
      </div>
    `;

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
      toolsList.innerHTML = `
        <div class="mcp-empty-small">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
          </svg>
          <p>没有发现可用工具</p>
        </div>
      `;
    } else {
      toolsList.innerHTML = allTools.map(tool => `
        <div class="mcp-tool-card">
          <div class="mcp-tool-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
            </svg>
          </div>
          <div class="mcp-tool-content">
            <div class="mcp-tool-header">
              <h4 class="mcp-tool-name">${escapeHtml(tool.name)}</h4>
              <span class="mcp-tool-badge">${escapeHtml(tool.serverName)}</span>
            </div>
            <p class="mcp-tool-desc">${escapeHtml(tool.description || '无描述')}</p>
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

  // ==================== 样式（参考 Twitter 风格）====================

  function addStyles() {
    if (document.getElementById("mcp-styles")) return;

    const style = document.createElement("style");
    style.id = "mcp-styles";
    style.textContent = `
      /* 全局 */
      .mcp-app {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        background: #ffffff;
        color: #0f1419;
        min-height: 100vh;
        max-width: 768px;
        margin: 0 auto;
      }

      /* 顶部导航栏 */
      .mcp-top-bar {
        position: sticky;
        top: 0;
        left: 0;
        right: 0;
        height: 60px;
        background: rgba(255, 255, 255, 0.85);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border-bottom: 1px solid #eff3f4;
        display: flex;
        align-items: center;
        padding: 0 16px;
        z-index: 100;
        padding-top: env(safe-area-inset-top);
      }

      .mcp-back-btn {
        width: 36px;
        height: 36px;
        border: none;
        background: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        color: #0f1419;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      }

      .mcp-back-btn:hover {
        background: rgba(0, 0, 0, 0.03);
        transform: scale(1.1);
      }

      .mcp-back-btn:active {
        background: rgba(0, 0, 0, 0.08);
        transform: scale(0.95);
      }

      .mcp-close-btn {
        width: 36px;
        height: 36px;
        border: none;
        background: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        color: #0f1419;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      }

      .mcp-close-btn:hover {
        background: rgba(244, 33, 46, 0.1);
        color: #f4212e;
        transform: scale(1.1);
      }

      .mcp-close-btn:active {
        background: rgba(244, 33, 46, 0.2);
        transform: scale(0.95);
      }

      .mcp-top-title {
        flex: 1;
        text-align: center;
        font-size: 17px;
        font-weight: 700;
        margin: 0;
        color: #0f1419;
      }

      .mcp-top-spacer {
        width: 36px;
      }

      /* 主内容区 */
      .mcp-content {
        padding: 16px;
        padding-bottom: calc(16px + env(safe-area-inset-bottom));
      }

      /* 区块 */
      .mcp-section {
        background: #ffffff;
        border: 1px solid #eff3f4;
        border-radius: 16px;
        padding: 20px;
        margin-bottom: 16px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      }

      .mcp-section:hover {
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
        transform: translateY(-2px);
      }

      .mcp-section-header {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 12px;
      }

      .mcp-section-icon {
        color: #536471;
        flex-shrink: 0;
      }

      .mcp-section-header h2 {
        flex: 1;
        font-size: 19px;
        font-weight: 700;
        margin: 0;
        color: #0f1419;
      }

      .mcp-section-desc {
        font-size: 14px;
        color: #536471;
        margin: 0 0 16px 0;
        line-height: 1.5;
      }

      /* 输入框 */
      .mcp-input-group {
        display: flex;
        gap: 12px;
      }

      .mcp-input {
        flex: 1;
        padding: 12px 16px;
        border: 1px solid #cfd9de;
        border-radius: 8px;
        font-size: 15px;
        outline: none;
        transition: all 0.2s;
      }

      .mcp-input:focus {
        border-color: #1d9bf0;
        box-shadow: 0 0 0 3px rgba(29, 155, 240, 0.1);
      }

      /* 按钮 */
      .mcp-btn {
        padding: 10px 20px;
        border: none;
        border-radius: 20px;
        cursor: pointer;
        font-size: 15px;
        font-weight: 600;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        white-space: nowrap;
      }

      .mcp-btn-primary {
        background: #1d9bf0;
        color: white;
        box-shadow: 0 2px 8px rgba(29, 155, 240, 0.3);
      }

      .mcp-btn-primary:hover {
        background: #1a8cd8;
        box-shadow: 0 4px 12px rgba(29, 155, 240, 0.4);
        transform: translateY(-1px);
      }

      .mcp-btn-primary:active {
        background: #1570b5;
        transform: translateY(0);
        box-shadow: 0 2px 6px rgba(29, 155, 240, 0.3);
      }

      .mcp-btn-secondary {
        background: #eff3f4;
        color: #0f1419;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.04);
      }

      .mcp-btn-secondary:hover {
        background: #e7ecef;
        box-shadow: 0 4px 8px rgba(0, 0, 0, 0.08);
        transform: translateY(-1px);
      }

      .mcp-btn-secondary:active {
        background: #d7dbdf;
        transform: translateY(0);
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.04);
      }

      .mcp-icon-btn {
        width: 36px;
        height: 36px;
        padding: 0;
        border: none;
        background: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        color: #1d9bf0;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      }

      .mcp-icon-btn:hover {
        background: rgba(29, 155, 240, 0.1);
        transform: scale(1.1);
      }

      .mcp-icon-btn:active {
        background: rgba(29, 155, 240, 0.2);
        transform: scale(0.95);
      }

      /* 服务器列表 */
      .mcp-server-list {
        display: grid;
        gap: 12px;
        margin-top: 16px;
      }

      .mcp-server-card {
        border: 1px solid #eff3f4;
        border-radius: 16px;
        padding: 16px;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        background: #ffffff;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
      }

      .mcp-server-card:hover {
        border-color: #cfd9de;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
        transform: translateY(-4px);
      }

      .mcp-server-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 12px;
      }

      .mcp-server-info {
        flex: 1;
        min-width: 0;
      }

      .mcp-server-name {
        font-size: 17px;
        font-weight: 700;
        margin: 0 0 4px 0;
        color: #0f1419;
      }

      .mcp-server-url {
        font-size: 13px;
        color: #536471;
        margin: 0;
        word-break: break-all;
      }

      .mcp-server-status {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 13px;
        font-weight: 600;
        white-space: nowrap;
      }

      .mcp-server-tools {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 14px;
        color: #536471;
        margin-bottom: 12px;
      }

      .mcp-server-actions {
        display: flex;
        gap: 8px;
      }

      .mcp-action-btn {
        flex: 1;
        padding: 8px 12px;
        border: 1px solid #cfd9de;
        background: #ffffff;
        border-radius: 8px;
        cursor: pointer;
        font-size: 14px;
        font-weight: 600;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        color: #0f1419;
        transition: all 0.2s;
      }

      .mcp-action-btn:hover {
        background: rgba(0, 0, 0, 0.03);
      }

      .mcp-action-btn:active {
        background: rgba(0, 0, 0, 0.08);
      }

      .mcp-action-test {
        color: #1d9bf0;
        border-color: #1d9bf0;
      }

      .mcp-action-test:hover {
        background: rgba(29, 155, 240, 0.1);
      }

      .mcp-action-test:active {
        background: rgba(29, 155, 240, 0.2);
      }

      .mcp-action-delete {
        color: #f4212e;
        border-color: #f4212e;
      }

      .mcp-action-delete:hover {
        background: rgba(244, 33, 46, 0.1);
      }

      .mcp-action-delete:active {
        background: rgba(244, 33, 46, 0.2);
      }

      /* 工具列表 */
      .mcp-tools-list {
        display: grid;
        gap: 12px;
        margin-top: 16px;
      }

      .mcp-tool-card {
        display: flex;
        gap: 12px;
        border: 1px solid #eff3f4;
        border-radius: 12px;
        padding: 16px;
        transition: all 0.2s;
        background: #ffffff;
      }

      .mcp-tool-card:hover {
        border-color: #cfd9de;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
      }

      .mcp-tool-icon {
        width: 40px;
        height: 40px;
        border-radius: 8px;
        background: rgba(29, 155, 240, 0.1);
        display: flex;
        align-items: center;
        justify-content: center;
        color: #1d9bf0;
        flex-shrink: 0;
      }

      .mcp-tool-content {
        flex: 1;
        min-width: 0;
      }

      .mcp-tool-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        margin-bottom: 4px;
      }

      .mcp-tool-name {
        font-size: 15px;
        font-weight: 700;
        margin: 0;
        color: #0f1419;
      }

      .mcp-tool-badge {
        font-size: 12px;
        color: #536471;
        background: #eff3f4;
        padding: 2px 8px;
        border-radius: 12px;
        white-space: nowrap;
      }

      .mcp-tool-desc {
        font-size: 14px;
        color: #536471;
        margin: 0;
        line-height: 1.4;
      }

      /* 空状态 */
      .mcp-empty {
        text-align: center;
        padding: 60px 20px;
      }

      .mcp-empty svg {
        color: #cfd9de;
        margin-bottom: 16px;
      }

      .mcp-empty p {
        font-size: 17px;
        font-weight: 700;
        color: #0f1419;
        margin: 0 0 8px 0;
      }

      .mcp-empty-hint {
        font-size: 14px;
        color: #536471;
      }

      .mcp-empty-small {
        text-align: center;
        padding: 40px 20px;
      }

      .mcp-empty-small svg {
        color: #cfd9de;
        margin-bottom: 12px;
      }

      .mcp-empty-small p {
        font-size: 14px;
        color: #536471;
        margin: 0;
      }

      /* 加载状态 */
      .mcp-loading {
        text-align: center;
        padding: 40px 20px;
      }

      .mcp-spinner {
        width: 32px;
        height: 32px;
        margin: 0 auto 16px;
        border: 3px solid #eff3f4;
        border-top-color: #1d9bf0;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
      }

      @keyframes spin {
        to { transform: rotate(360deg); }
      }

      .mcp-loading p {
        font-size: 14px;
        color: #536471;
        margin: 0;
      }

      /* 对话框 */
      .mcp-dialog-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.4);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
        padding: 20px;
        opacity: 0;
        transition: opacity 0.2s;
      }

      .mcp-dialog-overlay.mcp-dialog-show {
        opacity: 1;
      }

      .mcp-dialog {
        background: #ffffff;
        border-radius: 16px;
        width: 100%;
        max-width: 480px;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        transform: scale(0.9);
        transition: transform 0.2s;
      }

      .mcp-dialog-show .mcp-dialog {
        transform: scale(1);
      }

      .mcp-dialog-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 20px 20px 16px 20px;
        border-bottom: 1px solid #eff3f4;
      }

      .mcp-dialog-header h2 {
        font-size: 19px;
        font-weight: 700;
        margin: 0;
        color: #0f1419;
      }

      .mcp-dialog-close {
        width: 32px;
        height: 32px;
        padding: 0;
        border: none;
        background: none;
        cursor: pointer;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #536471;
        transition: background 0.2s;
      }

      .mcp-dialog-close:hover {
        background: rgba(0, 0, 0, 0.03);
      }

      .mcp-dialog-close:active {
        background: rgba(0, 0, 0, 0.08);
      }

      .mcp-dialog-body {
        padding: 20px;
      }

      .mcp-form-item {
        margin-bottom: 20px;
      }

      .mcp-form-item:last-child {
        margin-bottom: 0;
      }

      .mcp-form-item label {
        display: block;
        font-size: 15px;
        font-weight: 600;
        color: #0f1419;
        margin-bottom: 8px;
      }

      .mcp-label-optional {
        font-weight: 400;
        color: #536471;
      }

      .mcp-form-item .mcp-input {
        width: 100%;
        box-sizing: border-box;
      }

      .mcp-dialog-footer {
        display: flex;
        gap: 12px;
        padding: 16px 20px 20px 20px;
      }

      .mcp-dialog-footer .mcp-btn {
        flex: 1;
      }

      /* 移动端适配 */
      @media (max-width: 768px) {
        .mcp-dialog {
          max-width: none;
          width: 100%;
          margin: 0;
          border-radius: 16px 16px 0 0;
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
        }

        .mcp-dialog-overlay:not(.mcp-dialog-show) .mcp-dialog {
          transform: translateY(100%);
        }

        .mcp-dialog-overlay.mcp-dialog-show .mcp-dialog {
          transform: translateY(0);
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
