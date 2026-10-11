<script setup lang="ts">
import { computed, onMounted, ref, useTemplateRef, watch } from 'vue'
import SegmentedControl from '../components/SegmentedControl.vue'
import { useEvents } from '../composables/useEvents'
import { useNow } from '../composables/useNow'
import { dailyCoups, dayLabel, plural } from '../lib/format'
import { previousRoute } from '../router'

const { events } = useEvents()
const now = useNow(60_000)

type Period = '7' | '14' | '30'
const period = ref<Period>('7')
const periodOptions: { value: Period; label: string }[] = [
  { value: '7', label: '7 jours' },
  { value: '14', label: '14 jours' },
  { value: '30', label: '30 jours' },
]

const days = computed(() => dailyCoups(events.value, Number(period.value), now.value))
const total = computed(() => days.value.reduce((n, d) => n + d.count, 0))
const average = computed(() => total.value / days.value.length)
const best = computed(() => Math.max(0, ...days.value.map((d) => d.count)))

const fmtAvg = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 1 })

/** Graduations « rondes » de l'axe vertical (4 intervalles au plus). */
const ticks = computed(() => {
  const max = Math.max(best.value, 4)
  const raw = max / 4
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw)!
  const out: number[] = []
  for (let v = 0; v < max + step; v += step) out.push(v)
  return out
})
const top = computed(() => ticks.value[ticks.value.length - 1])

/** Jour mis en avant (survol, toucher ou clavier) ; par défaut aujourd'hui. */
const selected = ref(-1)
watch(period, () => (selected.value = -1))
const current = computed(() => (selected.value < 0 ? days.value.length - 1 : selected.value))
const readout = computed(() => {
  const d = days.value[current.value]
  return `${dayLabel(d.t, now.value)} : ${d.count ? plural(d.count, 'coup', 'coups') : 'aucun coup'}`
})

/** Libellés de l'axe horizontal : tous sur 7/14 jours, un sur cinq (aujourd'hui inclus) sur 30. */
function showTick(i: number) {
  const n = days.value.length
  return n <= 14 || (n - 1 - i) % 5 === 0
}
const INITIALES = ['D', 'L', 'M', 'M', 'J', 'V', 'S']
const dayNum = (t: number) => new Date(t).getDate()
const dayInitial = (t: number) => INITIALES[new Date(t).getDay()]

/** Coordonnées des points dans un repère 0–100 (x au centre de chaque jour). */
const points = computed(() =>
  days.value.map((d, i) => ({
    x: ((i + 0.5) / days.value.length) * 100,
    y: 100 - (d.count / top.value) * 100,
  })),
)
const linePath = computed(() => points.value.map((p) => `${p.x},${p.y}`).join(' '))
const areaPath = computed(() => {
  const p = points.value
  return `${p[0].x},100 ${linePath.value} ${p[p.length - 1].x},100`
})

const plot = useTemplateRef<HTMLElement>('plot')
function pick(ev: PointerEvent) {
  const el = plot.value
  if (!el) return
  const r = el.getBoundingClientRect()
  const i = Math.floor(((ev.clientX - r.left) / r.width) * days.value.length)
  selected.value = Math.min(days.value.length - 1, Math.max(0, i))
}
function onKey(ev: KeyboardEvent) {
  const last = days.value.length - 1
  const moves: Record<string, number> = {
    ArrowLeft: current.value - 1,
    ArrowRight: current.value + 1,
    Home: 0,
    End: last,
  }
  if (!(ev.key in moves)) return
  ev.preventDefault()
  selected.value = Math.min(last, Math.max(0, moves[ev.key]))
}

const heading = useTemplateRef<HTMLElement>('heading')
onMounted(() => {
  if (previousRoute) heading.value?.focus()
})
</script>

<template>
  <main class="chart-view">
    <header class="chart-view__head">
      <RouterLink to="/historique" class="back" aria-label="Retour à l’historique">
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M15 6l-6 6 6 6" /></svg>
      </RouterLink>
      <h1 ref="heading" tabindex="-1">Évolution des coups</h1>
    </header>

    <SegmentedControl v-model="period" label="Période affichée" :options="periodOptions" />

    <dl class="stats">
      <div class="stat">
        <dt>Total</dt>
        <dd class="num">{{ total }}</dd>
      </div>
      <div class="stat">
        <dt>Moyenne par jour</dt>
        <dd class="num">{{ fmtAvg(average) }}</dd>
      </div>
      <div class="stat">
        <dt>Record</dt>
        <dd class="num">{{ best }}</dd>
      </div>
    </dl>

    <section class="card" aria-labelledby="chart-title">
      <h2 id="chart-title" class="card__title">Coups par jour</h2>

      <p v-if="!total" class="empty">Aucun coup enregistré sur cette période.</p>

      <template v-else>
        <p id="chart-readout" class="readout" aria-live="polite">{{ readout }}</p>

        <div class="chart">
          <div class="chart__y" aria-hidden="true">
            <span
              v-for="v in ticks"
              :key="v"
              class="num"
              :style="{ bottom: `${(v / top) * 100}%` }"
            >{{ v }}</span>
          </div>

          <div
            ref="plot"
            class="chart__plot"
            tabindex="0"
            role="group"
            aria-label="Graphique des coups par jour. Flèches gauche et droite pour parcourir les jours."
            aria-describedby="chart-readout"
            @pointermove="pick"
            @pointerdown="pick"
            @keydown="onKey"
          >
            <span
              v-for="v in ticks"
              :key="v"
              class="chart__grid"
              :class="{ 'chart__grid--base': v === 0 }"
              :style="{ bottom: `${(v / top) * 100}%` }"
              aria-hidden="true"
            />
            <span class="chart__cross" :style="{ left: `${points[current].x}%` }" aria-hidden="true" />
            <svg class="chart__svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">
              <polygon class="chart__area" :points="areaPath" />
              <polyline class="chart__line" :points="linePath" />
            </svg>
            <span
              v-for="(p, i) in points"
              v-show="days.length <= 14 || i === current"
              :key="days[i].key"
              class="chart__dot"
              :class="{ 'chart__dot--on': i === current }"
              :style="{ left: `${p.x}%`, bottom: `${100 - p.y}%` }"
              aria-hidden="true"
            />
          </div>

          <div class="chart__x" aria-hidden="true">
            <span v-for="(d, i) in days" :key="d.key" :class="{ 'is-on': i === current }">
              <template v-if="showTick(i)">
                <span v-if="days.length === 7" class="chart__wd">{{ dayInitial(d.t) }}</span>
                <span class="num">{{ dayNum(d.t) }}</span>
              </template>
            </span>
          </div>
        </div>
      </template>

      <details class="data">
        <summary>Voir les données</summary>
        <table>
          <thead>
            <tr><th scope="col">Jour</th><th scope="col">Coups</th></tr>
          </thead>
          <tbody>
            <tr v-for="d in [...days].reverse()" :key="d.key">
              <th scope="row">{{ dayLabel(d.t, now) }}</th>
              <td class="num">{{ d.count }}</td>
            </tr>
          </tbody>
        </table>
      </details>
    </section>
  </main>
</template>

<style scoped>
.chart-view {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  width: 100%;
  max-width: 36rem;
  margin: 0 auto;
  padding: max(clamp(1.25rem, 8vh, 4rem), env(safe-area-inset-top)) var(--gutter)
    max(2.125rem, env(safe-area-inset-bottom));
}

.chart-view__head {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.chart-view__head h1 {
  font-family: var(--font-display);
  font-size: clamp(1.75rem, 9vw, 2.125rem);
  font-weight: 700;
  line-height: 1.1;
  letter-spacing: -0.01em;
  min-width: 0;
  overflow-wrap: anywhere;
}
.chart-view__head h1:focus {
  outline: none;
}
.chart-view__head h1:focus-visible {
  outline: 3px solid var(--focus);
}
.back {
  flex: none;
  width: 3rem;
  height: 3rem;
  border: 2px solid transparent;
  border-radius: 50%;
  background: var(--surface);
  display: flex;
  align-items: center;
  justify-content: center;
}
.back svg {
  width: 1.375rem;
  height: 1.375rem;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.5rem;
}
.stat {
  display: flex;
  flex-direction: column-reverse;
  gap: 0.125rem;
  justify-content: flex-end;
  padding: 0.75rem clamp(0.625rem, 3vw, 1rem);
  border-radius: var(--radius-card);
  background: var(--surface);
}
.stat dt {
  font-size: 0.8125rem;
  line-height: 1.25;
  color: var(--muted);
}
.stat dd {
  font-size: 1.75rem;
  font-weight: 700;
  line-height: 1.1;
}

.card {
  border-radius: var(--radius-card);
  background: var(--surface);
  padding: 1rem clamp(0.75rem, 4vw, 1.25rem);
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.card__title {
  font-size: 1rem;
  font-weight: 800;
}
.empty {
  padding: 2rem 0.5rem;
  text-align: center;
  color: var(--muted);
}
.readout {
  font-size: 0.9375rem;
  font-weight: 700;
  min-height: 1.3em;
}

.chart {
  --y-w: 1.75rem;
  display: grid;
  grid-template-columns: var(--y-w) 1fr;
  grid-template-rows: 12rem auto;
  column-gap: 0.375rem;
}
.chart__y {
  position: relative;
}
.chart__y span {
  position: absolute;
  right: 0;
  transform: translateY(50%);
  font-size: 0.75rem;
  color: var(--muted);
  line-height: 1;
}

.chart__plot {
  position: relative;
  touch-action: pan-y;
  border-radius: 4px;
}
.chart__plot:focus-visible {
  outline-offset: 6px;
}
.chart__grid {
  position: absolute;
  left: 0;
  right: 0;
  height: 0;
  border-top: 1px solid var(--line);
  pointer-events: none;
}
.chart__grid--base {
  border-top-color: var(--track);
  border-top-width: 2px;
  margin-bottom: -1px;
}
.chart__svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
}
.chart__area {
  fill: var(--coup-tint);
  opacity: 0.6;
}
.chart__line {
  fill: none;
  stroke: var(--coup);
  stroke-width: 2;
  stroke-linejoin: round;
  stroke-linecap: round;
  vector-effect: non-scaling-stroke;
}
.chart__cross {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 0;
  border-left: 1px dashed var(--muted);
  pointer-events: none;
}
.chart__dot {
  position: absolute;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--coup);
  box-shadow: 0 0 0 2px var(--surface);
  transform: translate(-50%, 50%);
  pointer-events: none;
}
.chart__dot--on {
  width: 12px;
  height: 12px;
}

.chart__x {
  grid-column: 2;
  display: flex;
  padding-top: 0.375rem;
}
.chart__x > span {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  font-size: 0.75rem;
  line-height: 1.25;
  color: var(--muted);
  white-space: nowrap;
}
.chart__x > span.is-on {
  color: var(--ink);
  font-weight: 700;
}
.chart__wd {
  font-weight: 700;
}

.data summary {
  cursor: pointer;
  min-height: 2.75rem;
  display: flex;
  align-items: center;
  font-weight: 700;
  font-size: 0.9375rem;
}
.data table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9375rem;
}
.data th,
.data td {
  padding: 0.5rem 0;
  text-align: left;
  border-top: 1px solid var(--line);
}
.data thead th {
  border-top: 0;
  color: var(--muted);
  font-weight: 600;
}
.data tbody th {
  font-weight: 500;
}
.data td,
.data thead th:last-child {
  text-align: right;
  font-weight: 600;
}

@media (forced-colors: active) {
  .chart__line {
    stroke: CanvasText;
  }
  .chart__area {
    display: none;
  }
  .chart__dot {
    background: CanvasText;
  }
  .chart__dot--on {
    background: Highlight;
  }
}
</style>
