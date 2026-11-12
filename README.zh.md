# dsh-restart

给 DeepSeek Harness 加一个**重启 DSH** 入口，放在左下角账号菜单里、**退出登录**上方，安装或更新插件后不用手动退出应用再打开。

包名：`@qhy2333/dsh-restart`

![icon](icon.svg)

## 功能

- 点击左下角用户头像后，在账号菜单里、**设置**和**退出登录**同一列添加「重启 DSH」。
- 点击后先弹出确认框，确认后退出桌面应用并重新启动。
- Web GUI 与 DSH 桌面应用都能用，因为两者页面由同一个 HTTP 服务提供。

重启会中断当时正在运行的任务，确认框会先把这一点说清楚。如果 20 秒内应用没有回来，确认框会显示错误，而不是一直停在「正在重启…」。

## 为什么需要它

DSH 在启动时加载插件代码。插件文件变化、或新装插件需要新的模块代际时，状态会显示 `restart-required`，常规做法是退出应用再打开。这个插件把它变成一次点击。

## 要求

- DSH `0.2.2-rc.1` 或后续 `0.2.x` 版本。
- 重启端点只在 Web 服务挂载时存在，因此按钮面向 Web GUI / 桌面应用，不面向 headless profile。
- 真正执行“退出并重新启动”的是 DSH 桌面应用（Electron）。在纯 `dsh web` 进程里，按钮会提示仅桌面版支持，而不会把服务杀掉。

## 安装

在 DSH 的插件页里从 Git 源码安装：

```
git+https://github.com/QHY2333/dsh-restart.git
```

安装后点左下角用户头像：**重启 DSH** 就在**退出登录**上面。首次安装本插件后仍需手动重启一次，之后这个入口就能用了。

## 实现

宿主半侧注册一个精确 HTTP 路由 `/_dsh_restart`：

- 只接受 `POST`，且要求 `x-dsh-restart: 1` 请求头；跨站页面要发这个头会触发 CORS 预检，而该路由不授予预检。
- 校验 `Origin` / `Sec-Fetch-Site` 与当前 Web 服务同源。
- 先返回响应，再由一个短命的启动器让 Windows WMI 创建辅助进程。辅助进程在 Electron 的 Job 对象之外、以当前用户会话运行，因此不会被应用退出一起杀掉。它会清除 `ELECTRON_RUN_AS_NODE`（Host 以 Node 模式运行，重开的 Electron 应用不能继承它），结束应用的所有进程，等它们退出后重新启动 `process.execPath`；可执行文件不由浏览器决定。
- 用 WMI 创建进程是为了避开两个真实故障：放在 Electron Job 里的助手会随应用一起被杀；带 `ELECTRON_RUN_AS_NODE=1` 启动的 Electron 会直接以 Node 模式退出，不显示窗口。

客户端半侧没有现成插槽可用：内置账号插件用写死的 `items` 数组构建菜单。本插件监听账号触发按钮（`button[aria-haspopup="menu"][data-signed-out]`）的点击，找到随后出现的菜单浮层，复用最后一行的实时 class，在**退出登录**上方插入一个外观原生、`role="menuitem"` 的行。确认框是一个挂到 `document.body` 的小型 React root。不修改任何内置插件文件。

## 排错

如果重启没有完成，`%TEMP%` 下的这些文件会指出卡在哪一步：

- `dsh-restart-host.log` — Host 收到了重启请求并启动了 WMI 启动器。
- `dsh-restart-launcher.log` — WMI `Win32_Process.Create` 的返回值和助手 PID。
- `dsh-restart-helper.log` — 助手开始执行、结束应用，以及重新启动后的应用 PID。

`dsh-restart-failure.log` 记录宿主侧异常。

## 隐私

不联网、不上报、不存数据。唯一的请求是页面同源 `POST` 到本插件自己的宿主路由。

## 开发

这个包是普通 Cordis bundle：`index.js` 是宿主半侧，`client.js` 是 Web 客户端半侧，`cordis.patch.yml` 插入插件行。

```sh
node --check index.js
node --check client.js
npm test
```

## 许可证

MIT
