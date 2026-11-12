window.__ModuleLoader__.load({
  id: '@qhy2333/dsh-restart',
  factory(require) {
    const React = require('react')
    const ReactDOMClient = require('react-dom/client')
    const h = React.createElement

    const zh = {
      button: '重启 DSH',
      title: '重启 DeepSeek Harness？',
      description: '重启会中断正在运行的任务。新安装或更新的插件将在重启后生效。',
      cancel: '取消',
      confirm: '立即重启',
      restarting: '正在重启…',
      failed: '无法触发重启：',
      timeout: '重启没有完成。请手动退出并重新打开 DSH。',
    }

    const en = {
      button: 'Restart DSH',
      title: 'Restart DeepSeek Harness?',
      description: 'Restarting interrupts running tasks. Newly installed or updated plugins take effect after the restart.',
      cancel: 'Cancel',
      confirm: 'Restart now',
      restarting: 'Restarting…',
      failed: 'Could not request a restart: ',
      timeout: 'The restart did not complete. Quit and reopen DSH manually.',
    }

    const CSS = `
.dsh-restart-overlay{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;box-sizing:border-box;padding:24px;background:color-mix(in srgb,var(--dsw-alias-bg-base) 42%,transparent);backdrop-filter:blur(2px)}
.dsh-restart-dialog{box-sizing:border-box;width:min(420px,100%);padding:20px;border:1px solid var(--dsw-alias-border-l1);border-radius:16px;background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary);box-shadow:0 16px 48px rgba(0,0,0,.28);font-size:14px}
.dsh-restart-title{margin:0 0 8px;font-size:16px;font-weight:600;line-height:24px}
.dsh-restart-body{margin:0;color:var(--dsw-alias-label-secondary);line-height:22px}
.dsh-restart-error{margin:10px 0 0;color:var(--dsw-alias-state-error-primary);line-height:20px}
.dsh-restart-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:20px}
.dsh-restart-actions button{box-sizing:border-box;height:32px;padding:0 14px;border:1px solid transparent;border-radius:10px;font:inherit;font-size:14px;line-height:20px;cursor:pointer}
.dsh-restart-actions button:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
.dsh-restart-actions button:disabled{opacity:.55;cursor:default}
.dsh-restart-cancel{border-color:var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-primary)}
.dsh-restart-confirm{background:var(--dsw-alias-brand-primary);color:#fff}
`

    const ICON = '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13.1 6.2A5.5 5.5 0 1 0 13.5 9.4"/><path d="M13.4 2.9v3.4H10"/></svg>'

    /** Small external store so the injected menu row can open the React dialog. */
    const dialog = {
      open: false,
      listeners: new Set(),
      subscribe(listener) {
        this.listeners.add(listener)
        return () => this.listeners.delete(listener)
      },
      setOpen(value) {
        this.open = value
        for (const listener of this.listeners) listener(value)
      },
    }

    function RestartDialog({ t, onClose }) {
      const [phase, setPhase] = React.useState('idle')
      const [error, setError] = React.useState(null)
      const cancelRef = React.useRef(null)
      const timerRef = React.useRef(null)

      const clearTimer = () => {
        if (timerRef.current !== null) {
          window.clearTimeout(timerRef.current)
          timerRef.current = null
        }
      }

      React.useEffect(() => () => clearTimer(), [])

      React.useEffect(() => {
        const onKey = (event) => {
          if (event.key !== 'Escape' || phase === 'restarting') return
          event.preventDefault()
          onClose()
        }
        window.addEventListener('keydown', onKey, true)
        const focusTimer = window.setTimeout(() => cancelRef.current?.focus(), 0)
        return () => {
          window.removeEventListener('keydown', onKey, true)
          window.clearTimeout(focusTimer)
        }
      }, [phase, onClose])

      const confirm = async () => {
        if (phase === 'restarting') return
        setError(null)
        setPhase('restarting')
        clearTimer()
        timerRef.current = window.setTimeout(() => {
          setPhase('idle')
          setError(t('timeout'))
        }, 20000)
        try {
          const response = await fetch('/_dsh_restart', {
            method: 'POST',
            headers: { 'x-dsh-restart': '1' },
            credentials: 'same-origin',
            cache: 'no-store',
          })
          if (!response.ok) {
            let detail = ''
            try {
              const body = await response.json()
              if (body !== null && typeof body === 'object' && typeof body.error === 'string') detail = body.error
            } catch {
              detail = ''
            }
            throw new Error(detail === '' ? 'HTTP ' + response.status : detail)
          }
        } catch (reason) {
          clearTimer()
          setPhase('idle')
          setError(t('failed') + (reason instanceof Error ? reason.message : String(reason)))
        }
      }

      return h(React.Fragment, null, [
        h('style', { key: 'style' }, CSS),
        h('div', {
          key: 'overlay',
          className: 'dsh-restart-overlay',
          onMouseDown: (event) => {
            if (event.target !== event.currentTarget || phase === 'restarting') return
            event.preventDefault()
            onClose()
          },
        }, h('div', {
          className: 'dsh-restart-dialog',
          role: 'dialog',
          'aria-modal': 'true',
          'aria-labelledby': 'dsh-restart-title',
        }, [
          h('h2', { key: 'title', id: 'dsh-restart-title', className: 'dsh-restart-title' }, t('title')),
          h('p', { key: 'body', className: 'dsh-restart-body' }, t('description')),
          error === null ? null : h('p', { key: 'error', className: 'dsh-restart-error', role: 'alert' }, error),
          h('div', { key: 'actions', className: 'dsh-restart-actions' }, [
            h('button', {
              key: 'cancel',
              ref: cancelRef,
              type: 'button',
              className: 'dsh-restart-cancel',
              disabled: phase === 'restarting',
              onClick: onClose,
            }, t('cancel')),
            h('button', {
              key: 'confirm',
              type: 'button',
              className: 'dsh-restart-confirm',
              disabled: phase === 'restarting',
              onClick: confirm,
            }, phase === 'restarting' ? t('restarting') : t('confirm')),
          ]),
        ])),
      ])
    }

    function DialogHost({ t }) {
      const [open, setOpen] = React.useState(dialog.open)
      React.useEffect(() => dialog.subscribe(setOpen), [])
      if (!open) return null
      return h(RestartDialog, { t, onClose: () => dialog.setOpen(false) })
    }

    /**
     * The shipped account menu is a hardcoded Menu inside the account plugin and
     * exposes no slot for extra rows. Its DOM is a portal with
     * `div[role=menu] > div[role=presentation] > div > button[role=menuitem]`.
     * When the account trigger opens it, clone the last row's classes and insert
     * this action above Sign out / Sign in. Classes are read from the live DOM,
     * so hashed styles stay correct across builds.
     */
    function installAccountMenuRow(ctx, t) {
      if (typeof document === 'undefined' || document.body === null) return () => {}
      const doc = document
      let pending = null
      let injected = null

      const removeInjected = () => {
        if (injected !== null && injected.wrap.isConnected) injected.wrap.remove()
        injected = null
      }

      const injectInto = (menu) => {
        if (pending === null) return
        if (Date.now() > pending.expires) {
          pending = null
          return
        }
        if (injected !== null && injected.menu === menu) return
        const viewport = menu.querySelector(':scope > [role="presentation"]') ?? menu
        const wraps = [...viewport.children].filter((element) => element.querySelector(':scope > button[role="menuitem"]') !== null)
        if (wraps.length === 0) return
        const lastWrap = wraps[wraps.length - 1]
        const template = lastWrap.querySelector(':scope > button[role="menuitem"]')
        if (template === null) return
        removeInjected()

        const iconTemplate = [...template.children].find((element) => element.tagName === 'SPAN' && element.querySelector('svg') !== null)
        const labelTemplate = [...template.children].find((element) => element.tagName === 'SPAN' && element.querySelector('svg') === null)
        const wrap = doc.createElement('div')
        wrap.className = lastWrap.className
        wrap.setAttribute('data-dsh-restart-row', '')
        const button = doc.createElement('button')
        button.type = 'button'
        button.setAttribute('role', 'menuitem')
        button.className = template.className
        button.setAttribute('data-dsh-restart-action', '')
        const icon = doc.createElement('span')
        if (iconTemplate !== undefined) icon.className = iconTemplate.className
        icon.setAttribute('aria-hidden', 'true')
        icon.innerHTML = ICON
        const label = doc.createElement('span')
        if (labelTemplate !== undefined) label.className = labelTemplate.className
        label.textContent = t('button')
        button.append(icon, label)
        wrap.append(button)
        lastWrap.before(wrap)
        injected = { menu, wrap, trigger: pending.trigger }
        pending = null
        button.addEventListener('click', (event) => {
          event.preventDefault()
          event.stopPropagation()
          const trigger = injected?.trigger ?? null
          removeInjected()
          if (trigger !== null && trigger.isConnected) trigger.click()
          dialog.setOpen(true)
        }, true)
      }

      const observer = new MutationObserver((records) => {
        if (pending === null) return
        for (const record of records) {
          for (const node of record.addedNodes) {
            if (!(node instanceof Element)) continue
            const menu = node.matches('[role="menu"]') ? node : node.querySelector('[role="menu"]')
            if (menu !== null) {
              queueMicrotask(() => injectInto(menu))
              return
            }
          }
        }
      })

      const onPointerDown = (event) => {
        const target = event.target instanceof Element ? event.target : null
        if (target === null) return
        const trigger = target.closest('button[aria-haspopup="menu"][data-signed-out]')
        if (trigger === null) return
        pending = { trigger, expires: Date.now() + 1500 }
      }

      // The account trigger also opens from keyboard activation, which fires a
      // click without a preceding pointerdown.
      const onTriggerClick = onPointerDown

      doc.addEventListener('pointerdown', onPointerDown, true)
      doc.addEventListener('click', onTriggerClick, true)
      observer.observe(doc.body, { childList: true, subtree: true })

      return () => {
        doc.removeEventListener('pointerdown', onPointerDown, true)
        doc.removeEventListener('click', onTriggerClick, true)
        observer.disconnect()
        removeInjected()
      }
    }

    return {
      inject: ['locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register('dsh-restart', { zh, en }), 'dsh-restart: dictionaries')
        const t = ctx.locale.bind('dsh-restart')

        ctx.effect(() => {
          const container = document.createElement('div')
          container.setAttribute('data-dsh-restart-dialog', '')
          document.body.append(container)
          const root = ReactDOMClient.createRoot(container)
          root.render(h(DialogHost, { t }))
          return () => {
            root.unmount()
            container.remove()
          }
        }, 'dsh-restart: dialog host')

        ctx.effect(() => installAccountMenuRow(ctx, t), 'dsh-restart: account menu row')
      },
    }
  },
})
