"use client"

import type React from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Moon, Sun, Play, CheckCircle2, Loader2, XCircle, Clock, Bell } from 'lucide-react'
import { useState, useEffect, useRef } from "react"
import { Shader, Pixelate, SineWave, SolidColor } from "shaders/react"
import { Typewriter } from "@/components/typewriter"
import { useToast } from "@/hooks/use-toast"

type PageMode = "form" | "how-it-works" | "about-us"
type BookingMode = "monitor" | "full"
type Theme = "light" | "dark"

type TaskStatus = "pending" | "in-progress" | "completed" | "error" | "monitoring"

interface Task {
  id: string
  name: string
  status: TaskStatus
  error?: string
  lastCheckTime?: string
}

interface BookingForm {
  email: string
  password: string
  resyUrl: string
  partySize: string
  date: string
  refreshTime: string
  notificationMethod: "email" | "sms"
  notificationContact: string
}

export default function GetResydPage() {
  const [pageMode, setPageMode] = useState<PageMode>("form")
  const [bookingMode, setBookingMode] = useState<BookingMode>("full")
  // Initialize theme based on what's actually in the DOM (set by the script in layout.tsx)
  const [theme, setTheme] = useState<Theme>(() => {
    // Check if we're on the client side
    if (typeof window !== 'undefined') {
      const savedTheme = localStorage.getItem('theme') as Theme | null
      if (savedTheme) {
        return savedTheme
      }
      // Check if dark class is already on the document (set by the script)
      if (document.documentElement.classList.contains('dark')) {
        return 'dark'
      }
      // Check system preference
      if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
        return 'dark'
      }
    }
    return 'light'
  })
  const [tasks, setTasks] = useState<Task[]>([])
  const [isRunning, setIsRunning] = useState(false)
  const [isMonitoring, setIsMonitoring] = useState(false)
  const [lastCheckTime, setLastCheckTime] = useState<string | null>(null)
  const [taskId] = useState(() => `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`)
  const [sessionToken, setSessionToken] = useState<string | null>(null)
  const isRunningRef = useRef(false)
  const { toast } = useToast()

  const [form, setForm] = useState<BookingForm>({
    email: "",
    password: "",
    resyUrl: "",
    partySize: "2",
    date: "",
    refreshTime: "5",
    notificationMethod: "email",
    notificationContact: ""
  })

  useEffect(() => {
    // Sync theme state with DOM and localStorage
    const savedTheme = localStorage.getItem('theme') as Theme | null
    const isDarkInDOM = document.documentElement.classList.contains('dark')
    
    if (savedTheme) {
      // If we have a saved theme, use it and sync DOM
      setTheme(savedTheme)
      document.documentElement.classList.toggle("dark", savedTheme === "dark")
    } else if (isDarkInDOM) {
      // If no saved theme but DOM is dark (set by script), sync state
      setTheme('dark')
    } else {
      // Otherwise, check system preference and sync
      const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      const initialTheme = systemPrefersDark ? 'dark' : 'light'
      setTheme(initialTheme)
      document.documentElement.classList.toggle("dark", initialTheme === "dark")
    }
  }, [])

  const toggleTheme = () => {
    const newTheme = theme === "light" ? "dark" : "light"
    setTheme(newTheme)
    localStorage.setItem("theme", newTheme)
    document.documentElement.classList.toggle("dark", newTheme === "dark")
  }

  const updateTaskStatus = (taskId: string, status: TaskStatus, error?: string, lastCheckTime?: string) => {
    setTasks(prev => prev.map(task => 
      task.id === taskId ? { ...task, status, error, lastCheckTime } : task
    ))
  }

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    })
  }

  const pollSlotsUntilAvailable = async (venueId: number, day: string, numSeats: number, refreshTime: number, taskName: string = "monitor", token: string | null = null) => {
    setIsMonitoring(true)
    const maxAttempts = 10000 // Very high limit, but prevents true infinite loops
    let attempts = 0
    // Use the passed token, or fall back to state (for backwards compatibility)
    const currentToken = token !== null ? token : sessionToken

    while (attempts < maxAttempts && isRunningRef.current) {
      try {
        const checkTime = new Date()
        const formattedTime = formatTime(checkTime)
        setLastCheckTime(formattedTime)
        updateTaskStatus(taskName, "monitoring", undefined, formattedTime)

        const headers: HeadersInit = {
          "Content-Type": "application/json",
          "x-task-id": taskId
        }
        
        // Add session token if available
        if (currentToken) {
          headers["x-session-token"] = currentToken
        }
        
        const slotsRes = await fetch("/api/resy/slots", {
          method: "POST",
          headers,
          body: JSON.stringify({
            venue_id: venueId,
            day: day,
            num_seats: numSeats
          })
        })

        if (!slotsRes.ok) {
          throw new Error("Failed to check slots")
        }

        const slotsData = await slotsRes.json()
        
        if (slotsData.slots && slotsData.slots.length > 0) {
          setIsMonitoring(false)
          updateTaskStatus(taskName, "completed")
          return slotsData
        }

        // Wait before next check
        await new Promise(resolve => setTimeout(resolve, refreshTime * 1000))
        attempts++
      } catch (error: any) {
        console.error("[Poll] Error:", error)
        // Don't throw immediately - continue monitoring unless it's a critical error
        if (error.message.includes("Failed to check slots")) {
          // Wait a bit before retrying on API errors
          await new Promise(resolve => setTimeout(resolve, refreshTime * 1000))
          attempts++
        } else {
          setIsMonitoring(false)
          updateTaskStatus(taskName, "error", error.message)
          throw error
        }
      }
    }

    setIsMonitoring(false)
    if (!isRunningRef.current) {
      throw new Error("Monitoring stopped by user")
    }
    throw new Error("Max polling attempts reached")
  }

  const handleMonitorMode = async () => {
    if (!form.resyUrl || !form.date || !form.notificationContact) {
      toast({
        title: "Missing Fields",
        description: "Please fill in all required fields",
        variant: "destructive",
      })
      return
    }

    setIsRunning(true)
    isRunningRef.current = true
    
    const initialTasks: Task[] = [
      { id: "venue", name: "Getting venue information", status: "pending" },
      { id: "monitor", name: "Monitoring for available slots", status: "pending" },
    ]
    setTasks(initialTasks)

    try {
      // Step 1: Get Venue ID
      updateTaskStatus("venue", "in-progress")
      const venueRes = await fetch("/api/resy/venue", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "x-task-id": taskId 
        },
        body: JSON.stringify({ url: form.resyUrl })
      })
      
      if (!venueRes.ok) throw new Error("Failed to get venue information")
      const venueData = await venueRes.json()
      // Store the session token from venue lookup
      if (venueData.session_token) {
        setSessionToken(venueData.session_token)
      }
      updateTaskStatus("venue", "completed")

      // Step 2: Monitor for slots
      // Get the current token value (might be set from venue lookup above)
      const currentToken = venueData.session_token || sessionToken
      await pollSlotsUntilAvailable(
        venueData.venue_id,
        form.date,
        parseInt(form.partySize),
        parseInt(form.refreshTime),
        "monitor",
        currentToken
      )

      // In monitor mode, we just notify - no booking happens
      toast({
        title: "Monitoring Complete",
        description: "You will be notified when slots become available.",
      })
    } catch (error: any) {
      console.error("[Monitor] Error:", error)
      const currentTask = tasks.find(t => t.status === "in-progress" || t.status === "monitoring")
      if (currentTask) {
        updateTaskStatus(currentTask.id, "error", error.message)
      }
      toast({
        title: "Monitoring Failed",
        description: error.message || "An error occurred while monitoring",
        variant: "destructive",
      })
    } finally {
      setIsRunning(false)
      isRunningRef.current = false
      setIsMonitoring(false)
    }
  }

  const handleFullMode = async () => {
    if (!form.email || !form.password || !form.resyUrl || !form.date) {
      toast({
        title: "Missing Fields",
        description: "Please fill in all required fields",
        variant: "destructive",
      })
      return
    }

    setIsRunning(true)
    isRunningRef.current = true
    
    const initialTasks: Task[] = [
      { id: "venue", name: "Getting venue information", status: "pending" },
      { id: "login", name: "Logging into Resy", status: "pending" },
      // { id: "calendar", name: "Checking availability", status: "pending" },
      { id: "slots", name: "Finding available slots", status: "pending" },
      { id: "preview", name: "Previewing reservation", status: "pending" },
      { id: "book", name: "Booking reservation", status: "pending" },
    ]
    setTasks(initialTasks)

    try {
      // Step 1: Get Venue ID
      updateTaskStatus("venue", "in-progress")
      const venueRes = await fetch("/api/resy/venue", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "x-task-id": taskId 
        },
        body: JSON.stringify({ url: form.resyUrl })
      })
      
      if (!venueRes.ok) throw new Error("Failed to get venue information")
      const venueData = await venueRes.json()
      // Store the session token from venue lookup
      if (venueData.session_token) {
        setSessionToken(venueData.session_token)
      }
      updateTaskStatus("venue", "completed")

      // Step 2: Login
      updateTaskStatus("login", "in-progress")
      const loginRes = await fetch("/api/resy/login", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "x-task-id": taskId 
        },
        body: JSON.stringify({ email: form.email, password: form.password })
      })
      
      if (!loginRes.ok) throw new Error("Login failed")
      const loginData = await loginRes.json()
      // Store the session token from login (this will override venue token if both exist)
      if (loginData.session_token) {
        setSessionToken(loginData.session_token)
      }
      updateTaskStatus("login", "completed")


      // Step 3: Find Slots (with monitoring if none available)
      updateTaskStatus("slots", "in-progress")
      const slotsHeaders: HeadersInit = {
        "Content-Type": "application/json",
        "x-task-id": taskId
      }
      
      // Add session token if available (use login token, fallback to venue token)
      const currentToken = loginData.session_token || venueData.session_token || sessionToken
      if (currentToken) {
        slotsHeaders["x-session-token"] = currentToken
      }
      
      let slotsRes = await fetch("/api/resy/slots", {
        method: "POST",
        headers: slotsHeaders,
        body: JSON.stringify({
          venue_id: venueData.venue_id,
          day: form.date,
          num_seats: parseInt(form.partySize)
        })
      })
      
      if (!slotsRes.ok) throw new Error("Failed to find slots")
      let slotsData = await slotsRes.json()
      
      // If no slots available, enter monitoring mode
      if (!slotsData.slots || slotsData.slots.length === 0) {
        // Monitor until slots become available
        // Use the token from login (which overrides venue token)
        const currentToken = loginData.session_token || venueData.session_token || sessionToken
        slotsData = await pollSlotsUntilAvailable(
          venueData.venue_id,
          form.date,
          parseInt(form.partySize),
          parseInt(form.refreshTime),
          "slots",
          currentToken
        )
      }
      
      updateTaskStatus("slots", "completed")

      // Step 4: Preview Reservation
      updateTaskStatus("preview", "in-progress")
      const firstSlot = slotsData.slots[0]
      const previewRes = await fetch("/api/resy/preview", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "x-task-id": taskId 
        },
        body: JSON.stringify({
          config_id: firstSlot.token,
          day: form.date,
          party_size: parseInt(form.partySize)
        })
      })
      
      if (!previewRes.ok) throw new Error("Failed to preview reservation")
      const previewData = await previewRes.json()
      updateTaskStatus("preview", "completed")

      // Step 5: Book Reservation
      updateTaskStatus("book", "in-progress")
      const bookRes = await fetch("/api/resy/book", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "x-task-id": taskId 
        },
        body: JSON.stringify({
          book_token: previewData.book_token,
          payment_method_id: previewData.payment_methods?.[0]?.id
        })
      })
      
      if (!bookRes.ok) throw new Error("Failed to book reservation")
      updateTaskStatus("book", "completed")

      toast({
        title: "Success!",
        description: "Reservation completed successfully!",
      })
    } catch (error: any) {
      console.error("[Booking] Error:", error)
      const currentTask = tasks.find(t => t.status === "in-progress" || t.status === "monitoring")
      if (currentTask) {
        updateTaskStatus(currentTask.id, "error", error.message)
      }
      toast({
        title: "Booking Failed",
        description: error.message || "An error occurred during booking",
        variant: "destructive",
      })
    } finally {
      setIsRunning(false)
      isRunningRef.current = false
      setIsMonitoring(false)
    }
  }

  const handleSubmit = () => {
    if (bookingMode === "monitor") {
      handleMonitorMode()
    } else {
      handleFullMode()
    }
  }

  const getTaskIcon = (status: TaskStatus) => {
    switch (status) {
      case "completed":
        return <CheckCircle2 className="w-4 h-4 text-blue-600" />
      case "in-progress":
        return <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
      case "monitoring":
        return <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
      case "error":
        return <XCircle className="w-4 h-4 text-red-600" />
      default:
        return <Clock className="w-4 h-4 text-muted-foreground" />
    }
  }

  return (
    <>
      <div className="fixed inset-0 -z-10 w-full h-full">
        <Shader className="w-full h-full">
          <SolidColor color={theme === "dark" ? "#000000" : "#ffffff"} maskType="alpha" />
          <Pixelate scale={15} maskType="alpha" opacity={0.84}>
            <SineWave
              color="#3B82F6"
              amplitude={0.87}
              frequency={10.8}
              speed={-0.5}
              angle={6}
              position={{ x: 0.5, y: 0.5 }}
              thickness={0.22}
              softness={0.44}
              maskType="alpha"
            />
          </Pixelate>
        </Shader>
      </div>

      <div className="min-h-screen flex flex-col items-center justify-center p-3 gap-3">
        <Card className="w-full max-w-4xl h-[600px] flex flex-col shadow-lg overflow-hidden bg-white dark:bg-gray-900 border-2 border-blue-600">
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
                onClick={toggleTheme}
                className="h-8 w-8 bg-transparent border-blue-600"
                title={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
              >
                {theme === "light" ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5" />}
                <span className="sr-only">Toggle theme</span>
              </Button>
              <div className="relative inline-flex h-8 bg-muted border-2 border-blue-600 shadow-sm">
                <div
                  className="absolute top-0 h-full bg-blue-600 shadow-sm transition-all duration-300 ease-out"
                  style={{
                    left: pageMode === "form" ? "0" : pageMode === "how-it-works" ? "33.33%" : "66.66%",
                    width: "33.33%",
                  }}
                />
                <button
                  onClick={() => setPageMode("form")}
                  className={`relative z-10 w-28 flex items-center justify-center text-sm font-medium transition-colors duration-300 ${
                    pageMode === "form" ? "text-white" : "text-foreground hover:text-blue-600"
                  }`}
                >
                  Form / Tasks
                </button>
                <button
                  onClick={() => setPageMode("how-it-works")}
                  className={`relative z-10 w-28 flex items-center justify-center text-sm font-medium transition-colors duration-300 ${
                    pageMode === "how-it-works" ? "text-white" : "text-foreground hover:text-blue-600"
                  }`}
                >
                  How It Works
                </button>
                <button
                  onClick={() => setPageMode("about-us")}
                  className={`relative z-10 w-28 flex items-center justify-center text-sm font-medium transition-colors duration-300 ${
                    pageMode === "about-us" ? "text-white" : "text-foreground hover:text-blue-600"
                  }`}
                >
                  About Us
                </button>
              </div>
            </div>
          </div>

          {pageMode === "form" ? (
            <div className="flex-1 overflow-y-auto p-4 min-h-0 bg-white dark:bg-gray-900">
              {tasks.length === 0 ? (
                <div className="space-y-4 max-w-2xl mx-auto">
                  <h2 className="text-xl font-semibold text-blue-600 mb-4">Book Your Reservation</h2>
                  
                  {/* Mode Selector */}
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <button
                      onClick={() => setBookingMode("monitor")}
                      className={`p-4 border-2 rounded-lg transition-all ${
                        bookingMode === "monitor"
                          ? "border-blue-600 bg-blue-50 dark:bg-blue-950"
                          : "border-gray-300 dark:border-gray-700 hover:border-blue-400"
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <Bell className="w-5 h-5 text-blue-600" />
                        <span className="font-semibold">Monitor Only</span>
                      </div>
                      <p className="text-xs text-muted-foreground">Get notified when slots open</p>
                    </button>
                    <button
                      onClick={() => setBookingMode("full")}
                      className={`p-4 border-2 rounded-lg transition-all ${
                        bookingMode === "full"
                          ? "border-blue-600 bg-blue-50 dark:bg-blue-950"
                          : "border-gray-300 dark:border-gray-700 hover:border-blue-400"
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <Play className="w-5 h-5 text-blue-600" />
                        <span className="font-semibold">Auto-Book</span>
                      </div>
                      <p className="text-xs text-muted-foreground">Automatically book when available</p>
                    </button>
                  </div>
                  
                  <div className="space-y-3">
                    {bookingMode === "full" && (
                      <>
                        <div>
                          <Label htmlFor="email" className="text-sm font-medium">Resy Email</Label>
                          <Input
                            id="email"
                            type="email"
                            value={form.email}
                            onChange={(e) => setForm({...form, email: e.target.value})}
                            placeholder="your@email.com"
                            className="mt-1 border-blue-600 focus:ring-blue-600"
                            required
                          />
                        </div>

                        <div>
                          <Label htmlFor="password" className="text-sm font-medium">Resy Password</Label>
                          <Input
                            id="password"
                            type="password"
                            value={form.password}
                            onChange={(e) => setForm({...form, password: e.target.value})}
                            placeholder="Your Resy password"
                            className="mt-1 border-blue-600 focus:ring-blue-600"
                            required
                          />
                        </div>
                      </>
                    )}

                    {bookingMode === "monitor" && (
                      <>
                        <div>
                          <Label htmlFor="notificationMethod" className="text-sm font-medium">Notification Method</Label>
                          <Select
                            value={form.notificationMethod}
                            onValueChange={(value: "email" | "sms") => setForm({...form, notificationMethod: value})}
                          >
                            <SelectTrigger className="mt-1 border-blue-600 focus:ring-blue-600">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="email">Email</SelectItem>
                              <SelectItem value="sms">Text Message</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div>
                          <Label htmlFor="notificationContact" className="text-sm font-medium">
                            {form.notificationMethod === "email" ? "Email Address" : "Phone Number"}
                          </Label>
                          <Input
                            id="notificationContact"
                            type={form.notificationMethod === "email" ? "email" : "tel"}
                            value={form.notificationContact}
                            onChange={(e) => setForm({...form, notificationContact: e.target.value})}
                            placeholder={form.notificationMethod === "email" ? "your@email.com" : "+1234567890"}
                            className="mt-1 border-blue-600 focus:ring-blue-600"
                            required
                          />
                        </div>
                      </>
                    )}

                    <div>
                      <Label htmlFor="resyUrl" className="text-sm font-medium">Resy Restaurant URL</Label>
                      <Input
                        id="resyUrl"
                        value={form.resyUrl}
                        onChange={(e) => setForm({...form, resyUrl: e.target.value})}
                        placeholder="https://resy.com/cities/nyc/venues/..."
                        className="mt-1 border-blue-600 focus:ring-blue-600"
                        required
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label htmlFor="partySize" className="text-sm font-medium">Party Size</Label>
                        <Input
                          id="partySize"
                          type="number"
                          min="1"
                          max="20"
                          value={form.partySize}
                          onChange={(e) => setForm({...form, partySize: e.target.value})}
                          className="mt-1 border-blue-600 focus:ring-blue-600"
                          required
                        />
                      </div>

                      <div>
                        <Label htmlFor="date" className="text-sm font-medium">Date</Label>
                        <Input
                          id="date"
                          type="date"
                          value={form.date}
                          onChange={(e) => setForm({...form, date: e.target.value})}
                          className="mt-1 border-blue-600 focus:ring-blue-600"
                          required
                        />
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="refreshTime" className="text-sm font-medium">
                        Refresh Interval (seconds)
                      </Label>
                      <Input
                        id="refreshTime"
                        type="number"
                        min="1"
                        max="60"
                        value={form.refreshTime}
                        onChange={(e) => setForm({...form, refreshTime: e.target.value})}
                        className="mt-1 border-blue-600 focus:ring-blue-600"
                        required
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        How often to check for availability
                      </p>
                    </div>

                    <Button
                      onClick={handleSubmit}
                      disabled={isRunning}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white mt-6"
                    >
                      {isRunning ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Running...
                        </>
                      ) : (
                        <>
                          {bookingMode === "monitor" ? (
                            <>
                              <Bell className="w-4 h-4 mr-2" />
                              Start Monitoring
                            </>
                          ) : (
                            <>
                              <Play className="w-4 h-4 mr-2" />
                              Start Booking
                            </>
                          )}
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4 max-w-2xl mx-auto">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-semibold text-blue-600">
                      {bookingMode === "monitor" ? "Monitoring Progress" : "Booking Progress"}
                    </h2>
                    {!isRunning && (
                      <Button
                        onClick={() => setTasks([])}
                        variant="outline"
                        size="sm"
                        className="border-blue-600 text-blue-600 hover:bg-blue-50"
                      >
                        New {bookingMode === "monitor" ? "Monitor" : "Booking"}
                      </Button>
                    )}
                  </div>

                  <div className="space-y-2">
                    {tasks.map((task) => (
                      <div
                        key={task.id}
                        className="flex items-center gap-3 p-3 border border-blue-600 bg-white dark:bg-black rounded"
                      >
                        {getTaskIcon(task.status)}
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-medium">{task.name}</p>
                            {task.status === "monitoring" && task.lastCheckTime && (
                              <p className="text-xs text-muted-foreground">
                                Last checked: {task.lastCheckTime}
                              </p>
                            )}
                          </div>
                          {task.error && (
                            <p className="text-xs text-red-600 mt-1">{task.error}</p>
                          )}
                          {task.status === "monitoring" && (
                            <p className="text-xs text-blue-600 mt-1">
                              Monitoring for available slots...
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : pageMode === "how-it-works" ? (
            <div className="flex-1 overflow-y-auto p-6 min-h-0 bg-white dark:bg-gray-900">
              <div className="max-w-2xl mx-auto space-y-6">
                <div>
                  <h2 className="text-2xl font-bold text-blue-600 mb-4">How Get Resyd Works</h2>
                  <p className="text-base leading-relaxed text-foreground">
                    Get Resyd automates the process of booking reservations on Resy.com. 
                    Simply provide your details, and we'll handle the rest.
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="border-l-4 border-blue-600 pl-4">
                    <h3 className="font-semibold text-lg mb-2">1. Enter Your Information</h3>
                    <p className="text-sm text-muted-foreground">
                      Provide your Resy credentials (for auto-booking) or notification details (for monitoring), 
                      the restaurant URL, party size, preferred date, and how often you want us to check for availability.
                    </p>
                  </div>

                  <div className="border-l-4 border-blue-600 pl-4">
                    <h3 className="font-semibold text-lg mb-2">2. Monitor Availability</h3>
                    <p className="text-sm text-muted-foreground">
                      Our system continuously checks for available reservations at your chosen restaurant, 
                      monitoring slots that match your preferences.
                    </p>
                  </div>

                  <div className="border-l-4 border-blue-600 pl-4">
                    <h3 className="font-semibold text-lg mb-2">3. Automatic Booking or Notification</h3>
                    <p className="text-sm text-muted-foreground">
                      When a slot becomes available, we either immediately secure the reservation for you 
                      (auto-booking mode) or notify you via email or text (monitor mode).
                    </p>
                  </div>
                </div>

                <div className="bg-blue-50 dark:bg-blue-950 border-2 border-blue-600 p-4 rounded">
                  <h3 className="font-semibold text-lg mb-2 text-blue-600">Privacy & Security</h3>
                  <p className="text-sm text-foreground leading-relaxed">
                    <strong>We do not store your personal information.</strong> Your credentials are only 
                    used temporarily during the booking session and are never saved to our servers. 
                    All communication with Resy is encrypted and secure.
                  </p>
                </div>

                <div className="text-center pt-4">
                  <Button
                    onClick={() => setPageMode("form")}
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    Get Started
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-6 min-h-0 bg-white dark:bg-gray-900">
              <div className="max-w-2xl mx-auto space-y-6">
                <div>
                  <h2 className="text-2xl font-bold text-blue-600 mb-4">About Us</h2>
                  <p className="text-base leading-relaxed text-foreground">
                    Get Resyd is a passion project run by just one person, dedicated to helping people 
                    secure last-minute reservations at their favorite restaurants.
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="border-l-4 border-blue-600 pl-4">
                    <h3 className="font-semibold text-lg mb-2">Our Mission</h3>
                    <p className="text-sm text-muted-foreground">
                      It can be frustrating to miss out on reservations at popular spots. 
                      That's why I built Get Resyd; to give everyone a chance at securing those 
                      hard-to-snag tables, especially when plans change last minute.
                    </p>
                  </div>

                  <div className="border-l-4 border-blue-600 pl-4">
                    <h3 className="font-semibold text-lg mb-2">Free for Now</h3>
                    <p className="text-sm text-muted-foreground">
                      I am trying to keeping this service free for as long as possible. 
                      This is a side project, not a business, and I would like to help as many people as we can 
                      without putting up barriers.
                    </p>
                  </div>

                  <div className="border-l-4 border-blue-600 pl-4">
                    <h3 className="font-semibold text-lg mb-2">Built with Care</h3>
                    <p className="text-sm text-muted-foreground">
                      Every feature, every update, and every fix comes from real feedback and a genuine 
                      desire to make dining reservations more accessible. I amconstantly improving 
                      based on what you need, potentially adding further sites in the future.
                    </p>
                  </div>
                </div>

                <div className="bg-blue-50 dark:bg-blue-950 border-2 border-blue-600 p-4 rounded">
                  <h3 className="font-semibold text-lg mb-2 text-blue-600">Your Privacy Matters</h3>
                  <p className="text-sm text-foreground leading-relaxed">
                    We don't store your login credentials or personal information. Everything is processed 
                    securely and only used for the duration of your booking session. Your data is yours, 
                    always.
                  </p>
                </div>

                <div className="text-center pt-4">
                  <Button
                    onClick={() => setPageMode("form")}
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    Get Started
                  </Button>
                </div>
              </div>
            </div>
          )}
        </Card>

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

