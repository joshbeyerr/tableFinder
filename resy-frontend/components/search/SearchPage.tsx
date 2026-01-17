"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { VenueSearchInput, type VenueSearchResult } from "./VenueSearchInput"
import { Link2 } from "lucide-react"

interface SearchPageProps {
  onSelectVenue: (venue: VenueSearchResult) => void
  onUseUrl: (url: string) => void
  taskId: string
}

export function SearchPage({ onSelectVenue, onUseUrl, taskId }: SearchPageProps) {
  const [useUrlMode, setUseUrlMode] = useState(false)
  const [url, setUrl] = useState("")

  const handleUrlSubmit = () => {
    if (url.trim()) {
      onUseUrl(url.trim())
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 min-h-0 bg-white dark:bg-gray-900">
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-blue-600 mb-2">Find Your Restaurant</h2>
          <p className="text-sm text-muted-foreground">
            Search for a restaurant by name, or paste a Resy URL to skip the search
          </p>
        </div>

        {!useUrlMode ? (
          <>
            <div className="space-y-2">
              <Label htmlFor="search" className="text-sm font-medium">
                Restaurant Name
              </Label>
              <VenueSearchInput onSelect={onSelectVenue} taskId={taskId} />
            </div>

            <div className="flex items-center gap-2 pt-4">
              <div className="flex-1 border-t border-gray-300 dark:border-gray-700"></div>
              <span className="text-xs text-muted-foreground">OR</span>
              <div className="flex-1 border-t border-gray-300 dark:border-gray-700"></div>
            </div>

            <Button
              variant="outline"
              onClick={() => setUseUrlMode(true)}
              className="w-full border-blue-600 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950"
            >
              <Link2 className="w-4 h-4 mr-2" />
              Paste Resy URL Instead
            </Button>
          </>
        ) : (
          <>
            <div className="space-y-2">
              <Label htmlFor="url" className="text-sm font-medium">
                Resy Restaurant URL
              </Label>
              <Input
                id="url"
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://resy.com/cities/nyc/venues/..."
                className="border-blue-600 focus:ring-blue-600"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleUrlSubmit()
                  }
                }}
              />
            </div>

            <div className="flex gap-3">
              <Button
                onClick={handleUrlSubmit}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                disabled={!url.trim()}
              >
                Continue
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setUseUrlMode(false)
                  setUrl("")
                }}
                className="border-blue-600 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950"
              >
                Back to Search
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

