"use client"

import { Shader, Pixelate, SineWave, SolidColor } from "shaders/react"

interface BackgroundProps {
  theme: "light" | "dark"
}

export function Background({ theme }: BackgroundProps) {
  return (
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
  )
}

