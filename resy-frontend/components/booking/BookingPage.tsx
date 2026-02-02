"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Play, CheckCircle2, Loader2, XCircle, Clock, Bell } from 'lucide-react'
import { useToast } from "@/hooks/use-toast"

type BookingMode = "monitor" | "full"
type PageMode = "form" | "how-it-works" | "about-us"
type TaskStatus = "pending" | "in-progress" | "completed" | "error" | "monitoring"

interface Task {
  id: string
  name: string
  status: TaskStatus
  error?: string
  lastCheckTime?: string
  restaurantName?: string
  checkoutTime?: string
  reservationTime?: string
}

interface BookingForm {
  email: string
  password: string
  resyUrl: string
  partySize: string
  date: string
  timeStart: string
  timeEnd: string
  refreshTime: string
  notificationMethod: "email" | "sms"
  notificationContact: string
}

interface BookingPageProps {
  selectedVenue: {
    venueId: string
    venueName: string
    resyUrl?: string
  }
  taskId: string
  onBack: () => void
  onPageModeChange?: (mode: PageMode) => void
}

export function BookingPage({ selectedVenue, taskId, onBack, onPageModeChange }: BookingPageProps) {
  const [pageMode, setPageMode] = useState<PageMode>("form")
  const [bookingMode, setBookingMode] = useState<BookingMode>("full")
  const [tasks, setTasks] = useState<Task[]>([])
  const [isRunning, setIsRunning] = useState(false)
  const [isMonitoring, setIsMonitoring] = useState(false)
  const [lastCheckTime, setLastCheckTime] = useState<string | null>(null)
  const [sessionToken, setSessionToken] = useState<string | null>(null)
  const [cachedResyToken, setCachedResyToken] = useState<string | null>(null)
  const isRunningRef = useRef(false)
  const { toast } = useToast()

  const [form, setForm] = useState<BookingForm>({
    email: "",
    password: "",
    resyUrl: selectedVenue.resyUrl || "",
    partySize: "2",
    date: "",
    timeStart: "",
    timeEnd: "",
    refreshTime: "5",
    notificationMethod: "email",
    notificationContact: ""
  })

  // Load cached Resy token on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const cached = localStorage.getItem('resy_auth_token')
      const cachedExpiry = localStorage.getItem('resy_auth_token_expiry')
      
      if (cached && cachedExpiry) {
        const expiryTime = parseInt(cachedExpiry, 10)
        const now = Date.now()
        
        if (expiryTime > now + 3600000) {
          setCachedResyToken(cached)
        } else {
          localStorage.removeItem('resy_auth_token')
          localStorage.removeItem('resy_auth_token_expiry')
        }
      }
    }
  }, [])

  // If we have a venueId from search, we don't need the URL
  // But if we have a URL, we'll need to fetch the venueId
  useEffect(() => {
    if (selectedVenue.venueId && !selectedVenue.resyUrl) {
      // Venue was selected from search, URL is not needed
      setForm(prev => ({ ...prev, resyUrl: "" }))
    } else if (selectedVenue.resyUrl) {
      // URL was provided, keep it in form
      setForm(prev => ({ ...prev, resyUrl: selectedVenue.resyUrl || "" }))
    }
  }, [selectedVenue])

  const updateTaskStatus = (
    taskId: string, 
    status: TaskStatus, 
    error?: string, 
    lastCheckTime?: string,
    restaurantName?: string,
    checkoutTime?: string,
    reservationTime?: string
  ) => {
    setTasks(prev => prev.map(task => 
      task.id === taskId ? { 
        ...task, 
        status, 
        error, 
        lastCheckTime,
        restaurantName,
        checkoutTime,
        reservationTime
      } : task
    ))
  }

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    })
  }

  const formatReservationTime = (timeString: string) => {
    try {
      const date = new Date(timeString)
      return formatTime(date)
    } catch {
      const match = timeString.match(/(\d{2}):(\d{2})/)
      if (match) {
        const hours = parseInt(match[1])
        const minutes = match[2]
        const period = hours >= 12 ? 'PM' : 'AM'
        const displayHours = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours
        return `${displayHours}:${minutes} ${period}`
      }
      return timeString
    }
  }

  const pollSlotsUntilAvailable = async (venueId: number, day: string, numSeats: number, refreshTime: number, taskName: string = "monitor", token: string | null = null) => {
    setIsMonitoring(true)
    const maxAttempts = 10000
    let attempts = 0
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
        
        if (currentToken) {
          headers["x-session-token"] = currentToken
        }
        
        const slotsRes = await fetch("/api/resy/slots", {
          method: "POST",
          headers,
          body: JSON.stringify({
            venue_id: venueId,
            day: day,
            num_seats: numSeats,
            time_start: form.timeStart || undefined,
            time_end: form.timeEnd || undefined,
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

        await new Promise(resolve => setTimeout(resolve, refreshTime * 1000))
        attempts++
      } catch (error: any) {
        console.error("[Poll] Error:", error)
        if (error.message.includes("Failed to check slots")) {
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
    if ((!selectedVenue.venueId && !form.resyUrl) || !form.date || !form.notificationContact) {
      toast({
        title: "Missing Fields",
        description: "Please fill in all required fields",
        variant: "destructive",
      })
      return
    }
    
    if (!taskId) {
      toast({
        title: "Initializing",
        description: "Please wait a moment and try again",
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
      let venueId: number
      let venueName: string

      if (selectedVenue.venueId) {
        // Use venueId from search
        venueId = parseInt(selectedVenue.venueId)
        venueName = selectedVenue.venueName
        updateTaskStatus("venue", "completed")
      } else {
        // Get venue ID from URL
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
        venueId = venueData.venue_id
        venueName = venueData.venue_name
        if (venueData.session_token) {
          setSessionToken(venueData.session_token)
        }
        updateTaskStatus("venue", "completed")
      }

      const currentToken = sessionToken
      await pollSlotsUntilAvailable(
        venueId,
        form.date,
        parseInt(form.partySize),
        parseInt(form.refreshTime),
        "monitor",
        currentToken
      )

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
    if (!form.email || !form.password || (!selectedVenue.venueId && !form.resyUrl) || !form.date) {
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
      { id: "slots", name: "Finding available slots", status: "pending" },
      { id: "preview", name: "Previewing reservation", status: "pending" },
      { id: "book", name: "Booking reservation", status: "pending" },
    ]
    setTasks(initialTasks)

    try {
      let venueId: number
      let venueName: string

      if (selectedVenue.venueId) {
        venueId = parseInt(selectedVenue.venueId)
        venueName = selectedVenue.venueName
        updateTaskStatus("venue", "completed")
      } else {
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
        venueId = venueData.venue_id
        venueName = venueData.venue_name
        if (venueData.session_token) {
          setSessionToken(venueData.session_token)
        }
        updateTaskStatus("venue", "completed")
      }

      // Step 2: Login
      updateTaskStatus("login", "in-progress")
      
      let loginBody: { email?: string; password?: string; resy_token?: string } = {}
      
      if (cachedResyToken) {
        loginBody = { resy_token: cachedResyToken }
      } else {
        loginBody = { email: form.email, password: form.password }
      }
      
      const loginRes = await fetch("/api/resy/login", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "x-task-id": taskId 
        },
        body: JSON.stringify(loginBody)
      })
      
      let loginData: { session_token?: string; resy_token?: string } = {}
      
      if (!loginRes.ok) {
        const errorData = await loginRes.json().catch(() => ({}))
        if (cachedResyToken && errorData.error) {
          localStorage.removeItem('resy_auth_token')
          localStorage.removeItem('resy_auth_token_expiry')
          setCachedResyToken(null)
          
          const retryRes = await fetch("/api/resy/login", {
            method: "POST",
            headers: { 
              "Content-Type": "application/json",
              "x-task-id": taskId 
            },
            body: JSON.stringify({ email: form.email, password: form.password })
          })
          
          if (!retryRes.ok) {
            const retryError = await retryRes.json().catch(() => ({}))
            throw new Error(retryError.error || "Login failed")
          }
          
          loginData = await retryRes.json()
          
          if (loginData.session_token) {
            setSessionToken(loginData.session_token)
          }
          
          if (loginData.resy_token) {
            const expiryTime = Date.now() + (24 * 60 * 60 * 1000)
            localStorage.setItem('resy_auth_token', loginData.resy_token)
            localStorage.setItem('resy_auth_token_expiry', expiryTime.toString())
            setCachedResyToken(loginData.resy_token)
          }
          
          updateTaskStatus("login", "completed")
        } else {
          throw new Error(errorData.error || "Login failed")
        }
      } else {
        loginData = await loginRes.json()
        if (loginData.session_token) {
          setSessionToken(loginData.session_token)
        }
        updateTaskStatus("login", "completed")
        
        if (!cachedResyToken && loginData.resy_token && form.email && form.password) {
          const expiryTime = Date.now() + (24 * 60 * 60 * 1000)
          localStorage.setItem('resy_auth_token', loginData.resy_token)
          localStorage.setItem('resy_auth_token_expiry', expiryTime.toString())
          setCachedResyToken(loginData.resy_token)
        }
      }

      // Step 3: Find Slots
      updateTaskStatus("slots", "in-progress")
      const slotsHeaders: HeadersInit = {
        "Content-Type": "application/json",
        "x-task-id": taskId
      }
      
      const currentToken = loginData.session_token || sessionToken
      if (currentToken) {
        slotsHeaders["x-session-token"] = currentToken
      }
      
      let slotsRes = await fetch("/api/resy/slots", {
        method: "POST",
        headers: slotsHeaders,
        body: JSON.stringify({
          venue_id: venueId,
          day: form.date,
          num_seats: parseInt(form.partySize),
          time_start: form.timeStart || undefined,
          time_end: form.timeEnd || undefined,
        })
      })
      
      if (!slotsRes.ok) throw new Error("Failed to find slots")
      let slotsData = await slotsRes.json()
      
      if (!slotsData.slots || slotsData.slots.length === 0) {
        const currentToken = loginData.session_token || sessionToken
        slotsData = await pollSlotsUntilAvailable(
          venueId,
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
      
      const checkoutTime = formatTime(new Date())
      const reservationTime = formatReservationTime(firstSlot.start)
      updateTaskStatus("book", "completed", undefined, undefined, venueName, checkoutTime, reservationTime)

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

  const handlePageModeChange = (mode: PageMode) => {
    setPageMode(mode)
    if (onPageModeChange) {
      onPageModeChange(mode)
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 min-h-0 bg-white dark:bg-gray-900">
      {pageMode === "how-it-works" ? (
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
                onClick={() => handlePageModeChange("form")}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                Get Started
              </Button>
            </div>
          </div>
        </div>
      ) : pageMode === "about-us" ? (
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
                  desire to make dining reservations more accessible. I am constantly improving 
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
                onClick={() => handlePageModeChange("form")}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                Get Started
              </Button>
            </div>
          </div>
        </div>
      ) : tasks.length === 0 ? (
        <div className="space-y-4 max-w-2xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-blue-600">Book Your Reservation</h2>
            <button
              onClick={onBack}
              className="text-sm text-blue-600 hover:underline"
            >
              ← Back to Search
            </button>
          </div>

          {selectedVenue.venueName && (
            <div className="p-3 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-md">
              <p className="text-sm text-blue-900 dark:text-blue-100">
                <strong>Selected:</strong> {selectedVenue.venueName}
              </p>
            </div>
          )}

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
                  <div className="mt-2 p-3 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-md">
                    <p className="text-xs text-blue-900 dark:text-blue-100 leading-relaxed">
                      <strong className="font-semibold">🔒 Secure Authentication:</strong> Your password is authenticated directly with Resy's servers. 
                      We never see or store your password, only an encrypted session token is sent to our backend for booking operations.
                    </p>
                  </div>
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

            {!selectedVenue.venueId && (
              <div>
                <Label htmlFor="resyUrl" className="text-sm font-medium">Resy Restaurant URL</Label>
                <Input
                  id="resyUrl"
                  value={form.resyUrl}
                  onChange={(e) => setForm({...form, resyUrl: e.target.value})}
                  placeholder="https://resy.com/cities/nyc/venues/..."
                  className="mt-1 border-blue-600 focus:ring-blue-600"
                  required={!selectedVenue.venueId}
                />
              </div>
            )}

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

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="timeStart" className="text-sm font-medium">Earliest Time (optional)</Label>
                <Input
                  id="timeStart"
                  type="time"
                  value={form.timeStart}
                  onChange={(e) => setForm({...form, timeStart: e.target.value})}
                  className="mt-1 border-blue-600 focus:ring-blue-600"
                />
              </div>
              <div>
                <Label htmlFor="timeEnd" className="text-sm font-medium">Latest Time (optional)</Label>
                <Input
                  id="timeEnd"
                  type="time"
                  value={form.timeEnd}
                  onChange={(e) => setForm({...form, timeEnd: e.target.value})}
                  className="mt-1 border-blue-600 focus:ring-blue-600"
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground -mt-2">
              If set, we’ll only proceed when available slots fall within this time window. Otherwise, it keeps monitoring.
            </p>

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
                  {task.id === "book" && task.status === "completed" && task.restaurantName && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {task.restaurantName} • Checked out at {task.checkoutTime} • Reserved for {task.reservationTime}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

