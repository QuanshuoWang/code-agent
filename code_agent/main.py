import os
import sys
import json
import time
import shutil
from dotenv import load_dotenv
from agent_core.agent import CodeAgent

# 加载环境变量 (读取同目录下的 .env)
load_dotenv()

if __name__ == "__main__":
    print("==================================================")
    print("   🚀 欢迎使用 Code Agent CLI ")
    print("==================================================")

    doc_filename = "Architecture_Documentation.json"
    view_filename = "Architecture_View.md"

    if not os.path.exists(doc_filename) or not os.path.exists(view_filename):
        print(f"❌ 错误: 找不到架构文件。请确保当前目录下存在 '{doc_filename}' 和 '{view_filename}'。")
        sys.exit(1)

    print("📄 正在加载架构文档进入核心记忆...")
    with open(doc_filename, "r", encoding="utf-8") as f:
        try:
            arch_doc_data = json.load(f)
            arch_doc_content = json.dumps(arch_doc_data, ensure_ascii=False, indent=2)
        except json.JSONDecodeError as e:
            print(f"❌ '{doc_filename}' 解析失败: {str(e)}")
            sys.exit(1)

    with open(view_filename, "r", encoding="utf-8") as f:
        arch_view_content = f.read()

    system_instruction = f"""
    你是一个极其严谨的 AI 资深全栈工程师。你拥有读取、写入本地文件及执行 Shell 命令的能力。

    【全局项目架构知识库】(这是你开发的核心依据，请随时参考)：
    --- 架构说明 (JSON) ---
    {arch_doc_content}
    --- UML 视图 ---
    {arch_view_content}
    ---------------------------------

    【执行与操作原则】：
    1. 干活期间，闭嘴用工具：只要你还需要探索目录、查看文件、修改代码或规划任务，你**必须直接调用相应的工具 (tool_calls)**！绝对不要为了告诉我“我准备去查看文件”而放弃调用工具。
    2. 信任已有的进度！严禁无意义地重新 read_file 或 list_directory。
    3. 生成代码必须完整，绝不使用占位符。
    4.优先使用 edit_file 局部修改，而不是全量覆盖。
    5. 遇到 "❌ 错误"，请自我反思并修正参数重试。

    【高级能力指南】：
    6. 应对复杂任务：当你接到规模较大、涉及多个组件的修改请求时，务必**第一步调用 manage_tasks 工具 (action='init')**，将问题拆分为若干个逻辑清晰的步骤保存为 tasks.json。每完成一步，调用 action='update' 更新状态为 'completed'。你可以随时调用 'view' 审视当前进度。
    7. 委派子任务：对于与主流程低耦合的独立子任务（例如：编写某一个独立的工具脚本、单独解析一份数据源等），你可以调用 `delegate_to_sub_agent` 唤醒一个全新的子 Agent 帮你去写那部分代码。委派时，务必在 task_description 中提供所有必要的上下文和明确要求。
    
    【完工与退出红线】：
    1. 只做你被要求做的事：如果用户的指令只是“构建代码仓”或“编写代码”，那么代码文件落盘即视为 100% 完成任务。
    2. 严禁擅自测试：除非用户明确要求“请帮我运行测试”或“启动服务”，否则你绝对不允许使用 `run_shell` 去执行 npm run, python main.py 等验证命令！写完代码就停手。
    3. 任务清零即退出：当你调用的 tasks.json 中所有任务都变为 'completed' 时，立刻停止任何工具调用，直接输出最终 JSON 汇报。

    【🚨 强制输出规范 (极其重要) 🚨】：
    当你认为任务 100% 完成，或者你需要向我输出大量的分析/评审报告时，你**【必须且只能】**调用专用的工具 `finish_task`。将你想对我说的任何长篇报告、总结、Markdown 文档全部放进该工具的 `message_to_user` 参数中提交！！
    """

    # 初始化持久化的 Agent
    agent = CodeAgent(system_instruction)
    print("✅ Agent 初始化完成！你可以输入指令了 (输入 'exit' 或 'quit' 退出)。\n")

    # 建立交互循环
    while True:
        try:
            user_input = input("👤 你的指令 > ")

            if not user_input.strip():
                continue
            if user_input.lower() in ['exit', 'quit']:
                print("👋 感谢使用，再见！")
                break

            # 在交给 Agent 之前，清理上一次的任务板
            task_file = "tasks.json"
            if os.path.exists(task_file):
                os.makedirs("tasks_archive", exist_ok=True)
                timestamp = time.strftime("%Y%m%d-%H%M%S")
                shutil.move(task_file, f"tasks_archive/tasks_{timestamp}.json")
                print(f"🧹 [系统] 发现历史遗留的 tasks.json，已自动为您备份至 tasks_archive/ 目录。")
            # 将用户指令交给 Agent 处理，并获取结构化格式化后的文字回复
            response = agent.chat(user_input)

            print(f"\n🤖 Agent 汇报:\n{response}\n")
            print("-" * 50)

        except KeyboardInterrupt:
            print("\n👋 强制退出。")
            break
        except Exception as e:
            print(f"\n❌ 发生意外错误: {str(e)}")