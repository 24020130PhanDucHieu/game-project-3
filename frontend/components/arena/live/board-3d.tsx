'use client'

import { useEffect, useRef, type MutableRefObject } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { BASES, PIECE_ICON, type BoardTheme } from './board-themes'

export type CameraMode = 'cinematic' | 'free' | 'top'
export type Board3DHandle = { capture: () => string | null }

type Props = {
  step: any
  prev?: any
  /** true khi người xem đang tiến từng bước liên tiếp → có hoạt ảnh; false khi tua/nhảy → đặt vị trí ngay. */
  animate: boolean
  theme: BoardTheme
  camera: CameraMode
  quality: 'high' | 'low'
  onUnsupported?: () => void
  /** Tay cầm để cha gọi chụp ảnh (next/dynamic không chuyển tiếp ref). */
  handleRef?: MutableRefObject<Board3DHandle | null>
}

const toPos = (col: number, row: number) => new THREE.Vector3(col - 4, 0.05, row - 4)
const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)

type PieceView = {
  group: THREE.Group
  side: 'red' | 'blue'
  type: string
  from: THREE.Vector3
  to: THREE.Vector3
  start: number
  dur: number
  dying: number
  visible: boolean
}

type Fx = { update: (now: number, dt: number) => boolean; dispose: () => void }

function iconTexture(icon: string) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 128
  const ctx = canvas.getContext('2d')!
  ctx.font = '84px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(icon, 64, 70)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

/** Sân đấu 3D: bàn cờ có độ dày, ánh sáng + bóng, quân phát sáng, va chạm có hạt, camera điện ảnh. */
export default function Board3D({ step, prev, animate, theme, camera, quality, onUnsupported, handleRef }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const api = useRef<{
    apply: (step: any, prev: any, animate: boolean) => void
    setCamera: (mode: CameraMode) => void
    capture: () => string | null
  } | null>(null)
  const latest = useRef({ step, prev, animate, camera })
  latest.current = { step, prev, animate, camera }

  useEffect(() => {
    if (!handleRef) return
    handleRef.current = { capture: () => api.current?.capture() ?? null }
    return () => { handleRef.current = null }
  }, [handleRef])

  // Dựng lại toàn bộ cảnh khi đổi theme hoặc chất lượng (hiếm khi xảy ra).
  useEffect(() => {
    const el = host.current
    if (!el) return
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: quality === 'high', powerPreference: 'high-performance' })
    } catch {
      onUnsupported?.()
      return
    }
    const high = quality === 'high'
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, high ? 2 : 1))
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.05
    renderer.shadowMap.enabled = high
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    el.appendChild(renderer.domElement)
    renderer.domElement.style.cssText = 'width:100%;height:100%;display:block;border-radius:inherit'

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(theme.backdrop)
    scene.fog = new THREE.Fog(theme.fog, 14, 34)
    const cam = new THREE.PerspectiveCamera(42, 1, 0.1, 100)
    cam.position.set(0, 9, 11)

    const disposables: { dispose: () => void }[] = []
    const track = <T extends { dispose: () => void }>(item: T) => { disposables.push(item); return item }

    // ---- Ánh sáng
    scene.add(new THREE.AmbientLight(theme.ambient, 0.45))
    scene.add(new THREE.HemisphereLight(theme.ambient, theme.backdrop, 0.45))
    const spot = new THREE.SpotLight('#ffffff', 170, 40, 0.65, 0.55, 1.4)
    spot.position.set(0, 13, 6)
    spot.castShadow = high
    spot.shadow.mapSize.set(1024, 1024)
    spot.shadow.bias = -0.0004
    scene.add(spot, spot.target)
    const redLight = new THREE.PointLight(theme.red, 22, 22, 1.5)
    redLight.position.set(-6, 3.5, 6)
    const blueLight = new THREE.PointLight(theme.blue, 22, 22, 1.5)
    blueLight.position.set(6, 3.5, -6)
    scene.add(redLight, blueLight)

    // ---- Bàn cờ
    const board = new THREE.Group()
    scene.add(board)
    const frame = new THREE.Mesh(track(new THREE.BoxGeometry(9.8, 0.55, 9.8)), track(new THREE.MeshStandardMaterial({ color: theme.frame, metalness: 0.65, roughness: 0.32 })))
    frame.position.y = -0.3
    frame.receiveShadow = true
    frame.castShadow = true
    board.add(frame)
    const cellGeo = track(new THREE.BoxGeometry(0.96, 0.1, 0.96))
    const matA = track(new THREE.MeshStandardMaterial({ color: theme.cellA, roughness: 0.45, metalness: 0.15 }))
    const matB = track(new THREE.MeshStandardMaterial({ color: theme.cellB, roughness: 0.45, metalness: 0.15 }))
    const matRedHome = track(new THREE.MeshStandardMaterial({ color: theme.baseRed, emissive: theme.baseRed, emissiveIntensity: 0.55, roughness: 0.3 }))
    const matBlueHome = track(new THREE.MeshStandardMaterial({ color: theme.baseBlue, emissive: theme.baseBlue, emissiveIntensity: 0.55, roughness: 0.3 }))
    for (let row = 0; row < 9; row++) {
      for (let col = 0; col < 9; col++) {
        const home = row === BASES.red.row && col === BASES.red.col ? matRedHome : row === BASES.blue.row && col === BASES.blue.col ? matBlueHome : null
        const cell = new THREE.Mesh(cellGeo, home ?? ((row + col) % 2 ? matB : matA))
        cell.position.set(col - 4, 0, row - 4)
        cell.receiveShadow = true
        board.add(cell)
      }
    }
    const floor = new THREE.Mesh(track(new THREE.PlaneGeometry(80, 80)), track(new THREE.MeshStandardMaterial({ color: theme.backdrop, roughness: 0.85, metalness: 0.1 })))
    floor.rotation.x = -Math.PI / 2
    floor.position.y = -0.6
    floor.receiveShadow = true
    scene.add(floor)

    // Hạt bụi sáng lơ lửng tạo chiều sâu.
    const dustGeo = track(new THREE.BufferGeometry())
    const dust = new Float32Array(240 * 3)
    for (let i = 0; i < 240; i++) { dust[i * 3] = (Math.random() - 0.5) * 24; dust[i * 3 + 1] = Math.random() * 9; dust[i * 3 + 2] = (Math.random() - 0.5) * 24 }
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dust, 3))
    const dustPoints = new THREE.Points(dustGeo, track(new THREE.PointsMaterial({ color: theme.accent, size: 0.05, transparent: true, opacity: 0.55, depthWrite: false })))
    scene.add(dustPoints)

    // Cột sáng tại hai cứ điểm.
    const beamGeo = track(new THREE.CylinderGeometry(0.28, 0.4, 5, 24, 1, true))
    for (const [home, color] of [[BASES.red, theme.baseRed], [BASES.blue, theme.baseBlue]] as const) {
      const beam = new THREE.Mesh(beamGeo, track(new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })))
      beam.position.set(home.col - 4, 2.5, home.row - 4)
      scene.add(beam)
    }

    // ---- Đối tượng động
    const pieces = new Map<string, PieceView>()
    const obstacleGroup = new THREE.Group()
    const markerGroup = new THREE.Group()
    scene.add(obstacleGroup, markerGroup)
    const iconCache = new Map<string, THREE.CanvasTexture>()
    const iconOf = (type: string) => {
      const key = type || '?'
      let tex = iconCache.get(key)
      if (!tex) { tex = iconTexture(PIECE_ICON[key]?.icon ?? '❔'); iconCache.set(key, tex); track(tex) }
      return tex
    }
    const bodyGeo = track(new THREE.CylinderGeometry(0.34, 0.4, 0.3, 36))
    const capGeo = track(new THREE.CylinderGeometry(0.33, 0.33, 0.05, 36))
    const iconGeo = track(new THREE.PlaneGeometry(0.6, 0.6))
    const ringGeo = track(new THREE.TorusGeometry(0.43, 0.03, 8, 44))
    const sideMats = {
      red: { body: track(new THREE.MeshStandardMaterial({ color: theme.red, metalness: 0.4, roughness: 0.3, emissive: theme.red, emissiveIntensity: 0.12 })), ring: track(new THREE.MeshBasicMaterial({ color: theme.red, transparent: true, opacity: 0.9 })) },
      blue: { body: track(new THREE.MeshStandardMaterial({ color: theme.blue, metalness: 0.4, roughness: 0.3, emissive: theme.blue, emissiveIntensity: 0.12 })), ring: track(new THREE.MeshBasicMaterial({ color: theme.blue, transparent: true, opacity: 0.9 })) },
    }
    const capMat = track(new THREE.MeshStandardMaterial({ color: '#cfd2e4', roughness: 0.5, metalness: 0.05 }))
    const iconMats = new Map<string, THREE.MeshBasicMaterial>()
    const iconMat = (type: string) => {
      let m = iconMats.get(type)
      if (!m) { m = track(new THREE.MeshBasicMaterial({ map: iconOf(type), transparent: true, toneMapped: false })); iconMats.set(type, m) }
      return m
    }

    function makePiece(id: string, side: 'red' | 'blue', type: string, at: THREE.Vector3): PieceView {
      const group = new THREE.Group()
      const body = new THREE.Mesh(bodyGeo, sideMats[side].body)
      body.position.y = 0.15
      body.castShadow = high
      const cap = new THREE.Mesh(capGeo, capMat)
      cap.position.y = 0.32
      const icon = new THREE.Mesh(iconGeo, iconMat(type || '?'))
      icon.rotation.x = -Math.PI / 2
      icon.position.y = 0.36
      const ring = new THREE.Mesh(ringGeo, sideMats[side].ring)
      ring.rotation.x = Math.PI / 2
      ring.position.y = 0.04
      group.add(body, cap, icon, ring)
      group.position.copy(at)
      scene.add(group)
      const view: PieceView = { group, side, type, from: at.clone(), to: at.clone(), start: 0, dur: 1, dying: 0, visible: true }
      pieces.set(id, view)
      return view
    }

    const fx: Fx[] = []
    function burst(at: THREE.Vector3, color: string, big = false) {
      const count = big ? 90 : 48
      const geo = new THREE.BufferGeometry()
      const positions = new Float32Array(count * 3)
      const velocities: THREE.Vector3[] = []
      for (let i = 0; i < count; i++) {
        positions.set([at.x, at.y + 0.3, at.z], i * 3)
        velocities.push(new THREE.Vector3((Math.random() - 0.5) * 4, Math.random() * 4.2, (Math.random() - 0.5) * 4))
      }
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
      const mat = new THREE.PointsMaterial({ color, size: big ? 0.16 : 0.11, transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending })
      const points = new THREE.Points(geo, mat)
      const ringMesh = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.3, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }))
      ringMesh.rotation.x = -Math.PI / 2
      ringMesh.position.set(at.x, at.y + 0.08, at.z)
      const flash = new THREE.PointLight(color, big ? 90 : 55, 7, 1.6)
      flash.position.set(at.x, at.y + 1, at.z)
      scene.add(points, ringMesh, flash)
      let life = 0
      fx.push({
        update: (_now, dt) => {
          life += dt
          const pos = geo.getAttribute('position') as THREE.BufferAttribute
          for (let i = 0; i < count; i++) {
            const v = velocities[i]
            v.y -= 9 * dt
            pos.setXYZ(i, pos.getX(i) + v.x * dt, Math.max(0.05, pos.getY(i) + v.y * dt), pos.getZ(i) + v.z * dt)
          }
          pos.needsUpdate = true
          mat.opacity = Math.max(0, 1 - life / 1.1)
          const s = 1 + life * (big ? 9 : 6)
          ringMesh.scale.setScalar(s)
          ;(ringMesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.9 - life * 1.4)
          flash.intensity = Math.max(0, (big ? 90 : 55) * (1 - life / 0.45))
          return life < 1.15
        },
        dispose: () => {
          scene.remove(points, ringMesh, flash)
          geo.dispose(); mat.dispose(); ringMesh.geometry.dispose(); (ringMesh.material as THREE.Material).dispose()
        },
      })
    }

    let clashAt = 0
    const clashPos = new THREE.Vector3()

    function apply(step: any, prevStep: any, animateMoves: boolean) {
      const now = performance.now()
      const seen = new Set<string>()
      const prevById = new Map<string, any>()
      for (const p of [...(prevStep?.red_pieces || []), ...(prevStep?.blue_pieces || [])]) prevById.set(p.id, p)
      for (const [list, side] of [[step?.red_pieces, 'red'], [step?.blue_pieces, 'blue']] as const) {
        for (const p of list || []) {
          seen.add(p.id)
          let view = pieces.get(p.id)
          const target = toPos(p.col, p.row)
          if (p.alive === false) {
            if (view && view.visible) {
              if (animateMoves) { view.dying = now } else { view.group.visible = false; view.visible = false }
            }
            continue
          }
          if (!view) view = makePiece(p.id, side, p.type || '?', target)
          if (!view.visible) { view.visible = true; view.group.visible = true; view.group.scale.setScalar(1); view.dying = 0; view.group.position.copy(target) }
          view.dying = 0
          view.group.scale.setScalar(1)
          // Cập nhật biểu tượng khi loại quân đổi (tiến hóa) hoặc lộ ra.
          if ((p.type || '?') !== view.type) {
            view.type = p.type || '?'
            const iconMesh = view.group.children[2] as THREE.Mesh
            iconMesh.material = iconMat(view.type)
          }
          const moved = view.to.x !== target.x || view.to.z !== target.z
          if (moved) {
            if (animateMoves) { view.from.copy(view.group.position); view.to.copy(target); view.start = now; view.dur = 520 }
            else { view.group.position.copy(target); view.from.copy(target); view.to.copy(target); view.start = 0 }
          }
        }
      }
      // Quân biến mất khỏi dữ liệu → ẩn.
      for (const [id, view] of pieces) if (!seen.has(id) && view.visible) { view.group.visible = false; view.visible = false }

      // Chướng ngại vật và ô đặc biệt
      obstacleGroup.clear()
      markerGroup.clear()
      const cells = (v: any): [number, number][] => {
        const out: [number, number][] = []
        const walk = (x: any) => { if (Array.isArray(x) && x.length === 2 && typeof x[0] === 'number' && typeof x[1] === 'number') out.push([x[0], x[1]]); else if (Array.isArray(x)) x.forEach(walk) }
        walk(v)
        return out
      }
      const mystery = step?.mystery_tiles || {}
      for (const [c, r] of cells(step?.obstacles || mystery.obstacles)) {
        const m = new THREE.Mesh(track(new THREE.BoxGeometry(0.8, 0.55, 0.8)), track(new THREE.MeshStandardMaterial({ color: theme.obstacle, roughness: 0.6, metalness: 0.3 })))
        m.position.set(c - 4, 0.32, r - 4)
        m.castShadow = high
        obstacleGroup.add(m)
      }
      const spec: [any, string][] = [[mystery.evolve, '#7dffb2'], [mystery.portals, '#b388ff'], [mystery.traps, '#ff6b6b']]
      for (const [list, color] of spec) {
        for (const [c, r] of cells(list)) {
          const ring = new THREE.Mesh(track(new THREE.TorusGeometry(0.32, 0.05, 8, 32)), track(new THREE.MeshBasicMaterial({ color })))
          ring.rotation.x = Math.PI / 2
          ring.position.set(c - 4, 0.1, r - 4)
          markerGroup.add(ring)
        }
      }

      const clash = step?.clash_event
      if (animateMoves && clash && typeof clash.col === 'number') {
        const at = toPos(clash.col, clash.row)
        const color = clash.type === 'GOAL' ? theme.accent : clash.type === 'WARP' ? '#b388ff' : clash.type === 'EVOLVE' ? '#7dffb2' : clash.type === 'TRAP' ? '#ff6b6b' : theme.accent
        window.setTimeout(() => { burst(at, color, clash.type === 'GOAL'); clashAt = performance.now(); clashPos.copy(at) }, 380)
      }
    }

    // ---- Camera
    const controls = new OrbitControls(cam, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.maxPolarAngle = Math.PI * 0.48
    controls.minDistance = 5
    controls.maxDistance = 22
    controls.target.set(0, 0, 0)
    controls.enabled = false
    let mode: CameraMode = latest.current.camera
    const focus = new THREE.Vector3()
    let theta = 0
    const t0 = performance.now()
    const setCamera = (next: CameraMode) => {
      mode = next
      controls.enabled = next === 'free'
      if (next === 'free') { controls.target.copy(focus); controls.update() }
    }
    setCamera(mode)

    // ---- Hậu kỳ (bloom)
    let composer: EffectComposer | null = null
    let bloom: UnrealBloomPass | null = null
    if (high) {
      composer = new EffectComposer(renderer)
      composer.addPass(new RenderPass(scene, cam))
      bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.28, 0.55, 0.9)
      composer.addPass(bloom)
      composer.addPass(new OutputPass())
    }

    const resize = () => {
      const w = Math.max(160, el.clientWidth)
      const h = Math.max(160, el.clientHeight)
      renderer.setSize(w, h, false)
      composer?.setSize(w, h)
      bloom?.setSize(w, h)
      cam.aspect = w / h
      cam.updateProjectionMatrix()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(el)
    resize()

    let raf = 0
    let last = performance.now()
    let onScreen = true
    const io = new IntersectionObserver((entries) => { onScreen = entries[0]?.isIntersecting ?? true })
    io.observe(el)

    const loop = () => {
      raf = requestAnimationFrame(loop)
      if (!onScreen || document.hidden) { last = performance.now(); return }
      const now = performance.now()
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now

      // Quân: nhảy cung khi di chuyển, rơi và tan khi bị diệt.
      for (const view of pieces.values()) {
        if (view.dying) {
          const k = Math.min(1, (now - view.dying) / 650)
          view.group.scale.setScalar(Math.max(0.001, 1 - ease(k)))
          view.group.rotation.y += dt * 8
          view.group.position.y = 0.05 + k * 0.6
          if (k >= 1) { view.group.visible = false; view.visible = false; view.dying = 0; view.group.rotation.y = 0 }
        } else if (view.start) {
          const k = Math.min(1, (now - view.start) / view.dur)
          view.group.position.lerpVectors(view.from, view.to, ease(k))
          view.group.position.y = 0.05 + Math.sin(k * Math.PI) * 0.55
          if (k >= 1) view.start = 0
        }
      }
      for (let i = fx.length - 1; i >= 0; i--) {
        if (!fx[i].update(now, dt)) { fx[i].dispose(); fx.splice(i, 1) }
      }
      dustPoints.rotation.y += dt * 0.02
      redLight.intensity = 22 + Math.sin(now / 600) * 4
      blueLight.intensity = 22 + Math.cos(now / 650) * 4

      if (mode === 'cinematic') {
        const recent = Math.max(0, 1 - (now - clashAt) / 2200)
        const wantFocus = recent > 0 ? clashPos : new THREE.Vector3(0, 0, 0)
        focus.lerp(wantFocus, 1 - Math.exp(-dt * 2.2))
        theta += dt * (0.1 + recent * 0.05)
        const t = (now - t0) / 1000
        const elevation = 0.78 + Math.sin(t * 0.33) * 0.1 - recent * 0.12
        const radius = 13.5 + Math.sin(t * 0.21) * 1.4 - recent * 5
        cam.position.set(focus.x + Math.sin(theta) * Math.cos(elevation) * radius, focus.y + Math.sin(elevation) * radius, focus.z + Math.cos(theta) * Math.cos(elevation) * radius)
        cam.lookAt(focus)
        if (bloom) bloom.strength = 0.28 + recent * 0.4
      } else if (mode === 'top') {
        focus.lerp(new THREE.Vector3(0, 0, 0), 1 - Math.exp(-dt * 3))
        cam.position.lerp(new THREE.Vector3(0, 15.5, 4.2), 1 - Math.exp(-dt * 3))
        cam.lookAt(0, 0, 0)
      } else {
        controls.update()
        focus.copy(controls.target)
      }

      if (composer) composer.render()
      else renderer.render(scene, cam)
    }
    loop()

    api.current = {
      apply,
      setCamera,
      capture: () => {
        if (composer) composer.render(); else renderer.render(scene, cam)
        return renderer.domElement.toDataURL('image/png')
      },
    }
    apply(latest.current.step, latest.current.prev, false)

    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
      io.disconnect()
      controls.dispose()
      fx.forEach((f) => f.dispose())
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh
        if (mesh.geometry) mesh.geometry.dispose()
      })
      disposables.forEach((d) => { try { d.dispose() } catch { /* đã giải phóng */ } })
      composer?.dispose()
      renderer.dispose()
      renderer.forceContextLoss()
      renderer.domElement.remove()
      api.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme, quality])

  useEffect(() => { api.current?.apply(step, prev, animate) }, [step, prev, animate])
  useEffect(() => { api.current?.setCamera(camera) }, [camera])

  return <div ref={host} className="aspect-[4/3] min-h-[320px] w-full overflow-hidden rounded-2xl border border-border bg-black/40" aria-label="Sân đấu 3D" role="img" />
}
