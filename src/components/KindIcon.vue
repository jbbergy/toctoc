<script setup lang="ts">
import type { EventKind } from '../db/types'
defineProps<{ kind: EventKind }>()
</script>

<template>
  <svg v-if="kind === 'coup'" viewBox="0 0 24 24" aria-hidden="true" focusable="false" class="icon">
    <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2" />
    <circle cx="12" cy="12" r="2.5" fill="currentColor" />
  </svg>
  <svg v-else viewBox="0 0 24 24" aria-hidden="true" focusable="false" class="icon">
    <path
      d="M2 12c1.7-5 3.3-5 5 0s3.3 5 5 0 3.3-5 5 0 3.3 5 5 0"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
</template>

<style scoped>
.icon {
  width: 1.25rem;
  height: 1.25rem;
}
</style>
