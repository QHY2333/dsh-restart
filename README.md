# dsh-restart

> 在 DSH 左下角的账号菜单里加一个 **重启 DSH**，安装或更新插件后不用退出应用再重进。

[![version](https://img.shields.io/badge/version-1.0.2-4D6BFE)](https://github.com/QHY2333/dsh-restart/releases)
[![license](https://img.shields.io/badge/license-MIT-green)](LICENSE)

---

## 这是什么

`dsh-restart` 是一个 DeepSeek Harness（DSH）插件。它只做一件事：**把「退出应用 → 重新打开」变成一次点击**。

安装后，点击左下角的用户头像，账号菜单里会多出一行：

```text
┌──────────────────────┐
│  设置                │
│  反馈                │
│  重启 DSH            │  ← 本插件
│  退出登录            │
└──────────────────────┘
```

点击「重启 DSH」会先弹确认框，确认后 DSH 会退出并自动重新启动。新安装或更新的插件在重启后生效。

---

## 功能特性

- **位置原生**：在账号菜单里、「退出登录」正上方，和「设置」「退出登录」同一列。
- **一次点击**：确认后自动结束旧进程并启动新进程，不需要任务管理器或终端。
- **静默重启**：负责重启的助手进程以 `SW_HIDE` 创建，不会弹出控制台窗口。
- **同源保护**：重启接口只接受同源 `POST`，并要求一个跨站页面无法直接携带的请求头。
- **不会选错程序**：重新启动的可执行文件固定为当前 DSH 的 `process.execPath`，浏览器无法指定路径。
- **有超时反馈**：如果 20 秒内应用没有回来，确认框会显示错误，而不是永远停在「正在重启…」。
- **中英双语**：菜单项和确认框跟随 DSH 当前界面语言。
- **无网络、无遥测、无落盘数据**：唯一的请求是页面同源 `POST` 到插件自己的 Host 路由。

---

## 为什么需要它

DSH 在启动时加载插件代码和 Cordis 组合。以下情况都会让 DSH 标记 `restart-required`：

- 新安装一个插件；
- 更新一个插件的版本；
- 插件文件发生变化，需要新的模块代际；
- 修改了某些只能在启动时读取的配置。

常规做法是退出 DSH 再打开。这个插件把这件事变成账号菜单里的一次点击，避免每次都去任务栏或开始菜单里找应用。

---

## 安装

### 方式一：从 Git 源码安装（推荐）

在 DSH 的 **插件** 页面里添加：

```text
git+https://github.com/QHY2333/dsh-restart.git
```

### 方式二：从 Release 的预构建包安装

下载：

```text
https://github.com/QHY2333/dsh-restart/releases/latest/download/dsh-restart.tgz
```

在插件页面里填入这个 `.tgz` 的地址或本地路径。

### 首次安装需要手动重启一次

这是所有「重启类」插件都绕不开的一步：插件本身也要在 DSH 启动时才会被加载。

安装完成后：

1. 完全退出 DSH；
2. 重新打开 DSH；
3. 点击左下角用户头像，就能看到「重启 DSH」。

之后再安装或更新其他插件，直接点这个入口即可。

---

## 使用

1. 点击左下角的用户头像。
2. 在账号菜单里点击 **重启 DSH**（在「退出登录」上方）。
3. 确认框会说明：重启会中断当前正在运行的任务。
4. 点击 **立即重启**。
5. DSH 退出并自动重新启动；新插件在重启后生效。

如果 20 秒内应用没有回来，确认框会显示：

> 重启没有完成。请手动退出并重新打开 DSH。

这时可以查看下面「故障排查」里的日志，或者手动重启。

---

## 系统要求与兼容性

| 项目 | 要求 |
|---|---|
| DSH 版本 | `0.2.2-rc.1` 或后续 `0.2.x` |
| 平台 | Windows（主要验证平台）；macOS / Linux 为尽力而为 |
| 界面 | Web GUI 或 DSH 桌面应用 |
| 实际重启 | 需要 DSH 桌面应用（Electron） |
| 纯 `dsh web` | 接口返回 501，提示仅桌面版支持，不会杀掉服务 |

> 说明：Web GUI 也可以打开这个菜单，但真正执行「退出并重新启动」的前提是 Host 跑在 DSH 桌面进程里。纯 CLI 起的 `dsh web` 没有 Electron 主进程，插件会明确拒绝，而不是把服务杀掉。

---

## 工作原理

### 1. Host 半侧：一个受保护的重启接口

Host 插件在 Web 服务可用时注册一个精确路由：

```text
POST /_dsh_restart
Header: x-dsh-restart: 1
```

校验顺序：

1. 只接受 `POST`，其他方法返回 405；
2. 必须有 `x-dsh-restart: 1`，否则 403；
3. `Origin` / `Sec-Fetch-Site` 必须是同源，否则 403；
4. 不是 Electron 主进程时返回 501；
5. 通过后先返回 202，再在 300ms 后启动重启流程。

自定义请求头是关键：跨站页面要携带它，浏览器会先发 CORS 预检，而这个路由不授予预检，因此跨站请求到不了真正的处理逻辑。

### 2. Windows：WMI 助手必须活在 Electron 的 Job 对象之外

Host 进程运行在 Electron 的 Windows Job 对象里。**如果助手是 Host 的子进程，应用退出时 Job 关闭，助手会一起被杀掉**，结果就是应用关了但没人把它拉起来。

所以流程是：

```text
Host（Job 内）
  └─ 同步调用一个隐藏的 PowerShell 启动器
       └─ Invoke-CimMethod Win32_Process.Create
            └─ 助手 PowerShell（WmiPrvSE 的子进程，Job 外、用户会话内）
                 ├─ 清除 ELECTRON_RUN_AS_NODE / NODE_OPTIONS
                 ├─ 结束所有 DeepSeek Harness 进程
                 ├─ 等待进程真正退出
                 └─ Start-Process process.execPath
```

WMI 创建进程时传入：

```powershell
$startup = New-CimInstance -CimClass (Get-CimClass Win32_ProcessStartup) -ClientOnly
$startup.ShowWindow = 0   # SW_HIDE
```

这样助手从创建那一刻起就没有控制台窗口，不会闪一下黑框。

### 3. 为什么要清除 `ELECTRON_RUN_AS_NODE`

Host 是以 Node 模式运行的（`ELECTRON_RUN_AS_NODE=1`）。如果重开的 Electron 应用继承了这个变量，它会以 Node 模式启动，执行完就退出，**窗口永远不会出现**。

助手启动应用前会清除：

- `ELECTRON_RUN_AS_NODE`
- `NODE_OPTIONS`
- `ELECTRON_NO_ATTACH_CONSOLE`

这样新进程才会以正常的桌面应用方式启动。

### 4. 为什么不直接用 `app.relaunch()`

`app.relaunch()` 属于 Electron 主进程，而插件运行在 Host 子进程里，拿不到 `app` 对象。插件能做的只有「请一个 Job 外的助手，替我把应用关掉再打开」，这也是 WMI 方案存在的原因。

### 5. Client 半侧：账号菜单没有插槽，只能插入一行

内置账号插件把菜单项写死在 `items` 数组里，没有给插件留扩展插槽。本插件的做法是：

1. 监听账号触发按钮的点击（`button[aria-haspopup="menu"][data-signed-out]`）；
2. 等菜单浮层出现在 `document.body`；
3. 找到最后一行（「退出登录」或「登录」）；
4. 克隆它的实时 class，插入一个同样外观的 `role="menuitem"`；
5. 点击时关闭菜单，打开插件自己的 React 确认框。

确认框是一个挂到 `document.body` 的小型 React root，使用 DSH 主题变量，支持 `Esc` 关闭和 20 秒超时。

**没有修改任何内置插件文件。**

### 6. 为什么只刷新页面不够

刷新页面只会重新加载浏览器里的 Client 模块，不会重新加载 Host 里的 Cordis 插件树。新安装的插件需要在 Host 启动时重新导入，所以必须重启整个 DSH 进程，而不是按 F5。

---

## 故障排查

### 看不到「重启 DSH」

- 确认插件版本 ≥ `1.0.2`；
- 确认插件在 **设置 → 插件** 里是启用状态；
- 首次安装后需要手动重启一次；
- 如果 DSH 升级后账号菜单结构变化，DOM 注入可能失效，请提 issue。

### 点击后一直停在「正在重启…」

1.0.2 起会在 20 秒后显示错误。此时查看 `%TEMP%` 下的日志：

| 文件 | 记录内容 |
|---|---|
| `dsh-restart-host.log` | Host 收到请求、生成助手路径 |
| `dsh-restart-launcher.log` | WMI `Win32_Process.Create` 的返回值和助手 PID |
| `dsh-restart-helper.log` | 助手开始、结束应用、新应用 PID |
| `dsh-restart-failure.log` | 宿主侧异常栈 |

常见判断：

- `launcher.log` 里 `helper pid` 为 0 或 `wmi failed`：WMI 创建进程被安全软件/策略拦截；
- `helper.log` 有 `start` 但没有 `started pid`：`Start-Process` 失败，检查安装路径和权限；
- 三个文件都没有：请求没有到达 Host，检查插件是否启用、路由是否 405/403。

手动兜底：完全退出 DSH 再打开。Windows 上也可以在任务管理器里结束所有 “DeepSeek Harness” 进程，然后重新打开应用。

### 还看到控制台窗口

- 确认版本是 `1.0.2` 或更高；
- 旧版本启动的助手可能还在运行，等它退出或手动结束；
- 1.0.2 在 WMI 创建时就设置 `SW_HIDE`，正常不会再有窗口。

### 返回 403

说明请求不是同源，常见于：

- 通过反向代理/远程地址访问 Web GUI；
- 页面嵌入在 iframe 或 `dsh-app://` 之外的自定义容器里。

这是有意的安全限制，避免任意网页触发重启。

### 返回 501

说明当前 DSH 不是桌面应用（例如纯 `dsh web`）。请用桌面客户端，或手动重启服务。

---

## 安全与隐私

- **只接受同源 POST**，并要求自定义请求头，降低 CSRF 风险；
- **可执行文件固定**：重启的永远是当前进程的 `process.execPath`，浏览器不能传路径；
- **WMI 助手以当前用户身份运行**，创建时隐藏窗口；
- **不联网、不遥测、不写业务数据**；
- 唯一的网络请求是页面同源 `POST /_dsh_restart`。

需要说明的是：本机上的任意进程如果知道这个路由，理论上也可以触发重启。插件没有额外的身份验证，因为重启本身不会泄露数据，最坏影响是中断当前任务。如果你在共享机器上使用，请注意这一点。

---

## 开发

### 目录结构

```text
dsh-restart/
├─ index.js            # Host 半侧：重启路由 + WMI 助手
├─ client.js           # Client 半侧：账号菜单注入 + 确认框
├─ cordis.patch.yml    # 插入插件行
├─ package.json        # bundle / client 清单
├─ locale/
│  ├─ en.json          # 插件市场显示用元数据
│  └─ zh.json
├─ icon.svg
├─ test/
│  └─ plugin.test.mjs  # Host 路由 + Client 注册测试
├─ README.md
├─ README.zh.md
└─ LICENSE
```

### 本地检查

```sh
node --check index.js
node --check client.js
npm test
```

当前测试覆盖：

- 路由只接受 POST；
- 缺少请求头返回 403；
- 跨源返回 403；
- 非 Electron 返回 501；
- 桌面同源请求返回 202；
- Client 模块注册语言包、对话框根和账号菜单监听。

### 打包

```sh
npm pack
```

生成 `qhy2333-dsh-restart-1.0.2.tgz`，可在 DSH 插件页或通过 `plugin_manager install_bundle` 安装。

### 修改账号菜单注入时的注意事项

- 选择器来自内置账号插件当前的 DOM：`button[aria-haspopup="menu"][data-signed-out]`、`div[role="menu"]`、`button[role="menuitem"]`；
- 插入位置是菜单最后一行之前；
- class 从实时 DOM 克隆，因此不要硬编码哈希 class；
- 如果 DSH 升级后菜单结构变化，先更新选择器和测试。

---

## 已知限制

- **账号菜单 DOM 注入不是官方插槽**：DSH 升级如果重写账号菜单，可能需要适配；
- **重启会中断正在运行的任务**：确认框只能提示，不能等任务结束；
- **20 秒超时**：极慢的机器上应用可能在超时后才回来，此时确认框已经显示错误；
- **Windows 是主要验证平台**：macOS/Linux 的 POSIX 重启路径是尽力而为；
- **纯 `dsh web` 不支持**：没有 Electron 主进程，接口返回 501；
- **首次安装仍需手动重启一次**：插件自己也要被 Host 加载。

---

## 版本历史

### 1.0.2

- WMI 助手改为 `SW_HIDE` 创建，不再弹控制台窗口。

### 1.0.1

- 修复重开的 Electron 继承 `ELECTRON_RUN_AS_NODE=1` 导致启动后立即退出的问题；
- 助手改由 WMI 创建，脱离 Electron Job 对象，避免随应用一起被杀；
- 重启入口从侧栏底部移到账号菜单、「退出登录」上方；
- 确认框增加 20 秒超时和错误提示；
- 增加 `%TEMP%` 诊断日志。

### 1.0.0

- 首个版本：侧栏底部重启按钮、同源重启接口、确认框。

---

## 许可证

[MIT](LICENSE)
