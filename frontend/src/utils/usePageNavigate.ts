import { useCallback } from 'react'
import { flushSync } from 'react-dom'
import { useNavigate, type NavigateOptions, type To } from 'react-router-dom'
import { prefersStillness } from './useSpring'

/** Which way the new page slides in: deeper pages come from the right, going back from the left. */
export type PageDirection = 'forward' | 'back'

type PageNavigateOptions = NavigateOptions & { direction?: PageDirection }

/** The element of the page on screen: the routed page inside the app shell, or a full-screen page. */
function currentPage(): Element | null {
  return document.querySelector('.app-main > *') ?? document.querySelector('#root > *')
}

/**
 * Router updates run as React transitions, and a page opened for the first time also suspends, so
 * the new page can land a moment after navigate(). Wait for it, so the transition's new snapshot is
 * the new page and not the old one or an empty frame. Frames are paused during this step, so this
 * listens to DOM changes instead of animation frames, and gives up after 400 ms.
 */
function newPageShown(previous: Element | null): Promise<void> {
  const shown = () => currentPage() !== previous && !document.querySelector('[data-page-loading]')
  if (shown()) return Promise.resolve()
  return new Promise((done) => {
    const observer = new MutationObserver(() => { if (shown()) finish() })
    const timer = window.setTimeout(finish, 400)
    function finish() { observer.disconnect(); window.clearTimeout(timer); done() }
    observer.observe(document.getElementById('root') ?? document.body, { childList: true, subtree: true })
  })
}

/** Drop-in for useNavigate that slides between pages with a View Transition where the browser has one. */
export function usePageNavigate() {
  const navigate = useNavigate()
  // Stable like useNavigate's function, so effects that list it as a dependency don't rerun.
  return useCallback((to: To | number, options: PageNavigateOptions = {}) => {
    const { direction = typeof to === 'number' && to < 0 ? 'back' : 'forward', ...navigateOptions } = options
    const go = () => (typeof to === 'number' ? navigate(to) : navigate(to, navigateOptions))
    // Same page (e.g. clearing router state): nothing to slide.
    const samePage = typeof to === 'string' && to.split(/[?#]/)[0] === window.location.pathname
    if (samePage || !document.startViewTransition || prefersStillness()) {
      void go()
      return
    }
    document.documentElement.dataset.pageDirection = direction
    const previous = currentPage()
    document.startViewTransition(async () => {
      flushSync(() => { void go() })
      await newPageShown(previous)
    })
  }, [navigate])
}
