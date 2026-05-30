import json
import os
import copy
from openai import OpenAI

from .schemas import TOOLS
from .tools import (
    create_directory,
    create_file,
    list_directory,
    read_file,
    edit_file,
    search_text,
    run_shell,
    manage_tasks
)


class CodeAgent:
    def __init__(self, system_instruction: str, is_sub_agent: bool = False):
        self.client = OpenAI(
            api_key=os.environ.get("DEEPSEEK_API_KEY"),
            base_url="https://api.deepseek.com"
        )

        self.messages = [{"role": "system", "content": system_instruction}]
        self.MAX_CHARS = 150000

        # 标记当前是否为子 Agent
        self.is_sub_agent = is_sub_agent

        # 隔离工具权限：如果是子 Agent，则无权继续衍生子 Agent (防止死锁套娃)
        self.tools = copy.deepcopy(TOOLS)
        if self.is_sub_agent:
            self.tools = [t for t in self.tools if t["function"]["name"] != "delegate_to_sub_agent"]

    def chat(self, user_prompt: str) -> str:
        """接收单次指令，执行工具循环，直到完成任务后返回结构化总结"""
        self.messages.append({"role": "user", "content": user_prompt})

        loop_count = 0
        max_loops = 50

        while loop_count < max_loops:
            loop_count += 1
            # 若是子 Agent，日志缩进更深，方便区分
            prefix = "      " if self.is_sub_agent else "   "
            agent_type = "子 Agent" if self.is_sub_agent else "主 Agent"
            print(f"\n{prefix}🧠 [{agent_type}] 思考与执行中... (内部循环第 {loop_count} 轮)")

            try:
                response = self.client.chat.completions.create(
                    model="deepseek-v4-flash",
                    messages=self.messages,
                    tools=self.tools,
                    temperature=0.1,
                    name="Agent-Core-Loop"
                )
            except Exception as e:
                return f"API 网络请求异常: {str(e)}"

            assistant_message = response.choices[0].message

            try:
                msg_dict = assistant_message.model_dump(exclude_none=True)
            except AttributeError:
                msg_dict = assistant_message.dict(exclude_none=True)

            self.messages.append(msg_dict)

            if assistant_message.tool_calls:
                for tool_call in assistant_message.tool_calls:
                    func_name = tool_call.function.name

                    # 带有容错恢复机制的参数解析
                    try:
                        func_args = json.loads(tool_call.function.arguments)
                    except json.JSONDecodeError as e:
                        error_msg = f"❌ JSON 解析失败: {str(e)}"
                        print(f"{prefix}   ⚠️  触发自愈: {error_msg}")
                        self.messages.append({
                            "role": "tool",
                            "tool_call_id": tool_call.id,
                            "name": func_name,
                            "content": error_msg + " 请精简代码或拆分多次写入。"
                        })
                        continue


                    print(f"{prefix}   🛠️  执行动作: {func_name}")

                    # 工具路由
                    match func_name:
                        case "create_directory":
                            result = create_directory(func_args.get("path", ""))
                        case "create_file":
                            result = create_file(func_args.get("filepath", ""), func_args.get("content", ""))
                        case "list_directory":
                            result = list_directory(func_args.get("path", ""))
                        case "read_file":
                            result = read_file(func_args.get("filepath", ""))
                        case "edit_file":
                            result = edit_file(func_args.get("filepath", ""), func_args.get("old_string", ""),
                                               func_args.get("new_string", ""))
                        case "search_text":
                            result = search_text(func_args.get("directory", ""), func_args.get("keyword", ""))
                        case "run_shell":
                            result = run_shell(func_args.get("command", ""))
                        case "finish_task":
                            print(f"{prefix}   🏁 检测到汇报提交 (finish_task)！任务执行完毕。")
                            status = func_args.get("status", "unknown").upper()
                            thought = func_args.get("thought", "无思考过程")
                            files = func_args.get("files_affected", [])
                            files_str = ", ".join(files) if files else "无"
                            msg = func_args.get("message_to_user", "")

                            # 直接从 match 分支中 return，跳出循环交回控制权
                            return (
                                f"✅ [状态]: {status}\n"
                                f"🧠 [思考]: {thought}\n"
                                f"📁 [变动文件]: {files_str}\n"
                                f"💬 [留言]: {msg}"
                            )
                        case "manage_tasks":
                            result = manage_tasks(
                                func_args.get("action"),
                                func_args.get("tasks"),
                                func_args.get("task_id"),
                                func_args.get("status")
                            )
                            # 新增拦截逻辑：如果执行了更新操作，检查任务是否全部完成
                            if func_args.get("action") == "update":
                                try:
                                    with open("tasks.json", "r", encoding="utf-8") as f:
                                        current_tasks = json.load(f)
                                    # 检查是否所有任务状态都是 completed
                                    if current_tasks and all(t.get("status") == "completed" for t in current_tasks):
                                        print(f"{prefix}   🎯 [系统监控] 检测到任务已全部完成！正在强制截断...")
                                        # 改写 result，用极其严厉的语气逼迫它交出控制权
                                        result += (
                                            "\n\n🚨 【系统最高指令】：所有的任务步骤均已标记为 completed！你的工作已彻底结束。"
                                            "请立刻调用唯一的退出工具 `finish_task` 提交最终结果并汇报交接！"
                                        )
                                except Exception as e:
                                    pass

                        case "delegate_to_sub_agent":
                            if self.is_sub_agent:
                                result = "❌ 错误: 子 Agent 无法再次创建子 Agent。"
                            else:
                                sub_task = func_args.get("task_description", "")
                                print(f"{prefix}   🐣 [衍生] 正在启动独立子 Agent 处理分支任务...")

                                sub_sys_prompt = (
                                    "你是一个受命于主 Agent 的专注型子 Agent。你拥有读取、写入本地文件及执行 Shell 命令的能力。\n"
                                    "你的能力和主 Agent 完全一致，但你只负责完成主 Agent 委派给你的【单一子任务】。\n"
                                    "1. 干活阶段：直接调用相应的工具干活。只要你还需要读取文件、修改代码，就必须通过规范的工具调用（tool_calls）来完成。绝对不要把你打算修改的代码或者工具调用标签写在普通回复文本里！\n"
                                    "2. 汇报阶段：当你完成任务，或者想输出长篇的评审/代码生成报告时，【绝对不允许】直接输出自然语言！你必须且只能调用专用工具 `finish_task`，将你要写的报告完整地放入它的 `message_to_user` 参数中交出控制权！\n"
                                )

                                # 实例化子 Agent
                                sub_agent = CodeAgent(system_instruction=sub_sys_prompt, is_sub_agent=True)
                                sub_result = sub_agent.chat(sub_task)

                                print(f"{prefix}   [归队] 子 Agent 任务结束。")
                                result = f"子 Agent 执行完毕。其最终汇报如下：\n{sub_result}"
                        case _:
                            result = f"❌ 错误: 未知工具 {func_name}"

                    print(f"{prefix}   📢 结果: {result[:100].replace(chr(10), ' ')}...\n")

                    self.messages.append({
                        "role": "tool",
                        "tool_call_id": tool_call.id,
                        "name": func_name,
                        "content": result
                    })
            else:
                raw_response = assistant_message.content

                # 在控制台截取展示它企图输出的废话，方便开发者排查问题
                preview_text = raw_response[:50].replace("\n", " ")
                print(f"{prefix}   ⚠️ [系统拦截] 大模型企图输出文本: '{preview_text}...' 已打回重做。")

                self.messages.append({
                    "role": "user",
                    "content": (
                        "拒绝执行！系统已经彻底封闭了你的普通对话输出能力。\n"
                        "如果你是为了告诉我进度，或者输出了一份极长的分析报告，请不要直接发在对话框里！\n"
                        "👉 请必须调用 `finish_task` 工具，把你刚才想要输出的所有长文本塞入它的 `message_to_user` 参数中提交给我！"
                    )
                })

            # 执行末尾上下文无损压缩检查
            self._compress_memory_if_needed()

        return "⚠️ 达到单次最大执行轮数限制，强制挂起并等待新指令。"

    def _compress_memory_if_needed(self):
        """内部上下文管理方法 """
        current_length = sum(
            len(str(m.get("content", ""))) + len(str(m.get("tool_calls", "")))
            for m in self.messages
        )

        if current_length > self.MAX_CHARS:
            prefix = "      " if self.is_sub_agent else "   "
            print(f"\n{prefix}⚠️ [记忆超载] 当前字符数 {current_length}。触发无损状态机压缩...")

            base_head_size = 1
            head = self.messages[:base_head_size]
            middle_to_compress = self.messages[base_head_size:]

            if middle_to_compress:
                print(f"{prefix}   📝 正在将中间的 {len(middle_to_compress)} 条记录压缩为极简状态机...")

                summary_prompt = (
                        "你是一个负责维持 AI 长期记忆的“压缩器”。请根据以下历史记录，输出项目状态快照。\n"
                        "🚫 绝对不要输出任何具体的代码实现！\n"
                        "1. 📦 [已就绪文件]：列出已创建/修改的文件名及其对外暴露的核心接口。\n"
                        "2. ⚠️ [最新状态/错误]：上一轮操作的结果是什么？\n\n"
                        "【历史记录】\n" + str(middle_to_compress)
                )

                try:
                    summary_response = self.client.chat.completions.create(
                        model="deepseek-v4-flash",
                        messages=[{"role": "user", "content": summary_prompt}],
                        temperature=0.0,
                        name="Memory-Compression"
                    )
                    summary_text = summary_response.choices[0].message.content

                    summary_memory = {
                        "role": "user",
                        "content": f"【系统内部状态同步：请注意】\n"
                                   f"以下是截至目前的项目状态快照。所有罗列的文件已真实落盘。\n\n"
                                   f"{summary_text}\n\n"
                                   f"👉 【行为准则】：请牢记你的红线，在没有收到我下一步明确指令前，什么都不要做，只需等待！\n"
                                   "👉 【继续执行指令】：这只是一次上下文压缩，你的原始任务**并未中断**！\n"
                                   "请根据上述快照确认进度，并立刻调用相关工具继续你的工作。除非你确认原始任务的最终目标已 100% 达成，否则绝对不要输出 JSON 汇报停止运行！"
                    }

                    self.messages = head + [summary_memory]

                    new_length = sum(len(str(m.get("content", ""))) for m in self.messages)
                    print(f"{prefix}   ✅ 压缩完成！字符数从 {current_length} 降至 {new_length}。")
                except Exception as e:
                    print(f"{prefix}   ❌ 摘要生成失败: {str(e)}")
                    self.messages = head + self.messages[-2:]