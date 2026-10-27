# Aurora Forge / AF

在互动中自然学习。

Aurora Forge 是以视觉小说呈现日常互动与章节学习的桌面应用，使用 Electron、electron-vite、React 和 TypeScript。设计基线为 v1.3，当前交付为已审核的开屏、标题栏与首页交互切片，完整学习平台仍在开发中。

## 当前可用

- 黑屏 → AF 品牌淡入与随机一段品牌朗读 → 品牌淡出 → 校园标题栏。
- 标题栏根据本地时间显示白天（06:00–17:00）、黄昏（17:00–19:00）和夜景，包含分层树冠、云层与水面动画；夜景顶部窗户保持熄灯。
- 标题栏点击或按键进入首页，播放一次确认音效。标题栏至首页共约 2 秒过渡，BGM 保持同一播放实例，不重启。
- 首页使用已审核的 Aurore 立绘与布局，人物、导航有鼠标视差，控件有悬停和按下反馈。
- 支持开屏跳过、静音、简化动效、素材缺失降级，以及本地前端预览偏好保存。

首页其余入口目前提供明确的未接入提示。首页聊天、真实存档、章节学习、资料解析、模型调用与 MCP／Skill 调度尚未实现；页面预览不代表这些功能已完成。当前没有安装包或干净机器验收结论。

## 本地运行

开发环境使用 Node.js 24 或更高版本与 npm，首次安装需要联网下载依赖及 Electron。

```powershell
npm ci
npm run dev
```

编译后运行桌面预览：

```powershell
npm run build
npm run preview
```

`preview` 使用已有编译产物；修改源码后需要重新构建。桌面运行前请关闭之前的 AF 窗口，避免单实例机制切回旧窗口。

固定时段检查标题栏（开发预览，不改变系统时间）：

```powershell
npm run title:review -- day
npm run title:review -- dusk
npm run title:review -- night
```

不指定时段时按本地时间选择。浏览器辅助预览使用 `npm run dev:browser`，地址为终端显示的本地地址；浏览器可能限制音频自动播放，音频验收以 Electron 为准。

## 验证

```powershell
npm run typecheck
npm test
npm run check:assets
npm run check:boundaries
npm run build
npm run test:e2e
npm run test:title-review
```

`test:e2e` 需要先构建，并在真实 Electron 中检查启动、交互、素材与短音效播放；`test:title-review` 自行构建并检查时段切换、动画分层和背景加载失败降级。两类端到端命令应顺序运行，避免同时改写构建产物。测试报告与截图统一写入 `build/reports/`，不提交仓库。

自动测试只覆盖当前实现，不能替代视觉审核、完整规格验收或干净机器安装包验收。

## 规格与开发约束

- [唯一设计规格源](docs/AF项目设计书.md)
- [同版本 PDF](docs/AuroraForge-设计规格书-v1.3.pdf)
- [Agent 开发协作规范](Agent.md)

全部有效界面参考图、立绘及样式说明集中在规格书第 23 章。后续开发必须同时遵守相应图版、交互说明、工程结构与验收契约，不凭截图近似或测试通过宣称完整功能完成。

共享接口与状态机遵循 17.11、25.2.2、25.3.1，草稿与角色会话隔离遵循 25.4.1；按 20.8 的依赖推进，21.4 的 CT01–CT18 用于完整产品后续验收。

最终用户版本必须自包含：用户只安装 AF，无需另装 dsh、Node.js、Python、Office／LibreOffice 或 MCP 宿主。上述 Node.js 要求仅适用于源码开发。在线模型仍需 API key，可选平台功能需账号授权；发行边界见规格书 25.2.1。

## 目录与素材

| 目录 | 用途 |
|---|---|
| `src/main/`、`src/preload/`、`src/renderer/` | Electron 主进程、隔离桥与前端 |
| `assets/` | 已确认运行素材、来源和资源清单 |
| `docs/` | 唯一规格源、PDF 与正式参考图 |
| `config/`、`scripts/` | 配置与长期维护的工程工具 |
| `tests/` | 单元与 Electron 端到端测试 |
| `build/`、`tmp/` | 已忽略的构建产物、报告及临时文件 |

六张 Aurore 透明全身立绘位于 `assets/characters/aurore/`，透明矢量标志位于 `assets/brand/`。素材由 `assets/registry.json` 校验，开发服务器只提供登记的可用资源，构建只复制已确认资源。已否决的三首程序 BGM 及谱面仅保留本地副本并受 Git 忽略，仓库保留拒绝记录，禁止接入播放。

音频的来源与使用范围见 [音频说明](assets/audio/README.md)。用户审核的六首 BGM、五种操作音效和两段品牌朗读分别保留来源与许可记录；它们不因项目许可而自动获得重新授权。

`scripts/docs/` 为本地文档辅助目录，按 `.gitignore` 忽略，不随仓库分发。临时脚本、报告、缓存和构建产物不得提交。规格变更按第 22 节维护同一 Markdown 与同版本 PDF，不并列维护竞争性规格。
