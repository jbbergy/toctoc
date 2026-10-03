import { ref, watch } from 'vue'
import type { EventKind } from '../db/types'

const KEY = 'toctoc:mode'

function initial(): EventKind {
  try {
    return localStorage.getItem(KEY) === 'contraction' ? 'contraction' : 'coup'
  } catch {
    return 'coup'
  }
}

/** Mode courant de l'accueil (mémorisé sur l'appareil). */
export const mode = ref<EventKind>(initial())

watch(mode, (m) => {
  try {
    localStorage.setItem(KEY, m)
  } catch {
    /* stockage indisponible */
  }
})
