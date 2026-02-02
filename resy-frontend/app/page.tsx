"use client"

import { useState, useEffect } from "react"
import { Background } from "@/components/shared/Background"
import { MainCard } from "@/components/shared/MainCard"
import { MainHeader } from "@/components/shared/MainHeader"
import { SearchPage } from "@/components/search/SearchPage"
import { BookingPage } from "@/components/booking/BookingPage"
import type { VenueSearchResult } from "@/components/search/VenueSearchInput"

type PageMode = "form" | "how-it-works" | "about-us"

function BookingPageWrapper({
  selectedVenue,
  taskId,
  theme,
  mounted,
  onToggleTheme,
  onBack,
}: {
  selectedVenue: {
    venueId: string
    venueName: string
    resyUrl?: string
  }
  taskId: string
  theme: "light" | "dark"
  mounted: boolean
  onToggleTheme: () => void
  onBack: () => void
}) {
  const [pageMode, setPageMode] = useState<PageMode>("form")

  return (
    <>
      <MainHeader
        theme={theme}
        mounted={mounted}
        onToggleTheme={onToggleTheme}
        pageMode={pageMode}
        onPageModeChange={setPageMode}
      />
      <BookingPage
        selectedVenue={selectedVenue}
        taskId={taskId}
        onBack={onBack}
        onPageModeChange={setPageMode}
      />
    </>
  )
}

type Theme = "light" | "dark"
type ViewMode = "search" | "booking"

export default function GetResydPage() {
  const [theme, setTheme] = useState<Theme>("light")
  const [mounted, setMounted] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>("search")
  const [taskId, setTaskId] = useState<string>("")
  const [selectedVenue, setSelectedVenue] = useState<{
    venueId: string
    venueName: string
    resyUrl?: string
  } | null>(null)

  // Initialize after mount to avoid hydration mismatches
  useEffect(() => {
    setMounted(true)
    setTaskId(`task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`)
    
    // Default to LIGHT on first load. Only use dark if the user explicitly saved it.
    const savedTheme = localStorage.getItem('theme') as Theme | null
    
    let initialTheme: Theme = 'light'
    if (savedTheme === 'dark') initialTheme = 'dark'
    
    setTheme(initialTheme)
    document.documentElement.classList.toggle("dark", initialTheme === "dark")
  }, [])

  const toggleTheme = () => {
    if (!mounted) return
    const newTheme = theme === "light" ? "dark" : "light"
    setTheme(newTheme)
    localStorage.setItem("theme", newTheme)
    document.documentElement.classList.toggle("dark", newTheme === "dark")
  }

  const handleVenueSelect = (venue: VenueSearchResult) => {
    setSelectedVenue({
      venueId: venue.venue_id.toString(),
      venueName: venue.name,
    })
    setViewMode("booking")
  }

  const handleUrlSelect = (url: string) => {
    setSelectedVenue({
      venueId: "", // Will be fetched from URL
      venueName: "",
      resyUrl: url,
    })
    setViewMode("booking")
  }

  const handleBackToSearch = () => {
    setViewMode("search")
    setSelectedVenue(null)
  }

  if (!taskId) {
    return null // Wait for taskId to be initialized
  }

  return (
    <>
      <Background theme={theme} />
      <div className="min-h-screen flex flex-col items-center justify-center p-3 gap-3">
        <MainCard>
          {viewMode === "search" ? (
            <>
              <MainHeader
                theme={theme}
                mounted={mounted}
                onToggleTheme={toggleTheme}
              />
              <SearchPage
                onSelectVenue={handleVenueSelect}
                onUseUrl={handleUrlSelect}
                taskId={taskId}
              />
            </>
          ) : selectedVenue ? (
            <BookingPageWrapper
              selectedVenue={selectedVenue}
              taskId={taskId}
              theme={theme}
              mounted={mounted}
              onToggleTheme={toggleTheme}
              onBack={handleBackToSearch}
            />
          ) : null}
        </MainCard>

        <div className="shrink-0">
          <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
            <span className="text-blue-600 font-medium">Get Resyd</span>
            <span className="text-muted-foreground/40">•</span>
            <span>Automated Resy Booking</span>
          </div>
        </div>
      </div>
    </>
  )
}
