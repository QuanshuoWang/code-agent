TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "create_directory",
            "description": "在本地创建文件夹目录",
            "parameters": {
                "type": "object",
                "properties": {"path": {"type": "string"}},
                "required": ["path"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "create_file",
            "description": "创建或覆盖写入代码到指定文件",
            "parameters": {
                "type": "object",
                "properties": {
                    "filepath": {"type": "string"},
                    "content": {"type": "string"}
                },
                "required": ["filepath", "content"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "list_directory",
            "description": "查看本地某个目录下的所有文件和子目录列表。如果不确定文件在哪，可以先用这个工具查看结构。",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "要查看的相对路径，例如 '.' 表示当前根目录，或 'src/controllers'"
                    }
                },
                "required": ["path"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "read_file",
            "description": "读取并查看本地某个特定文件的完整文本内容。用于在修改代码前理解现有逻辑，或检查文件是否写入正确。",
            "parameters": {
                "type": "object",
                "properties": {
                    "filepath": {
                        "type": "string",
                        "description": "要读取的完整相对路径，例如 'src/app.js'"
                    }
                },
                "required": ["filepath"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "edit_file",
            "description": "编辑本地文件。通过精准匹配旧字符串并替换为新字符串来实现局部修改。在仅需修改几行代码时，请优先使用此工具，而不是覆盖重写整个文件。",
            "parameters": {
                "type": "object",
                "properties": {
                    "filepath": {
                        "type": "string",
                        "description": "要编辑的文件路径，例如 'src/app.js'"
                    },
                    "old_string": {
                        "type": "string",
                        "description": "必须与文件原内容完全一致的文本片段（包含原有的空格和缩进），用于定位修改位置。"
                    },
                    "new_string": {
                        "type": "string",
                        "description": "替换后的新代码内容。"
                    }
                },
                "required": ["filepath", "old_string", "new_string"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "search_text",
            "description": "全局代码搜索工具。在指定目录下搜索包含特定关键字的所有文本文件，返回对应的文件路径和代码行。类似于终端中的 grep 命令。",
            "parameters": {
                "type": "object",
                "properties": {
                    "directory": {
                        "type": "string",
                        "description": "要搜索的相对目录，比如 '.' 代表全项目搜索，或者 'src/components'"
                    },
                    "keyword": {
                        "type": "string",
                        "description": "要搜索的变量名、函数名或任意关键文本"
                    }
                },
                "required": ["directory", "keyword"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "run_shell",
            "description": "执行终端 bash/shell 命令。可用于运行代码测试 (npm test, pytest)、安装依赖包包、检查 Git 状态或执行项目构建操作。注意最大执行时间限制为 30 秒。",
            "parameters": {
                "type": "object",
                "properties": {
                    "command": {
                        "type": "string",
                        "description": "要执行的合法 Shell 命令，例如 'npm install express'"
                    }
                },
                "required": ["command"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "finish_task",
            "description": "🚨 【终极出口工具】：当你认为任务已经彻底 100% 完成，或者你需要向人类汇报长篇报告/结果时，【必须且只能】调用此工具！",
            "parameters": {
                "type": "object",
                "properties": {
                    "thought": {
                        "type": "string",
                        "description": "用一两句话简要总结你刚才执行了哪些操作"
                    },
                    "status": {
                        "type": "string",
                        "enum": ["completed", "need_user_input", "failed"],
                        "description": "任务的最终状态"
                    },
                    "files_affected": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "本次任务中创建或修改的相对文件路径列表"
                    },
                    "message_to_user": {
                        "type": "string",
                        "description": "详细的汇报内容、长篇评审报告正文或给人类的留言。支持 Markdown 格式编排。"
                    }
                },
                "required": ["thought", "status", "files_affected", "message_to_user"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "manage_tasks",
            "description": "任务进度管理工具。遇到复杂需求时，先调用此工具制定拆解步骤并保存到 tasks.json。后续可更新状态。",
            "parameters": {
                "type": "object",
                "properties": {
                    "action": {
                        "type": "string",
                        "enum": ["init", "update", "view"],
                        "description": "操作类型：'init'(初始化任务列表), 'update'(更新某个任务的状态), 'view'(查看当前任务列表)"
                    },
                    "tasks": {
                        "type": "array",
                        "description": "当 action='init' 时提供，包含任务对象的数组",
                        "items": {
                            "type": "object",
                            "properties": {
                                "id": {"type": "integer", "description": "任务编号，例如 1, 2, 3"},
                                "description": {"type": "string", "description": "任务的具体描述"},
                                "status": {
                                    "type": "string",
                                    "enum": ["pending", "in_progress", "completed", "failed"],
                                    "description": "任务初始状态，通常为 pending"
                                }
                            },
                            "required": ["id", "description", "status"]
                        }
                    },
                    "task_id": {
                        "type": "integer",
                        "description": "当 action='update' 时提供，要更新的任务 ID"
                    },
                    "status": {
                        "type": "string",
                        "enum": ["pending", "in_progress", "completed", "failed"],
                        "description": "当 action='update' 时提供，任务的新状态"
                    }
                },
                "required": ["action"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "delegate_to_sub_agent",
            "description": "启动一个隔离的子 Agent 来处理独立且具体的子任务（如编写独立脚本、解析复杂数据逻辑）。子 Agent 执行完毕后会给你返回摘要。注意：请在 task_description 中给出所有必要的上下文（如文件路径、需求细节）。",
            "parameters": {
                "type": "object",
                "properties": {
                    "task_description": {
                        "type": "string",
                        "description": "必须包含三部分：1. 明确的最终目标；2. 子 Agent 必须知道的上下文（如相关的文件路径、部分架构规范、数据结构等）；3. 具体的验收标准。不要只给一句话！"
                    }
                },
                "required": ["task_description"]
            }
        }
    }
]