import * as THREE from 'three';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { readChapterBounds } from './journeyMath';

// GSAP drives two things for the scene:
//  1. The journey timeline — scroll position → progress (0–3.7 across the four chapters), scrubbed by ScrollTrigger.
//     The timeline is rebuilt from the chapter bounds whenever ScrollTrigger refreshes (resize, layout change).
//  2. Decorative motion — drifting balloon and clouds, fluttering flags, the pop when the runner reaches a camp and
//     the shape of the runner's jumps.
// The page keeps a single requestAnimationFrame: GSAP's root timeline is detached from its own ticker and advanced
// from Journey's frame loop via tick(); it is simply not ticked while motion is paused, so loops resume where they
// stopped. ScrollTrigger updates synchronously on scroll events, so it needs no ticker of its own.
gsap.registerPlugin(ScrollTrigger);
gsap.ticker.remove(gsap.updateRoot);
gsap.ticker.lagSmoothing(0);
ScrollTrigger.config({ ignoreMobileResize: true });

/** Anchor line used by the story: a point 38% down the viewport decides which chapter the camera is in. */
export const scrollAnchor = () => window.innerHeight * 0.38;

/** Fires each key once when `progress` crosses it upwards; nothing on the first call, so a page opened mid-scroll stays calm. */
export function createPopTriggers(keys: { key: number; fire: () => void }[]) {
  let last: number | null = null;
  return (progress: number) => {
    if (last !== null) for (const item of keys) if (last < item.key && progress >= item.key) item.fire();
    last = progress;
  };
}

/**
 * Scroll → progress as piecewise-linear keyframes in scroll-pixel space: inside chapter i the anchor runs the
 * section from i to i + 0.7, and the travel gap to the next chapter runs i + 0.7 to i + 1 (see measureProgress).
 */
function progressKeyframes(offset: number): [number, number][] {
  const points: [number, number][] = [];
  for (const [index, section] of readChapterBounds().entries()) {
    if (!section) continue;
    points.push([section.top - offset, index], [section.bottom - offset, index + 0.7]);
  }
  return points;
}

export function createFlourishes() {
  const context = gsap.context(() => {});
  const within = <T,>(build: () => T): T => { let out!: T; context.add(() => { out = build(); }); return out; };
  let clock = 0;

  return {
    /** Advance every real-time GSAP animation by `deltaMs` (call once per rendered frame while motion runs). */
    tick(deltaMs: number) { clock += deltaMs / 1000; gsap.updateRoot(clock); },

    /**
     * ScrollTrigger scrubbing the journey timeline. `progress` is always the value for the current scroll position;
     * `onChange` runs synchronously whenever ScrollTrigger updates it. Call `refresh()` after a layout change.
     */
    createScrollDriver(onChange: () => void) {
      const value = { progress: 0 };
      const timeline = gsap.timeline({ paused: true });
      const rebuild = () => {
        const offset = scrollAnchor();
        const points = progressKeyframes(offset);
        timeline.clear();
        let time = 0;
        let progress = 0;
        if (points.length) {
          // Value at scroll 0 (the first keyframes usually sit above the top of the page, before the anchor).
          let i = 0;
          while (i < points.length - 1 && points[i + 1][0] <= 0) i++;
          const [t0, p0] = points[i];
          const [t1, p1] = points[Math.min(i + 1, points.length - 1)];
          progress = t0 >= 0 ? p0 : t1 <= t0 ? p1 : p0 + ((0 - t0) / (t1 - t0)) * (p1 - p0);
          for (const [t, p] of points.slice(i + 1)) {
            if (t <= time) { progress = p; continue; }
            // immediateRender: false — a fromTo would otherwise write its start value the moment it is created,
            // leaving the last keyframe's value in place until the first scroll.
            timeline.fromTo(value, { progress }, { progress: p, duration: t - time, ease: 'none', immediateRender: false }, time);
            time = t;
            progress = p;
          }
        }
        if (!timeline.duration()) timeline.set(value, { progress }, 0);
        // Render the rebuilt timeline at the current scroll position right away: ScrollTrigger only re-renders when
        // its own progress changes, which it does not on a refresh that leaves the scroll position alone.
        timeline.render(Math.min(Math.max(0, window.scrollY), timeline.duration()), true, true);
      };
      const driver = within(() => ScrollTrigger.create({
        start: 0,
        end: () => Math.max(1, timeline.duration()),
        animation: timeline,
        scrub: true,
        onRefreshInit: rebuild,
        onUpdate: onChange,
        onRefresh: onChange,
      }));
      return {
        get progress() { return value.progress; },
        refresh() { driver.refresh(); },
      };
    },

    /** Endless out-of-phase bobbing (balloon, floating islands, satellite): base ± amplitude with a soft sine ease. */
    drift(items: { object: THREE.Object3D; base: number; amplitude: number }[], period = 3) {
      return within(() => items.map((item, index) => {
        item.object.position.y = item.base - item.amplitude;
        return gsap.to(item.object.position, { y: item.base + item.amplitude, duration: period * (0.85 + (index % 4) * 0.11), delay: index * 0.26, ease: 'sine.inOut', repeat: -1, yoyo: true });
      }));
    },

    /** Slow cloud drift: each bank wanders sideways and lifts slightly, each at its own pace. */
    driftClouds(items: { group: THREE.Group; base: number; height: number; speed: number }[]) {
      return within(() => items.flatMap((item, index) => {
        item.group.position.x = item.base - 0.4;
        item.group.position.y = item.height - 0.045;
        return [
          gsap.to(item.group.position, { x: item.base + 0.4, duration: 24 / Math.max(0.3, item.speed), delay: index * 0.9, ease: 'sine.inOut', repeat: -1, yoyo: true }),
          gsap.to(item.group.position, { y: item.height + 0.045, duration: 19 + index * 1.3, ease: 'sine.inOut', repeat: -1, yoyo: true }),
        ];
      }));
    },

    /** Flags flutter in turn instead of all at once. */
    flutter(banners: THREE.Object3D[]) {
      return within(() => banners.map((banner, index) => {
        banner.rotation.y = -0.22;
        return gsap.to(banner.rotation, { y: 0.22, duration: 1.15 + index * 0.09, delay: index * 0.14, ease: 'sine.inOut', repeat: -1, yoyo: true });
      }));
    },

    /** A camp signpost or flag springs up as the runner arrives (scale from `from` with a bouncy overshoot). */
    pop(target: THREE.Object3D, from = 0.45) {
      return within(() => {
        gsap.killTweensOf(target.scale);
        target.scale.setScalar(from);
        return gsap.to(target.scale, { x: 1, y: 1, z: 1, duration: 0.9, ease: 'elastic.out(1.05, 0.62)' });
      });
    },

    /**
     * A quick celebratory hop played once (when the runner reaches a camp or the summit): crouch, spring up with a
     * stretch, fall, land with a squash and recover. Runs in real time on top of the scroll-driven route;
     * `pose.lift` is the height (0–height) and `pose.stretch` the squash/stretch (+1/-1).
     */
    createHop(height = 1) {
      const pose = { lift: 0, stretch: 0 };
      const timeline = within(() => gsap.timeline({ paused: true })
        .to(pose, { stretch: -0.5, duration: 0.09, ease: 'power1.out' })
        .to(pose, { stretch: 0.6, lift: height, duration: 0.26, ease: 'power3.out' })
        .to(pose, { stretch: 0, lift: 0, duration: 0.26, ease: 'power1.in' })
        .to(pose, { stretch: -0.4, duration: 0.06, ease: 'power1.out' })
        .to(pose, { stretch: 0, duration: 0.09, ease: 'back.out(1.7)' }));
      const hop = { pose, strength: 1, play(strength = 1) { hop.strength = strength; timeline.restart(); } };
      return hop;
    },

    /**
     * The runner's jump, as a scrubbed timeline: crouch, launch (stretched), gravity-shaped fall, landing squash and
     * a small recovery. `lift` is the normalised height of the arc; `stretch` is +1 fully stretched, -1 fully squashed.
     */
    createJump() {
      const pose = { lift: 0, stretch: 0 };
      const timeline = within(() => gsap.timeline({ paused: true })
        .to(pose, { stretch: -0.6, duration: 0.12, ease: 'power1.out' })
        .to(pose, { stretch: 0.7, lift: 1, duration: 0.38, ease: 'power3.out' })
        .to(pose, { stretch: 0, lift: 0, duration: 0.38, ease: 'power1.in' })
        .to(pose, { stretch: -0.5, duration: 0.07, ease: 'power1.out' })
        .to(pose, { stretch: 0, duration: 0.06, ease: 'back.out(1.7)' }));
      timeline.progress(0);
      return {
        pose,
        /** Scrub to a fraction (0–1) of the jump. */
        seek(fraction: number) { timeline.progress(Math.max(0, Math.min(1, fraction))); return pose; },
      };
    },

    /** Kill every animation and ScrollTrigger created here. */
    dispose() { context.revert(); },
  };
}

export type Flourishes = ReturnType<typeof createFlourishes>;
