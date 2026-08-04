/*
 * Roche MCP 桥接插件 v1.0.0
 * 通过 ECS 服务器调用 MCP 工具
 */
(function () {
  "use strict";

  const PLUGIN_ID = "mcp-bridge";
  const MCP_SERVER = "http://182.92.218.147:3000";

  // 全局状态
  let globalState = {
    serverUrl: MCP_SERVER,
    enabled: true,
    initialized: false,
    history: [], // 调用历史
  };

  // 初始化
  async function initGlobalState(roche) {
    if (globalState.initialized) return;

    try {
      const savedUrl = await roche.storage.get("serverUrl");
      const savedEnabled = await roche.storage.get("enabled");
      const savedHistory = await roche.storage.get("history");

      if (savedUrl) globalState.serverUrl = savedUrl;
      if (savedEnabled !== undefined) globalState.enabled = savedEnabled;
      if (savedHistory) globalState.history = savedHistory;

      globalState.initialized = true;
      console.log("[MCP 桥接] 已初始化");
    } catch (e) {
      console.error("[MCP 桥接] 初始化失败:", e);
    }
  }

  // 添加历史记录
  function addToHistory(tool, args, result) {
    globalState.history.unshift({
      tool: tool,
      args: args,
      result: result,
      timestamp: Date.now(),
    });

    if (globalState.history.length > 50) {
      globalState.history = globalState.history.slice(0, 50);
    }
  }

  async function persistState(roche) {
    try {
      await roche.storage.set("history", globalState.history);
    } catch (e) {
      console.error("[MCP 桥接] 持久化失败:", e);
    }
  }

  // 调用 MCP 服务器
  async function callMCPServer(endpoint, data) {
    if (!globalState.enabled) {
      return { error: "MCP 桥接未启用" };
    }

    try {
      const response = await fetch(`${globalState.serverUrl}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (e) {
      return { error: e.message };
    }
  }

  // ============================================================
  // 插件注册
  // ============================================================

  window.RochePlugin.register({
    id: PLUGIN_ID,
    name: "MCP 工具桥接",
    version: "1.0.0",

    chat: {
      scope: {},
      tools: [
        {
          id: "mcp_echo",
          description: "测试 MCP 服务器连接。参数：message（测试消息）",
          parameters: { message: "string" },
          async execute(args, ctx) {
            const roche = ctx.roche || window.Roche;
            await initGlobalState(roche);

            const message = String(args?.message || "Hello MCP").trim();
            const result = await callMCPServer("/mcp/echo", { message });

            addToHistory("mcp_echo", { message }, result);
            await persistState(roche);

            return result;
          },
        },
      ],
    },

    apps: [
      {
        id: "mcp-bridge-settings",
        name: "MCP 设置",
        icon: "settings",
        async mount(container, roche) {
          await initGlobalState(roche);

          container.innerHTML = `
            <div class="roche-plugin-mcp-bridge" style="display: flex; flex-direction: column; height: 100%; font-family: system-ui; color: #333; background: #f5f5f5;">
              <div style="display: flex; align-items: center; padding: 16px; background: white; border-bottom: 1px solid #e0e0e0; flex-shrink: 0;">
                <button id="back-btn" style="padding: 8px 16px; background: #f0f0f0; border: none; border-radius: 6px; cursor: pointer; font-size: 14px;">
                  ← 返回
                </button>
                <h2 style="margin: 0 0 0 16px; font-size: 18px; font-weight: 600;">MCP 工具桥接 v1.0.0</h2>
              </div>

              <div style="flex: 1; overflow-y: auto; padding: 20px;">
                <!-- 基本设置 -->
                <div style="background: white; border-radius: 12px; padding: 20px; margin-bottom: 16px;">
                  <label style="display: block; font-weight: 600; margin-bottom: 8px;">MCP 服务器地址</label>
                  <input id="server-input" type="text" placeholder="http://your-server:3000" value="${globalState.serverUrl}" style="width: 100%; padding: 12px; border: 1px solid #ddd; border-radius: 8px; font-size: 14px; box-sizing: border-box;" />

                  <label style="display: flex; align-items: center; cursor: pointer; margin-top: 12px;">
                    <input id="enabled-checkbox" type="checkbox" ${globalState.enabled ? "checked" : ""} style="width: 20px; height: 20px; margin-right: 10px; cursor: pointer;" />
                    <span style="font-weight: 600;">启用 MCP 桥接</span>
                  </label>
                </div>

                <button id="save-btn" style="width: 100%; padding: 14px; background: #007aff; color: white; border: none; border-radius: 8px; font-size: 16px; font-weight: 600; cursor: pointer; margin-bottom: 16px;">保存设置</button>

                <!-- 服务器状态 -->
                <div style="background: white; border-radius: 12px; padding: 20px; margin-bottom: 16px;">
                  <h3 style="margin: 0 0 12px; font-size: 16px;">📡 服务器状态</h3>
                  <button id="test-btn" style="padding: 10px 20px; background: #4caf50; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px;">测试连接</button>
                  <div id="status-result" style="margin-top: 12px; padding: 12px; background: #f5f5f5; border-radius: 6px; font-size: 13px; display: none;"></div>
                </div>

                <!-- 调用历史 -->
                <div style="background: white; border-radius: 12px; padding: 20px;">
                  <h3 style="margin: 0 0 12px; font-size: 16px;">📜 调用历史（${globalState.history.length}/50）</h3>
                  <div style="max-height: 300px; overflow-y: auto; font-size: 13px;">
                    ${globalState.history.slice(0, 10).map(h => {
                      const time = new Date(h.timestamp).toLocaleString("zh-CN", { hour: "2-digit", minute: "2-digit" });
                      const resultText = h.result.error ? `❌ ${h.result.error}` : `✅ 成功`;
                      return `<div style="padding: 8px; border-bottom: 1px solid #f0f0f0;">
                        <strong>${h.tool}</strong> - ${resultText} <span style="color: #999;">${time}</span>
                      </div>`;
                    }).join("") || "<div style='color: #999;'>暂无调用历史</div>"}
                  </div>
                  <button id="clear-history-btn" style="margin-top: 12px; padding: 8px 16px; background: #ff9800; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px;">清空历史</button>
                </div>
              </div>
            </div>
          `;

          container.querySelector("#back-btn").onclick = () => roche.ui.closeApp();

          container.querySelector("#save-btn").onclick = async () => {
            const input = container.querySelector("#server-input");
            const checkbox = container.querySelector("#enabled-checkbox");
            const url = input.value.trim();

            if (!url) {
              roche.ui.toast("请输入服务器地址");
              return;
            }

            globalState.serverUrl = url;
            globalState.enabled = checkbox.checked;

            await roche.storage.set("serverUrl", url);
            await roche.storage.set("enabled", globalState.enabled);

            roche.ui.toast("✅ 保存成功！");
          };

          container.querySelector("#test-btn").onclick = async () => {
            const resultDiv = container.querySelector("#status-result");
            resultDiv.style.display = "block";
            resultDiv.textContent = "测试中...";
            resultDiv.style.background = "#fff3cd";

            const result = await callMCPServer("/mcp/echo", { message: "测试连接" });

            if (result.error) {
              resultDiv.textContent = `❌ 连接失败：${result.error}`;
              resultDiv.style.background = "#ffebee";
            } else {
              resultDiv.textContent = `✅ 连接成功！服务器返回：${JSON.stringify(result)}`;
              resultDiv.style.background = "#e8f5e9";
            }
          };

          container.querySelector("#clear-history-btn").onclick = async () => {
            const ok = await roche.ui.confirm({
              title: "清空历史",
              message: "确定要清空调用历史吗？"
            });
            if (ok) {
              globalState.history = [];
              await roche.storage.set("history", []);
              roche.ui.toast("✅ 已清空历史");
              roche.ui.closeApp();
              setTimeout(() => roche.ui.openApp("mcp-bridge-settings"), 100);
            }
          };
        },
        async unmount(container) {
          container.innerHTML = "";
        },
      },
    ],
  });
})();
