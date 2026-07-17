"use client";

import { useEffect, useRef } from "react";

const PARTICLE_COUNT = 70;
const DURATION_MS = 2600;
const GRAVITY = 0.12;
const COLORS = ["#f97316", "#22c55e", "#3b82f6", "#eab308", "#ec4899", "#8b5cf6"];

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  rotationSpeed: number;
  size: number;
  color: string;
}

function createParticles(originX: number, originY: number): Particle[] {
  const particles: Particle[] = [];
  for (let i = 0; i < PARTICLE_COUNT; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 3 + Math.random() * 6;
    particles.push({
      x: originX,
      y: originY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 4,
      rotation: Math.random() * 360,
      rotationSpeed: (Math.random() - 0.5) * 20,
      size: 5 + Math.random() * 5,
      color: COLORS[i % COLORS.length],
    });
  }
  return particles;
}

/**
 * Lightweight canvas confetti burst — no dependency, spawns once on mount
 * and stops after DURATION_MS. Skips entirely under prefers-reduced-motion.
 */
export function ConfettiBurst() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const width = window.innerWidth;
    const height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;

    const particles = createParticles(width / 2, height / 2.5);
    const startedAt = performance.now();
    let frameId: number;

    const tick = (now: number) => {
      const elapsed = now - startedAt;
      ctx.clearRect(0, 0, width, height);

      if (elapsed >= DURATION_MS) return;

      const fadeStart = DURATION_MS * 0.7;
      const opacity = elapsed > fadeStart ? Math.max(0, 1 - (elapsed - fadeStart) / (DURATION_MS - fadeStart)) : 1;

      for (const particle of particles) {
        particle.vy += GRAVITY;
        particle.x += particle.vx;
        particle.y += particle.vy;
        particle.rotation += particle.rotationSpeed;

        ctx.save();
        ctx.globalAlpha = opacity;
        ctx.translate(particle.x, particle.y);
        ctx.rotate((particle.rotation * Math.PI) / 180);
        ctx.fillStyle = particle.color;
        ctx.fillRect(-particle.size / 2, -particle.size / 4, particle.size, particle.size / 2);
        ctx.restore();
      }

      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-[100]"
      aria-hidden="true"
    />
  );
}
