// Время ползунка + проигрывание дня
import { useCallback, useEffect, useRef, useState } from 'react'
import { stateAt } from './geo.js'

export const SPEEDS = [60, 300, 1200] // секунд дня за секунду: 1 / 5 / 20 мин/с
const STOP_FAST = 10 // стоянки при проигрывании пролетаем в 10 раз быстрее

export function useReplay(day) {
  const [sec, setSec] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(300)
  const secRef = useRef(0) // актуальное время для цикла анимации без перезапуска эффекта

  const seek = useCallback((v) => {
    secRef.current = v
    setSec(v)
  }, [])

  const first = day?.route[0]?.s
  const last = day?.route[day.route.length - 1]?.s

  const toggle = useCallback(() => {
    if (first == null) return
    if (!playing && secRef.current >= last) seek(first) // доиграли — начинаем сначала
    setPlaying(!playing)
  }, [first, last, playing, seek])

  const stop = useCallback(() => setPlaying(false), [])
  const cycleSpeed = useCallback(() => setSpeed((s) => SPEEDS[(SPEEDS.indexOf(s) + 1) % SPEEDS.length]), [])

  // каждый кадр двигаем время на dt × скорость
  useEffect(() => {
    if (!playing || !day) return
    let raf
    let prev = performance.now()
    const tick = (now) => {
      const dt = (now - prev) / 1000
      prev = now
      const s = secRef.current
      const st = stateAt(day, s)
      let next
      if (st.kind === 'before') next = st.at // до первой точки смотреть нечего
      else if (st.kind === 'gap') next = st.to // дыру в данных перепрыгиваем
      else next = s + dt * speed * (st.kind === 'stop' ? STOP_FAST : 1)
      if (!(next > s)) next = s + dt * speed // подстраховка: время обязано идти вперёд
      if (next >= last) {
        seek(last)
        setPlaying(false)
        return
      }
      seek(next)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, day, speed, last, seek])

  return { sec, secRef, seek, playing, toggle, stop, speed, cycleSpeed }
}
