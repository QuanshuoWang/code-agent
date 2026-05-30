import os
import subprocess
import json


def create_directory(path: str) -> str:
    """在本地创建目录"""
    try:
        os.makedirs(path, exist_ok=True)
        return f"✅ 成功: 目录 '{path}' 已创建或已存在。"
    except Exception as e:
        return f"❌ 失败: 无法创建目录 '{path}'. 错误: {str(e)}"


def create_file(filepath: str, content: str) -> str:
    """在本地创建并写入文件"""
    try:
        os.makedirs(os.path.dirname(filepath), exist_ok=True)
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        return f"✅ 成功: 文件 '{filepath}' 已成功写入。"
    except Exception as e:
        return f"❌ 失败: 无法写入文件 '{filepath}'. 错误: {str(e)}"


def list_directory(path: str) -> str:
    """列出指定目录下的文件和文件夹结构"""
    if not os.path.exists(path):
        return f"⚠️ 提示: 目录 '{path}' 目前不存在。"
    try:
        items = os.listdir(path)
        if not items:
            return f"📁 目录 '{path}' 是空的。"
        result = [f"目录 '{path}' 的内容："]
        for item in sorted(items):
            full_path = os.path.join(path, item)
            if os.path.isdir(full_path):
                result.append(f"  📁 [目录] {item}/")
            else:
                result.append(f"  📄 [文件] {item}")
        return "\n".join(result)
    except Exception as e:
        return f"❌ 读取目录失败: {str(e)}"


def read_file(filepath: str) -> str:
    """读取指定文件内容"""
    if not os.path.exists(filepath):
        return f"❌ 错误: 文件 '{filepath}' 不存在。"
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
        return f"📄 文件 '{filepath}' 内容如下:\n{content}"
    except UnicodeDecodeError:
        return f"❌ 错误: '{filepath}' 似乎是一个二进制文件，无法读取文本内容。"
    except Exception as e:
        return f"❌ 读取文件失败: {str(e)}"


def edit_file(filepath: str, old_string: str, new_string: str) -> str:
    """编辑文件：将文件中的旧文本局部替换为新文本"""
    if not os.path.exists(filepath):
        return f"❌ 错误: 文件 '{filepath}' 不存在。"
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
        if old_string not in content:
            return f"❌ 错误: 替换失败。在文件中未找到指定的旧文本(old_string)。请确认原文空格和换行。"
        new_content = content.replace(old_string, new_string)
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(new_content)
        return f"✅ 成功: 文件 '{filepath}' 已局部修改成功。"
    except Exception as e:
        return f"❌ 编辑文件失败: {str(e)}"


def search_text(directory: str, keyword: str) -> str:
    """全局代码搜索工具"""
    if not os.path.exists(directory):
        return f"❌ 错误: 目录 '{directory}' 不存在。"
    results = []
    try:
        for root, _, files in os.walk(directory):
            for file in files:
                if any(exclude in root for exclude in ['.git', '__pycache__', 'node_modules', 'venv', 'dist']):
                    continue
                filepath = os.path.join(root, file)
                try:
                    with open(filepath, 'r', encoding='utf-8') as f:
                        for i, line in enumerate(f):
                            if keyword in line:
                                results.append(f"{filepath} (行 {i + 1}): {line.strip()}")
                except (UnicodeDecodeError, PermissionError):
                    continue
        if not results:
            return f"🔍 提示: 在 '{directory}' 中未找到包含 '{keyword}' 的内容。"
        max_results = 50
        output = "\n".join(results[:max_results])
        if len(results) > max_results:
            output += f"\n... (截断: 还有 {len(results) - max_results} 个匹配项未显示)"
        return f"🔍 搜索 '{keyword}' 的结果:\n{output}"
    except Exception as e:
        return f"❌ 搜索失败: {str(e)}"


def run_shell(command: str) -> str:
    """在本地执行终端 Shell 命令"""
    try:
        result = subprocess.run(command, shell=True, capture_output=True, text=True, timeout=30)
        output = f"✅ 执行完成 (退出码: {result.returncode})\n"
        if result.stdout:
            output += f"STDOUT:\n{result.stdout.strip()[:2000]}\n"
        if result.stderr:
            output += f"STDERR:\n{result.stderr.strip()[:2000]}"
        return output
    except subprocess.TimeoutExpired:
        return f"❌ 错误: 命令执行超时 (超过 30 秒被迫终止)。请不要执行会无限挂起的命令。"
    except Exception as e:
        return f"❌ Shell 执行失败: {str(e)}"


def manage_tasks(action: str, tasks: list = None, task_id: int = None, status: str = None) -> str:
    """操作和管理本地 tasks.json 文件"""
    filepath = "tasks.json"
    try:
        if action == "init":
            if not tasks:
                return "❌ 错误: action='init' 时必须提供 tasks 列表。"
            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump(tasks, f, ensure_ascii=False, indent=2)
            return f"✅ 成功: 任务列表已初始化并保存至 {filepath}。"
        elif action == "update":
            if task_id is None or status is None:
                return "❌ 错误: action='update' 时必须提供 task_id 和 status。"
            if not os.path.exists(filepath):
                return "❌ 错误: 找不到 tasks.json，请先使用 init 动作初始化任务列表。"

            with open(filepath, 'r', encoding='utf-8') as f:
                current_tasks = json.load(f)

            updated = False
            for t in current_tasks:
                if t.get("id") == task_id:
                    t["status"] = status
                    updated = True
                    break

            if not updated:
                return f"❌ 错误: 未找到 ID 为 {task_id} 的任务。"

            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump(current_tasks, f, ensure_ascii=False, indent=2)
            return f"✅ 成功: 任务 {task_id} 状态已更新为 '{status}'。"
        elif action == "view":
            if not os.path.exists(filepath):
                return "⚠️ 提示: 目前没有任务列表 (tasks.json 不存在)。"
            with open(filepath, 'r', encoding='utf-8') as f:
                content = f.read()
            return f"📋 当前任务列表:\n{content}"
        else:
            return f"❌ 错误: 未知的 action '{action}'。"
    except Exception as e:
        return f"❌ 任务管理失败: {str(e)}"