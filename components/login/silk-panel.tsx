'use client';

import { useEffect, useRef } from 'react';

const RIBBONS = [
  { color: 'rgba(242, 145, 145, 0.62)', amp: 0.16, freq: 1.3, speed: 0.11, offset: 0.0, y: 0.34, width: 0.2 },
  { color: 'rgba(247, 173, 173, 0.5)', amp: 0.13, freq: 1.7, speed: 0.08, offset: 1.7, y: 0.48, width: 0.16 },
  { color: 'rgba(177, 229, 230, 0.55)', amp: 0.18, freq: 1.1, speed: 0.07, offset: 3.1, y: 0.6, width: 0.18 },
  { color: 'rgba(204, 251, 250, 0.6)', amp: 0.12, freq: 2.0, speed: 0.1, offset: 4.6, y: 0.72, width: 0.12 },
];

/**
 * Abstract flowing silk drawn on a canvas from the brand colours. It is the only
 * looping animation in the app, so it is kept slow and quiet. It stops when the
 * tab is hidden or scrolled away, and renders one still frame for people who
 * prefer reduced motion.
 */
export function SilkPanel() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    let running = false;
    let visible = true;
    const start = performance.now();

    function resize() {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const { width, height } = canvas!.getBoundingClientRect();
      canvas!.width = Math.max(1, Math.round(width * ratio));
      canvas!.height = Math.max(1, Math.round(height * ratio));
      context!.setTransform(ratio, 0, 0, ratio, 0, 0);
    }

    function draw(seconds: number) {
      const { width, height } = canvas!.getBoundingClientRect();
      context!.clearRect(0, 0, width, height);
      for (const ribbon of RIBBONS) {
        const steps = 64;
        // Each ribbon is a band between two waves whose phase drifts slowly, so
        // the band seems to twist like fabric catching the light.
        const edge = (side: number) => {
          const points: Array<[number, number]> = [];
          for (let i = 0; i <= steps; i += 1) {
            const t = i / steps;
            const phase = t * Math.PI * 2 * ribbon.freq + seconds * ribbon.speed * Math.PI * 2 + ribbon.offset;
            const twist = Math.sin(phase * 0.5 + seconds * 0.15) * ribbon.width * height * 0.5;
            const y = ribbon.y * height + Math.sin(phase) * ribbon.amp * height + side * twist;
            points.push([t * width * 1.2 - width * 0.1, y]);
          }
          return points;
        };
        const top = edge(1);
        const bottom = edge(-1).reverse();
        context!.beginPath();
        top.forEach(([x, y], i) => (i === 0 ? context!.moveTo(x, y) : context!.lineTo(x, y)));
        bottom.forEach(([x, y]) => context!.lineTo(x, y));
        context!.closePath();
        context!.fillStyle = ribbon.color;
        context!.fill();
      }
    }

    function loop(now: number) {
      draw((now - start) / 1000);
      frame = requestAnimationFrame(loop);
    }

    function update() {
      const shouldRun = !reduced.matches && visible && document.visibilityState === 'visible';
      if (shouldRun && !running) {
        running = true;
        frame = requestAnimationFrame(loop);
      } else if (!shouldRun && running) {
        running = false;
        cancelAnimationFrame(frame);
      }
      if (!shouldRun) draw(6);
    }

    resize();
    draw(6);
    const observer = new IntersectionObserver(([entry]) => {
      visible = Boolean(entry?.isIntersecting);
      update();
    });
    observer.observe(canvas);
    const onResize = () => {
      resize();
      if (!running) draw(6);
    };
    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', update);
    reduced.addEventListener('change', update);
    update();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', update);
      reduced.removeEventListener('change', update);
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden className="absolute inset-0 size-full" />;
}
