/**
 * FORK PATCH (yian / Wechatsync fork) — 可拖动 / 贴边半隐藏悬浮同步按钮。
 * 勿随上游整文件覆盖删除本文件；升级后确认 extractor / weixin 仍从此处 import createSyncFab。
 *
 * 行为：
 * 1. 页面内自由拖动，位置写入 chrome.storage.local
 * 2. 右上角关闭 → 半隐藏依附浏览器右侧（只露出半圆）
 * 3. 贴边时鼠标悬停展开完整按钮；点击则固定为普通浮层位置
 * 4. 短按：预览/原 onClick；长按 3 秒：进度条 → onLongPress（松开则取消）
 */

export interface FabOptions {
  onClick: () => void
  /** 长按满 3 秒触发（直接打开同步弹窗）；中途松开取消 */
  onLongPress?: () => void
  /** 按钮默认 bottom 偏移，默认 88px（仅首次无存储位置时） */
  bottom?: string
}

const STORAGE_KEY = 'floatingFabState'
const DRAG_THRESHOLD = 6
const FAB_HEIGHT = 40
const FAB_MIN_WIDTH = 88
const LONG_PRESS_MS = 3000

type FabState = {
  left: number
  top: number
  docked: boolean
}

const PULSE_KEYFRAMES = `
  @keyframes wcs-pulse {
    0%, 100% { box-shadow: 0 4px 12px rgba(7,193,96,0.35); }
    50% { box-shadow: 0 4px 20px rgba(7,193,96,0.6), 0 0 0 8px rgba(7,193,96,0.1); }
  }
`

function defaultState(bottomOffset: string): FabState {
  const bottomPx = parseInt(bottomOffset, 10) || 88
  const top = Math.max(16, window.innerHeight - bottomPx - FAB_HEIGHT)
  const left = Math.max(16, window.innerWidth - 24 - FAB_MIN_WIDTH)
  return { left, top, docked: false }
}

function clampPosition(left: number, top: number, width: number): { left: number; top: number } {
  const maxLeft = Math.max(0, window.innerWidth - width)
  const maxTop = Math.max(0, window.innerHeight - FAB_HEIGHT)
  return {
    left: Math.min(Math.max(0, left), maxLeft),
    top: Math.min(Math.max(0, top), maxTop),
  }
}

function loadState(): Promise<FabState | null> {
  return new Promise(resolve => {
    try {
      chrome.storage.local.get(STORAGE_KEY, result => {
        const s = result[STORAGE_KEY] as FabState | undefined
        if (s && typeof s.left === 'number' && typeof s.top === 'number') {
          resolve({ left: s.left, top: s.top, docked: !!s.docked })
        } else {
          resolve(null)
        }
      })
    } catch {
      resolve(null)
    }
  })
}

function saveState(state: FabState) {
  try {
    chrome.storage.local.set({ [STORAGE_KEY]: state }).catch(() => {})
  } catch {
    // ignore
  }
}

/**
 * 创建可拖动 / 可贴边半隐藏的悬浮同步按钮（API 与官方 createSyncFab 对齐）。
 */
export function createSyncFab(options: FabOptions): HTMLElement {
  const { onClick, onLongPress, bottom = '88px' } = options

  const wrap = document.createElement('div')
  wrap.id = 'wechatsync-fab'
  wrap.setAttribute('data-wechatsync-ui', '')
  wrap.setAttribute('data-wechatsync-fab', '')
  wrap.title = '同步文章'

  const btn = document.createElement('div')
  btn.className = 'wcs-fab-body'
  btn.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="white" style="flex-shrink:0">
      <path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/>
    </svg>
    <span class="wcs-fab-label" style="color:white;font-size:14px;font-weight:500;">同步</span>
  `

  const progressTrack = document.createElement('div')
  progressTrack.className = 'wcs-fab-progress'
  const progressFill = document.createElement('div')
  progressFill.className = 'wcs-fab-progress-fill'
  progressTrack.appendChild(progressFill)
  btn.appendChild(progressTrack)

  const closeBtn = document.createElement('button')
  closeBtn.type = 'button'
  closeBtn.setAttribute('aria-label', '收起至右侧')
  closeBtn.title = '收起至右侧'
  closeBtn.textContent = '×'

  const tooltip = document.createElement('div')
  tooltip.className = 'wcs-fab-tip'
  tooltip.textContent = onLongPress
    ? '短按预览 · 长按3秒同步 · 拖动可移动'
    : '拖动可移动 · 点击同步 · 关闭收起右侧'

  btn.appendChild(closeBtn)
  btn.appendChild(tooltip)
  wrap.appendChild(btn)

  const style = document.createElement('style')
  style.textContent = `
    ${PULSE_KEYFRAMES}
    [data-wechatsync-fab] {
      position: fixed !important;
      z-index: 2147483646 !important;
    }
    [data-wechatsync-fab] .wcs-fab-body {
      position: relative !important;
      height: ${FAB_HEIGHT}px !important;
      padding: 0 16px !important;
      padding-right: 28px !important;
      border-radius: 20px !important;
      background: linear-gradient(135deg, #07c160 0%, #06ad56 100%) !important;
      box-shadow: 0 4px 12px rgba(7, 193, 96, 0.35) !important;
      cursor: grab !important;
      display: flex !important;
      align-items: center !important;
      gap: 6px !important;
      transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.25s, border-radius 0.2s !important;
      user-select: none !important;
      color: white !important;
      font-size: 14px !important;
      font-weight: 500 !important;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
      border: none !important;
      white-space: nowrap !important;
      overflow: visible !important;
    }
    [data-wechatsync-fab] .wcs-fab-progress {
      position: absolute !important;
      left: 4px !important;
      right: 4px !important;
      bottom: 4px !important;
      height: 4px !important;
      background: rgba(0,0,0,0.22) !important;
      opacity: 0 !important;
      pointer-events: none !important;
      overflow: hidden !important;
      border-radius: 2px !important;
      z-index: 5 !important;
    }
    [data-wechatsync-fab].wcs-longpressing .wcs-fab-progress {
      opacity: 1 !important;
    }
    [data-wechatsync-fab] .wcs-fab-progress-fill {
      height: 100% !important;
      width: 100% !important;
      transform-origin: left center !important;
      transform: scaleX(0) !important;
      background: #ffffff !important;
      border-radius: 2px !important;
      will-change: transform !important;
    }
    [data-wechatsync-fab] button {
      position: absolute !important;
      top: -6px !important;
      right: -6px !important;
      width: 18px !important;
      height: 18px !important;
      border-radius: 50% !important;
      border: none !important;
      background: rgba(0,0,0,0.5) !important;
      color: white !important;
      font-size: 14px !important;
      line-height: 1 !important;
      padding: 0 !important;
      cursor: pointer !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      z-index: 2 !important;
      opacity: 0 !important;
      transition: opacity 0.15s !important;
    }
    [data-wechatsync-fab]:hover button { opacity: 1 !important; }
    [data-wechatsync-fab].wcs-docked-collapsed button,
    [data-wechatsync-fab].wcs-longpressing button { display: none !important; }
    [data-wechatsync-fab] .wcs-fab-tip {
      position: absolute !important;
      right: 100% !important;
      top: 50% !important;
      transform: translateY(-50%) !important;
      margin-right: 10px !important;
      padding: 6px 12px !important;
      background: rgba(0,0,0,0.75) !important;
      color: white !important;
      font-size: 12px !important;
      border-radius: 6px !important;
      white-space: nowrap !important;
      pointer-events: none !important;
      opacity: 0 !important;
      transition: opacity 0.2s !important;
      z-index: 3 !important;
    }
    [data-wechatsync-fab].wcs-floating:hover .wcs-fab-tip { opacity: 1 !important; }
    [data-wechatsync-fab].wcs-longpressing .wcs-fab-tip { opacity: 0 !important; }
    [data-wechatsync-fab].wcs-floating:hover .wcs-fab-body {
      transform: scale(1.05) !important;
      box-shadow: 0 6px 20px rgba(7, 193, 96, 0.45) !important;
    }
    [data-wechatsync-fab].wcs-docked-collapsed .wcs-fab-body {
      border-radius: 20px 0 0 20px !important;
      box-shadow: 0 2px 8px rgba(7, 193, 96, 0.4) !important;
      cursor: pointer !important;
    }
    [data-wechatsync-fab].wcs-dragging {
      transition: none !important;
    }
    [data-wechatsync-fab].wcs-dragging .wcs-fab-body {
      cursor: grabbing !important;
      transition: none !important;
    }
    [data-wechatsync-fab].wcs-longpressing .wcs-fab-body {
      cursor: pointer !important;
      transform: scale(1.02) !important;
      box-shadow: 0 6px 20px rgba(7, 193, 96, 0.55) !important;
    }
  `
  document.head.appendChild(style)

  let state = defaultState(bottom)
  let expandedFromDock = false
  let dragging = false
  let moved = false
  let startX = 0
  let startY = 0
  let originLeft = 0
  let originTop = 0

  let longPressRaf = 0
  let longPressStart = 0
  let longPressFired = false
  let longPressing = false

  function measureWidth(): number {
    return btn.getBoundingClientRect().width || FAB_MIN_WIDTH
  }

  function setProgress(ratio: number) {
    const pct = Math.max(0, Math.min(1, ratio))
    // 必须用 setProperty + important：样式表里有 transform !important
    progressFill.style.setProperty('transform', `scaleX(${pct})`, 'important')
  }

  function stopLongPress(resetBar = true) {
    if (longPressRaf) {
      cancelAnimationFrame(longPressRaf)
      longPressRaf = 0
    }
    longPressing = false
    wrap.classList.remove('wcs-longpressing')
    if (resetBar) setProgress(0)
  }

  function startLongPress() {
    if (!onLongPress || state.docked) return
    longPressing = true
    longPressFired = false
    longPressStart = performance.now()
    wrap.classList.add('wcs-longpressing')
    setProgress(0)

    const tick = (now: number) => {
      if (!longPressing) return
      const elapsed = now - longPressStart
      const ratio = elapsed / LONG_PRESS_MS
      setProgress(ratio)
      if (ratio >= 1) {
        longPressFired = true
        longPressing = false
        wrap.classList.remove('wcs-longpressing')
        setProgress(1)
        try {
          onLongPress()
        } finally {
          setTimeout(() => setProgress(0), 200)
        }
        return
      }
      longPressRaf = requestAnimationFrame(tick)
    }
    longPressRaf = requestAnimationFrame(tick)
  }

  function applyLayout() {
    const width = measureWidth()
    const clamped = clampPosition(state.left, state.top, Math.min(width, FAB_MIN_WIDTH))
    state.left = clamped.left
    state.top = clamped.top

    wrap.classList.remove('wcs-floating', 'wcs-docked-collapsed', 'wcs-docked-expanded', 'wcs-dragging')
    if (dragging) wrap.classList.add('wcs-dragging')
    if (longPressing) wrap.classList.add('wcs-longpressing')

    if (state.docked && !expandedFromDock) {
      wrap.classList.add('wcs-docked-collapsed')
      const peek = FAB_HEIGHT / 2 + 2
      wrap.style.setProperty('left', 'auto', 'important')
      wrap.style.setProperty('right', `-${Math.max(8, width - peek)}px`, 'important')
      wrap.style.setProperty('top', `${state.top}px`, 'important')
      wrap.style.setProperty('bottom', 'auto', 'important')
      wrap.title = '悬停展开 · 点击固定'
    } else if (state.docked && expandedFromDock) {
      wrap.classList.add('wcs-docked-expanded')
      wrap.style.setProperty('left', 'auto', 'important')
      wrap.style.setProperty('right', '8px', 'important')
      wrap.style.setProperty('top', `${state.top}px`, 'important')
      wrap.style.setProperty('bottom', 'auto', 'important')
      wrap.title = '点击固定位置 · 可拖走'
    } else {
      wrap.classList.add('wcs-floating')
      wrap.style.setProperty('left', `${state.left}px`, 'important')
      wrap.style.setProperty('top', `${state.top}px`, 'important')
      wrap.style.setProperty('right', 'auto', 'important')
      wrap.style.setProperty('bottom', 'auto', 'important')
      wrap.title = onLongPress ? '短按预览 · 长按3秒同步' : '同步文章'
    }
  }

  function persist() {
    saveState({ left: state.left, top: state.top, docked: state.docked })
  }

  function dockToRight() {
    stopLongPress()
    state.docked = true
    expandedFromDock = false
    const width = measureWidth()
    state.left = Math.max(0, window.innerWidth - width)
    applyLayout()
    persist()
  }

  function undockAndFix() {
    state.docked = false
    expandedFromDock = false
    const width = measureWidth()
    state.left = Math.max(0, window.innerWidth - width - 8)
    applyLayout()
    persist()
  }

  loadState().then(saved => {
    if (saved) state = saved
    applyLayout()
    wrap.style.animation = 'wcs-pulse 1.2s ease-in-out 3'
  })

  wrap.addEventListener('mouseenter', () => {
    if (state.docked && !dragging) {
      expandedFromDock = true
      applyLayout()
    }
  })

  wrap.addEventListener('mouseleave', () => {
    if (state.docked && !dragging) {
      expandedFromDock = false
      applyLayout()
    }
  })

  closeBtn.addEventListener('pointerdown', e => {
    e.stopPropagation()
    e.preventDefault()
  })
  closeBtn.addEventListener('click', e => {
    e.stopPropagation()
    e.preventDefault()
    dockToRight()
  })

  wrap.addEventListener('pointerdown', e => {
    if (e.button !== 0) return
    if ((e.target as HTMLElement).closest('button')) return

    dragging = true
    moved = false
    longPressFired = false
    startX = e.clientX
    startY = e.clientY

    const rect = wrap.getBoundingClientRect()
    originLeft = rect.left
    originTop = rect.top
    state.left = originLeft
    state.top = originTop

    wrap.setPointerCapture(e.pointerId)
    startLongPress()
    applyLayout()
  })

  wrap.addEventListener('pointermove', e => {
    if (!dragging) return
    const dx = e.clientX - startX
    const dy = e.clientY - startY
    if (!moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return
    moved = true
    stopLongPress()

    if (state.docked) {
      state.docked = false
      expandedFromDock = false
    }

    const width = measureWidth()
    const next = clampPosition(originLeft + dx, originTop + dy, width)
    state.left = next.left
    state.top = next.top
    applyLayout()
  })

  wrap.addEventListener('pointerup', e => {
    if (!dragging) return
    dragging = false
    try {
      wrap.releasePointerCapture(e.pointerId)
    } catch {
      // ignore
    }

    const wasLongPress = longPressFired
    if (!wasLongPress) stopLongPress()

    if (moved) {
      const width = measureWidth()
      if (state.left + width > window.innerWidth - 28) {
        dockToRight()
      } else {
        persist()
        applyLayout()
      }
      return
    }

    applyLayout()

    if (state.docked) {
      undockAndFix()
      return
    }

    if (wasLongPress) return

    onClick()
  })

  wrap.addEventListener('pointercancel', () => {
    dragging = false
    moved = false
    stopLongPress()
    applyLayout()
  })

  window.addEventListener('resize', () => {
    applyLayout()
  })

  applyLayout()
  return wrap
}
