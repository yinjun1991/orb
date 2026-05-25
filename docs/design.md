# orb -- 面向工程师和 AI 协作的全流程开发工具

orb 是一款面向工程师的 cli 工具，用于编排 AI agent，覆盖从 issue（feature/bug）到代码提交的全流程。

它在 project 中围绕 issue 展开工作：

- project: 一个产品/工程项目，可以由多个 git repos 组成，比如前后端
- issue: 一个 feature or bug，每个 issue 有一个编号，以 'f' 开头加数字编号，比如 'f1', 'f2'

## 技术栈

- TypeScript + Node.js，发布为 npm 包
- 底层 AI 引擎使用 Claude Code CLI（`claude`），orb 负责编排、组装上下文和管理状态机

## issue 流程与 AI agent

每个 issue 经过四个阶段，每个阶段由对应的 AI agent 主导：

### 阶段 1: 需求定义（人主导，AI 辅助）

使用者借助 Codex/Claude Code 讨论需求、澄清边界。AI 作为需求分析师，challenge 使用者的思路、帮助完善需求描述。

- 产物：`issue.md`
- 若是 bug issue，可跳过此阶段

### 阶段 2: 技术方案设计（AI 主导，人辅助）

AI 阅读项目文档（repos 下的 docs/）、现有代码架构，输出技术方案。人审核方案是否合理。

- 输入：`issue.md`、项目 docs
- 产物：`tech_design.md`、`code_plan.md`

### 阶段 3: 编码（AI 主导，多 agents 协作）

AI 开发工程师 agent 按照 `code_plan.md` 逐步实现，完成后运行自测。

- 输入：`code_plan.md`、`tech_design.md`
- 产物：代码变更、自测结果

### 阶段 4: Code review（AI 主导，自动 loop）

code-reviewer agent review 代码变更，发现 bug/问题后提交到 `bugs/` 目录，然后自动唤起 developer agent 修复。修复完成后 code-reviewer 再次 review，如此循环直到 code-reviewer 输出通过或无新 bug 发现。

这是 orb 的核心自动化环节，详见下方 review→fix loop 设计。

## issue 状态机

```
[defining] → [designing] → [coding] → [reviewing] → [merging] → [done]
                                                ↑    │
                                                └────┘
                                            fixing (自动 loop)
```

- `defining`: 需求定义阶段，人主导，产出 issue.md
- `designing`: 方案设计阶段，AI 主导，产出 tech_design.md 和 code_plan.md
- `coding`: 编码阶段，AI developer agent 执行 code_plan.md
- `reviewing`: code review 阶段，自动 review→fix loop 运行中
- `fixing`: developer agent 修复 code reviewer 发现的 bugs
- `merging`: PR 已创建，等待 GitHub 合入
- `done`: PR 已合入，worktree 已清理

状态迁移规则：
- `defining` → `designing`: issue.md 就绪，人工触发
- `designing` → `coding`: tech_design.md + code_plan.md 审核通过，人工触发
- `coding` → `reviewing`: 编码完成，自动或人工触发
- `reviewing` → `fixing`: code-reviewer 发现 bug，自动触发
- `fixing` → `reviewing`: 所有 bug resolved，自动触发
- `reviewing` → `done`: code-reviewer 通过，人工确认

## Commands

### `orbc ic "title"`

创建 issue，分配编号、初始化目录结构和 worktree。

流程：
1. 在 issues.md 追加 issue 条目，分配编号（如 f1、f2）
2. 在 issues/ 下创建 `f<n>/` 文件夹，填充模板文件
3. 在 worktrees/ 下创建 `f<n>/`，将所有 repos 以 worktree 形式 checkout 到该目录，分支名即为 issue 编号

```sh
orbc ic "Add user authentication"
```

### `orbc code f1`

启动 developer agent，按照 code_plan.md 执行编码任务。

流程：
1. 验证 issue 目录和 code_plan.md 存在
2. 更新 issue 状态为 `coding`
3. 组装 prompt，以**文件路径引用**方式传递上下文（不 inline 文件内容）：
   - `issues/f1/tech_design.md`
   - `issues/f1/code_plan.md`
   - `issues/f1/base_version.json`
4. 调用 agent（默认 Claude Code `--skill orb-developer`），工作目录设为 worktree
5. agent 完成后更新 issue 状态为 `reviewing`

```sh
orbc code f1
```

### `orbc review f1`

启动 review→fix 自动 loop。

流程：
```
┌─────────────────────────────┐
│  启动 code-reviewer agent    │
│  阅读 diff + tech_design     │
│  产出 bugs 到 bugs/ 目录     │
└──────────────┬──────────────┘
               │
               ▼
         有 unresolved bug 吗？
      ┌────┴────┐
      │ 有       │ 无
      ▼          ▼
┌──────────────┐   通过 ✓
│ 启动 developer │   (人工手动确认 done)
│ agent fix bugs │
│ 标记 resolved  │
└─────┬─────────┘
      │
      ▼
  回到 review
```

- code-reviewer agent 职责：阅读 tech_design.md 理解设计意图，对比当前 worktree 的 diff，检查逻辑正确性、边界情况、是否符合设计、是否有遗漏。发现的问题以独立 bug 文件写入 `issues/f<n>/bugs/`
- developer agent 职责：读取所有 unresolved bug 文件，逐一修复并标记 resolved。若修复过程中发现需要改动设计，标记为 blocked 等待人工介入
- loop 终止条件：code-reviewer 输出 "no bugs found" 或达到最大轮数（默认 3 轮）
- 每次 review 产出的 bugs 保留在 bugs/ 目录作为 review 记录

```sh
orbc review f1
```

### `orbc status [f1]`

查看 issue 或整个 project 的当前状态。

不指定 issue 编号时，列出所有 issue 及各自状态：

```sh
$ orbc status
Issues:

  ◉ f1  Add login  (defining)
  ◉ f2  Fix dashboard  (designing)
```

指定 issue 编号时，展示该 issue 详情，包括状态 + bug 列表：

```sh
$ orbc status f1
Issue f1
  ◉  Add login
  Status:  defining

  Bugs (3 total):
    ✖ unresolved: 1
    ◷ pending_verification: 1
    ✔ resolved: 1
    ⊘ blocked: 0

    ✖ #1  Null check missing in handler  (unresolved)
    ◷ #2  SQL injection in query builder  (pending_verification)
    ✔ #3  Missing error boundary  (resolved)
```

### `orbc pr f1`

Push issue 分支到 remote，使用 `gh` CLI 创建 GitHub PR 到 base_branch，打印 PR URL。代码合并由 GitHub 负责。

```sh
orbc pr f1
```

### `orbc clean f1`

删除 worktree，标记 issue 为 done。在 PR 合并后运行。

```sh
orbc clean f1
```

### `orbc install-skills`

将 orb 内置的 4 个 skill 安装到 agent 对应的 skills 目录：

```sh
$ orbc install-skills
Installed 4 skill(s):

  /orb-requirement-analyst
  /orb-architect
  /orb-developer
  /orb-code-reviewer

  Claude Code: ~/.claude/skills/  (4 files)
  Codex:       ~/.agents/skills/  (4 dirs)
```

| Skill | 阶段 | Claude Code 触发 | orb CLI 编排 |
|---|---|---|---|
| `orb-requirement-analyst` | 需求定义 | `/orb-requirement-analyst` | — |
| `orb-architect` | 方案设计 | `/orb-architect` | — |
| `orb-developer` | 编码 / bugfix | — | `orbc code` `--skill orb-developer` |
| `orb-code-reviewer` | code review | — | `orbc review` `--skill orb-code-reviewer` |

- **Claude Code**: skill 文件复制到 `~/.claude/skills/<name>.md`
- **Codex**: skill 文件复制到 `~/.agents/skills/<name>/SKILL.md`（Agent Skills 标准格式）

阶段 1-2 用户在 Claude Code/Codex 会话中手动触发；阶段 3-4 由 orb CLI 通过 `--skill` flag（Claude Code）或 inline（Codex）编程调用。

## project 目录

```
<project root>/
├── repos/                          # 基于线上稳定分支的仓库列表（只读）
│   ├── repo1/
│   │   └── docs/                   # 线上代码的架构分析、描述等文档
│   └── repo2/
│       └── docs/
├── worktrees/                      # 基于 issue 从 repos 切出的 worktree
│   ├── f1/
│   │   ├── repo1/
│   │   └── repo2/
│   └── f2/
│       ├── repo1/
│       └── repo2/
├── issues/
│   ├── issues.md                   # 各 issue 的编号、title、状态
│   ├── f1/
│   │   ├── issue.md                # issue 描述（title、背景、目标、非目标、约束）
│   │   ├── tech_design.md          # 技术方案
│   │   ├── code_plan.md    # 编码计划
│   │   ├── base_version.json         # 该 issue 基于各 repos 的哪个 commit 切出
│   │   ├── bugs.md                 # bug 列表 + 状态（唯一数据源）
│   │   └── bugs/                   # bug 详细描述（不含状态字段）
│   │       ├── bug1.md         # title、描述、严重程度、关联文件:行号
│   │       └── bug2.md
│   └── f2/
│       └── ...
└── AGENTS.md                       # project 介绍与指导（repos 介绍等）
```

## bug 文件格式

code-reviewer 产出的每个 bug 文件（`issues/f<n>/bugs/bug<n>.md`）格式：

```markdown
# Bug <n>: <简短 title>

- **Severity**: critical | major | minor | nit
- **Related files**:
  - repo1/src/foo.ts:42
  - repo1/src/bar.ts:18
- **Description**: <问题描述>
- **Expected behavior**: <预期行为>
- **Actual behavior** (if applicable): <当前行为>
- **Fix suggestion** (optional): <修复建议>
```

Bug 状态**只存储在 `bugs.md` 索引表中**，bug 文件不含 Status 字段。

### bugs.md 格式

```markdown
# Bugs

| ID | Title | Status | Block reason |
|----|-------|--------|--------------|
| 1  | Null check missing      | unresolved | |
| 2  | SQL injection risk      | blocked | Not a real risk, sanitized upstream |
| 3  | Missing error boundary  | resolved | |
```

### Bug 状态流转

- `unresolved`: code-reviewer 发现的新问题，待 developer 修复
- `pending_verification`: developer 已修复，等待 code-reviewer 验证
- `resolved`: code-reviewer 验证通过，修复已确认（只有 code-reviewer 可标记）
- `blocked`: 人工或 developer 标记为忽略/无法修复

关键规则：
- developer 只能将 status 改为 `pending_verification` 或 `blocked`，不能直接标 `resolved`
- code-reviewer 将 `pending_verification` → `resolved`（通过）或 → `unresolved`（打回）
- 所有状态更新都在 `bugs.md` 中，bug 文件只描述问题
