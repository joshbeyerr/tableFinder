"use client"

import { useState, useEffect, useCallback } from "react"
import { cn } from "@/lib/utils"

interface TypewriterProps {
  text: string
  speed?: number
  className?: string
  showCursor?: boolean
  onComplete?: () => void
  hackerStyle?: boolean
  repeat?: boolean
  repeatDelay?: number
}

export function Typewriter({ 
  text, 
  speed = 80, 
  className,
  showCursor = true,
  onComplete,
  hackerStyle = true,
  repeat = false,
  repeatDelay = 7500
}: TypewriterProps) {
  const [displayedText, setDisplayedText] = useState("")
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isComplete, setIsComplete] = useState(false)

  // Reset animation
  const resetAnimation = useCallback(() => {
    setDisplayedText("")
    setCurrentIndex(0)
    setIsComplete(false)
  }, [])

  // Handle typing animation
  useEffect(() => {
    if (currentIndex < text.length) {
      // Add slight randomness to speed for more authentic hacker feel
      const randomSpeed = hackerStyle 
        ? speed + Math.random() * 30 - 15 
        : speed
      
      const timeout = setTimeout(() => {
        setDisplayedText(text.slice(0, currentIndex + 1))
        setCurrentIndex(currentIndex + 1)
      }, Math.max(50, randomSpeed))

      return () => clearTimeout(timeout)
    } else if (!isComplete) {
      setIsComplete(true)
      onComplete?.()
    }
  }, [currentIndex, text, speed, isComplete, onComplete, hackerStyle])

  // Handle repeat logic
  useEffect(() => {
    if (isComplete && repeat) {
      const repeatTimeout = setTimeout(() => {
        resetAnimation()
      }, repeatDelay)
      
      return () => clearTimeout(repeatTimeout)
    }
  }, [isComplete, repeat, repeatDelay, resetAnimation])

  return (
    <span className={cn("inline-block", className)}>
      <span 
        className={cn(
          "font-mono",
          hackerStyle && "text-blue-600 drop-shadow-[0_0_8px_rgba(59,130,246,0.5)]"
        )}
        style={{
          opacity: displayedText.length > 0 ? 1 : 0,
          transition: "opacity 0.1s ease-in"
        }}
      >
        {displayedText}
      </span>
      {showCursor && (
        <span 
          className={cn(
            "inline-block w-0.5 h-4 ml-0.5 bg-blue-600",
            isComplete 
              ? "animate-pulse opacity-50" 
              : "animate-blink"
          )}
          style={{
            boxShadow: "0 0 4px rgba(59, 130, 246, 0.8)"
          }}
        />
      )}
    </span>
  )
}

