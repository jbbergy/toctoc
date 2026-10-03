<script setup lang="ts" generic="T extends string">
defineProps<{
  /** Nom accessible du groupe. */
  label: string
  options: { value: T; label: string; activeBg?: string }[]
  size?: 'md' | 'lg'
}>()
const model = defineModel<T>({ required: true })
</script>

<template>
  <div class="seg" :class="`seg--${size ?? 'md'}`" role="group" :aria-label="label">
    <button
      v-for="o in options"
      :key="o.value"
      type="button"
      class="seg__btn"
      :aria-pressed="model === o.value"
      :style="model === o.value && o.activeBg ? { '--seg-on-bg': o.activeBg, '--seg-on-fg': '#fff' } : undefined"
      @click="model = o.value"
    >
      {{ o.label }}
    </button>
  </div>
</template>

<style scoped>
.seg {
  --pad: 0.25rem;
  --h: 2.75rem;
  display: flex;
  flex-wrap: wrap;
  gap: var(--pad);
  padding: var(--pad);
  border-radius: calc(var(--h) / 2 + var(--pad));
  background: var(--track);
}
.seg--lg {
  --pad: 0.375rem;
  --h: 3.5rem;
}
.seg__btn {
  /* Largeurs égales quand ça tient, retour à la ligne sinon (écrans très étroits / zoom). */
  flex: 1 1 0;
  min-width: max-content;
  min-height: var(--h);
  padding: 0.25rem 0.75rem;
  border-radius: calc(var(--h) / 2);
  background: transparent;
  color: var(--muted-strong);
  font-size: 0.9375rem;
  font-weight: 700;
  line-height: 1.2;
  transition:
    background-color 200ms ease,
    color 200ms ease;
}
.seg--lg .seg__btn {
  font-size: clamp(1rem, 5vw, 1.125rem);
}
.seg__btn[aria-pressed='true'] {
  background: var(--seg-on-bg, var(--surface));
  color: var(--seg-on-fg, var(--ink));
}
@media (forced-colors: active) {
  .seg__btn[aria-pressed='true'] {
    forced-color-adjust: none;
    background: Highlight;
    color: HighlightText;
  }
}
</style>
