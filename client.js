window.__ModuleLoader__.load({
  id: '@qhy2333/dsh-restart',
  factory(require) {
    const React = require('react')
    const ReactDOM = require('react-dom')
    const h = React.createElement

    const zh = {
      button: '重启 DSH',
      title: '重启 DeepSeek Harness？',
      description: '重启会中断正在运行的任务。新安装或更新的插件将在重启后生效。',
      cancel: '取消',
      confirm: '立即重启',
      restarting: '正在重启…',
      failed: '无法触发重启：',
    }

    const en = {
      button: 'Restart DSH',
      title: 'Restart DeepSeek Harness?',
      description: 'Restarting interrupts running tasks. Newly installed or updated plugins take effect after the restart.',
      cancel: 'Cancel',
      confirm: 'Restart now',
      restarting: 'Restarting…',
      failed: 'Could not request a restart: ',
    }

    const CSS = `
.dsh-restart-button{display:flex;align-items:center;gap:8px;box-sizing:border-box;flex:1 1 auto;min-width:0;max-width:100%;height:32px;margin:0;padding:0 12px;border:0;border-radius:10px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:14px;line-height:20px;text-align:left;cursor:pointer}
.dsh-restart-button:hover{background:color-mix(in srgb,var(--dsw-alias-label-primary) 8%,transparent)}
.dsh-restart-button:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}
.dsh-restart-button[data-collapsed=true]{justify-content:center;flex:none;width:36px;height:36px;padding:0}
.dsh-restart-button[data-collapsed=true] .dsh-restart-label{display:none}
.dsh-restart-icon{display:block;flex:none;width:16px;height:16px}
.dsh-restart-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
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

    function RestartIcon() {
      return h('svg', {
        className: 'dsh-restart-icon',
        viewBox: '0 0 16 16',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.6,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': true,
      }, [
        h('path', { key: 'arc', d: 'M13.1 6.2A5.5 5.5 0 1 0 13.5 9.4' }),
        h('path', { key: 'head', d: 'M13.4 2.9v3.4H10' }),
      ])
    }

    function RestartButton(props) {
      const { wide, t } = props
      const [open, setOpen] = React.useState(false)
      const [phase, setPhase] = React.useState('idle')
      const [error, setError] = React.useState(null)
      const cancelRef = React.useRef(null)

      React.useEffect(() => {
        if (!open) return
        const onKey = (event) => {
          if (event.key !== 'Escape') return
          if (phase === 'restarting') return
          event.preventDefault()
          setOpen(false)
        }
        window.addEventListener('keydown', onKey, true)
        const focusTimer = window.setTimeout(() => cancelRef.current?.focus(), 0)
        return () => {
          window.removeEventListener('keydown', onKey, true)
          window.clearTimeout(focusTimer)
        }
      }, [open, phase])

      React.useEffect(() => {
        if (open) return
        setPhase('idle')
        setError(null)
      }, [open])

      const confirm = async () => {
        if (phase === 'restarting') return
        setError(null)
        setPhase('restarting')
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
          setPhase('idle')
          setError(t('failed') + (reason instanceof Error ? reason.message : String(reason)))
        }
      }

      const button = h('button', {
        type: 'button',
        className: 'dsh-restart-button',
        'data-collapsed': !wide,
        'aria-label': t('button'),
        'aria-haspopup': 'dialog',
        'aria-expanded': open,
        title: t('button'),
        onClick: () => setOpen(true),
      }, h(RestartIcon), wide ? h('span', { className: 'dsh-restart-label' }, t('button')) : null)

      const dialog = open && typeof document !== 'undefined' ? ReactDOM.createPortal(
        h('div', {
          className: 'dsh-restart-overlay',
          onMouseDown: (event) => {
            if (event.target !== event.currentTarget || phase === 'restarting') return
            event.preventDefault()
            setOpen(false)
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
              onClick: () => setOpen(false),
            }, t('cancel')),
            h('button', {
              key: 'confirm',
              type: 'button',
              className: 'dsh-restart-confirm',
              disabled: phase === 'restarting',
              onClick: confirm,
            }, phase === 'restarting' ? t('restarting') : t('confirm')),
          ]),
        ]))
      , document.body) : null

      return h(React.Fragment, null, [
        h('style', { key: 'style' }, CSS),
        h(React.Fragment, { key: 'button' }, button),
        h(React.Fragment, { key: 'dialog' }, dialog),
      ])
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register('dsh-restart', { zh, en }), 'dsh-restart: dictionaries')
        ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
          name: 'sidebar.footer.action',
          id: 'dsh-restart',
          order: 0,
          locale: 'dsh-restart',
        }, RestartButton))
      },
    }
  },
})
