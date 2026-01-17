"use client"

import { Card } from "@/components/ui/card"
import { ReactNode } from "react"

interface MainCardProps {
  children: ReactNode
  className?: string
}

export function MainCard({ children, className = "" }: MainCardProps) {
  return (
    <Card className={`w-full max-w-4xl h-[600px] flex flex-col shadow-lg overflow-hidden bg-white dark:bg-gray-900 border-2 border-blue-600 ${className}`}>
      {children}
    </Card>
  )
}

