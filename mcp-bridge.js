/*
 * Roche MCP 桥接插件 v2.0.1
 * 让主聊天 AI 按需调用 ECS MCP 服务器工具
 */
(function () {
  "use strict";

  const PLUGIN_ID = "mcp-bridge";
  const MCP_SERVER = "http://182.92.218.147:3000/mcp";

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

    if (globalState.history.length > 100) {
      globalState.history = globalState.history.slice(0, 100);
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
      return { error: "MCP 桥接未启用，请在 MCP 设置中启用" };
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
      return { error: `MCP 服务器请求失败: ${e.message}` };
    }
  }

  // ============================================================
  // 插件注册
  // ============================================================

  window.RochePlugin.register({
    id: PLUGIN_ID,
    name: "MCP 工具桥接",
    version: "2.0.1",

    // 主聊天工具注册
    chat: {
      scope: {}, // 对所有会话生效

      tools: [
        {
          id: "mcp_echo",
          description: "测试 MCP 服务器连接。仅在需要诊断连接问题时使用。参数：message（测试消息）",
          parameters: { message: "string" },
          async execute(args, ctx) {
            const roche = ctx.roche || window.Roche;
            await initGlobalState(roche);

            const message = String(args?.message || "Hello MCP").trim();
            const result = await callMCPServer("/echo", { message });

            addToHistory("mcp_echo", { message }, result);
            await persistState(roche);

            return result;
          },
        },

        {
          id: "mcp_search",
          description: "通过 MCP 服务器搜索信息。适用于需要查询实时信息、事实核查、资料检索的场景。参数：query（搜索关键词）",
          parameters: { query: "string" },
          async execute(args, ctx) {
            const roche = ctx.roche || window.Roche;
            await initGlobalState(roche);

            const query = String(args?.query || "").trim();
            if (!query) {
              return { error: "搜索关键词不能为空" };
            }

            const result = await callMCPServer("/search_with_cache", { query });

            addToHistory("mcp_search", { query }, result);
            await persistState(roche);

            return result;
          },
        },

        {
          id: "mcp_batch_search",
          description: "批量搜索多个关键词。适用于需要对比多个主题、并行查询多个问题的场景。参数：queries（字符串数组）",
          parameters: { queries: "array" },
          async execute(args, ctx) {
            const roche = ctx.roche || window.Roche;
            await initGlobalState(roche);

            const queries = Array.isArray(args?.queries) ? args.queries : [];
            if (queries.length === 0) {
              return { error: "搜索关键词列表不能为空" };
            }

            const result = await callMCPServer("/batch_search", { queries });

            addToHistory("mcp_batch_search", { queries }, result);
            await persistState(roche);

            return result;
          },
        },

        {
          id: "mcp_deep_search",
          description: "深度搜索并汇总分析。适用于需要全面了解某个主题、生成详细报告的场景。参数：query（搜索主题），depth（深度，默认3）",
          parameters: {
            query: "string",
            depth: "number"
          },
          async execute(args, ctx) {
            const roche = ctx.roche || window.Roche;
            await initGlobalState(roche);

            const query = String(args?.query || "").trim();
            const depth = parseInt(args?.depth) || 3;

            if (!query) {
              return { error: "搜索主题不能为空" };
            }

            const result = await callMCPServer("/deep_search", {
              query,
              depth: Math.min(depth, 5) // 限制最大深度
            });

            addToHistory("mcp_deep_search", { query, depth }, result);
            await persistState(roche);

            return result;
          },
        },
      ],
    },

    // 设置 App
    apps: [
      {
        id: "mcp-bridge-settings",
        name: "MCP 设置",
        icon: "settings",
        async mount(container, roche) {
          await initGlobalState(roche);

          // 获取缓存统计
          let cacheStats = { hits: 0, misses: 0, total: 0 };
          try {
            const response = await fetch(`${globalState.serverUrl}/cache_stats`);
            if (response.ok) {
              cacheStats = await response.json();
            }
          } catch (e) {
            console.error("获取缓存统计失败:", e);
          }

          container.innerHTML = `
            <div class="roche-plugin-mcp-bridge" style="display: flex; flex-direction: column; height: 100%; font-family: system-ui; color: #333; background: #f5f5f5;">
              <div style="display: flex; align-items: center; padding: 16px; background: white; border-bottom: 1px solid #e0e0e0; flex-shrink: 0;">
                <button id="back-btn" style="padding: 8px 16px; background: #f0f0f0; border: none; border-radius: 6px; cursor: pointer; font-size: 14px;">
                  ← 返回
                </button>
                <h2 style="margin: 0 0 0 16px; font-size: 18px; font-weight: 600;">MCP 工具桥接 v2.0.1</h2>
              </div>

              <div style="flex: 1; overflow-y: auto; padding: 20px;">
                <!-- 状态横幅 -->
                <div style="background: ${globalState.enabled ? '#e8f5e9' : '#ffebee'}; border-radius: 12px; padding: 16px; margin-bottom: 16px; display: flex; align-items: center;">
                  <span style="font-size: 24px; margin-right: 12px;">${globalState.enabled ? '✅' : '❌'}</span>
                  <div>
                    <div style="font-weight: 600; font-size: 16px;">${globalState.enabled ? 'MCP 桥接已启用' : 'MCP 桥接已禁用'}</div>
                    <div style="font-size: 13px; color: #666; margin-top: 4px;">主聊天 AI ${globalState.enabled ? '可以' : '无法'}调用 MCP 工具</div>
                  </div>
                </div>

                <!-- 基本设置 -->
                <div style="background: white; border-radius: 12px; padding: 20px; margin-bottom: 16px;">
                  <h3 style="margin: 0 0 16px; font-size: 16px;">⚙️ 基本设置</h3>

                  <label style="display: block; font-weight: 600; margin-bottom: 8px; font-size: 14px;">MCP 服务器地址</label>
                  <input id="server-input" type="text" placeholder="http://your-server:3000/mcp" value="${globalState.serverUrl}" style="width: 100%; padding: 12px; border: 1px solid #ddd; border-radius: 8px; font-size: 14px; box-sizing: border-box; margin-bottom: 16px;" />

                  <label style="display: flex; align-items: center; cursor: pointer;">
                    <input id="enabled-checkbox" type="checkbox" ${globalState.enabled ? "checked" : ""} style="width: 20px; height: 20px; margin-right: 10px; cursor: pointer;" />
                    <span style="font-weight: 600;">启用 MCP 桥接</span>
                  </label>

                  <button id="save-btn" style="width: 100%; padding: 14px; background: #007aff; color: white; border: none; border-radius: 8px; font-size: 16px; font-weight: 600; cursor: pointer; margin-top: 16px;">保存设置</button>
                </div>

                <!-- 可用工具 -->
                <div style="background: white; border-radius: 12px; padding: 20px; margin-bottom: 16px;">
                  <h3 style="margin: 0 0 12px; font-size: 16px;">🛠️ 主聊天可用工具</h3>
                  <div style="font-size: 13px; color: #666; margin-bottom: 12px;">主聊天 AI 会根据对话内容自动选择合适的工具</div>
                  <div style="display: grid; gap: 8px;">
                    <div style="padding: 12px; background: #f9f9f9; border-radius: 8px; border-left: 3px solid #4caf50;">
                      <strong>mcp_search</strong> - 搜索信息
                    </div>
                    <div style="padding: 12px; background: #f9f9f9; border-radius: 8px; border-left: 3px solid #2196f3;">
                      <strong>mcp_batch_search</strong> - 批量搜索
                    </div>
                    <div style="padding: 12px; background: #f9f9f9; border-radius: 8px; border-left: 3px solid #ff9800;">
                      <strong>mcp_deep_search</strong> - 深度搜索
                    </div>
                    <div style="padding: 12px; background: #f9f9f9; border-radius: 8px; border-left: 3px solid #9e9e9e;">
                      <strong>mcp_echo</strong> - 测试连接
                    </div>
                  </div>
                </div>

                <!-- 服务器状态 -->
                <div style="background: white; border-radius: 12px; padding: 20px; margin-bottom: 16px;">
                  <h3 style="margin: 0 0 12px; font-size: 16px;">📡 服务器状态</h3>
                  <button id="test-btn" style="padding: 10px 20px; background: #4caf50; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 600;">测试连接</button>
                  <div id="status-result" style="margin-top: 12px; padding: 12px; background: #f5f5f5; border-radius: 6px; font-size: 13px; display: none;"></div>
                </div>

                <!-- 缓存统计 -->
                <div style="background: white; border-radius: 12px; padding: 20px; margin-bottom: 16px;">
                  <h3 style="margin: 0 0 12px; font-size: 16px;">💾 缓存统计</h3>
                  <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 12px;">
                    <div style="text-align: center; padding: 12px; background: #f9f9f9; border-radius: 8px;">
                      <div style="font-size: 24px; font-weight: 600; color: #4caf50;">${cacheStats.total || 0}</div>
                      <div style="font-size: 12px; color: #666; margin-top: 4px;">总缓存</div>
                    </div>
                    <div style="text-align: center; padding: 12px; background: #f9f9f9; border-radius: 8px;">
                      <div style="font-size: 24px; font-weight: 600; color: #2196f3;">${cacheStats.hits || 0}</div>
                      <div style="font-size: 12px; color: #666; margin-top: 4px;">命中次数</div>
                    </div>
                    <div style="text-align: center; padding: 12px; background: #f9f9f9; border-radius: 8px;">
                      <div style="font-size: 24px; font-weight: 600; color: #ff9800;">${cacheStats.misses || 0}</div>
                      <div style="font-size: 12px; color: #666; margin-top: 4px;">未命中</div>
                    </div>
                  </div>
                  <button id="clear-cache-btn" style="width: 100%; padding: 10px; background: #ff9800; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 600;">清空服务器缓存</button>
                </div>

                <!-- 调用历史 -->
                <div style="background: white; border-radius: 12px; padding: 20px;">
                  <h3 style="margin: 0 0 12px; font-size: 16px;">📜 调用历史（最近 20 条）</h3>
                  <div style="max-height: 400px; overflow-y: auto; font-size: 13px;">
                    ${globalState.history.slice(0, 20).map(h => {
                      const time = new Date(h.timestamp).toLocaleString("zh-CN", {
                        month: "2-digit",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit"
                      });
                      const resultText = h.result.error
                        ? `<span style="color: #f44336;">❌ ${h.result.error}</span>`
                        : `<span style="color: #4caf50;">✅ 成功</span>`;
                      const argsText = JSON.stringify(h.args).substring(0, 50);
                      return `<div style="padding: 12px; border-bottom: 1px solid #f0f0f0;">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                          <strong style="color: #2196f3;">${h.tool}</strong>
                          <span style="color: #999; font-size: 12px;">${time}</span>
                        </div>
                        <div style="color: #666; font-size: 12px; margin-top: 4px;">${argsText}</div>
                        <div style="margin-top: 4px;">${resultText}</div>
                      </div>`;
                    }).join("") || "<div style='color: #999; padding: 12px; text-align: center;'>暂无调用历史</div>"}
                  </div>
                  <button id="clear-history-btn" style="margin-top: 12px; width: 100%; padding: 10px; background: #9e9e9e; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 600;">清空历史</button>
                </div>
              </div>
            </div>
          `;

          // 事件绑定
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

            roche.ui.toast("✅ 设置已保存");

            // 刷新界面
            setTimeout(() => {
              roche.ui.closeApp();
              roche.ui.openApp("mcp-bridge-settings");
            }, 500);
          };

          container.querySelector("#test-btn").onclick = async () => {
            const resultDiv = container.querySelector("#status-result");
            const testBtn = container.querySelector("#test-btn");

            resultDiv.style.display = "block";
            resultDiv.textContent = "🔄 测试中...";
            resultDiv.style.background = "#fff3cd";
            resultDiv.style.color = "#856404";
            testBtn.disabled = true;
            testBtn.style.opacity = "0.6";

            const result = await callMCPServer("/echo", { message: "测试连接" });

            if (result.error) {
              resultDiv.innerHTML = `<strong style="color: #d32f2f;">❌ 连接失败</strong><div style="margin-top: 8px; font-size: 12px;">${result.error}</div>`;
              resultDiv.style.background = "#ffebee";
              resultDiv.style.color = "#c62828";
            } else {
              resultDiv.innerHTML = `<strong style="color: #2e7d32;">✅ 连接成功</strong><div style="margin-top: 8px; font-size: 12px; color: #666;">服务器响应：${JSON.stringify(result)}</div>`;
              resultDiv.style.background = "#e8f5e9";
              resultDiv.style.color = "#2e7d32";
            }

            testBtn.disabled = false;
            testBtn.style.opacity = "1";
          };

          container.querySelector("#clear-cache-btn").onclick = async () => {
            const ok = await roche.ui.confirm({
              title: "清空缓存",
              message: "确定要清空 MCP 服务器上的所有缓存吗？"
            });

            if (ok) {
              try {
                const response = await fetch(`${globalState.serverUrl}/clear_cache`, {
                  method: "POST"
                });

                if (response.ok) {
                  roche.ui.toast("✅ 缓存已清空");
                  setTimeout(() => {
                    roche.ui.closeApp();
                    roche.ui.openApp("mcp-bridge-settings");
                  }, 500);
                } else {
                  roche.ui.toast("❌ 清空失败");
                }
              } catch (e) {
                roche.ui.toast(`❌ 请求失败: ${e.message}`);
              }
            }
          };

          container.querySelector("#clear-history-btn").onclick = async () => {
            const ok = await roche.ui.confirm({
              title: "清空历史",
              message: "确定要清空本地调用历史吗？"
            });

            if (ok) {
              globalState.history = [];
              await roche.storage.set("history", []);
              roche.ui.toast("✅ 历史已清空");
              setTimeout(() => {
                roche.ui.closeApp();
                roche.ui.openApp("mcp-bridge-settings");
              }, 500);
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
