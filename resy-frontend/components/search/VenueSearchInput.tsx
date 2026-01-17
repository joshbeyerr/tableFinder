"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Input } from "@/components/ui/input"
import { Loader2, Search } from "lucide-react"
import { getGeoIP, type GeoIPResponse } from "@/lib/resy-api"
import { useToast } from "@/hooks/use-toast"

export interface VenueSearchResult {
  name: string
  cuisine: string | null
  neighborhood: string | null
  region: string | null
  image_url: string | null
  venue_id: number
}

interface VenueSearchInputProps {
  onSelect: (venue: VenueSearchResult) => void
  taskId: string
}

export function VenueSearchInput({ onSelect, taskId }: VenueSearchInputProps) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<VenueSearchResult[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const [geoData, setGeoData] = useState<GeoIPResponse | null>(null)
  const [showDropdown, setShowDropdown] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const { toast } = useToast()
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Load geoip on mount
  useEffect(() => {
    const loadGeoIP = async () => {
      try {
        const data = await getGeoIP()
        setGeoData(data)
      } catch (error: any) {
        console.error("[VenueSearch] Failed to load location:", error)
        toast({
          title: "Location Error",
          description: "Could not determine your location. Search may be limited.",
          variant: "destructive",
        })
      }
    }
    loadGeoIP()
  }, [toast])

  // Debounced search
  const performSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim() || searchQuery.length < 2) {
      setResults([])
      setIsSearching(false)
      return
    }

    if (!geoData) {
      setIsSearching(false)
      return
    }

    setIsSearching(true)
    try {
      const response = await fetch("/api/resy/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-task-id": taskId,
        },
        body: JSON.stringify({
          latitude: geoData.latitude,
          longitude: geoData.longitude,
          query: searchQuery,
          per_page: 5,
        }),
      })

      if (!response.ok) {
        throw new Error("Search failed")
      }

      const data = await response.json()
      setResults(data.results || [])
    } catch (error: any) {
      console.error("[VenueSearch] Search error:", error)
      setResults([])
    } finally {
      setIsSearching(false)
    }
  }, [geoData, taskId])

  // Handle input change with debounce
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }

    if (query.trim().length >= 2) {
      setIsLoading(true)
      debounceTimerRef.current = setTimeout(() => {
        performSearch(query)
        setIsLoading(false)
      }, 300) // 300ms debounce
    } else {
      setResults([])
      setIsLoading(false)
    }

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [query, performSearch])

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (results.length === 0) return

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault()
        setSelectedIndex((prev) => (prev < results.length - 1 ? prev + 1 : prev))
        break
      case "ArrowUp":
        e.preventDefault()
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1))
        break
      case "Enter":
        e.preventDefault()
        if (selectedIndex >= 0 && selectedIndex < results.length) {
          handleSelect(results[selectedIndex])
        }
        break
      case "Escape":
        setShowDropdown(false)
        setSelectedIndex(-1)
        break
    }
  }

  const handleSelect = (venue: VenueSearchResult) => {
    setQuery(venue.name)
    setShowDropdown(false)
    setSelectedIndex(-1)
    onSelect(venue)
  }

  const handleInputFocus = () => {
    if (results.length > 0) {
      setShowDropdown(true)
    }
  }

  const handleInputBlur = (e: React.FocusEvent) => {
    // Delay to allow click on dropdown item
    setTimeout(() => {
      if (!dropdownRef.current?.contains(document.activeElement)) {
        setShowDropdown(false)
        setSelectedIndex(-1)
      }
    }, 200)
  }

  useEffect(() => {
    setShowDropdown(results.length > 0 && query.length >= 2)
  }, [results, query])

  return (
    <div className="relative w-full">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={handleInputFocus}
          onBlur={handleInputBlur}
          onKeyDown={handleKeyDown}
          placeholder="Search for a restaurant..."
          className="pl-10 pr-10 border-blue-600 focus:ring-blue-600"
        />
        {(isLoading || isSearching) && (
          <Loader2 className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground animate-spin" />
        )}
      </div>

      {showDropdown && results.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-900 border-2 border-blue-600 rounded-md shadow-lg max-h-96 overflow-y-auto"
        >
          {results.map((venue, index) => (
            <button
              key={venue.venue_id}
              type="button"
              onClick={() => handleSelect(venue)}
              className={`w-full flex items-center gap-3 p-3 hover:bg-blue-50 dark:hover:bg-blue-950 transition-colors ${
                index === selectedIndex ? "bg-blue-50 dark:bg-blue-950" : ""
              } ${index < results.length - 1 ? "border-b border-gray-200 dark:border-gray-700" : ""}`}
            >
              <div className="flex-shrink-0 w-16 h-16 rounded overflow-hidden bg-gray-200 dark:bg-gray-800">
                {venue.image_url ? (
                  <img
                    src={venue.image_url}
                    alt={venue.name}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      // Hide image on error
                      e.currentTarget.style.display = "none"
                    }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">
                    No image
                  </div>
                )}
              </div>
              <div className="flex-1 text-left min-w-0">
                <div className="font-semibold text-base text-foreground truncate">{venue.name}</div>
                <div className="text-sm text-muted-foreground truncate">
                  {venue.cuisine && <span>{venue.cuisine}</span>}
                  {venue.cuisine && (venue.neighborhood || venue.region) && <span> • </span>}
                  {venue.neighborhood && <span>{venue.neighborhood}</span>}
                  {venue.neighborhood && venue.region && <span>, </span>}
                  {venue.region && <span>{venue.region}</span>}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

