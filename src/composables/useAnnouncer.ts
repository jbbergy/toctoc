import { ref } from 'vue'

/** Message lu par les lecteurs d'écran via la région live globale (App.vue). */
export const announcement = ref('')

export function announce(message: string) {
  // Vider puis réécrire force la relecture d'un message identique.
  announcement.value = ''
  setTimeout(() => (announcement.value = message), 50)
}
