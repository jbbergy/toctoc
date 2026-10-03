<script setup lang="ts">
import { useEvents } from './composables/useEvents'
import { announcement } from './composables/useAnnouncer'

const { ready, error } = useEvents()
</script>

<template>
  <div class="app">
    <p v-if="error" class="app-error" role="alert">{{ error }}</p>
    <RouterView v-else-if="ready" />
    <p v-else class="app-loading" role="status">Chargement…</p>
    <div class="visually-hidden" role="status" aria-live="polite" aria-atomic="true">
      {{ announcement }}
    </div>
  </div>
</template>
