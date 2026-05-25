# orb 技术方案

## Agent adapter 设计

### 动机

orb 需要支持多种 AI agent 作为底层引擎，从 Claude Code 起步，后续可能接入 Codex、Cursor CLI 等。不同 agent 的调用方式、参数、skill 安装路径各不相同，需要统一的抽象层。

### 核心思想

orb 内部定义统一的 `AgentAdapter` 接口，具体 agent 的 CLI 调用细节封装在各自的 adapter 实现中。用户通过 CLI flag 指定 agent，orb 路由到对应 adapter。

```
用户命令                               orb 核心                    agent adapter
─────────                             ─────────                   ─────────────
orb review f1 --cc     ──→    AgentRouter.resolve("cc")    ──→    ClaudeCodeAdapter
orb review f1 --codex  ──→    AgentRouter.resolve("codex") ──→    CodexAdapter
orb implement f1       ──→    读取 orb config 默认 agent    ──→    Adapter.invoke(...)
```

### AgentAdapter 接口

```typescript
interface AgentAdapter {
  /** adapter 标识，如 "cc", "codex" */
  readonly id: string;

  /** 检查该 agent CLI 是否已安装 */
  isAvailable(): Promise<boolean>;

  /** 调用 agent：传入 prompt + 上下文，返回结果 */
  invoke(opts: InvokeOptions): Promise<InvokeResult>;

  /** 安装 skill 到该 agent 的 skills 目录 */
  installSkill(skill: SkillFile): Promise<void>;
}

interface InvokeOptions {
  /** 主 prompt，或要执行的任务描述 */
  prompt: string;
  /** 要使用的 skill 名称（不带前缀），如 "orb-code-reviewer" */
  skill?: string;
  /** 工作目录（通常是 worktrees/f1/） */
  workdir: string;
  /** 附加的上下文文件路径列表 */
  contextFiles?: string[];
  /** 附加的系统指令 */
  systemPrompt?: string;
}

interface InvokeResult {
  /** agent 的文本输出 */
  output: string;
  /** 退出码 */
  exitCode: number;
  /** 是否成功（exitCode === 0） */
  success: boolean;
}
```

### 每个 adapter 的差异点

| 差异点 | Claude Code | Codex |
|---|---|---|
| CLI 命令 | `claude -p "<prompt>"` | `codex exec "<prompt>"` |
| 指定 skill | `--skill <name>`（原生支持） | **不支持 `--skill` flag** |
| 工作目录 | `-w <path>` / `--workdir <path>` | `--cwd <path>` |
| skill 安装路径 | `~/.claude/skills/<name>.md` | `~/.agents/skills/<name>/SKILL.md` |
| skill 触发方式 | 手动 `/skill` 或 `--skill` flag | 自动匹配 `description` 触发（不可控） |
| 项目指令文件 | `CLAUDE.md` | `AGENTS.md` |

### skill + prompt 如何协作

skill 定义**稳定的角色**（原则、checklist、输出格式），prompt 定义**当次的具体任务**（哪个 issue、读哪些文件、做什么）。两者组合使用：skill 不变，prompt 每次 invoke 动态构建。

```
┌─────────────────────────────────────────────────────────┐
│  skill（稳定，练级在 .md 文件中）                          │
│  - 你是 code reviewer                                    │
│  - Review checklist: correctness, design fidelity...     │
│  - 输出格式：bugs/bug<n>.md                               │
│  - 约束：不要自己修 bug                                   │
├─────────────────────────────────────────────────────────┤
│  prompt（动态，orb 每次 invoke 构建）                      │
│  - 当前 issue: f1                                        │
│  - 读取 issues/f1/base_version.json，git diff <base>       │
│  - 读取 issues/f1/tech_design.md                         │
│  - 对 pending_verification 的 bug 进行验证                │
└─────────────────────────────────────────────────────────┘
```

### 各 adapter 如何组合 skill + prompt

**Claude Code** — 原生支持 `--skill` flag，skill 和 prompt 分开传入：

```sh
claude -p "Review issue f1. Read issues/f1/base_version.json, run git diff..." \
       --skill orb-code-reviewer \
       -w worktrees/f1/
```

adapter 实现：
```typescript
// ClaudeCodeAdapter.invoke()
const args = [
  '-p', opts.prompt,
  '--skill', opts.skill,
  '-w', opts.workdir,
];
spawn('claude', args);
```

**Codex** — 没有 `--skill` flag。Codex 的 skill 机制基于 Agent Skills 标准（`SKILL.md` + YAML frontmatter），依赖 AI 自动匹配 `description` 触发，**不可编程指定**。因此 adapter 将 skill 内容直接 inline 到 prompt 前面：

```sh
codex exec "<skill 内容>\n\n## Current task\n<task prompt>" --cwd worktrees/f1/
```

adapter 实现：
```typescript
// CodexAdapter.invoke()
const skillContent = fs.readFileSync(`skills/${opts.skill}.md`, 'utf-8');
const fullPrompt = `${skillContent}\n\n## Current task\n${opts.prompt}`;
const args = ['exec', fullPrompt, '--cwd', opts.workdir];
spawn('codex', args);
```

### 引申：Codex skill 能否用 AGENTS.md 替代

Codex 加载 `AGENTS.md` 作为项目级指令。理论上可以将 skill 内容写入 `<project_root>/AGENTS.md`，但有两个问题：
1. `AGENTS.md` 是项目级全局的，无法按阶段切换不同的 skill
2. orb 需要在不同阶段加载不同 skill（review 用 code-reviewer，fix 用 developer），全局文件做不到

因此 inline 方式更合适：每次 invoke 时动态选择 skill 内容拼入 prompt。

### InvokeOptions 接口更新

```typescript
interface InvokeOptions {
  /** 当次任务描述（适配器会与 skill 组合，组合方式由适配器决定） */
  prompt: string;
  /** skill 名称，如 "orb-code-reviewer"。适配器自行决定如何加载和组合 */
  skill?: string;
  /** 工作目录 */
  workdir: string;
  /** 附加上下文文件（适配器决定是拼入 prompt 还是通过 CLI 参数传入）*/
  contextFiles?: string[];
}
```

### 默认 agent 配置

orb 支持在 project 级别配置默认 agent，也可在命令中覆盖：

```yaml
# <project_root>/.orb.yaml
agent: cc  # 默认使用 Claude Code
```

```sh
orb review f1 --cc     # 强制 Claude Code
orb review f1 --codex  # 强制 Codex
```

不指定 flag 时使用 `.orb.yaml` 中的配置。

### 配置文件 .orb.yaml

```yaml
# <project_root>/.orb.yaml
agent: cc
repos:
  - path: ./repos/backend
    remote: origin
    base_branch: main
  - path: ./repos/frontend
    remote: origin
    base_branch: main
max_review_rounds: 3
```

### orb 内部架构

```
┌──────────────────────────────────────────┐
│                  CLI 层                    │
│  ic / implement / review / status / done  │
└──────────────────┬───────────────────────┘
                   │
┌──────────────────▼───────────────────────┐
│              核心编排层                     │
│  IssueManager / ReviewLoop / StateMachine │
└──────────────────┬───────────────────────┘
                   │
┌──────────────────▼───────────────────────┐
│             AgentAdapter 接口              │
│         invoke() / installSkill()         │
└──────┬──────────────┬────────────────────┘
       │              │
┌──────▼──────┐ ┌─────▼──────┐
│ ClaudeCode   │ │ Codex      │
│ Adapter      │ │ Adapter    │
└──────────────┘ └────────────┘
```

### `installSkill` 实现差异

两种 agent 的 skill 格式不同，`installSkill` 封装这个差异：

```typescript
// ClaudeCodeAdapter.installSkill()
// 格式：单个 .md 文件
// 安装到：~/.claude/skills/<name>.md
fs.copyFileSync(
  skill.sourcePath,                              // orb skills/ 下的 .md 文件
  path.join(homeDir, '.claude', 'skills', `${skill.name}.md`)
);

// CodexAdapter.installSkill()
// 格式：目录 + SKILL.md（YAML frontmatter）
// 安装到：~/.agents/skills/<name>/SKILL.md
const destDir = path.join(homeDir, '.agents', 'skills', skill.name);
fs.mkdirSync(destDir, { recursive: true });
fs.writeFileSync(
  path.join(destDir, 'SKILL.md'),
  wrapWithYamlFrontmatter(skill.content)  // 包装 name + description
);
```

由于 Codex 不支持 `--skill` flag，`installSkill` 安装后也无法被 orb 编程调用。因此 Codex adapter 的 `invoke()` 直接读取 orb 内置的 skill 文件内容并 inline 到 prompt，不依赖已安装的 skill。

### 讨论点

1. **Codex skill 能否在 invoke 时编程指定？** 测试结论：不能。Codex 的 skill 机制依赖 AI 根据 `description` 自动匹配，没有类似 `--skill` 的 flag。orb 的应对策略：Codex adapter 将 skill 内容 inline 进 prompt。

2. **invoke 返回的是纯文本还是结构化输出？** 当前设计返回纯文本，因为 code-reviewer 的 `NO_BUGS_FOUND` 信号和 bug 文件可以用字符串匹配 + 文件检测来判断，足够简单。如果后续 agent 需要返回结构化数据，再考虑扩展 `InvokeResult`——但 YAGNI 原则，先保持文本。

3. **skill 安装后对 Codex 有意义吗？** 有，但不是给 orb 用的。安装后用户可以在 Codex 会话中手动 `$orb-code-reviewer` 触发——对应阶段 1-2 的人工使用场景。阶段 3-4 的自动化 loop 走 inline 方式。对于 Claude Code，`--skill` 直接引用已安装的 skill 文件，安装和 invoke 路径统一。

## review→fix loop 实现

### Bug 状态流转

bug 状态有四个，各自有明确的**谁可以改**的规则：

```
            code-reviewer 发现新问题
                    │
                    ▼
              ┌─ unresolved ─┐
              │              │
              │   developer   │ developer 无法修复
              │   修复完成     │ （需变更设计/外部依赖）
              ▼              ▼
     pending_verification   blocked ──→ 人工介入
              │
              │   code-reviewer
              │   验证修复
         ┌────┴────┐
         │ 通过     │ 不通过
         ▼         ▼
      resolved   unresolved（打回重修，附原因）
```

关键规则：
- **developer 只能将 status 改为 `pending_verification` 或 `blocked`**，永远不能直接改 `resolved`
- **code-reviewer 才能将 status 改为 `resolved`**（验证通过）或打回 `unresolved`（验证不通过）
- `blocked` 不能被 agent 改回——需要人工解除

### 整体状态机

```
orb review f1
    │
    ▼
┌──────────────────────────┐        有 unresolved         ┌──────────────────────────┐
│   REVIEWING               │────────────────────────────→│   FIXING                  │
│                          │                              │                          │
│   code-reviewer agent     │    有 pending_verification  │   developer agent         │
│   - 验证 pending 的 bug   │←────────────────────────────│   - 修复 unresolved bug   │
│   - 发现新问题             │                              │   - 标记 pending_verif.   │
│   - 确认修复 → resolved   │                              │   - 无法修复 → blocked    │
└──────────┬───────────────┘                              └──────────────────────────┘
           │
           │ 全部 resolved（通过）
           ▼
       ✅ done
```

orb 的角色不是理解代码，而是做三件事：
1. **检测** — 每轮结束后扫描 bugs 目录，按 status 分类统计
2. **路由** — 根据结果决定下一步：继续 fix 还是结束 loop
3. **喂上下文** — 为下一轮 agent 调用拼装 prompt 和上下文文件列表

### 不把 git diff 放入 prompt，让 agent 自己 diff

orb 不在 prompt 或 contextFiles 里注入 diff 内容。agent 在 worktree 里有完整的 git 环境，orb 只需传入 `base_version.json`，让 agent 自己执行 `git diff <base_commit>`。

理由：
- **diff 总是实时的** — developer 修完代码后 reviewer 再 diff，看到的就是最新状态
- **省上下文** — 大 diff 塞 prompt 里占 token，agent 按需自己读
- **orb 更简单** — 不需要维护 diff 文件，contextFiles 只传文档类文件

### Agent I/O 契约

#### code-reviewer agent（REVIEWING 阶段）

```
输入（只读）:
  issues/f1/tech_design.md          ← 理解设计意图
  issues/f1/code_plan.md    ← 理解实现步骤
  issues/f1/base_version.json         ← 获取 base commit，自行 git diff
  issues/f1/bugs.md                 ← 了解历史 bug（避免重复报告）
  issues/f1/bugs/bug<n>.md          ← status=pending_verification 的 bug（需验证修复）

输出（创建/修改）:
  issues/f1/bugs/bug<n>.md          ← 创建新 bug 文件（status=unresolved）
                                     或 将 pending_verification → resolved（验证通过）
                                     或 将 pending_verification → unresolved（打回）
  issues/f1/bugs.md                 ← 同步更新索引表
```

无新 bug 且所有 pending 验证通过时：输出 `NO_BUGS_FOUND`。

#### developer agent（FIXING 阶段）

```
输入（只读）:
  issues/f1/tech_design.md          ← 理解设计意图（修复前需参考）
  issues/f1/base_version.json         ← 了解是从哪个 commit 切出的
  issues/f1/bugs.md                 ← 查找需要修复的 bug
  issues/f1/bugs/bug<n>.md          ← 所有 status=unresolved 的 bug 文件

输出（修改）:
  worktrees/f1/ 中的代码文件         ← 修复代码
  issues/f1/bugs/bug<n>.md          ← Status: unresolved → pending_verification
                                      （若无法修复 → blocked，附原因）
  issues/f1/bugs.md                 ← 同步更新索引表状态
```

### 核心数据结构

```typescript
interface ReviewLoop {
  issueId: string;
  round: number;
  maxRounds: number;
  state: 'reviewing' | 'fixing' | 'done' | 'blocked';
}

type BugStatus = 'unresolved' | 'pending_verification' | 'resolved' | 'blocked';

interface BugFile {
  path: string;           // e.g. "issues/f1/bugs/bug3.md"
  number: number;
  title: string;
  severity: 'critical' | 'major' | 'minor' | 'nit';
  status: BugStatus;
  roundFound: number;     // 第几轮 review 发现的
}
```

### 单轮执行流程

```
Round 1:
  ┌─ 1. REVIEWING ───────────────────────────────────────────────────┐
  │  orb 构建 prompt，核心指令：                                       │
  │    "Read base_version.json to find the base commit.                 │
  │     Run git diff <base_commit> to see all changes.                │
  │     Read tech_design.md to understand the design.                 │
  │     For each issue found, create issues/f1/bugs/bug<n>.md         │
  │     (status=unresolved) and append to issues/f1/bugs.md.          │
  │     If no bugs found, output NO_BUGS_FOUND."                      │
  │                                                                   │
  │  adapter.invoke({                                                 │
  │    skill: "orb-code-reviewer",                                    │
  │    workdir: "worktrees/f1/",                                      │
  │    contextFiles: [                                                │
  │      "issues/f1/base_version.json",                                 │
  │      "issues/f1/tech_design.md",                                  │
  │      "issues/f1/code_plan.md",                            │
  │      "issues/f1/bugs.md"                                          │
  │    ]                                                              │
  │  })                                                               │
  │                                                                   │
  │  → agent 创建 bug1.md, bug2.md（status=unresolved），更新 bugs.md  │
  └──────────────────────────────────────────────────────────────────┘
                          │
                          ▼
  ┌─ 2. 检测 ────────────────────────────────────────────────────────┐
  │  orb 扫描 issues/f1/bugs/*.md                                     │
  │  有 unresolved → 进入 FIXING                                      │
  └──────────────────────────────────────────────────────────────────┘
                          │
                          ▼
  ┌─ 3. FIXING ──────────────────────────────────────────────────────┐
  │  orb 构建 prompt，核心指令：                                       │
  │    "Read issues/f1/bugs.md to find unresolved bugs.               │
  │     Read each unresolved bug file.                                │
  │     Fix each in worktrees/f1/.                                    │
  │     After fixing, change Status to pending_verification           │
  │     and update bugs.md accordingly.                               │
  │     If a bug cannot be fixed (needs design change),               │
  │     mark it blocked with an explanation."                         │
  │                                                                   │
  │  adapter.invoke({                                                 │
  │    skill: "orb-developer",                                        │
  │    workdir: "worktrees/f1/",                                      │
  │    contextFiles: [                                                │
  │      "issues/f1/base_version.json",                                 │
  │      "issues/f1/tech_design.md",                                  │
  │      "issues/f1/bugs.md",                                         │
  │      "issues/f1/bugs/bug1.md",                                    │
  │      "issues/f1/bugs/bug2.md"                                     │
  │    ]                                                              │
  │  })                                                               │
  │                                                                   │
  │  → developer 修完代码                                              │
  │  → bug1.md, bug2.md Status: unresolved → pending_verification     │
  │  → 同步更新 bugs.md                                               │
  └──────────────────────────────────────────────────────────────────┘
                          │
                          ▼
  ┌─ 4. 检测 ────────────────────────────────────────────────────────┐
  │  orb 扫描 issues/f1/bugs/ 目录                                     │
  │  全部为 pending_verification 或 resolved → 进入下一轮 REVIEWING     │
  └──────────────────────────────────────────────────────────────────┘
                          │
                          ▼
Round 2:
  ┌─ 1. REVIEWING ───────────────────────────────────────────────────┐
  │  code-reviewer 重新 review（diff 现在包含 round 1 的修复）          │
  │  对 pending_verification 的 bug：验证修复                          │
  │    → 修复正确 → resolved                                          │
  │    → 修复不正确 → 打回 unresolved（附原因）                         │
  │  对代码变更：发现新问题 → 创建新 unresolved bug                      │
  │  无新问题且所有 pending 已验证 → NO_BUGS_FOUND                      │
  └──────────────────────────────────────────────────────────────────┘
                          │
                          ▼
         还有 unresolved？
      ┌─────┴─────┐
      │ 有          │ 无
      ▼             ▼
  回到 FIXING    ✅ done
```

### agent 如何产生 bug 文件与更新 bugs.md

code-reviewer 被调用时，skill prompt 指导它：
1. 通过 `base_version.json` 获取 base commit，运行 `git diff <base>` 查看变更
2. 在 `issues/f1/bugs/` 下创建 `bug<n>.md`（n 接续 bugs.md 中已有编号，status=unresolved）
3. 对 `pending_verification` 的 bug：验证修复 → resolved（通过）或 unresolved（打回）
4. 同步更新 `issues/f1/bugs.md`

developer 被调用时，skill prompt 指导它：
1. 读取 `bugs.md` 和所有 `unresolved` 的 bug 文件
2. 在 worktree 中修复代码
3. 修改 `bug<n>.md` 的 Status：`unresolved` → `pending_verification`（或 `blocked`）
4. 同步更新 `issues/f1/bugs.md`

orb 只在 agent 执行**结束后**扫描文件系统来判断 loop 走向。

### 终止条件

```typescript
function checkTermination(bugs: BugFile[], round: number, maxRounds: number): TerminateReason {
  // 1. 全部 resolved → 通过
  if (bugs.every(b => b.status === 'resolved')) return 'passed';

  // 2. 到达最大轮数 → 超限
  if (round >= maxRounds) return 'max_rounds';

  // 3. 剩余未解决的 bug（unresolved | pending_verification）全部是 blocked → 需人工介入
  const active = bugs.filter(b => b.status !== 'resolved');
  if (active.every(b => b.status === 'blocked')) return 'human_needed';

  // 4. 还有 unresolved 或 pending_verification → 继续 loop
  return 'continue';
}
```

### 关键设计决策

**每轮 review 创建新的 bug 文件，不复用旧文件。** 每轮 review 的发现独立保存，构成审计轨迹，可以看到 bug 数量在收敛（round 1: 5 个, round 2: 1 个, round 3: 0 个）。

**developer 永远不能将 bug 标记为 resolved。** 只有 code-reviewer 可以确认修复。developer 只能标记 `pending_verification`（我修了，请检查）或 `blocked`（我修不了）。

**不把 git diff 写进 prompt。** orb 传入 `base_version.json`（含各 repo 的 base commit SHA），agent 在 worktree 中自己 `git diff <base>`。diff 始终实时，不占 prompt 上下文。

**不实时解析 agent 输出，靠文件系统检测。** agent 的输出是自然语言，不可靠。文件系统是 agent 和 orb 之间唯一的可靠契约。

## Templates 模板系统

### 概述

orb 内置一套 markdown 模板文件（位于 `templates/` 目录），用于生成 issue pipeline 中的各阶段文档产物。模板使用 `{{PLACEHOLDER}}` 语法，由 orb 命令或 AI agent 填充实际内容。

### 模板文件清单

| 模板文件 | 对应产物 | 使用者 | `{{占位符}}` | 说明 |
|---|---|---|---|---|
| `templates/issue.md` | `issues/f<n>/issue.md` | `orb ic` | `{{TITLE}}` | 需求文档框架 |
| `templates/tech_design.md` | `issues/f<n>/tech_design.md` | architect agent | `{{TITLE}}` | 技术方案框架 |
| `templates/code_plan.md` | `issues/f<n>/code_plan.md` | architect agent | `{{TITLE}}` | 编码计划框架 |
| `templates/issues.md` | `issues/issues.md` | `orb ic` | 无（纯结构模板） | issue 索引表 |
| `templates/bugs.md` | `issues/f<n>/bugs.md` | `orb ic` | 无（纯结构模板） | bug 索引表 |

`bug<n>.md` 的格式在 `orb-code-reviewer` skill 中定义，不需要单独模板。

`base_version.json` 不需要模板——由代码直接 `JSON.stringify` 生成。

### 模板使用方式

**orb 命令使用模板：** `orb ic` 读取 `templates/issue.md` 替换 `{{TITLE}}` 占位符后写入。`base_version.json` 由代码直接生成 JSON，不走模板替换。模板文件随 orb npm 包一起分发，构建时 `tsc && cp -r templates dist/` 复制到 dist。运行时从 `dist/templates/` 读取（开发模式回退到 `templates/`）。

**AI agent 使用模板：** architect agent 和 code-reviewer agent 的 skill prompt 中引用模板路径，指导 agent 按照模板结构填写内容。agent 不直接读模板文件，而是从 skill prompt 中学习输出格式。

```
code-reviewer skill prompt:
  "For each bug found, create bug<n>.md using this format:
   <templates/bug.md 的结构描述>"

architect skill prompt:  
  "Write tech_design.md using this structure:
   <templates/tech_design.md 的结构描述>"
```

### 设计原则

- **模板是 orb 的源码，不是用户配置文件。** 模板随 orb npm 包版本管理，用户不需要手动编辑
- **模板与 skill 解耦。** skill 定义 agent 行为规范，模板定义文档结构。两者可以独立演化
- **占位符极简。** 不使用复杂模板引擎，`{{VAR}}` 替换足以覆盖所有场景

