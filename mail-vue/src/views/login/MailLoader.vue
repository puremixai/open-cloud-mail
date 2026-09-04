<template>
  <transition name="mail-loader-fade">
    <div v-if="!closing" class="mail-loader-overlay" role="presentation">
      <div class="mail-loader">
        <svg class="mail-loader__art" viewBox="0 0 320 280" aria-hidden="true" focusable="false">
          <defs>
            <linearGradient id="envelope-back-gradient" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stop-color="#267ee9"></stop>
              <stop offset="0.55" stop-color="#176bd9"></stop>
              <stop offset="1" stop-color="#2753c9"></stop>
            </linearGradient>
            <linearGradient id="opening-gradient" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stop-color="#37c4ef"></stop>
              <stop offset="0.48" stop-color="#178ce0"></stop>
              <stop offset="1" stop-color="#6a67e8"></stop>
            </linearGradient>
            <linearGradient id="flap-gradient" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stop-color="#3a8ef0"></stop>
              <stop offset="0.62" stop-color="#246edc"></stop>
              <stop offset="1" stop-color="#6665e5"></stop>
            </linearGradient>
            <linearGradient id="paper-back-gradient" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stop-color="#1c79e8"></stop>
              <stop offset="1" stop-color="#344dc5"></stop>
            </linearGradient>
            <linearGradient id="paper-gradient" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stop-color="#fff7d6"></stop>
              <stop offset="0.52" stop-color="#f2edd4"></stop>
              <stop offset="1" stop-color="#dce9e8"></stop>
            </linearGradient>
            <linearGradient id="front-left-gradient" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stop-color="#62d2f1"></stop>
              <stop offset="1" stop-color="#28b0e8"></stop>
            </linearGradient>
            <linearGradient id="front-right-gradient" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stop-color="#269ee8"></stop>
              <stop offset="1" stop-color="#0878db"></stop>
            </linearGradient>
            <linearGradient id="front-face-gradient" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stop-color="#36bce9"></stop>
              <stop offset="0.55" stop-color="#138fdf"></stop>
              <stop offset="1" stop-color="#0873d4"></stop>
            </linearGradient>
            <filter id="mail-loader-soft-shadow" x="-30%" y="-30%" width="160%" height="180%">
              <feDropShadow dx="0" dy="9" stdDeviation="7" flood-color="#1261c7" flood-opacity="0.18"></feDropShadow>
            </filter>
          </defs>

          <ellipse class="mail-loader__shadow" cx="160" cy="241" rx="92" ry="11"></ellipse>

          <path class="mail-loader__envelope-back" d="M57 124c0-15 8-26 22-33l63-31c11-5 23-5 34 0l63 31c14 7 22 18 22 33v87c0 14-11 25-25 25H82c-14 0-25-11-25-25z"></path>
          <path class="mail-loader__opening" d="M57 124c3-12 15-20 29-20l58 32c10 6 22 6 32 0l58-32c14 0 26 8 29 20l-89 58c-8 5-20 5-28 0z"></path>

          <path class="mail-loader__flap" d="m59 121 90-53c7-4 15-4 22 0l90 53-83 43c-10 6-22 6-32 0z"></path>

          <g class="mail-loader__paper">
            <path class="mail-loader__paper-shadow" d="m113 51 86-20c10-2 18 4 20 14l21 105c2 10-4 19-14 21l-85 18c-10 2-19-4-21-14L99 70c-2-9 4-17 14-19z"></path>
            <path class="mail-loader__paper-back" d="m109 47 81-21c9-2 18 3 20 12l23 103c2 10-4 18-14 20l-80 19c-9 2-18-4-20-13L98 66c-2-9 3-17 11-19z"></path>
            <path class="mail-loader__paper-sheet" d="m132 48 75-14c9-2 16 4 18 13l19 92c2 9-4 17-13 19l-73 14c-9 2-17-4-19-13l-19-92c-2-9 4-17 12-19z"></path>
            <path class="mail-loader__paper-fold" d="m207 34 20 5c-8 3-12 8-10 16l5 22-20-23c-6-8-3-17 5-20z"></path>
          </g>

          <path class="mail-loader__front-face" d="M57 125 143 183c10 7 19 10 29 10s19-3 29-10l62-58v86c0 14-11 25-25 25H82c-14 0-25-11-25-25z"></path>
          <path class="mail-loader__front-right" d="M263 125 177 183c-7 5-13 8-19 9v42h80c14 0 25-11 25-25z"></path>
          <path class="mail-loader__front-left" d="M57 125 143 183c10 7 19 10 29 10 7 0 14-2 20-6l7 8c3 9 0 18-7 27-8 10-18 14-32 14H82c-14 0-25-11-25-25z"></path>
          <path class="mail-loader__front-highlight" d="M57 125 143 183c10 7 19 10 29 10 6 0 12-2 17-5-3 8-9 14-17 19-11 7-21 11-34 11H82c-14 0-25-11-25-25z"></path>
          <path class="mail-loader__crease" d="m58 126 85 57c10 7 19 10 29 10s19-3 29-10l62-57"></path>
        </svg>
      </div>
    </div>
  </transition>
</template>

<script setup>
import { onMounted, ref } from 'vue'

const emit = defineEmits(['done'])

const closing = ref(false)
const ANIMATION_DURATION = 3200
const FADE_DURATION = 700

onMounted(() => {
  setTimeout(() => {
    closing.value = true
    setTimeout(() => emit('done'), FADE_DURATION)
  }, ANIMATION_DURATION)
})
</script>

<style scoped>
.mail-loader-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: grid;
  place-items: center;
  overflow: hidden;
  background: #fff;
  isolation: isolate;
}

.mail-loader {
  display: grid;
  width: min(74vw, 286px);
  aspect-ratio: 320 / 280;
  place-items: center;
  transform: translateY(-4.5vh);
}

.mail-loader__art {
  display: block;
  width: 100%;
  height: auto;
  overflow: visible;
}

.mail-loader__shadow {
  fill: rgba(32, 92, 178, 0.16);
  filter: blur(6px);
  transform-origin: 50% 50%;
  animation: mail-loader-shadow-settle 900ms var(--mail-ease-out, cubic-bezier(0.22, 0.61, 0.36, 1)) both;
}

.mail-loader__envelope-back {
  fill: url(#envelope-back-gradient);
  filter: url(#mail-loader-soft-shadow);
}

.mail-loader__opening {
  fill: url(#opening-gradient);
}

.mail-loader__paper {
  transform-box: fill-box;
  transform-origin: 50% 100%;
  animation: mail-loader-paper-rise 3200ms var(--mail-ease-out, cubic-bezier(0.22, 0.61, 0.36, 1)) infinite both;
}

.mail-loader__paper-shadow {
  fill: rgba(28, 62, 133, 0.2);
  filter: blur(3px);
}

.mail-loader__paper-back {
  fill: url(#paper-back-gradient);
  stroke: rgba(19, 73, 164, 0.12);
  stroke-width: 1.5;
}

.mail-loader__paper-sheet {
  fill: url(#paper-gradient);
  stroke: rgba(208, 192, 143, 0.18);
  stroke-width: 1.2;
}

.mail-loader__paper-fold {
  fill: rgba(255, 255, 255, 0.32);
}

.mail-loader__flap {
  fill: url(#flap-gradient);
  transform-box: fill-box;
  transform-origin: 50% 100%;
  animation: mail-loader-envelope-open 3200ms var(--mail-ease-open, cubic-bezier(0.2, 0.78, 0.24, 1)) infinite both;
}

.mail-loader__front-face {
  fill: url(#front-face-gradient);
}

.mail-loader__front-left {
  fill: url(#front-left-gradient);
}

.mail-loader__front-right {
  fill: url(#front-right-gradient);
}

.mail-loader__front-highlight {
  fill: rgba(126, 226, 246, 0.26);
}

.mail-loader__crease {
  fill: none;
  stroke: rgba(8, 87, 190, 0.24);
  stroke-linecap: round;
  stroke-width: 1.8;
}

.mail-loader-fade-leave-active {
  transition: opacity 700ms ease;
}

.mail-loader-fade-leave-to {
  opacity: 0;
}

@keyframes mail-loader-paper-rise {
  0%,
  14% {
    opacity: 0;
    transform: translateY(30px) scale(0.82) rotate(-8deg);
  }
  34% {
    opacity: 1;
    transform: translateY(-10px) scale(1.025) rotate(-8deg);
  }
  46%,
  72% {
    opacity: 1;
    transform: translateY(0) scale(1) rotate(-8deg);
  }
  100% {
    opacity: 0;
    transform: translateY(30px) scale(0.82) rotate(-8deg);
  }
}

@keyframes mail-loader-envelope-open {
  0%,
  14% {
    opacity: 0.98;
    transform: translateY(4px) rotateX(0deg) scaleY(1);
  }
  34% {
    opacity: 1;
    transform: translateY(-27px) rotateX(58deg) scaleY(0.7);
  }
  46%,
  72% {
    opacity: 1;
    transform: translateY(-40px) rotateX(74deg) scaleY(0.54);
  }
  100% {
    opacity: 0.98;
    transform: translateY(4px) rotateX(0deg) scaleY(1);
  }
}

@keyframes mail-loader-shadow-settle {
  from {
    opacity: 0;
    transform: scaleX(0.74);
  }
  to {
    opacity: 1;
    transform: scaleX(1);
  }
}

@media (max-width: 560px) {
  .mail-loader {
    width: min(78vw, 272px);
    transform: translateY(-5vh);
  }
}

@media (prefers-reduced-motion: reduce) {
  .mail-loader__shadow,
  .mail-loader__paper,
  .mail-loader__flap {
    opacity: 1;
    transform: none;
    animation: none !important;
  }
}
</style>
