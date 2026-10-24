'use client'

import { useEffect, useRef, type MutableRefObject } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { BASES, PIECE_ICON, type BoardTheme } from './board-themes'
import { asCells, NO_HIGHLIGHT, type Highlight } from './board-logic'

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
  /** Quân đang chọn, ô gợi ý, và camera có bám theo quân không. */
  selectedId?: string | null
  highlight?: Highlight
  follow?: boolean
  onSelect?: (id: string | null) => void
}

const toPos = (col: number, row: number) => new THREE.Vector3(col - 4, 0.05, row - 4)
const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)

type PieceView = {
  group: THREE.Group
  icon: THREE.Sprite
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

function canvasTexture(size: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  draw(canvas.getContext('2d')!)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

/** Huy hiệu tròn có viền vàng chứa biểu tượng Kéo/Búa/Bao. */
const iconTexture = (icon: string) => canvasTexture(128, (ctx) => {
  const g = ctx.createRadialGradient(52, 46, 6, 64, 64, 62)
  g.addColorStop(0, 'rgba(255,255,255,0.97)')
  g.addColorStop(1, 'rgba(200,205,226,0.92)')
  ctx.fillStyle = g
  ctx.beginPath(); ctx.arc(64, 64, 57, 0, Math.PI * 2); ctx.fill()
  ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(232,195,106,1)'; ctx.stroke()
  ctx.font = '68px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif'
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText(icon, 64, 70)
})

const labelTexture = (text: string, color: string) => canvasTexture(64, (ctx) => {
  ctx.font = 'bold 40px ui-monospace,Consolas,monospace'
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillStyle = color
  ctx.fillText(text, 32, 34)
})

/** Sân đấu 3D: bàn có khung vát và toạ độ, quân dạng tượng, đá chướng ngại, bấm vào quân để xem nước đi. */
export default function Board3D({ step, prev, animate, theme, camera, quality, onUnsupported, handleRef, selectedId = null, highlight = NO_HIGHLIGHT, follow = false, onSelect }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const api = useRef<{
    apply: (step: any, prev: any, animate: boolean) => void
    setCamera: (mode: CameraMode) => void
    select: (id: string | null, highlight: Highlight, follow: boolean) => void
    capture: () => string | null
  } | null>(null)
  const latest = useRef({ step, prev, animate, camera, selectedId, highlight, follow, onSelect })
  latest.current = { step, prev, animate, camera, selectedId, highlight, follow, onSelect }

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
      renderer = new THREE.WebGLRenderer({ antialias: quality === 'high', powerPreference: 'high-performance', preserveDrawingBuffer: false })
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
    renderer.domElement.style.cssText = 'width:100%;height:100%;display:block;border-radius:inherit;touch-action:none'

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(theme.backdrop)
    scene.fog = new THREE.Fog(theme.fog, 14, 34)
    const cam = new THREE.PerspectiveCamera(42, 1, 0.1, 100)
    cam.position.set(0, 9, 11)

    const disposables: { dispose: () => void }[] = []
    const track = <T extends { dispose: () => void }>(item: T) => { disposables.push(item); return item }

    // ---- Ánh sáng
    scene.add(new THREE.AmbientLight(theme.ambient, 0.42))
    scene.add(new THREE.HemisphereLight(theme.ambient, theme.backdrop, 0.45))
    const spot = new THREE.SpotLight('#ffffff', 175, 40, 0.65, 0.55, 1.4)
    spot.position.set(0, 13, 6)
    spot.castShadow = high
    spot.shadow.mapSize.set(1024, 1024)
    spot.shadow.bias = -0.0004
    scene.add(spot, spot.target)
    const rimLight = new THREE.DirectionalLight('#ffffff', 0.6)
    rimLight.position.set(-6, 5, -8)
    scene.add(rimLight)
    const redLight = new THREE.PointLight(theme.red, 22, 22, 1.5)
    redLight.position.set(-6, 3.5, 6)
    const blueLight = new THREE.PointLight(theme.blue, 22, 22, 1.5)
    blueLight.position.set(6, 3.5, -6)
    scene.add(redLight, blueLight)

    // ---- Bàn cờ: khung bo tròn vát cạnh, viền vàng, toạ độ quanh mép.
    const board = new THREE.Group()
    scene.add(board)
    const outline = new THREE.Shape()
    const half = 5.1
    const rad = 0.45
    outline.moveTo(-half + rad, -half)
    outline.lineTo(half - rad, -half); outline.quadraticCurveTo(half, -half, half, -half + rad)
    outline.lineTo(half, half - rad); outline.quadraticCurveTo(half, half, half - rad, half)
    outline.lineTo(-half + rad, half); outline.quadraticCurveTo(-half, half, -half, half - rad)
    outline.lineTo(-half, -half + rad); outline.quadraticCurveTo(-half, -half, -half + rad, -half)
    const frameGeo = track(new THREE.ExtrudeGeometry(outline, { depth: 0.42, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.12, bevelSegments: 4, curveSegments: 10 }))
    const frame = new THREE.Mesh(frameGeo, track(new THREE.MeshPhysicalMaterial({ color: theme.frame, metalness: 0.55, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.25 })))
    frame.rotation.x = -Math.PI / 2
    frame.position.y = -0.5
    frame.receiveShadow = true
    frame.castShadow = true
    board.add(frame)
    const inlay = new THREE.Mesh(track(new THREE.BoxGeometry(9.2, 0.06, 9.2)), track(new THREE.MeshStandardMaterial({ color: '#d4a64a', metalness: 0.9, roughness: 0.25 })))
    inlay.position.y = 0.005
    board.add(inlay)
    const bed = new THREE.Mesh(track(new THREE.BoxGeometry(9.06, 0.08, 9.06)), track(new THREE.MeshStandardMaterial({ color: theme.backdrop, roughness: 0.9 })))
    bed.position.y = 0
    board.add(bed)
    const labelGeo = track(new THREE.PlaneGeometry(0.4, 0.4))
    for (let i = 0; i < 9; i++) {
      const mat = track(new THREE.MeshBasicMaterial({ map: track(labelTexture(String(i), theme.accent)), transparent: true, depthWrite: false }))
      for (const [x, z] of [[i - 4, 4.8], [i - 4, -4.8], [-4.8, i - 4], [4.8, i - 4]]) {
        const label = new THREE.Mesh(labelGeo, mat)
        label.rotation.x = -Math.PI / 2
        label.position.set(x, 0.03, z)
        board.add(label)
      }
    }
    const cellGeo = track(new THREE.BoxGeometry(0.94, 0.1, 0.94))
    const matA = track(new THREE.MeshPhysicalMaterial({ color: theme.cellA, roughness: 0.38, metalness: 0.12, clearcoat: 0.5, clearcoatRoughness: 0.4 }))
    const matB = track(new THREE.MeshPhysicalMaterial({ color: theme.cellB, roughness: 0.42, metalness: 0.12, clearcoat: 0.5, clearcoatRoughness: 0.4 }))
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
    floor.position.y = -0.62
    floor.receiveShadow = true
    scene.add(floor)

    // Hạt bụi sáng lơ lửng tạo chiều sâu.
    const dustGeo = track(new THREE.BufferGeometry())
    const dust = new Float32Array(240 * 3)
    for (let i = 0; i < 240; i++) { dust[i * 3] = (Math.random() - 0.5) * 24; dust[i * 3 + 1] = Math.random() * 9; dust[i * 3 + 2] = (Math.random() - 0.5) * 24 }
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dust, 3))
    const dustPoints = new THREE.Points(dustGeo, track(new THREE.PointsMaterial({ color: theme.accent, size: 0.05, transparent: true, opacity: 0.55, depthWrite: false })))
    scene.add(dustPoints)

    // Cột sáng và tháp nhỏ tại hai cứ điểm.
    const beamGeo = track(new THREE.CylinderGeometry(0.28, 0.4, 5, 24, 1, true))
    const towerGeo = track(new THREE.CylinderGeometry(0.16, 0.2, 0.34, 8))
    for (const [home, color] of [[BASES.red, theme.baseRed], [BASES.blue, theme.baseBlue]] as const) {
      const beam = new THREE.Mesh(beamGeo, track(new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })))
      beam.position.set(home.col - 4, 2.5, home.row - 4)
      scene.add(beam)
      const towerMat = track(new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.4, metalness: 0.6, roughness: 0.3 }))
      for (const [dx, dz] of [[-0.34, -0.34], [0.34, -0.34], [-0.34, 0.34], [0.34, 0.34]]) {
        const tower = new THREE.Mesh(towerGeo, towerMat)
        tower.position.set(home.col - 4 + dx, 0.22, home.row - 4 + dz)
        tower.castShadow = high
        scene.add(tower)
      }
    }

    // ---- Quân cờ dạng tượng tiện tròn: đế có viền kim loại, eo, vai, huy hiệu nổi phía trên.
    const pieces = new Map<string, PieceView>()
    const obstacleGroup = new THREE.Group()
    const markerGroup = new THREE.Group()
    const hintGroup = new THREE.Group()
    scene.add(obstacleGroup, markerGroup, hintGroup)
    const iconMats = new Map<string, THREE.SpriteMaterial>()
    const iconMat = (type: string) => {
      const key = type || '?'
      let m = iconMats.get(key)
      if (!m) { m = track(new THREE.SpriteMaterial({ map: track(iconTexture(PIECE_ICON[key]?.icon ?? '❔')), transparent: true, toneMapped: false, depthWrite: false })); iconMats.set(key, m) }
      return m
    }
    const profile = [[0, 0], [0.42, 0], [0.43, 0.05], [0.39, 0.09], [0.33, 0.12], [0.27, 0.2], [0.22, 0.32], [0.21, 0.4], [0.29, 0.45], [0.31, 0.5], [0.27, 0.54], [0, 0.55]]
      .map(([x, y]) => new THREE.Vector2(x, y))
    const bodyGeo = track(new THREE.LatheGeometry(profile, 40))
    const rimGeo = track(new THREE.TorusGeometry(0.405, 0.03, 10, 48))
    const ringGeo = track(new THREE.TorusGeometry(0.46, 0.025, 8, 48))
    const sideMat = (color: string) => ({
      body: track(new THREE.MeshPhysicalMaterial({ color, metalness: 0.35, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.15, emissive: color, emissiveIntensity: 0.1 })),
      ring: track(new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 })),
    })
    const sideMats = { red: sideMat(theme.red), blue: sideMat(theme.blue) }
    const rimMat = track(new THREE.MeshStandardMaterial({ color: '#e8c36a', metalness: 0.95, roughness: 0.2 }))

    function makePiece(id: string, side: 'red' | 'blue', type: string, at: THREE.Vector3): PieceView {
      const group = new THREE.Group()
      const body = new THREE.Mesh(bodyGeo, sideMats[side].body)
      body.castShadow = high
      body.receiveShadow = high
      const rim = new THREE.Mesh(rimGeo, rimMat)
      rim.rotation.x = Math.PI / 2
      rim.position.y = 0.05
      const icon = new THREE.Sprite(iconMat(type))
      icon.scale.setScalar(0.5)
      icon.position.y = 0.86
      const ring = new THREE.Mesh(ringGeo, sideMats[side].ring)
      ring.rotation.x = Math.PI / 2
      ring.position.y = 0.02
      group.add(body, rim, icon, ring)
      group.traverse((o) => { o.userData.pieceId = id })
      group.position.copy(at)
      scene.add(group)
      const view: PieceView = { group, icon, side, type, from: at.clone(), to: at.clone(), start: 0, dur: 1, dying: 0, visible: true }
      pieces.set(id, view)
      return view
    }

    // Chướng ngại: khối đá nhiều mặt trên bệ lục giác, xoay theo toạ độ để mỗi viên một dáng.
    const rockGeo = track(new THREE.IcosahedronGeometry(0.36, 0))
    const rockBaseGeo = track(new THREE.CylinderGeometry(0.42, 0.45, 0.08, 6))
    const rockMat = track(new THREE.MeshStandardMaterial({ color: theme.obstacle, roughness: 0.85, metalness: 0.15, flatShading: true }))
    const rockBaseMat = track(new THREE.MeshStandardMaterial({ color: '#2a2d3a', roughness: 0.7 }))
    const markerGeo = track(new THREE.TorusGeometry(0.32, 0.05, 8, 32))
    const markerMats = new Map<string, THREE.MeshBasicMaterial>()
    const markerMat = (color: string) => { let m = markerMats.get(color); if (!m) { m = track(new THREE.MeshBasicMaterial({ color })); markerMats.set(color, m) } return m }

    // ---- Lớp gợi ý khi chọn quân: ô đi được (xanh lá), ô tấn công (đỏ), đường đã đi, vòng chọn.
    const moveGeo = track(new THREE.PlaneGeometry(0.86, 0.86))
    const moveMat = track(new THREE.MeshBasicMaterial({ color: '#4ade80', transparent: true, opacity: 0.45, depthWrite: false }))
    const attackGeo = track(new THREE.RingGeometry(0.3, 0.44, 36))
    const attackMat = track(new THREE.MeshBasicMaterial({ color: '#f87171', transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }))
    const dotGeo = track(new THREE.SphereGeometry(0.07, 12, 10))
    const pathMats = { red: track(new THREE.MeshBasicMaterial({ color: theme.red })), blue: track(new THREE.MeshBasicMaterial({ color: theme.blue })) }
    const lineMats = { red: track(new THREE.LineBasicMaterial({ color: theme.red, transparent: true, opacity: 0.9 })), blue: track(new THREE.LineBasicMaterial({ color: theme.blue, transparent: true, opacity: 0.9 })) }
    const selRing = new THREE.Mesh(track(new THREE.RingGeometry(0.5, 0.6, 48)), track(new THREE.MeshBasicMaterial({ color: theme.accent, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false })))
    selRing.rotation.x = -Math.PI / 2
    selRing.visible = false
    scene.add(selRing)
    let selected: string | null = null
    let following = false
    let glideUntil = 0
    let hovered: string | null = null
    let pathLine: THREE.BufferGeometry | null = null

    function select(id: string | null, h: Highlight, followPiece: boolean) {
      if (id && id !== selected) glideUntil = performance.now() + 900
      selected = id
      following = followPiece
      pathLine?.dispose(); pathLine = null
      hintGroup.clear()
      if (!id) return
      for (const [c, r] of h.moves) {
        const m = new THREE.Mesh(moveGeo, moveMat)
        m.rotation.x = -Math.PI / 2
        m.position.set(c - 4, 0.065, r - 4)
        hintGroup.add(m)
      }
      for (const [c, r] of h.attacks) {
        const m = new THREE.Mesh(attackGeo, attackMat)
        m.rotation.x = -Math.PI / 2
        m.position.set(c - 4, 0.07, r - 4)
        hintGroup.add(m)
      }
      if (h.path.length > 1) {
        const side = pieces.get(id)?.side ?? 'red'
        const pts = h.path.map(([c, r]) => new THREE.Vector3(c - 4, 0.12, r - 4))
        pathLine = new THREE.BufferGeometry().setFromPoints(pts)
        hintGroup.add(new THREE.Line(pathLine, lineMats[side]))
        for (const p of pts.slice(0, -1)) { const d = new THREE.Mesh(dotGeo, pathMats[side]); d.position.copy(p); hintGroup.add(d) }
      }
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
          ringMesh.scale.setScalar(1 + life * (big ? 9 : 6))
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

    function apply(step: any, _prevStep: any, animateMoves: boolean) {
      const now = performance.now()
      const seen = new Set<string>()
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
          if (!view.visible) { view.visible = true; view.group.visible = true; view.group.scale.setScalar(1); view.group.position.copy(target) }
          view.dying = 0
          // Cập nhật huy hiệu khi loại quân đổi (tiến hóa) hoặc lộ ra.
          if ((p.type || '?') !== view.type) { view.type = p.type || '?'; view.icon.material = iconMat(view.type) }
          const moved = view.to.x !== target.x || view.to.z !== target.z
          if (moved) {
            if (animateMoves) { view.from.copy(view.group.position); view.to.copy(target); view.start = now; view.dur = 520 }
            else { view.group.position.copy(target); view.from.copy(target); view.to.copy(target); view.start = 0 }
          }
        }
      }
      for (const [id, view] of pieces) if (!seen.has(id) && view.visible) { view.group.visible = false; view.visible = false }

      // Chướng ngại vật và ô đặc biệt (hình học dùng chung, không tạo mới mỗi bước).
      obstacleGroup.clear()
      markerGroup.clear()
      const mystery = step?.mystery_tiles || {}
      for (const [c, r] of asCells(step?.obstacles || mystery.obstacles)) {
        const base = new THREE.Mesh(rockBaseGeo, rockBaseMat)
        base.position.set(c - 4, 0.09, r - 4)
        const rock = new THREE.Mesh(rockGeo, rockMat)
        rock.position.set(c - 4, 0.38, r - 4)
        rock.scale.set(1, 0.85, 1)
        rock.rotation.set((c * 1.3) % 1, c * 0.7 + r * 1.9, (r * 0.9) % 1)
        rock.castShadow = high
        rock.receiveShadow = high
        obstacleGroup.add(base, rock)
      }
      const spec: [any, string][] = [[mystery.evolve, '#7dffb2'], [mystery.portals, '#b388ff'], [mystery.traps, '#ff6b6b']]
      for (const [list, color] of spec) {
        for (const [c, r] of asCells(list)) {
          const ring = new THREE.Mesh(markerGeo, markerMat(color))
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
    controls.minDistance = 4
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

    // ---- Bấm / rê chuột vào quân (phân biệt bấm với kéo xoay camera).
    const ray = new THREE.Raycaster()
    const ndc = new THREE.Vector2()
    const pick = (event: PointerEvent): string | null => {
      const rect = renderer.domElement.getBoundingClientRect()
      ndc.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1)
      ray.setFromCamera(ndc, cam)
      const targets: THREE.Object3D[] = []
      for (const v of pieces.values()) if (v.visible && !v.dying) targets.push(v.group)
      return ray.intersectObjects(targets, true)[0]?.object.userData.pieceId ?? null
    }
    let down: { x: number; y: number } | null = null
    const onDown = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY } }
    const onUp = (e: PointerEvent) => {
      const start = down
      down = null
      if (!start || Math.hypot(e.clientX - start.x, e.clientY - start.y) > 6) return
      const id = pick(e)
      latest.current.onSelect?.(id && id !== selected ? id : null)
    }
    const onMove = (e: PointerEvent) => {
      if (e.buttons) return
      hovered = pick(e)
      renderer.domElement.style.cursor = hovered ? 'pointer' : mode === 'free' ? 'grab' : 'default'
    }
    const onLeave = () => { hovered = null }
    renderer.domElement.addEventListener('pointerdown', onDown)
    renderer.domElement.addEventListener('pointerup', onUp)
    renderer.domElement.addEventListener('pointermove', onMove)
    renderer.domElement.addEventListener('pointerleave', onLeave)

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
    const origin = new THREE.Vector3(0, 0, 0)
    const flat = new THREE.Vector3()

    const loop = () => {
      raf = requestAnimationFrame(loop)
      if (!onScreen || document.hidden) { last = performance.now(); return }
      const now = performance.now()
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now

      // Quân: nhảy cung khi di chuyển, phóng to khi rê/chọn, xoay và tan khi bị diệt.
      for (const [id, view] of pieces) {
        if (view.dying) {
          const k = Math.min(1, (now - view.dying) / 650)
          view.group.scale.setScalar(Math.max(0.001, 1 - ease(k)))
          view.group.rotation.y += dt * 8
          view.group.position.y = 0.05 + k * 0.6
          if (k >= 1) { view.group.visible = false; view.visible = false; view.dying = 0; view.group.rotation.y = 0 }
          continue
        }
        if (view.start) {
          const k = Math.min(1, (now - view.start) / view.dur)
          view.group.position.lerpVectors(view.from, view.to, ease(k))
          view.group.position.y = 0.05 + Math.sin(k * Math.PI) * 0.55
          if (k >= 1) view.start = 0
        }
        if (view.visible) {
          const want = id === hovered || id === selected ? 1.15 : 1
          const cur = view.group.scale.x
          view.group.scale.setScalar(cur + (want - cur) * Math.min(1, dt * 12))
          view.icon.position.y = 0.86 + (id === selected ? Math.sin(now / 260) * 0.06 : 0)
        }
      }
      const chosen = selected ? pieces.get(selected) : undefined
      const live = !!chosen && chosen.visible && !chosen.dying
      selRing.visible = live
      if (live) {
        selRing.position.set(chosen!.group.position.x, 0.08, chosen!.group.position.z)
        selRing.scale.setScalar(1 + Math.sin(now / 220) * 0.06)
        flat.set(chosen!.group.position.x, 0, chosen!.group.position.z)
      }
      const tracking = live && (following || now < glideUntil)

      for (let i = fx.length - 1; i >= 0; i--) {
        if (!fx[i].update(now, dt)) { fx[i].dispose(); fx.splice(i, 1) }
      }
      dustPoints.rotation.y += dt * 0.02
      redLight.intensity = 22 + Math.sin(now / 600) * 4
      blueLight.intensity = 22 + Math.cos(now / 650) * 4

      if (mode === 'cinematic') {
        const recent = Math.max(0, 1 - (now - clashAt) / 2200)
        const wantFocus = tracking ? flat : recent > 0 ? clashPos : origin
        focus.lerp(wantFocus, 1 - Math.exp(-dt * 2.2))
        theta += dt * (0.1 + recent * 0.05)
        const t = (now - t0) / 1000
        const elevation = 0.78 + Math.sin(t * 0.33) * 0.1 - recent * 0.12
        const radius = 13.5 + Math.sin(t * 0.21) * 1.4 - recent * 5 - (tracking ? 4.5 : 0)
        cam.position.set(focus.x + Math.sin(theta) * Math.cos(elevation) * radius, focus.y + Math.sin(elevation) * radius, focus.z + Math.cos(theta) * Math.cos(elevation) * radius)
        cam.lookAt(focus)
        if (bloom) bloom.strength = 0.28 + recent * 0.4
      } else if (mode === 'top') {
        focus.lerp(origin, 1 - Math.exp(-dt * 3))
        cam.position.lerp(new THREE.Vector3(0, 15.5, 4.2), 1 - Math.exp(-dt * 3))
        cam.lookAt(0, 0, 0)
      } else {
        if (tracking) controls.target.lerp(flat, 1 - Math.exp(-dt * 4))
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
      select,
      capture: () => {
        if (composer) composer.render(); else renderer.render(scene, cam)
        return renderer.domElement.toDataURL('image/png')
      },
    }
    apply(latest.current.step, latest.current.prev, false)
    select(latest.current.selectedId, latest.current.highlight, latest.current.follow)

    return () => {
      cancelAnimationFrame(raf)
      renderer.domElement.removeEventListener('pointerdown', onDown)
      renderer.domElement.removeEventListener('pointerup', onUp)
      renderer.domElement.removeEventListener('pointermove', onMove)
      renderer.domElement.removeEventListener('pointerleave', onLeave)
      observer.disconnect()
      io.disconnect()
      controls.dispose()
      fx.forEach((f) => f.dispose())
      pathLine?.dispose()
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
  useEffect(() => { api.current?.select(selectedId, highlight, follow) }, [selectedId, highlight, follow])

  return <div ref={host} className="aspect-[4/3] min-h-[320px] w-full overflow-hidden rounded-2xl border border-border bg-black/40" aria-label="Sân đấu 3D — bấm vào quân để xem chi tiết" />
}
