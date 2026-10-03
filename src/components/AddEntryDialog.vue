<script setup lang="ts">
import { computed, nextTick, reactive, ref, useTemplateRef } from 'vue'
import type { EventKind } from '../db/types'
import {
  defaultEntry,
  MAX_DURATION_MIN,
  parseManualEntry,
  type ManualEntryField,
} from '../lib/manualEntry'

const emit = defineEmits<{
  submit: [entry: { kind: EventKind; at: Date; durationMs?: number }]
}>()

const dialog = useTemplateRef<HTMLDialogElement>('dialog')
const form = reactive(defaultEntry('coup'))
const errors = ref<Partial<Record<ManualEntryField, string>>>({})
const saving = ref(false)
const isContr = computed(() => form.kind === 'contraction')

const kinds: { value: EventKind; label: string }[] = [
  { value: 'coup', label: 'Coup' },
  { value: 'contraction', label: 'Contraction' },
]

/** Ouvre la fenêtre, pré-remplie avec la date et l'heure actuelles. */
function open(kind: EventKind = 'coup') {
  Object.assign(form, defaultEntry(kind))
  errors.value = {}
  dialog.value?.showModal()
}

function close() {
  dialog.value?.close()
}

const FIELD_IDS: Record<ManualEntryField, string> = {
  date: 'entry-date',
  time: 'entry-time',
  duration: 'entry-min',
}

async function onSubmit() {
  const res = parseManualEntry(form)
  if (!res.ok) {
    errors.value = res.errors
    await nextTick()
    // Place le focus sur le premier champ en erreur (WCAG 3.3.1).
    const first = (['date', 'time', 'duration'] as const).find((f) => res.errors[f])
    if (first) document.getElementById(FIELD_IDS[first])?.focus()
    return
  }
  errors.value = {}
  saving.value = true
  try {
    emit('submit', { kind: form.kind, at: res.at, durationMs: res.durationMs })
    close()
  } finally {
    saving.value = false
  }
}

defineExpose({ open })
</script>

<template>
  <dialog ref="dialog" class="dlg" aria-labelledby="entry-title">
    <form class="dlg__form" novalidate @submit.prevent="onSubmit">
      <div class="dlg__head">
        <h2 id="entry-title">Ajouter une entrée</h2>
        <button type="button" class="dlg__close" aria-label="Fermer" @click="close">
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6 6 18" /></svg>
        </button>
      </div>

      <fieldset class="field">
        <legend class="field__label">Type</legend>
        <div class="kinds">
          <label v-for="k in kinds" :key="k.value" class="kind" :class="`kind--${k.value}`">
            <input
              v-model="form.kind"
              type="radio"
              name="entry-kind"
              :value="k.value"
              :autofocus="form.kind === k.value"
            />
            <span>{{ k.label }}</span>
          </label>
        </div>
      </fieldset>

      <div class="row">
        <div class="field">
          <label class="field__label" for="entry-date">Date</label>
          <input
            id="entry-date"
            v-model="form.date"
            class="input"
            type="date"
            required
            :aria-invalid="!!errors.date"
            :aria-describedby="errors.date ? 'entry-date-err' : undefined"
          />
          <p v-if="errors.date" id="entry-date-err" class="field__error">{{ errors.date }}</p>
        </div>
        <div class="field">
          <label class="field__label" for="entry-time">Heure</label>
          <input
            id="entry-time"
            v-model="form.time"
            class="input"
            type="time"
            required
            :aria-invalid="!!errors.time"
            :aria-describedby="errors.time ? 'entry-time-err' : undefined"
          />
          <p v-if="errors.time" id="entry-time-err" class="field__error">{{ errors.time }}</p>
        </div>
      </div>

      <fieldset
        v-if="isContr"
        class="field"
        :aria-describedby="errors.duration ? 'entry-dur-hint entry-dur-err' : 'entry-dur-hint'"
      >
        <legend class="field__label">Durée <span class="field__opt">(facultatif)</span></legend>
        <p id="entry-dur-hint" class="field__hint">{{ MAX_DURATION_MIN }} minutes maximum.</p>
        <div class="row row--dur">
          <div class="dur">
            <input
              id="entry-min"
              v-model="form.minutes"
              class="input"
              type="text"
              inputmode="numeric"
              autocomplete="off"
              maxlength="2"
              :aria-invalid="!!errors.duration"
            />
            <label for="entry-min">min</label>
          </div>
          <div class="dur">
            <input
              id="entry-sec"
              v-model="form.seconds"
              class="input"
              type="text"
              inputmode="numeric"
              autocomplete="off"
              maxlength="2"
              :aria-invalid="!!errors.duration"
            />
            <label for="entry-sec">s</label>
          </div>
        </div>
        <p v-if="errors.duration" id="entry-dur-err" class="field__error">{{ errors.duration }}</p>
      </fieldset>

      <div class="dlg__actions">
        <button type="button" class="btn btn--ghost" @click="close">Annuler</button>
        <button type="submit" class="btn btn--primary" :disabled="saving">Ajouter</button>
      </div>
    </form>
  </dialog>
</template>

<style scoped>
.dlg {
  width: min(100% - 1.5rem, 28rem);
  max-width: none;
  max-height: calc(100dvh - 1.5rem);
  margin: auto;
  padding: 0;
  border: 2px solid transparent;
  border-radius: var(--radius-card);
  background: var(--surface);
  color: var(--ink);
  overflow-y: auto;
}
.dlg::backdrop {
  background: rgb(26 28 43 / 0.5);
}
.dlg__form {
  display: flex;
  flex-direction: column;
  gap: 1.125rem;
  padding: clamp(1rem, 5vw, 1.5rem);
}
.dlg__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}
.dlg__head h2 {
  font-family: var(--font-display);
  font-size: clamp(1.375rem, 7vw, 1.625rem);
  font-weight: 700;
  line-height: 1.15;
  min-width: 0;
}
.dlg__close {
  flex: none;
  width: 2.75rem;
  height: 2.75rem;
  border-radius: 50%;
  background: var(--bg);
  display: flex;
  align-items: center;
  justify-content: center;
}
.dlg__close svg {
  width: 1.25rem;
  height: 1.25rem;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
}

.field {
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}
.field__label {
  padding: 0;
  font-size: 0.9375rem;
  font-weight: 700;
}
.field__opt,
.field__hint {
  font-weight: 500;
  color: var(--muted);
}
.field__hint {
  font-size: 0.875rem;
}
.field__error {
  font-size: 0.875rem;
  font-weight: 600;
  color: #a3260b; /* 6,6:1 sur blanc */
}

.row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}
.row > .field {
  flex: 1 1 9rem;
}

.input {
  width: 100%;
  min-height: 3rem;
  padding: 0.5rem 0.75rem;
  border: 2px solid #8a8ea3; /* 3,3:1 sur blanc (WCAG 1.4.11) */
  border-radius: 0.75rem;
  background: var(--surface);
  color: var(--ink);
  font: inherit;
  font-size: 1rem; /* évite le zoom automatique d'iOS */
  font-variant-numeric: tabular-nums;
}
.input[aria-invalid='true'] {
  border-color: #a3260b;
}

.kinds {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.kind {
  --c: var(--coup);
  --t: var(--coup-tint);
  flex: 1 1 0;
  min-width: max-content;
  position: relative;
  min-height: 3rem;
  padding: 0.25rem 1rem;
  border: 2px solid #8a8ea3;
  border-radius: 999px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  cursor: pointer;
}
.kind--contraction {
  --c: var(--contr);
  --t: var(--contr-tint);
}
.kind input {
  position: absolute;
  inset: 0;
  margin: 0;
  opacity: 0;
  cursor: pointer;
}
.kind:has(input:checked) {
  border-color: var(--c);
  background: var(--c);
  color: #fff;
}
.kind:has(input:focus-visible) {
  outline: 3px solid var(--focus);
  outline-offset: 3px;
}

.row--dur {
  flex-wrap: nowrap;
}
.dur {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.dur .input {
  text-align: right;
}
.dur label {
  flex: none;
  font-weight: 600;
}

.dlg__actions {
  display: flex;
  flex-wrap: wrap-reverse;
  gap: 0.75rem;
  padding-top: 0.25rem;
}
.btn {
  flex: 1 1 8rem;
  min-height: 3rem;
  padding: 0.5rem 1.25rem;
  border-radius: 999px;
  font-size: 1rem;
  font-weight: 700;
}
.btn--ghost {
  background: var(--bg);
}
.btn--primary {
  background: var(--ink);
  color: #fff;
}
.btn--primary:disabled {
  opacity: 0.6;
}

@media (forced-colors: active) {
  .kind:has(input:checked) {
    forced-color-adjust: none;
    background: Highlight;
    color: HighlightText;
    border-color: Highlight;
  }
}
</style>
