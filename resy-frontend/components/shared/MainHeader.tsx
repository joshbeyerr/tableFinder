"use client"

import { Button } from "@/components/ui/button"
import { Moon, Sun } from "lucide-react"
import { Typewriter } from "@/components/typewriter"

interface MainHeaderProps {
  theme: "light" | "dark"
  mounted: boolean
  onToggleTheme: () => void
  pageMode?: "form" | "how-it-works" | "about-us"
  onPageModeChange?: (mode: "form" | "how-it-works" | "about-us") => void
}

export function MainHeader({ 
  theme, 
  mounted, 
  onToggleTheme,
  pageMode,
  onPageModeChange 
}: MainHeaderProps) {
  return (
    <div className="border-b border-blue-600 px-4 py-2.5 flex items-center justify-between shrink-0 bg-white dark:bg-black">
      <div>
        <h1 className="text-lg font-semibold text-blue-600">
          <Typewriter text="Get Resyd" speed={80} hackerStyle={true} repeat={true} repeatDelay={15000} />
        </h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Automated Resy Reservation Booking
        </p>
      </div>
      <div className="flex gap-1.5">
        <Button
          variant="outline"
          size="icon"
          onClick={onToggleTheme}
          className="h-8 w-8 bg-transparent border-blue-600"
          title={mounted && theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
          disabled={!mounted}
        >
          {mounted && theme === "light" ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5" />}
          <span className="sr-only">Toggle theme</span>
        </Button>
        {pageMode && onPageModeChange && (
          <div className="relative inline-flex h-8 bg-muted border-2 border-blue-600 shadow-sm">
            <div
              className="absolute top-0 h-full bg-blue-600 shadow-sm transition-all duration-300 ease-out"
              style={{
                left: pageMode === "form" ? "0" : pageMode === "how-it-works" ? "33.33%" : "66.66%",
                width: "33.33%",
              }}
            />
            <button
              onClick={() => onPageModeChange("form")}
              className={`relative z-10 w-28 flex items-center justify-center text-sm font-medium transition-colors duration-300 ${
                pageMode === "form" ? "text-white" : "text-foreground hover:text-blue-600"
              }`}
            >
              Form / Tasks
            </button>
            <button
              onClick={() => onPageModeChange("how-it-works")}
              className={`relative z-10 w-28 flex items-center justify-center text-sm font-medium transition-colors duration-300 ${
                pageMode === "how-it-works" ? "text-white" : "text-foreground hover:text-blue-600"
              }`}
            >
              How It Works
            </button>
            <button
              onClick={() => onPageModeChange("about-us")}
              className={`relative z-10 w-28 flex items-center justify-center text-sm font-medium transition-colors duration-300 ${
                pageMode === "about-us" ? "text-white" : "text-foreground hover:text-blue-600"
              }`}
            >
              About Us
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

