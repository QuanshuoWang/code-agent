# 🚀 CodeAgent CLI

一个基于 DeepSeek 构建的生产级自主编码 Agent 框架。

## ✨ 核心特性

*   **🐣 动态子节点委派 (Sub-Agent Delegation)**: 面对低耦合的分支任务（如独立脚本编写、数据解析），主 Agent 可随时剥离出独立的子 Agent。子 Agent 拥有全新的上下文记忆，执行完毕后仅返回摘要。从底层代码阻断了嵌套循环套娃的死锁风险。
*   **📋 智能任务看板 (Task Board)**: 内置基于 `tasks.json` 的敏捷任务管理系统。遇到复杂需求时自动拆解步骤。当任务大盘全绿 (Completed) 时，系统会实施强制硬件拦截，杜绝 Agent 的“过度执行/强迫症测试”。并在每次新会话前自动归档历史任务板。
*   **🗜️ 无损记忆压缩 (Memory Compression)**: 自带上下文超载监控。当历史记忆 Token 逼近极限时，自动触发内部“压缩器”，将冗长的试错记录折叠为极简的“项目状态机快照”，确保 Agent 在超大型项目中依然保持清醒。
*   **🛠️ 全套本地工程工具**: 自带 `create_file`, `edit_file` (精准局部替换), `search_text`, `run_shell` 等一套完备的本地文件与环境操作工具链。

## 📦 快速开始

### 环境准备
1.  确保你的机器上安装了 **Python 3.10+**。
2.  克隆本项目后，进入目录并安装依赖：

```bash
git clone https://github.com/your-username/CodeAgent-CLI.git
cd CodeAgent-CLI
pip install -r requirements.txt
```

### 配置环境变量
在项目根目录创建一个 `.env` 文件，并填入你的 DeepSeek API Key（或兼容 OpenAI 接口格式的其他模型 API Key）：

```bash
# .env
DEEPSEEK_API_KEY=sk-your_api_key_here
```

### 准备架构文档
为了让 Agent 深入理解你的项目，启动前请在根目录提供两份上下文文件（如果项目初始为空，可创建示例文件）：
- `Architecture_Documentation.json`: 全局架构与规范说明（JSON 格式）
- `Architecture_View.md`: 系统的 UML 或视图文档（Markdown 格式）

### 运行 Agent
```bash
python main.py
```
启动后，直接在控制台输入你的自然语言指令，例如：
> “请帮我根据架构文档中的定义，在 `src/components` 下构建一个 UserAuth 组件，并为其编写单元测试。”

## 🧠 架构揭秘：为什么它如此稳定？

在开发自主 Agent 时，最大的挑战并不是让它写代码，而是**如何控制它停下来**以及**如何保证输出格式不错乱**。本框架采用了以下先进策略：

1.  **掐断闲聊 (Anti-Chatty Bias)**: 利用 `match...case` 路由和拦截器，一旦发现模型企图输出普通文本，立即打回并提示强制使用 `finish_task` 工具输出。确保所有长文本报告、状态更新都通过结构化工具调用返回。
2.  **状态全绿监控**: 主循环实时监听 `manage_tasks` 的 `update` 操作。当任务节点全部标记为 `completed` 时，系统会在工具结果中注入指令，强迫大模型立即调用 `finish_task` 退出，彻底根治无限 `run_shell` 测试的顽疾。
3.  **隔离的运行时**: 子 Agent (`is_sub_agent=True`) 被深拷贝了严格限制的工具链（移除了自我繁殖能力 `delegate_to_sub_agent`），确保它只做纯粹的执行者，无法再创建“孙 Agent”，从根本上防止死锁。

## 📂 项目结构

```
.
├── main.py                 # CLI 入口，处理用户交互、环境加载与任务板归档调度
├── agent_core/             # 核心 Agent 引擎模块
│   ├── __init__.py
│   ├── agent.py           # 核心引擎 CodeAgent 类，管理对话循环、工具调用与记忆流
│   ├── schemas.py         # 工具链的 JSON Schema 定义 (TOOLS 列表)
│   └── tools.py           # 本地文件/Shell/任务状态管理的具体 Python 函数实现
├── .env                   # 环境变量配置文件 (需手动创建)
├── requirements.txt       # Python 项目依赖清单
├── Architecture_Documentation.json # 项目架构文档 (启动前需准备)
└── Architecture_View.md   # 项目架构视图/ UML 图 (启动前需准备)
```

## 🤝 贡献与定制

该框架极度易于扩展！你可以随时：

1.  **添加新工具**: 在 `tools.py` 中编写你自己的 Python 函数（比如：爬虫工具、数据库查询工具、Git 操作工具）。
2.  **注册工具**: 在 `schemas.py` 的 `TOOLS` 列表中，按照相同格式注册新工具的 JSON Schema 定义。
3.  **路由工具**: 在 `agent.py` 的 `chat` 方法的 `match func_name:` 代码块中，为新工具添加一个 `case` 分支进行调用。

完成这三步后，Agent 就会立即掌握这项新能力！

欢迎提交 Pull Request 或建立 Issue 探讨更多 Agent 工程化落地的奇思妙想。

## 📄 License

MIT License
