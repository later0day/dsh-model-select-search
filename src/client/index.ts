/**
 * dsh-model-select-search — client-side entry.
 *
 * Enhances the model selector dropdown (ModelSelect in ui-model-selection)
 * with three features:
 *
 * 1. **Provider groups default-collapsed** — only group titles are visible;
 *    click a title to expand/collapse.
 * 2. **Search box** — injected at the top of the model list; filters models
 *    by id or name in real time.
 * 3. **Auto-expand + highlight** — groups with matching models auto-expand;
 *    matching text is highlighted.
 *
 * All DOM manipulation is idempotent and survives React re-renders by
 * re-applying on every MutationObserver-triggered change.
 */

/** Injected CSS — theme-agnostic: uses `color: inherit` + `rgba()` borders. */
const STYLES = `
[data-dsh-mss-search] {
  position: sticky;
  top: 0;
  z-index: 2;
  padding: 4px 4px 6px 4px;
  background: inherit;
}
[data-dsh-mss-search] input {
  box-sizing: border-box;
  width: 100%;
  padding: 5px 8px;
  border: 1px solid rgba(128, 128, 128, 0.2);
  border-radius: 10px;
  background: rgba(128, 128, 128, 0.06);
  color: inherit;
  font-size: 13px;
  line-height: 1.4;
  outline: none;
}
[data-dsh-mss-search] input:focus {
  border-color: rgba(108, 140, 255, 0.5);
  background: rgba(128, 128, 128, 0.04);
}
[data-dsh-mss-search] input::placeholder {
  color: rgba(128, 128, 128, 0.45);
}
[data-dsh-mss-group-title] {
  cursor: pointer;
  user-select: none;
}
[data-dsh-mss-collapsed="true"] [role="menuitemradio"] {
  display: none !important;
}
[data-dsh-mss-group-title]::after {
  display: inline-block;
  margin-left: 3px;
  font-size: 9px;
  opacity: 0.4;
  transition: transform 0.15s ease;
}
[data-dsh-mss-collapsed="true"] [data-dsh-mss-group-title]::after {
  content: '▸';
}
[data-dsh-mss-collapsed="false"] [data-dsh-mss-group-title]::after {
  content: '▾';
}
[data-dsh-mss-highlight] {
  background: rgba(108, 140, 255, 0.15);
  border-radius: 2px;
}
/* Tree indentation: model items indented under group title */
[data-dsh-mss-tree] [role="menuitemradio"] {
  padding-left: 16px !important;
}
[data-dsh-mss-tree] [role="group"] {
  position: relative;
}
`

// ---- CSS injection ----

function injectStyles(): void {
  const tagId = 'dsh-model-select-search/styles'
  if (document.querySelector(`style[data-plugin-css="${tagId}"]`)) return
  const tag = document.createElement('style')
  tag.dataset.plugin = 'dsh-external/dsh-model-select-search'
  tag.dataset.pluginCss = tagId
  tag.textContent = STYLES
  document.head.appendChild(tag)
}

// ---- Search state (survives React re-renders) ----

let currentQuery = ''
let searchInput: HTMLInputElement | null = null

// ---- DOM helpers ----

/** Find the model selector menu (the one with role="group" sections inside). */
function findModelMenu(): HTMLElement | null {
  const menus = document.querySelectorAll<HTMLElement>('[role="menu"]')
  for (const menu of menus) {
    // The model selector menu contains role="group" sections
    if (menu.querySelector('[role="group"]')) return menu
  }
  return null
}

/** Find the scrollable container inside the menu. */
function findScrollable(menu: HTMLElement): HTMLElement | null {
  return menu.querySelector<HTMLElement>('.scrollable')
}

/** Get all groups inside the scrollable container. */
function getGroups(scrollable: HTMLElement): HTMLElement[] {
  return Array.from(scrollable.querySelectorAll<HTMLElement>('[role="group"]'))
}

/** Get the group title element (first div child). */
function getGroupTitle(group: HTMLElement): HTMLElement | null {
  return group.querySelector<HTMLElement>('[class*="groupTitle"]')
    ?? group.firstElementChild as HTMLElement | null
}

/** Get model items in a group. */
function getModelItems(group: HTMLElement): HTMLElement[] {
  return Array.from(group.querySelectorAll<HTMLElement>('[role="menuitemradio"]'))
}

// ---- Group collapse/expand ----

function collapseGroup(group: HTMLElement): void {
  group.setAttribute('data-dsh-mss-collapsed', 'true')
}

function expandGroup(group: HTMLElement): void {
  group.setAttribute('data-dsh-mss-collapsed', 'false')
}

function isCollapsed(group: HTMLElement): boolean {
  return group.getAttribute('data-dsh-mss-collapsed') !== 'false'
}

function toggleGroup(group: HTMLElement): void {
  if (isCollapsed(group)) {
    // Accordion: collapse all other groups first
    const scrollable = group.closest('[data-dsh-mss-tree]')
    if (scrollable) {
      for (const other of getGroups(scrollable as HTMLElement)) {
        if (other !== group) {
          collapseGroup(other)
          other.removeAttribute('data-dsh-mss-user-expanded')
        }
      }
    }
    expandGroup(group)
  } else {
    collapseGroup(group)
  }
  // Sync visibility of items
  const collapsed = isCollapsed(group)
  if (currentQuery === '') {
    for (const item of getModelItems(group)) {
      item.style.display = collapsed ? 'none' : ''
    }
  }
}

// ---- Highlighting ----

/** Clear highlight marks from a model item. */
function clearHighlight(item: HTMLElement): void {
  item.removeAttribute('data-dsh-mss-highlight')
  // Restore original text content
  const original = item.getAttribute('data-dsh-mss-original')
  if (original !== null) {
    const nameSpan = item.querySelector('[class*="modelName"]')
    if (nameSpan) {
      nameSpan.textContent = original
    }
    item.removeAttribute('data-dsh-mss-original')
  }
}

/**
 * Highlight matching text in a model item by wrapping it in <mark>-like spans.
 * Saves the original text so it can be restored on clear.
 */
function highlightMatch(item: HTMLElement, query: string): void {
  if (query === '') {
    clearHighlight(item)
    return
  }

  const nameSpan = item.querySelector<HTMLElement>('[class*="modelName"]')
  if (!nameSpan) return

  // Save original text if not already saved
  if (!item.hasAttribute('data-dsh-mss-original')) {
    item.setAttribute('data-dsh-mss-original', nameSpan.textContent ?? '')
  }

  const original = item.getAttribute('data-dsh-mss-original')!
  const lower = original.toLowerCase()
  const idx = lower.indexOf(query)
  if (idx === -1) {
    // No match — should not happen if called from filter
    nameSpan.textContent = original
    item.removeAttribute('data-dsh-mss-highlight')
    return
  }

  const before = original.slice(0, idx)
  const match = original.slice(idx, idx + query.length)
  const after = original.slice(idx + query.length)

  const mark = document.createElement('mark')
  mark.setAttribute('data-dsh-mss-mark', '')
  mark.textContent = match

  nameSpan.textContent = ''
  nameSpan.appendChild(document.createTextNode(before))
  nameSpan.appendChild(mark)
  nameSpan.appendChild(document.createTextNode(after))

  item.setAttribute('data-dsh-mss-highlight', '')
}

// ---- Search ----

function applySearch(scrollable: HTMLElement): void {
  const query = currentQuery.toLowerCase().trim()
  const groups = getGroups(scrollable)

  for (const group of groups) {
    const items = getModelItems(group)
    let hasMatch = false

    for (const item of items) {
      const text = (item.textContent ?? '').toLowerCase()

      if (query === '') {
        // No query: restore collapse state
        item.style.display = isCollapsed(group) ? 'none' : ''
        clearHighlight(item)
      } else if (text.includes(query)) {
        item.style.display = ''
        hasMatch = true
        highlightMatch(item, query)
      } else {
        item.style.display = 'none'
        clearHighlight(item)
      }
    }

    if (query !== '' && hasMatch) {
      expandGroup(group)
    } else if (query === '') {
      // Restore collapsed state; don't force-collapse groups user expanded
      // (collapseGroup only if not explicitly expanded)
      if (group.getAttribute('data-dsh-mss-user-expanded') !== 'true') {
        collapseGroup(group)
      }
    }
  }
}

// ---- Enhancement ----

let enhanced = false
let menuObserver: MutationObserver | null = null

function enhanceMenu(menu: HTMLElement): void {
  if (enhanced) return

  const scrollable = findScrollable(menu)
  if (!scrollable) return

  // Inject search input
  const searchContainer = document.createElement('div')
  searchContainer.setAttribute('data-dsh-mss-search', '')

  const input = document.createElement('input')
  input.type = 'search'
  input.placeholder = '搜索模型...'
  input.setAttribute('aria-label', '搜索模型')
  input.value = currentQuery

  input.addEventListener('input', () => {
    currentQuery = input.value
    applySearch(scrollable)
  })

  // Prevent the menu from closing when clicking the search input
  input.addEventListener('mousedown', (e) => { e.stopPropagation() })
  input.addEventListener('keydown', (e) => {
    // Prevent arrow keys from bubbling to the menu's keyboard handler
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.stopPropagation()
    }
  })

  searchContainer.appendChild(input)
  scrollable.insertBefore(searchContainer, scrollable.firstChild)
  scrollable.setAttribute('data-dsh-mss-tree', '')
  searchInput = input

  // Enhance each group
  const groups = getGroups(scrollable)
  for (const group of groups) {
    const title = getGroupTitle(group)
    if (title) {
      title.setAttribute('data-dsh-mss-group-title', '')
      title.addEventListener('click', (e) => {
        e.stopPropagation()
        // Mark as user-expanded to prevent search-clear from collapsing
        if (isCollapsed(group)) {
          group.setAttribute('data-dsh-mss-user-expanded', 'true')
        } else {
          group.removeAttribute('data-dsh-mss-user-expanded')
        }
        toggleGroup(group)
      })
    }
    // Default: collapsed
    collapseGroup(group)
  }

  enhanced = true

  // Apply current search state (in case of re-render)
  if (currentQuery !== '') {
    applySearch(scrollable)
  }

  // Watch for React re-renders that replace the menu content
  menuObserver = new MutationObserver(() => {
    const newScrollable = findScrollable(menu)
    if (!newScrollable) {
      // Menu content was replaced (e.g., pane switch)
      enhanced = false
      menuObserver?.disconnect()
      menuObserver = null
      return
    }
    // Check if our search input is still there
    if (!menu.querySelector('[data-dsh-mss-search]')) {
      enhanced = false
      menuObserver?.disconnect()
      menuObserver = null
      // Re-enhance on next tick
      requestAnimationFrame(() => { enhanceMenu(menu) })
    }
  })
  menuObserver.observe(menu, { childList: true, subtree: true })
}

// ---- Bootstrap ----

function scan(): void {
  const menu = findModelMenu()
  if (menu) {
    enhanceMenu(menu)
  }
}

/** Plugin entry point. */
export function apply(): void {
  injectStyles()

  // Watch for the model selector menu to appear/disappear in the DOM
  const observer = new MutationObserver(() => {
    const menu = findModelMenu()
    if (!menu) {
      // Menu was removed — reset so next open re-enhances
      enhanced = false
      menuObserver?.disconnect()
      menuObserver = null
      return
    }
    if (!enhanced) scan()
  })
  observer.observe(document.body, { childList: true, subtree: true })

  // Initial scan (menu might already be open)
  scan()
}

export const inject: string[] = []