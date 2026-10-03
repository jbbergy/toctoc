<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue'
import SegmentedControl from '../components/SegmentedControl.vue'
import { useEvents } from '../composables/useEvents'
import { useNow } from '../composables/useNow'
import { announce } from '../composables/useAnnouncer'
import { mode } from '../composables/useMode'
import { ago, clock, dayKey, fmtDur, gapMinutes, pad } from '../lib/format'
import { previousRoute } from '../router'
import type { EventKind } from '../db/types'

/** Durée d'appui à partir de laquelle on mesure la contraction. */
const HOLD_MS = 1500

const { events, add, remove } = useEvents()
const now = useNow()

const isCoup = computed(() => mode.value === 'coup')
const modeOptions: { value: EventKind; label: string; activeBg: string }[] = [
  { value: 'coup', label: 'Coups', activeBg: 'var(--coup)' },
  { value: 'contraction', label: 'Contractions', activeBg: 'var(--contr)' },
]

const ofKind = computed(() => events.value.filter((e) => e.kind === mode.value))
const last = computed(() => ofKind.value[0])

/* ---------- Appui court / maintenu ---------- */

const pressed = ref(false)
const heldMs = ref(0)
const justLogged = ref(false)
let downAt: number | null = null
let captured = false
let skipClickUntil = 0
let holdTicker: ReturnType<typeof setInterval> | undefined
let flashTimer: ReturnType<typeof setTimeout> | undefined

const holding = computed(() => !isCoup.value && pressed.value && heldMs.value >= HOLD_MS)
const holdTime = computed(() => {
  const s = Math.floor(heldMs.value / 1000)
  return `${Math.floor(s / 60)}:${pad(s % 60)}`
})

watch(holding, (h) => {
  if (h) announce('Chronométrage de la contraction en cours. Relâchez à la fin.')
})

function pressStart() {
  downAt = Date.now()
  heldMs.value = 0
  pressed.value = true
  justLogged.value = false
  clearInterval(holdTicker)
  if (!isCoup.value) {
    holdTicker = setInterval(() => {
      if (downAt) heldMs.value = Date.now() - downAt
    }, 250)
  }
}

/** Termine l'appui. Renvoie true si une contraction chronométrée a été enregistrée. */
function release(commit: boolean): boolean {
  if (downAt === null) return false
  const start = downAt
  const held = Date.now() - start
  downAt = null
  clearInterval(holdTicker)
  pressed.value = false
  heldMs.value = 0
  if (commit && !isCoup.value && held >= HOLD_MS) {
    skipClickUntil = Date.now() + 500
    void record(new Date(start), held)
    return true
  }
  return false
}

async function record(at?: Date, durationMs?: number) {
  const kind = mode.value
  const e = await add(kind, at, durationMs)
  justLogged.value = true
  clearTimeout(flashTimer)
  flashTimer = setTimeout(() => (justLogged.value = false), 2200)
  try {
    navigator.vibrate?.(30)
  } catch {
    /* non supporté */
  }
  const what = kind === 'coup' ? 'Coup enregistré' : 'Contraction enregistrée'
  announce(`${what} à ${clock(e.t)}${e.durationMs ? `, durée ${fmtDur(e.durationMs)}` : ''}.`)
}

function onPointerDown(e: PointerEvent) {
  if (e.button !== 0) return
  captured = false
  try {
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    captured = true
  } catch {
    /* capture impossible */
  }
  pressStart()
}

function onPointerLeave() {
  if (!captured) release(false)
}

function onClick() {
  if (Date.now() < skipClickUntil) return
  downAt = null
  clearInterval(holdTicker)
  pressed.value = false
  void record()
}

// Clavier : maintenir Espace chronomètre la contraction (alternative à l'appui long).
function onKeyDown(e: KeyboardEvent) {
  if (e.key === ' ' && !e.repeat) pressStart()
  else if (e.key === 'Enter' && e.repeat) e.preventDefault()
}

function onKeyUp(e: KeyboardEvent) {
  if (e.key !== ' ') return
  // Empêche le « click » natif déclenché par Espace si la contraction a été chronométrée.
  if (release(true)) e.preventDefault()
}

onBeforeUnmount(() => {
  clearInterval(holdTicker)
  clearTimeout(flashTimer)
})

/* ---------- Résumé ---------- */

const lastLabel = computed(() => (isCoup.value ? 'Dernier coup' : 'Dernière contraction'))
const lastTime = computed(() => (last.value ? clock(last.value.t) : '—'))
const lastSub = computed(() => {
  if (!last.value) return 'Aucun enregistrement'
  return last.value.durationMs ? `Durée ${fmtDur(last.value.durationMs)}` : ago(last.value.t, now.value)
})

const stat = computed(() => {
  if (isCoup.value) {
    const today = dayKey(now.value)
    const n = ofKind.value.filter((e) => dayKey(e.t) === today).length
    return { label: 'Aujourd’hui', value: String(n), sub: n > 1 ? 'coups' : 'coup' }
  }
  const [a, b] = ofKind.value
  const gap = a ? gapMinutes(a, b) : null
  return {
    label: 'Intervalle',
    value: gap ? `${gap} min` : '—',
    sub: 'entre les deux dernières',
  }
})

const hint = computed(() => {
  if (holding.value) return 'Relâcher à la fin de la contraction'
  if (justLogged.value && last.value) {
    const d = last.value.durationMs ? ` · ${fmtDur(last.value.durationMs)}` : ''
    return `Enregistré à ${clock(last.value.t)}${d}`
  }
  return isCoup.value ? 'Toucher pour enregistrer' : 'Toucher, ou maintenir pour mesurer la durée'
})

watch(mode, () => {
  justLogged.value = false
  release(false)
})

const undoLabel = computed(() =>
  isCoup.value ? 'Annuler le dernier coup' : 'Annuler la dernière contraction',
)

async function undo() {
  if (!last.value) return
  const wasCoup = isCoup.value
  await remove(last.value.id)
  justLogged.value = false
  announce(wasCoup ? 'Dernier coup supprimé.' : 'Dernière contraction supprimée.')
}

/* ---------- Focus au retour de l'historique ---------- */

const historyLink = useTemplateRef<{ $el: HTMLElement }>('historyLink')
onMounted(() => {
  if (previousRoute === 'history') historyLink.value?.$el.focus()
})
</script>

<template>
  <main class="home" :class="isCoup ? 'is-coup' : 'is-contr'">
    <h1 class="visually-hidden">Suivi des coups et contractions</h1>

    <SegmentedControl v-model="mode" label="Type d’enregistrement" :options="modeOptions" size="lg" />

    <div class="big-wrap">
      <button
        type="button"
        class="big"
        :class="{ 'is-pressed': pressed, 'is-holding': holding }"
        :aria-describedby="isCoup ? undefined : 'big-kbd-tip'"
        @click="onClick"
        @pointerdown="onPointerDown"
        @pointerup="release(true)"
        @pointercancel="release(false)"
        @pointerleave="onPointerLeave"
        @keydown="onKeyDown"
        @keyup="onKeyUp"
        @blur="release(false)"
        @contextmenu.prevent
      >
        <span class="big__label num">
          {{ holding ? holdTime : isCoup ? 'Coup' : 'Contraction' }}
        </span>
        <span class="big__hint">{{ hint }}</span>
      </button>
      <p id="big-kbd-tip" class="visually-hidden">
        Au clavier, maintenez la barre d’espace pour mesurer la durée.
      </p>
    </div>

    <section class="summary" aria-label="Résumé">
      <dl class="summary__cell">
        <dt>{{ lastLabel }}</dt>
        <dd class="summary__value num">{{ lastTime }}</dd>
        <dd class="summary__sub">{{ lastSub }}</dd>
      </dl>
      <dl class="summary__cell">
        <dt>{{ stat.label }}</dt>
        <dd class="summary__value num">{{ stat.value }}</dd>
        <dd class="summary__sub">{{ stat.sub }}</dd>
      </dl>
    </section>

    <button type="button" class="undo" :disabled="!last" @click="undo">
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M9 14 4 9l5-5" />
        <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
      </svg>
      <span>{{ undoLabel }}</span>
    </button>

    <RouterLink ref="historyLink" to="/historique" class="history-link">
      <svg class="history-link__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" />
      </svg>
      <span class="history-link__label">Historique</span>
      <svg class="history-link__chevron" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M9 6l6 6-6 6" />
      </svg>
    </RouterLink>
  </main>
</template>

<style scoped>
.home {
  --accent: var(--coup);
  --tint: var(--coup-tint);
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  width: 100%;
  max-width: 30rem;
  margin: 0 auto;
  padding: max(clamp(1.25rem, 8vh, 4rem), env(safe-area-inset-top)) var(--gutter)
    max(clamp(1rem, 4vh, 2.125rem), env(safe-area-inset-bottom));
}
.home.is-contr {
  --accent: var(--contr);
  --tint: var(--contr-tint);
}

/* ---------- Gros bouton ---------- */

.big-wrap {
  --ring: clamp(0.875rem, 5.5vw, 1.375rem);
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: calc(var(--ring) + 0.5rem) 0;
}
.big {
  container-type: inline-size;
  width: min(18rem, 100% - 2 * var(--ring));
  aspect-ratio: 1;
  padding: 1rem;
  border-radius: 50%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.625rem;
  color: #fff;
  background: var(--accent);
  box-shadow: 0 0 0 var(--ring) var(--tint);
  transition:
    transform 120ms ease,
    background-color 200ms ease,
    box-shadow 200ms ease;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
  -webkit-tap-highlight-color: transparent;
}
.big:focus-visible {
  /* L'anneau teinté masque l'outline par défaut : on le place au-delà. */
  outline-offset: calc(var(--ring) + 3px);
}
.big.is-pressed {
  transform: scale(0.96);
}
.big__label {
  font-size: clamp(1.5rem, 14cqi, 2.5rem);
  font-weight: 700;
  line-height: 1.1;
  letter-spacing: -0.01em;
}
.big.is-holding .big__label {
  font-size: clamp(2.5rem, 22cqi, 4rem);
}
.big__hint {
  max-width: 78%;
  font-size: clamp(0.875rem, 5.6cqi, 1rem);
  font-weight: 600;
  line-height: 1.3;
  text-align: center;
}

/* ---------- Résumé ---------- */

.summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 7.5rem), 1fr));
  border-radius: var(--radius-card);
  background: var(--surface);
  overflow: hidden;
}
.summary__cell {
  padding: 1rem clamp(0.875rem, 5vw, 1.25rem);
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  /* Séparateur qui fonctionne aussi quand les cellules passent l'une sous l'autre. */
  box-shadow: -1px -1px 0 var(--line);
  min-width: 0;
}
.summary dt,
.summary__sub {
  font-size: 0.875rem;
  color: var(--muted);
}
.summary dt {
  font-weight: 600;
}
.summary__value {
  font-size: clamp(1.5rem, 8vw, 1.875rem);
  font-weight: 700;
  line-height: 1.15;
}

/* ---------- Actions ---------- */

.undo {
  align-self: center;
  min-height: 2.75rem;
  padding: 0.25rem 1rem;
  border-radius: 999px;
  background: transparent;
  font-size: 0.9375rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  text-align: left;
}
.undo:disabled {
  opacity: 0.4;
}
.undo svg {
  flex: none;
  width: 1.25rem;
  height: 1.25rem;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.history-link {
  min-height: 3.5rem;
  padding: 0.5rem 1.25rem;
  border: 2px solid transparent;
  border-radius: 999px;
  background: var(--surface);
  font-size: 1.0625rem;
  font-weight: 700;
  text-decoration: none;
  display: flex;
  align-items: center;
  gap: 0.625rem;
}
.history-link svg {
  flex: none;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.history-link__icon {
  width: 1.375rem;
  height: 1.375rem;
}
.history-link__chevron {
  width: 1.25rem;
  height: 1.25rem;
}
.history-link__label {
  flex: 1;
}
</style>
