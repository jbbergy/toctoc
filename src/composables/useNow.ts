import { onBeforeUnmount, onMounted, ref } from 'vue'

/** Horloge réactive, rafraîchie à intervalle régulier. */
export function useNow(intervalMs = 30_000) {
  const now = ref(Date.now())
  let id: ReturnType<typeof setInterval> | undefined
  const refresh = () => (now.value = Date.now())
  const onVisible = () => document.visibilityState === 'visible' && refresh()
  onMounted(() => {
    id = setInterval(refresh, intervalMs)
    document.addEventListener('visibilitychange', onVisible)
  })
  onBeforeUnmount(() => {
    clearInterval(id)
    document.removeEventListener('visibilitychange', onVisible)
  })
  return now
}
