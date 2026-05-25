# orb -- 面向工程师和 AI 协作的全流程开发工具

orb 是一款面向工程师的 cli 工具，用于编排 AI，提升从 issue（feature/bug）到提交代码的整个流程

它在 project 中围绕 issue 展开工作

- project: 一个产品/工程项目，可以有多个 git repos 组成，比如前后端
- issue: 一个 feature or bug，每个 issue 有一个编号，以 'f' 开头加数字编号，比如 'f1', 'f2'

## project 目录

```
- <project root>
    - repos: 基于线上稳定分支的仓库列表，禁止修改该目录下的内容，禁止切换到其他分支
        - repo1:
            - docs: 文档，对线上代码的架构分析、描述等，issue 设计技术方案时可以参考
        - repo2:
    - worktrees: 基于 issue 从 repos 切出的 worktree
        - f1:
            - repo1
            - repo2
        - f2:
            - repo1
            - repo2
    - issues
        - issues.md: 各 issue 的编号、title、状态
        - f1: 指定 issue 的文件夹，包含该 issue 的目标、技术方案、编码计划、bug list 等
            - issue.md: issue 描述，包含简短 title, 背景、目标、非目标、约束
            - tech_design.md: 该 issue 的技术方案
            - implemention_plan.md: 由技术方案制定的编码计划
            - bugs:
                - bugs.md: bug 列表，包含 bug 编号、title、状态
                - bugs: 所有 bug 的文档
                    - bug1.md: 该 bug 的详细描述
                    - bug2.md
            - base_version.md: 该 issue 是基于各 repos 的哪个 commit 切出来的
        - f2:
    - AGENTS.md: 对该 project 的介绍和指导，包括 repos 介绍等
```

## 使用方式

### 创建 issue

```sh
orb ic "issue title"
```

创建 issue 时，需要将该 issue 添加到 issues.md 并分配编号，并且：

1. 在 worktrees 下新建该 issue 编号（包含f）的文件夹，并且将所有 repos 都 checkout 到该目录下，分支命名为也为该 issue 编号
2. 在 issues 创建该 issue 文件夹，填充 base_version.md 等内容
