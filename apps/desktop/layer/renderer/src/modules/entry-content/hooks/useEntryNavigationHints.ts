import { useScrollViewElement } from "@follow/components/ui/scroll-area/hooks.js"
import { throttle } from "es-toolkit"
import { useEffect, useRef, useState } from "react"
import { useEventCallback } from "usehooks-ts"

interface UseEntryNavigationHintsOptions {
  /** Whether hints are enabled */
  enabled: boolean
  /** Entry ID to track changes */
  entryId?: string
  /** Scroll threshold to show hint (default: 100px) */
  scrollThreshold?: number
}

interface UseEntryNavigationHintsReturn {
  /** Show hint for first entry */
  showFirstEntryHint: boolean
  /** Show hint when scrolled past threshold */
  showScrollHint: boolean
  /** Show hint when at bottom */
  showBottomHint: boolean
}

/**
 * Custom hook for managing entry navigation hints
 * Shows contextual hints based on scroll position and entry state
 */
export const useEntryNavigationHints = ({
  enabled,
  entryId,
  scrollThreshold = 100,
}: UseEntryNavigationHintsOptions): UseEntryNavigationHintsReturn => {
  const $scrollElement = useScrollViewElement()

  // State for different hint types
  const [showFirstEntryHint, setShowFirstEntryHint] = useState(false)
  const [showScrollHint, setShowScrollHint] = useState(false)
  const [showBottomHint, setShowBottomHint] = useState(false)

  // Refs to track state
  const hasShownFirstHintRef = useRef(false)
  const hasShownScrollHintRef = useRef(false)
  const hasShownBottomHintRef = useRef(false)
  const currentEntryIdRef = useRef<string>(void 0)
  const firstHintTimerRef = useRef<ReturnType<typeof setTimeout>>(void 0)
  const scrollHintTimerRef = useRef<ReturnType<typeof setTimeout>>(void 0)
  const bottomHintTimerRef = useRef<ReturnType<typeof setTimeout>>(void 0)

  // Reset hints when entry changes
  useEffect(() => {
    if (entryId && entryId !== currentEntryIdRef.current) {
      currentEntryIdRef.current = entryId
      hasShownFirstHintRef.current = false
      hasShownScrollHintRef.current = false
      hasShownBottomHintRef.current = false

      // Clear existing timers
      if (firstHintTimerRef.current) clearTimeout(firstHintTimerRef.current)
      if (scrollHintTimerRef.current) clearTimeout(scrollHintTimerRef.current)
      if (bottomHintTimerRef.current) clearTimeout(bottomHintTimerRef.current)

      // Reset all hint states
      setShowFirstEntryHint(false)
      setShowScrollHint(false)
      setShowBottomHint(false)

      if (enabled) {
        // Show first entry hint after a brief delay
        firstHintTimerRef.current = setTimeout(() => {
          if (!hasShownFirstHintRef.current) {
            setShowFirstEntryHint(true)
            hasShownFirstHintRef.current = true

            // Hide after 3 seconds
            firstHintTimerRef.current = setTimeout(() => {
              setShowFirstEntryHint(false)
            }, 3000)
          }
        }, 500) // Small delay to allow content to load
      }
    }
  }, [entryId, enabled])

  // Scroll handler to manage hints based on scroll position
  const handleScroll = useEventCallback(
    throttle(() => {
      if (!enabled || !$scrollElement) return

      const { scrollTop } = $scrollElement
      const { scrollHeight } = $scrollElement
      const { clientHeight } = $scrollElement
      const scrollBottom = scrollHeight - clientHeight - scrollTop

      // Check if scrolled past threshold
      if (scrollTop > scrollThreshold && !hasShownScrollHintRef.current) {
        hasShownScrollHintRef.current = true
        setShowScrollHint(true)

        // Clear previous timer
        if (scrollHintTimerRef.current) clearTimeout(scrollHintTimerRef.current)

        // Hide after 3 seconds
        scrollHintTimerRef.current = setTimeout(() => {
          setShowScrollHint(false)
        }, 3000)
      }

      // Check if at bottom (within 50px threshold)
      if (scrollBottom <= 50 && !hasShownBottomHintRef.current) {
        hasShownBottomHintRef.current = true
        setShowBottomHint(true)

        // Clear previous timer
        if (bottomHintTimerRef.current) clearTimeout(bottomHintTimerRef.current)

        // Hide after 3 seconds
        bottomHintTimerRef.current = setTimeout(() => {
          setShowBottomHint(false)
          hasShownBottomHintRef.current = false
        }, 3000)
      }
    }, 100),
  )

  // Attach scroll listener
  useEffect(() => {
    if (!enabled || !$scrollElement) return

    $scrollElement.addEventListener("scroll", handleScroll, { passive: true })

    return () => {
      $scrollElement.removeEventListener("scroll", handleScroll)
    }
  }, [enabled, $scrollElement, handleScroll])

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (firstHintTimerRef.current) clearTimeout(firstHintTimerRef.current)
      if (scrollHintTimerRef.current) clearTimeout(scrollHintTimerRef.current)
      if (bottomHintTimerRef.current) clearTimeout(bottomHintTimerRef.current)
    }
  }, [])

  return {
    showFirstEntryHint,
    showScrollHint,
    showBottomHint,
  }
}
