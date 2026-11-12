# dsh-restart

给 DeepSeek Harness 加一个**重启 DSH** 按钮，安装或更新插件后不用手动退出应用再打开。

包名：`@qhy2333/dsh-restart`

![icon](icon.svg)

## 功能

- 在侧栏左下角、账号/设置同一列添加一个重启入口。
- 点击后先弹出确认框，确认后退出桌面应用并重新启动。
- Web GUI 与 DSH 桌面应用都能用，因为两者页面由同一个 HTTP 服务提供。

重启会中断当时正在运行的任务，确认框会先把这一点说清楚。

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

安装后看侧栏左下角：**重启 DSH** 就在账号那一行上面。首次安装本插件后仍需手动重启一次，之后按钮就能用了。

## 实现

宿主半侧注册一个精确 HTTP 路由 `/_dsh_restart`：

- 只接受 `POST`，且要求 `x-dsh-restart: 1` 请求头；跨站页面要发这个头会触发 CORS 预检，而该路由不授予预检。
- 校验 `Origin` / `Sec-Fetch-Site` 与当前 Web 服务同源。
- 先返回响应，再由一个分离的辅助进程结束应用的所有进程，并重新启动 `process.execPath`；可执行文件不由浏览器决定。
- Windows 上辅助进程是一段隐藏的、编码后的 PowerShell 脚本，安装路径带空格或非 ASCII 字符也能工作。

客户端半侧通过 `ctx.slots` 注册 `sidebar.footer.action`，用当前主题变量渲染自己的确认框，不读取其他插件的 DOM 或样式。

## 隐私

不联网、不上报、不存数据。唯一的请求是页面同源 `POST` 到本插件自己的宿主路由。

## 开发

这个包是普通 Cordis bundle：`index.js` 是宿主半侧，`client.js` 是 Web 客户端半侧，`cordis.patch.yml` 插入插件行。

```sh
node --check index.js
node --check client.js
```

## 许可证

MIT
