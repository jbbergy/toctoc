<script setup lang="ts">
import { computed, nextTick, onMounted, ref, useTemplateRef, watch } from 'vue'
import SegmentedControl from '../components/SegmentedControl.vue'
import KindIcon from '../components/KindIcon.vue'
import AddEntryDialog from '../components/AddEntryDialog.vue'
import { useEvents } from '../composables/useEvents'
import { useNow } from '../composables/useNow'
import { announce } from '../composables/useAnnouncer'
import { clock, dayLabel, fmtDur, groupHistory, plural, type Filter } from '../lib/format'
import type { EventKind } from '../db/types'
import { previousRoute } from '../router'

const { events, add } = useEvents()
const now = useNow(60_000)

const filter = ref<Filter>('tout')
const filterOptions: { value: Filter; label: string }[] = [
  { value: 'tout', label: 'Tout' },
  { value: 'coups', label: 'Coups' },
  { value: 'contractions', label: 'Contractions' },
]

const groups = computed(() => groupHistory(events.value, filter.value, now.value))
const total = computed(() => groups.value.reduce((n, g) => n + g.items.length, 0))

watch(filter, () => {
  announce(total.value ? `${plural(total.value, 'entrée affichée', 'entrées affichées')}.` : 'Aucune entrée.')
})

/* ---------- Saisie manuelle ---------- */

const addDialog = useTemplateRef<InstanceType<typeof AddEntryDialog>>('addDialog')

function openAdd() {
  addDialog.value?.open(filter.value === 'contractions' ? 'contraction' : 'coup')
}

async function onAdd(entry: { kind: EventKind; at: Date; durationMs?: number }) {
  try {
    const e = await add(entry.kind, entry.at, entry.durationMs)
    // Si le filtre masquerait la nouvelle entrée, on revient à « Tout ».
    if (filter.value !== 'tout' && (filter.value === 'coups') !== (e.kind === 'coup')) {
      filter.value = 'tout'
    }
    const what = e.kind === 'coup' ? 'Coup ajouté' : 'Contraction ajoutée'
    const day = dayLabel(e.t, Date.now()).toLowerCase()
    const dur = e.durationMs ? `, durée ${fmtDur(e.durationMs)}` : ''
    // Après l'annonce éventuelle du changement de filtre, pour qu'elle ne l'écrase pas.
    await nextTick()
    announce(`${what} : ${day} à ${clock(e.t)}${dur}.`)
  } catch (err) {
    console.error(err)
    announce('L’entrée n’a pas pu être enregistrée.')
  }
}

const heading = useTemplateRef<HTMLElement>('heading')
onMounted(() => {
  if (previousRoute) heading.value?.focus()
})
</script>

<template>
  <main class="history">
    <header class="history__head">
      <RouterLink to="/" class="back" aria-label="Retour à l’accueil">
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M15 6l-6 6 6 6" /></svg>
      </RouterLink>
      <h1 ref="heading" tabindex="-1">Historique</h1>
    </header>

    <SegmentedControl v-model="filter" label="Filtrer l’historique" :options="filterOptions" />

    <div class="actions">
      <button type="button" class="action" aria-haspopup="dialog" @click="openAdd">
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 5v14M5 12h14" /></svg>
        <span>Ajouter une entrée</span>
      </button>
      <RouterLink to="/historique/graphique" class="action">
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 20V12M12 20V5M19 20v-9" /></svg>
        <span>Graphique des coups</span>
      </RouterLink>
    </div>

    <p v-if="!groups.length" class="empty">
      Rien pour l’instant. Ce que vous enregistrez apparaîtra ici.
    </p>

    <section
      v-for="g in groups"
      :key="g.key"
      class="day"
      :aria-labelledby="`day-${g.key}`"
    >
      <div class="day__head">
        <h2 :id="`day-${g.key}`">{{ g.day }}</h2>
        <p class="day__summary">{{ g.summary }}</p>
      </div>
      <ul class="day__list">
        <li v-for="it in g.items" :key="it.id" class="item" :class="`item--${it.kind}`">
          <span class="item__icon"><KindIcon :kind="it.kind" /></span>
          <span class="item__body">
            <span class="item__title">{{ it.kind === 'coup' ? 'Coup' : 'Contraction' }}</span>
            <span v-if="it.sub" class="item__sub">{{ it.sub }}</span>
          </span>
          <time class="item__time num" :datetime="it.iso">{{ it.time }}</time>
        </li>
      </ul>
    </section>

    <AddEntryDialog ref="addDialog" @submit="onAdd" />
  </main>
</template>

<style scoped>
.history {
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

.history__head {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.history__head h1 {
  font-family: var(--font-display);
  font-size: clamp(1.75rem, 9vw, 2.125rem);
  font-weight: 700;
  line-height: 1.1;
  letter-spacing: -0.01em;
  min-width: 0;
  overflow-wrap: anywhere;
}
.history__head h1:focus {
  outline: none;
}
.history__head h1:focus-visible {
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

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.action {
  flex: 1 1 12rem;
  min-height: 3rem;
  padding: 0.5rem 1.25rem;
  border-radius: 999px;
  background: var(--surface);
  font-size: 1rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  text-decoration: none;
}
.action svg {
  flex: none;
  width: 1.25rem;
  height: 1.25rem;
  fill: none;
  stroke: currentColor;
  stroke-width: 2.25;
  stroke-linecap: round;
}

.empty {
  padding: 3rem 1rem;
  text-align: center;
  font-size: 1rem;
  line-height: 1.45;
  color: var(--muted);
}

.day {
  margin-bottom: 0.25rem;
}
.day__head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  column-gap: 0.75rem;
  padding: 0 0.25rem 0.5rem;
}
.day__head h2 {
  font-size: 1rem;
  font-weight: 800;
}
.day__summary {
  font-size: 0.875rem;
  color: var(--muted);
}
.day__list {
  border-radius: var(--radius-card);
  background: var(--surface);
  padding: 0 clamp(0.75rem, 4vw, 1rem);
}

.item {
  --c: var(--coup);
  --t: var(--coup-tint);
  min-height: 3.75rem;
  padding: 0.5rem 0;
  display: flex;
  align-items: center;
  gap: clamp(0.5rem, 3vw, 0.75rem);
}
.item + .item {
  border-top: 1px solid var(--line);
}
.item--contraction {
  --c: var(--contr);
  --t: var(--contr-tint);
}
.item__icon {
  flex: none;
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--t);
  color: var(--c);
}
.item__body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.item__title {
  font-size: 1.0625rem;
  font-weight: 600;
}
.item__sub {
  font-size: 0.875rem;
  color: var(--muted);
}
.item__time {
  flex: none;
  font-size: 1.25rem;
  font-weight: 600;
}
</style>
