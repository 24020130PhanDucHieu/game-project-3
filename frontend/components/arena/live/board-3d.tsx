'use client'

import { useEffect, useRef, type MutableRefObject } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { BASES, type BoardTheme } from './board-themes'
import { drawPieceIcon } from './piece-icons'
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
  /** Cho phép phím F bật/tắt chỉ báo FPS (màn hình trình chiếu). */
  fpsKey?: boolean
}

const toPos = (col: number, row: number) => new THREE.Vector3(col - 4, 0.05, row - 4)
const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)

type PieceView = {
  group: THREE.Group
  icon: THREE.Sprite
  blob: THREE.Mesh
  side: 'red' | 'blue'
  type: string
  from: THREE.Vector3
  to: THREE.Vector3
  start: number
  dur: number
  dying: number
  visible: boolean
  /** Hệ số phóng to khi rê chuột/chọn, và xung nảy khi thắng va chạm. */
  hs: number
  kick: number
  /** Đang bị hất bay (cú đánh điện ảnh): không dùng hoạt ảnh thường. */
  flung: boolean
}

type Spring = { x: number; v: number }
/** Lò xo giảm chấn tới hạn: mượt, không vọt quá đích, ổn định với dt ≤ 0.05. */
const spring = (s: Spring, target: number, omega: number, dt: number) => {
  s.v += (omega * omega * (target - s.x) - 2 * omega * s.v) * dt
  s.x += s.v * dt
}

function canvasTexture(size: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  draw(canvas.getContext('2d')!)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

/** Huy hiệu tròn viền vàng chứa biểu tượng quân vẽ riêng (giống bàn 2D, không phụ thuộc font emoji). */
const iconTexture = (type: string) => canvasTexture(128, (ctx) => {
  const g = ctx.createRadialGradient(52, 46, 6, 64, 64, 62)
  g.addColorStop(0, 'rgba(255,255,255,0.97)')
  g.addColorStop(1, 'rgba(200,205,226,0.92)')
  ctx.fillStyle = g
  ctx.beginPath(); ctx.arc(64, 64, 57, 0, Math.PI * 2); ctx.fill()
  ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(232,195,106,1)'; ctx.stroke()
  drawPieceIcon(ctx, type, 128, '#312e81')
})

const labelTexture = (text: string, color: string) => canvasTexture(64, (ctx) => {
  ctx.font = 'bold 40px ui-monospace,Consolas,monospace'
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillStyle = color
  ctx.fillText(text, 32, 34)
})

/** Bóng mềm dưới quân: thay bóng đổ nặng khi máy yếu mà vẫn có chiều sâu. */
const blobTexture = () => canvasTexture(64, (ctx) => {
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30)
  g.addColorStop(0, 'rgba(0,0,0,0.6)')
  g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 64, 64)
})

const luminance = (hex: string) => { const c = new THREE.Color(hex); return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b }
const fxMode = () => (typeof document === 'undefined' ? 'full' : document.documentElement.getAttribute('data-fx') || 'full')

// Phong cách cú đánh theo quân thắng: Búa vỡ mảnh kim loại, Bao tung giấy, Kéo có vệt chém.
type Flavor = { color: string; n: number; speed: number; gravity: number; paper: boolean; ring: number; shake: number; slash: boolean }
const FLAVOR: Record<string, Flavor> = {
  ROCK: { color: '#aab3c2', n: 26, speed: 4.6, gravity: 11, paper: false, ring: 1.5, shake: 0.7, slash: false },
  PAPER: { color: '#ffffff', n: 22, speed: 3.2, gravity: 1.6, paper: true, ring: 1.0, shake: 0.3, slash: false },
  SCISSORS: { color: '#e5e7eb', n: 18, speed: 3.8, gravity: 2.4, paper: true, ring: 1.0, shake: 0.4, slash: true },
}
const DEFAULT_FLAVOR: Flavor = { color: '#ffe066', n: 18, speed: 4, gravity: 9, paper: false, ring: 1.1, shake: 0.4, slash: false }

const T_FLY = 0.34 // thời gian bay (theo đồng hồ hiệu ứng, chạy chậm 0.22×) ≈ 1.5 giây thật
const SLOW = 0.22
const HITSTOP = 0.09
const FADE = 0.4
const SPARKS = 32
const FLOOR_Y = -0.62

/** Sân đấu 3D: bàn có khung vát và toạ độ, quân dạng tượng, đá chướng ngại, bấm vào quân để xem nước đi. */
export default function Board3D({ step, prev, animate, theme, camera, quality, onUnsupported, handleRef, selectedId = null, highlight = NO_HIGHLIGHT, follow = false, onSelect, fpsKey = false }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const api = useRef<{
    apply: (step: any, prev: any, animate: boolean) => void
    setCamera: (mode: CameraMode) => void
    select: (id: string | null, highlight: Highlight, follow: boolean) => void
    capture: () => string | null
    toggleFps: () => void
  } | null>(null)
  const latest = useRef({ step, prev, animate, camera, selectedId, highlight, follow, onSelect })
  latest.current = { step, prev, animate, camera, selectedId, highlight, follow, onSelect }

  useEffect(() => {
    if (!handleRef) return
    handleRef.current = { capture: () => api.current?.capture() ?? null }
    return () => { handleRef.current = null }
  }, [handleRef])

  useEffect(() => {
    if (!fpsKey) return
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (e.key.toLowerCase() !== 'f' || e.ctrlKey || e.metaKey || e.altKey || t?.closest('input,textarea,select,[contenteditable="true"]')) return
      api.current?.toggleFps()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fpsKey])

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
    const baseTier = high ? 0 : 2
    let tier = baseTier
    const PIXEL = [Math.min(window.devicePixelRatio || 1, 1.5), Math.min(window.devicePixelRatio || 1, 1.25), 1, 0.85]
    renderer.setPixelRatio(PIXEL[tier])
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.05
    renderer.shadowMap.enabled = high
    renderer.shadowMap.type = THREE.PCFShadowMap
    el.appendChild(renderer.domElement)
    // Hiện dần sau khi biên dịch xong để không nháy khi mở 3D.
    renderer.domElement.style.cssText = 'width:100%;height:100%;display:block;border-radius:inherit;touch-action:pan-y;opacity:0;transition:opacity .45s ease'

    const dark = luminance(theme.backdrop) < 0.45
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(theme.backdrop)
    scene.fog = new THREE.Fog(theme.fog, 16, 40)
    const cam = new THREE.PerspectiveCamera(42, 1, 0.1, 140)
    cam.position.set(0, 9, 11)

    const disposables: { dispose: () => void }[] = []
    const track = <T extends { dispose: () => void }>(item: T) => { disposables.push(item); return item }

    // ---- Môi trường phản xạ (chỉ chất lượng cao): kim loại và lớp bóng của quân/khung có phản chiếu thật.
    if (high) {
      const pmrem = new THREE.PMREMGenerator(renderer)
      const room = new RoomEnvironment()
      const envRT = pmrem.fromScene(room, 0.04)
      scene.environment = envRT.texture
      scene.environmentIntensity = dark ? 0.35 : 0.55
      room.dispose()
      pmrem.dispose()
      track(envRT)
    }

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
    // Đèn chớp dùng chung cho mọi va chạm: tạo sẵn một lần (thêm/bớt đèn giữa chừng làm biên dịch lại mọi vật liệu → giật).
    const flashLight = new THREE.PointLight('#ffffff', 0, 8, 1.6)
    scene.add(redLight, blueLight, flashLight)

    // ---- Vòm trời: gradient + sao lấp lánh hai lớp (thị sai nhẹ khi camera quay).
    const skyUniforms = {
      top: { value: new THREE.Color(theme.backdrop).multiplyScalar(dark ? 0.55 : 0.93) },
      horizon: { value: new THREE.Color(theme.backdrop).lerp(new THREE.Color(theme.accent), dark ? 0.22 : 0.12) },
    }
    const sky = new THREE.Mesh(
      track(new THREE.SphereGeometry(70, 24, 16)),
      track(new THREE.ShaderMaterial({
        uniforms: skyUniforms, side: THREE.BackSide, depthWrite: false, fog: false,
        vertexShader: 'varying float vY; void main(){ vY = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: 'uniform vec3 top; uniform vec3 horizon; varying float vY; void main(){ float k = smoothstep(-0.05, 0.75, vY); gl_FragColor = vec4(mix(horizon, top, k), 1.0); }',
      })),
    )
    sky.renderOrder = -10
    scene.add(sky)
    const starLayers: { points: THREE.Points; mat: THREE.PointsMaterial; speed: number; phase: number }[] = []
    if (dark) {
      for (const [count, size, speed, radius] of [[420, 1.4, 0.004, 62], [110, 2.4, 0.009, 52]] as const) {
        const geo = track(new THREE.BufferGeometry())
        const pos = new Float32Array(count * 3)
        for (let i = 0; i < count; i++) {
          const u = Math.random() * Math.PI * 2
          const y = 0.08 + Math.random() * 0.92
          const r = Math.sqrt(1 - y * y)
          pos.set([Math.cos(u) * r * radius, y * radius, Math.sin(u) * r * radius], i * 3)
        }
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
        const mat = track(new THREE.PointsMaterial({ color: '#ffffff', size, sizeAttenuation: false, transparent: true, opacity: 0.7, depthWrite: false, fog: false }))
        const points = new THREE.Points(geo, mat)
        scene.add(points)
        starLayers.push({ points, mat, speed, phase: Math.random() * 6 })
      }
    }

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

    // ---- Sàn đấu tròn nhiều tầng + vòng sáng đồng tâm chạy chậm; sàn xa mờ dần vào sương.
    const floor = new THREE.Mesh(track(new THREE.PlaneGeometry(120, 120)), track(new THREE.MeshStandardMaterial({ color: theme.backdrop, roughness: 0.85, metalness: 0.1 })))
    floor.rotation.x = -Math.PI / 2
    floor.position.y = FLOOR_Y - 0.03
    floor.receiveShadow = true
    scene.add(floor)
    const stageMat = track(new THREE.MeshStandardMaterial({ color: new THREE.Color(theme.backdrop).lerp(new THREE.Color(theme.frame), 0.18), roughness: 0.5, metalness: 0.4 }))
    const stage = new THREE.Mesh(track(new THREE.CylinderGeometry(11, 11.5, 0.12, 72)), stageMat)
    stage.position.y = FLOOR_Y - 0.06
    stage.receiveShadow = true
    scene.add(stage)
    const ringUniforms = { time: { value: 0 }, color: { value: new THREE.Color(theme.accent) } }
    const rings = new THREE.Mesh(
      track(new THREE.RingGeometry(6.6, 11, 96, 1)),
      track(new THREE.ShaderMaterial({
        uniforms: ringUniforms, transparent: true, depthWrite: false, blending: dark ? THREE.AdditiveBlending : THREE.NormalBlending,
        vertexShader: 'varying float vR; void main(){ vR = length(position.xy); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: 'uniform float time; uniform vec3 color; varying float vR; void main(){ float band = smoothstep(0.55, 1.0, sin(vR * 3.2 - time * 0.9)); float fade = 1.0 - smoothstep(7.0, 11.0, vR); float edge = smoothstep(10.7, 10.95, vR) * (1.0 - smoothstep(10.95, 11.0, vR)); gl_FragColor = vec4(color, (band * 0.16 + edge * 0.5) * (0.35 + fade)); }',
      })),
    )
    rings.rotation.x = -Math.PI / 2
    rings.position.y = FLOOR_Y + 0.005
    scene.add(rings)

    // ---- Trang trí (chỉ chất lượng cao, tắt khi máy yếu hoặc hiệu ứng "Gọn/Tắt"): tinh thể trôi, cờ hai đội, cột sáng quét.
    const decor = new THREE.Group()
    scene.add(decor)
    const dummy = new THREE.Object3D()
    const CRYSTALS = 10
    const crystalSeed = Array.from({ length: CRYSTALS }, (_, i) => ({ a: (i / CRYSTALS) * Math.PI * 2 + Math.random() * 0.5, r: 14 + Math.random() * 5, y: 1.4 + Math.random() * 3.6, s: 0.6 + Math.random() * 0.9, ph: Math.random() * 6 }))
    let crystals: THREE.InstancedMesh | null = null
    const flags: { geo: THREE.PlaneGeometry; base: Float32Array }[] = []
    const beams: THREE.Mesh[] = []
    if (high) {
      crystals = new THREE.InstancedMesh(
        track(new THREE.OctahedronGeometry(0.5, 0)),
        track(new THREE.MeshStandardMaterial({ color: theme.frame, emissive: theme.accent, emissiveIntensity: 0.28, metalness: 0.7, roughness: 0.22, flatShading: true })),
        CRYSTALS,
      )
      crystals.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      decor.add(crystals)
      const poleGeo = track(new THREE.CylinderGeometry(0.06, 0.08, 4.4, 8))
      const poleMat = track(new THREE.MeshStandardMaterial({ color: '#d4a64a', metalness: 0.9, roughness: 0.3 }))
      for (const [x, z, color] of [[-8.2, 7.4, theme.red], [8.2, -7.4, theme.blue]] as const) {
        const pole = new THREE.Mesh(poleGeo, poleMat)
        pole.position.set(x, FLOOR_Y + 2.2, z)
        const geo = track(new THREE.PlaneGeometry(1.7, 0.95, 10, 4))
        flags.push({ geo, base: (geo.getAttribute('position').array as Float32Array).slice() })
        const flag = new THREE.Mesh(geo, track(new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.35, side: THREE.DoubleSide, roughness: 0.6 })))
        flag.position.set(x + 0.9, FLOOR_Y + 3.7, z)
        flag.rotation.y = x < 0 ? 0.5 : -0.5 + Math.PI
        decor.add(pole, flag)
      }
      if (dark) {
        const beamGeo = track(new THREE.ConeGeometry(2.4, 15, 24, 1, true))
        beamGeo.rotateX(Math.PI)
        beamGeo.translate(0, 7.5, 0)
        for (const color of [theme.red, theme.blue]) {
          const beam = new THREE.Mesh(beamGeo, track(new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.032, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false })))
          beams.push(beam)
          decor.add(beam)
        }
      }
    }

    // Hạt bụi sáng lơ lửng + tàn lửa bay lên: hai lớp tạo chiều sâu.
    const dustGeo = track(new THREE.BufferGeometry())
    const dust = new Float32Array(240 * 3)
    for (let i = 0; i < 240; i++) { dust[i * 3] = (Math.random() - 0.5) * 24; dust[i * 3 + 1] = Math.random() * 9; dust[i * 3 + 2] = (Math.random() - 0.5) * 24 }
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dust, 3))
    const dustPoints = new THREE.Points(dustGeo, track(new THREE.PointsMaterial({ color: theme.accent, size: 0.05, transparent: true, opacity: 0.55, depthWrite: false })))
    scene.add(dustPoints)
    const EMBERS = high ? 90 : 0
    const emberGeo = track(new THREE.BufferGeometry())
    const embers = new Float32Array(EMBERS * 3)
    const emberSpeed = new Float32Array(EMBERS)
    for (let i = 0; i < EMBERS; i++) { embers.set([(Math.random() - 0.5) * 20, Math.random() * 7, (Math.random() - 0.5) * 20], i * 3); emberSpeed[i] = 0.25 + Math.random() * 0.5 }
    emberGeo.setAttribute('position', new THREE.BufferAttribute(embers, 3))
    const emberPoints = new THREE.Points(emberGeo, track(new THREE.PointsMaterial({ color: dark ? theme.accent : theme.frame, size: 0.07, transparent: true, opacity: 0.8, depthWrite: false, blending: dark ? THREE.AdditiveBlending : THREE.NormalBlending })))
    emberPoints.visible = EMBERS > 0
    scene.add(emberPoints)

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
      if (!m) { m = track(new THREE.SpriteMaterial({ map: track(iconTexture(key)), transparent: true, toneMapped: false, depthWrite: false })); iconMats.set(key, m) }
      return m
    }
    const profile = [[0, 0], [0.42, 0], [0.43, 0.05], [0.39, 0.09], [0.33, 0.12], [0.27, 0.2], [0.22, 0.32], [0.21, 0.4], [0.29, 0.45], [0.31, 0.5], [0.27, 0.54], [0, 0.55]]
      .map(([x, y]) => new THREE.Vector2(x, y))
    const bodyGeo = track(new THREE.LatheGeometry(profile, 40))
    const rimGeo = track(new THREE.TorusGeometry(0.405, 0.03, 10, 48))
    const ringGeo = track(new THREE.TorusGeometry(0.46, 0.025, 8, 48))
    const blobGeo = track(new THREE.PlaneGeometry(1.25, 1.25))
    const blobMat = track(new THREE.MeshBasicMaterial({ map: track(blobTexture()), transparent: true, depthWrite: false, opacity: 0.85 }))
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
      const blob = new THREE.Mesh(blobGeo, blobMat)
      blob.rotation.x = -Math.PI / 2
      blob.renderOrder = 1
      scene.add(blob)
      const view: PieceView = { group, icon, blob, side, type, from: at.clone(), to: at.clone(), start: 0, dur: 1, dying: 0, visible: true, hs: 1, kick: 0, flung: false }
      pieces.set(id, view)
      return view
    }
    const setVisible = (view: PieceView, on: boolean) => { view.visible = on; view.group.visible = on; view.blob.visible = on }

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

    // ============ Hiệu ứng va chạm: TẤT CẢ đối tượng tạo sẵn một lần ở đây, không tạo thêm gì khi có va chạm. ============
    // Tia lửa: một Points 32 hạt dùng chung.
    const sparkPos = new Float32Array(SPARKS * 3)
    const sparkVel = new Float32Array(SPARKS * 3)
    const sparkGeo = track(new THREE.BufferGeometry())
    sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3))
    const sparkMat = track(new THREE.PointsMaterial({ color: '#ffffff', size: 0.12, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }))
    const sparkPoints = new THREE.Points(sparkGeo, sparkMat)
    sparkPoints.frustumCulled = false
    sparkPoints.visible = false
    scene.add(sparkPoints)
    const spark = { life: 0, max: 1.1, on: false }
    // Vòng sóng xung kích: 2 vòng luân phiên.
    const ringGeoShared = track(new THREE.RingGeometry(0.2, 0.3, 48))
    const shock = [0, 1].map(() => {
      const mat = track(new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }))
      const mesh = new THREE.Mesh(ringGeoShared, mat)
      mesh.rotation.x = -Math.PI / 2
      mesh.visible = false
      scene.add(mesh)
      return { mesh, mat, life: 0, on: false, speed: 6 }
    })
    let shockNext = 0
    // Mảnh vụn / giấy: một InstancedMesh (một draw call), tối đa 64 mảnh.
    const DEBRIS = high ? 64 : 24
    const debrisMesh = new THREE.InstancedMesh(track(new THREE.BoxGeometry(1, 1, 1)), track(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.55, metalness: 0.4 })), DEBRIS)
    debrisMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    debrisMesh.frustumCulled = false
    debrisMesh.visible = false
    const hide = new THREE.Matrix4().makeScale(0, 0, 0)
    const white = new THREE.Color('#ffffff')
    for (let i = 0; i < DEBRIS; i++) { debrisMesh.setMatrixAt(i, hide); debrisMesh.setColorAt(i, white) }
    scene.add(debrisMesh)
    const dState = new Float32Array(DEBRIS * 10) // x y z vx vy vz rx ry sx(kích thước) life
    const debris = { n: 0, on: false, gravity: 9, paper: false, life: 1.4 }
    const tmpColor = new THREE.Color()
    // Vệt chém của Kéo.
    const slashMat = track(new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }))
    const slash = new THREE.Mesh(track(new THREE.PlaneGeometry(1, 0.07)), slashMat)
    slash.rotation.x = -Math.PI / 2
    slash.visible = false
    scene.add(slash)
    const slashState = { life: 0, on: false, len: 3.2 }
    let flash = 0 // cường độ đèn chớp còn lại
    let flashMax = 60
    let shake = 0

    function startShock(x: number, z: number, color: string, scale: number) {
      const s = shock[shockNext]
      shockNext = (shockNext + 1) % shock.length
      s.mesh.position.set(x, 0.09, z)
      s.mesh.scale.setScalar(1)
      s.mat.color.set(color)
      s.speed = 6.5 * scale
      s.life = 0; s.on = true; s.mesh.visible = true
    }

    /** Tia lửa + vòng sóng + đèn chớp dùng chung cho mọi sự kiện (cứ điểm, dịch chuyển, tiến hóa, bẫy, va chạm). */
    function burst(x: number, z: number, color: string, big = false) {
      for (let i = 0; i < SPARKS; i++) {
        sparkPos[i * 3] = x; sparkPos[i * 3 + 1] = 0.35; sparkPos[i * 3 + 2] = z
        sparkVel[i * 3] = (Math.random() - 0.5) * (big ? 6 : 4); sparkVel[i * 3 + 1] = Math.random() * (big ? 6 : 4.2); sparkVel[i * 3 + 2] = (Math.random() - 0.5) * (big ? 6 : 4)
      }
      sparkMat.color.set(color)
      sparkMat.size = big ? 0.18 : 0.12
      spark.life = 0; spark.max = big ? 1.4 : 1.1; spark.on = true; sparkPoints.visible = true
      startShock(x, z, color, big ? 1.5 : 1)
      flashLight.color.set(color)
      flashLight.position.set(x, 1, z)
      flashMax = big ? 70 : 45; flash = 1
    }

    /** Cú đánh điện ảnh: mảnh vụn theo loại quân thắng. Dùng lại nhóm 64 mảnh, không tạo mới. */
    function spawnDebris(x: number, z: number, f: Flavor) {
      debris.n = Math.min(DEBRIS, f.n); debris.gravity = f.gravity; debris.paper = f.paper; debris.life = f.paper ? 2.2 : 1.4; debris.on = true
      tmpColor.set(f.color)
      for (let i = 0; i < DEBRIS; i++) {
        const o = i * 10
        if (i >= debris.n) { debrisMesh.setMatrixAt(i, hide); continue }
        const a = Math.random() * Math.PI * 2
        const sp = f.speed * (0.4 + Math.random() * 0.8)
        dState[o] = x + (Math.random() - 0.5) * 0.3; dState[o + 1] = 0.25 + Math.random() * 0.2; dState[o + 2] = z + (Math.random() - 0.5) * 0.3
        dState[o + 3] = Math.cos(a) * sp; dState[o + 4] = 1.5 + Math.random() * sp * 0.9; dState[o + 5] = Math.sin(a) * sp
        dState[o + 6] = Math.random() * 6; dState[o + 7] = Math.random() * 6
        dState[o + 8] = f.paper ? 0.2 + Math.random() * 0.14 : 0.07 + Math.random() * 0.08
        dState[o + 9] = 0
        debrisMesh.setColorAt(i, tmpColor)
      }
      if (debrisMesh.instanceColor) debrisMesh.instanceColor.needsUpdate = true
      debrisMesh.visible = true
    }

    function updateFx(edt: number) {
      if (spark.on) {
        spark.life += edt
        for (let i = 0; i < SPARKS; i++) {
          sparkVel[i * 3 + 1] -= 9 * edt
          sparkPos[i * 3] += sparkVel[i * 3] * edt
          sparkPos[i * 3 + 1] = Math.max(0.05, sparkPos[i * 3 + 1] + sparkVel[i * 3 + 1] * edt)
          sparkPos[i * 3 + 2] += sparkVel[i * 3 + 2] * edt
        }
        sparkGeo.getAttribute('position').needsUpdate = true
        sparkMat.opacity = Math.max(0, 1 - spark.life / spark.max)
        if (spark.life >= spark.max) { spark.on = false; sparkPoints.visible = false }
      }
      for (const s of shock) {
        if (!s.on) continue
        s.life += edt
        s.mesh.scale.setScalar(1 + s.life * s.speed)
        s.mat.opacity = Math.max(0, 0.9 - s.life * 1.3)
        if (s.mat.opacity <= 0) { s.on = false; s.mesh.visible = false }
      }
      if (flash > 0) {
        flash = Math.max(0, flash - edt / 0.45)
        flashLight.intensity = flashMax * flash
      }
      if (debris.on) {
        let alive = 0
        for (let i = 0; i < debris.n; i++) {
          const o = i * 10
          if (dState[o + 9] >= debris.life) { debrisMesh.setMatrixAt(i, hide); continue }
          dState[o + 9] += edt
          const k = 1 - dState[o + 9] / debris.life
          if (debris.paper) {
            // Giấy: rơi chậm, lắc lư, lực cản không khí lớn.
            dState[o + 3] *= 1 - Math.min(1, 2.4 * edt); dState[o + 5] *= 1 - Math.min(1, 2.4 * edt)
            dState[o + 4] += (-debris.gravity - dState[o + 4] * 1.8) * edt
            dState[o] += (dState[o + 3] + Math.sin(dState[o + 9] * 7 + i) * 0.5) * edt
            dState[o + 2] += (dState[o + 5] + Math.cos(dState[o + 9] * 6 + i) * 0.5) * edt
          } else {
            dState[o + 4] -= debris.gravity * edt
            dState[o] += dState[o + 3] * edt; dState[o + 2] += dState[o + 5] * edt
          }
          dState[o + 1] += dState[o + 4] * edt
          if (dState[o + 1] < FLOOR_Y + 0.05) { dState[o + 1] = FLOOR_Y + 0.05; dState[o + 4] = 0; dState[o + 3] *= 0.6; dState[o + 5] *= 0.6 }
          dummy.position.set(dState[o], dState[o + 1], dState[o + 2])
          dummy.rotation.set(dState[o + 6] + dState[o + 9] * 5, dState[o + 7] + dState[o + 9] * 4, 0)
          const sz = dState[o + 8] * Math.min(1, k * 2.4)
          if (debris.paper) dummy.scale.set(sz * 1.5, sz * 0.12, sz); else dummy.scale.setScalar(sz)
          dummy.updateMatrix()
          debrisMesh.setMatrixAt(i, dummy.matrix)
          alive++
        }
        debrisMesh.instanceMatrix.needsUpdate = true
        if (!alive) { debris.on = false; debrisMesh.visible = false }
      }
      if (slashState.on) {
        slashState.life += edt
        const k = slashState.life / 0.45
        slash.scale.set(slashState.len * Math.min(1, k * 4), 1, 1)
        slashMat.opacity = Math.max(0, 1 - k)
        if (k >= 1) { slashState.on = false; slash.visible = false }
      }
      shake = Math.max(0, shake - edt * 1.6)
    }
    const fxActive = () => spark.on || debris.on || slashState.on || flash > 0 || shock[0].on || shock[1].on

    // ---- Lịch sự kiện nhỏ (thay setTimeout để không còn việc chạy sau khi cảnh đã bị huỷ).
    type Job = { at: number; kind: 0 | 1 | 2; x: number; z: number; color: string; big: boolean }
    const jobs: Job[] = Array.from({ length: 4 }, () => ({ at: 0, kind: 0, x: 0, z: 0, color: '#fff', big: false }))
    function schedule(at: number, kind: 1 | 2, x: number, z: number, color: string, big: boolean) {
      const j = jobs.find((q) => q.kind === 0) ?? jobs[0]
      j.at = at; j.kind = kind; j.x = x; j.z = z; j.color = color; j.big = big
    }

    // ---- Cú đánh điện ảnh (một cảnh tại một thời điểm).
    const cine = {
      phase: 0 as 0 | 1 | 2 | 3 | 4, // 0 nghỉ, 1 chờ va chạm, 2 dừng hình, 3 bay, 4 mờ dần
      impactAt: 0, rt: 0, t: 0, fade: 0,
      loser: null as PieceView | null, winner: null as PieceView | null,
      flavor: DEFAULT_FLAVOR, sx: 0, sz: 0, dx: 0, dz: 0, spin: 1,
      pos: new THREE.Vector3(), color: '#ffe066',
    }
    let timeScale = 1
    const cineAllowed = () => high && tier <= 1 && fxMode() === 'full' && !document.hidden
    function endCine() {
      const l = cine.loser
      if (l) { l.flung = false; l.group.rotation.set(0, 0, 0); l.group.scale.setScalar(1); setVisible(l, false) }
      cine.phase = 0; cine.loser = null; cine.winner = null; timeScale = 1
    }
    function startImpact() {
      const l = cine.loser, w = cine.winner
      if (!l) { cine.phase = 0; return }
      const f = cine.flavor
      cine.sx = l.group.position.x; cine.sz = l.group.position.z
      // Hướng hất: từ quân thắng sang quân thua (nếu trùng ô thì hất ra ngoài tâm bàn), rồi đẩy tới khi rơi hẳn ngoài mép bàn.
      let dx = w ? cine.sx - w.from.x : cine.sx, dz = w ? cine.sz - w.from.z : cine.sz
      if (Math.hypot(dx, dz) < 0.2) { dx = cine.sx || 1; dz = cine.sz }
      const n = Math.hypot(dx, dz) || 1
      dx /= n; dz /= n
      let s = 4
      while (Math.max(Math.abs(cine.sx + dx * s), Math.abs(cine.sz + dz * s)) < 6.5 && s < 16) s += 0.5
      cine.dx = dx * s; cine.dz = dz * s
      cine.spin = Math.random() < 0.5 ? -1 : 1
      cine.t = 0; cine.rt = 0; cine.fade = 0
      cine.phase = 2; timeScale = 0.03
      l.flung = true; l.blob.visible = false
      if (w) w.kick = 1
      burst(cine.sx, cine.sz, cine.color, false)
      startShock(cine.sx, cine.sz, cine.color, f.ring)
      spawnDebris(cine.sx, cine.sz, f)
      if (f.slash) {
        slash.position.set(cine.sx, 0.5, cine.sz)
        slash.rotation.set(-Math.PI / 2, 0, Math.atan2(dz, dx) + 0.9)
        slashState.life = 0; slashState.on = true; slash.visible = true
      }
      shake = f.shake
      flashMax = 60; flash = 1; flashLight.color.set(cine.color); flashLight.position.set(cine.sx, 1, cine.sz)
      clashAt = performance.now(); clashPos.set(cine.sx, 0, cine.sz)
    }
    /** Tiến cảnh theo thời gian thật `dt`; trả về hệ số thời gian cho hiệu ứng. */
    function stepCine(dt: number): number {
      if (cine.phase === 2) {
        cine.rt += dt
        if (cine.rt >= HITSTOP) { cine.phase = 3; timeScale = SLOW }
      } else if (cine.phase === 3) {
        timeScale = SLOW
        cine.t += dt * SLOW
        const u = Math.min(1, cine.t / T_FLY)
        const l = cine.loser!
        const x = cine.sx + cine.dx * u
        const z = cine.sz + cine.dz * u
        const y = 0.05 * (1 - u) + (FLOOR_Y + 0.12) * u + 2.6 * 4 * u * (1 - u)
        l.group.position.set(x, y, z)
        l.group.rotation.set(u * Math.PI * 3.2 * cine.spin, u * 2, u * Math.PI * 2.1)
        cine.pos.set(x, y, z)
        if (u >= 1) { cine.phase = 4; cine.fade = 0; startShock(x, z, cine.color, 0.7) }
      } else if (cine.phase === 4) {
        cine.fade += dt
        timeScale += (1 - timeScale) * Math.min(1, dt * 6)
        const l = cine.loser!
        l.group.scale.setScalar(Math.max(0.001, 1 - ease(Math.min(1, cine.fade / FADE))))
        if (cine.fade >= FADE) endCine()
      }
      return timeScale
    }

    let clashAt = 0
    const clashPos = new THREE.Vector3()

    function apply(step: any, _prevStep: any, animateMoves: boolean) {
      const now = performance.now()
      const seen = new Set<string>()
      const justDied: PieceView[] = []
      if (!animateMoves && (cine.phase || fxActive())) abortFx()
      for (const [list, side] of [[step?.red_pieces, 'red'], [step?.blue_pieces, 'blue']] as const) {
        for (const p of list || []) {
          seen.add(p.id)
          let view = pieces.get(p.id)
          const target = toPos(p.col, p.row)
          if (p.alive === false) {
            if (view && view.visible && !view.flung && view !== cine.loser) {
              if (animateMoves) justDied.push(view); else setVisible(view, false)
            }
            continue
          }
          if (!view) view = makePiece(p.id, side, p.type || '?', target)
          if (!view.visible) { setVisible(view, true); view.group.scale.setScalar(1); view.group.rotation.set(0, 0, 0); view.group.position.copy(target); view.flung = false }
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
      for (const [id, view] of pieces) if (!seen.has(id) && view.visible && !view.flung) setVisible(view, false)

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
      let cinematic = false
      if (animateMoves && clash && typeof clash.col === 'number') {
        const at = toPos(clash.col, clash.row)
        const winnerSide = clash.winner === 'red' || clash.winner === 'blue' ? (clash.winner as 'red' | 'blue') : null
        const loserSide = winnerSide === 'red' ? 'blue' : 'red'
        const loser = clash.type === 'CLASH' && winnerSide && !clash.draw ? justDied.find((v) => v.side === loserSide) : undefined
        const color = clash.type === 'GOAL' ? theme.accent : clash.type === 'WARP' ? '#b388ff' : clash.type === 'EVOLVE' ? '#7dffb2' : clash.type === 'TRAP' ? '#ff6b6b' : theme.accent
        if (loser && justDied.length === 1 && cine.phase === 0 && cineAllowed()) {
          // Người thắng: quân cùng phe đang đi tới ô va chạm.
          let winner: PieceView | null = null
          for (const v of pieces.values()) if (v.visible && v.side === winnerSide && v.to.x === at.x && v.to.z === at.z) { winner = v; break }
          cine.loser = loser; cine.winner = winner
          cine.flavor = FLAVOR[String(clash.winner_type || '')] || DEFAULT_FLAVOR
          cine.color = winnerSide === 'red' ? theme.red : theme.blue
          cine.impactAt = now + 400; cine.phase = 1
          loser.dying = 0
          cinematic = true
        } else {
          schedule(now + 380, 1, at.x, at.z, color, clash.type === 'GOAL')
          if (loser && cine.phase !== 0) schedule(now + 380, 2, at.x, at.z, color, false) // cảnh rút gọn: thêm sóng xung kích
        }
      }
      if (!cinematic) for (const v of justDied) { if (animateMoves) v.dying = now; else setVisible(v, false) }
    }

    /** Dừng ngay mọi hiệu ứng khi người xem tua/nhảy bước. */
    function abortFx() {
      if (cine.phase) endCine()
      for (const j of jobs) j.kind = 0
      spark.on = false; sparkPoints.visible = false
      for (const s of shock) { s.on = false; s.mesh.visible = false }
      debris.on = false; debrisMesh.visible = false
      slashState.on = false; slash.visible = false
      flash = 0; flashLight.intensity = 0; shake = 0; timeScale = 1
      for (const v of pieces.values()) { v.kick = 0; v.dying = 0 }
    }

    // ---- Camera: tiêu điểm, độ gần và góc mở là các lò xo giảm chấn nên chuyển cảnh không bao giờ giật.
    const controls = new OrbitControls(cam, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.maxPolarAngle = Math.PI * 0.48
    controls.minDistance = 4
    controls.maxDistance = 22
    controls.target.set(0, 0, 0)
    controls.enabled = false
    // OrbitControls tự đặt touch-action:none; chỉ chế độ camera tự do mới cần chiếm thao tác chạm, còn lại để trang cuộn được.
    renderer.domElement.style.touchAction = 'pan-y'
    let mode: CameraMode = latest.current.camera
    const focus = new THREE.Vector3()
    const fsx: Spring = { x: 0, v: 0 }, fsy: Spring = { x: 0, v: 0 }, fsz: Spring = { x: 0, v: 0 }
    const zoomS: Spring = { x: 0, v: 0 }
    const fovS: Spring = { x: 42, v: 0 }
    let theta = 0
    const t0 = performance.now()
    const setCamera = (next: CameraMode) => {
      mode = next
      controls.enabled = next === 'free'
      renderer.domElement.style.touchAction = next === 'free' ? 'none' : 'pan-y'
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
      for (const v of pieces.values()) if (v.visible && !v.dying && !v.flung) targets.push(v.group)
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

    // ---- Hậu kỳ (bloom): chỉ bật ở mức chất lượng 0–1, tự tắt khi máy chậm.
    let composer: EffectComposer | null = null
    let bloom: UnrealBloomPass | null = null
    if (high) {
      composer = new EffectComposer(renderer)
      composer.addPass(new RenderPass(scene, cam))
      bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.28, 0.55, 0.9)
      composer.addPass(bloom)
      composer.addPass(new OutputPass())
    }
    const useComposer = () => !!composer && tier < 2

    const resize = () => {
      const w = Math.max(160, el.clientWidth)
      const h = Math.max(160, el.clientHeight)
      renderer.setPixelRatio(PIXEL[tier])
      renderer.setSize(w, h, false)
      composer?.setPixelRatio(PIXEL[tier])
      composer?.setSize(w, h)
      bloom?.setSize(w, h)
      cam.aspect = w / h
      cam.updateProjectionMatrix()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(el)
    resize()

    // ---- Chất lượng thích ứng: đo thời gian khung, hạ dần độ phân giải → bloom → bóng đổ → trang trí; ổn định thì nâng lại. Không dựng lại cảnh.
    let ema = 16.7
    let lastRaf = performance.now()
    let lastTierChange = 0
    let lastDowngrade = -1e9
    let goodSince = 0
    let ceiling = baseTier
    let decorOn = true
    function applyTier(next: number) {
      if (next === tier) return
      tier = next
      spot.castShadow = high && tier < 3
      resize()
      lastTierChange = performance.now()
    }
    function evaluateTier(now: number) {
      if (now - lastTierChange < 2500) return
      if (ema > 24 && tier < 3) {
        if (now - lastDowngrade < 15_000 && tier > baseTier) ceiling = tier // vừa nâng lại đã tụt: khóa không nâng nữa
        lastDowngrade = now; goodSince = 0
        applyTier(tier + 1)
      } else if (ema < 18.8 && tier > Math.max(baseTier, ceiling)) {
        if (!goodSince) goodSince = now
        if (now - goodSince > 8000 && now - lastDowngrade > 20_000) { goodSince = 0; applyTier(tier - 1) }
      } else goodSince = 0
    }

    // ---- Chỉ báo FPS (phím F ở màn hình trình chiếu).
    let fpsEl: HTMLDivElement | null = null
    let fpsAt = 0
    let frames = 0
    const toggleFps = () => {
      if (fpsEl) { fpsEl.remove(); fpsEl = null; return }
      fpsEl = document.createElement('div')
      fpsEl.setAttribute('data-testid', 'fps-indicator')
      fpsEl.style.cssText = 'position:absolute;left:8px;top:8px;z-index:5;padding:3px 8px;border-radius:8px;background:rgba(0,0,0,.65);color:#fff;font:600 11px ui-monospace,Consolas,monospace;pointer-events:none'
      el.appendChild(fpsEl)
    }

    let raf = 0
    let last = performance.now()
    let lastRender = 0
    let onScreen = true
    let shown = false
    let rendered = 0
    const io = new IntersectionObserver((entries) => { onScreen = entries[0]?.isIntersecting ?? true })
    io.observe(el)
    const origin = new THREE.Vector3(0, 0, 0)
    const flat = new THREE.Vector3()
    const topPos = new THREE.Vector3(0, 15.5, 4.2)

    const render = () => { if (useComposer()) composer!.render(); else renderer.render(scene, cam) }
    // Biên dịch trước cả các hiệu ứng va chạm (đang ẩn) để lần đánh đầu tiên không bị khựng vì biên dịch shader.
    const warm = [sparkPoints, debrisMesh, slash, shock[0].mesh, shock[1].mesh]
    warm.forEach((o) => { o.visible = true })
    renderer.compile(scene, cam)
    warm.forEach((o) => { o.visible = false })

    const loop = () => {
      raf = requestAnimationFrame(loop)
      const now = performance.now()
      if (!onScreen || document.hidden) { last = now; lastRaf = now; return }
      // Đo nhịp khung hình thật (kể cả khung bị bỏ qua để tiết kiệm) để biết máy có theo kịp không.
      const raw = now - lastRaf
      lastRaf = now
      if (raw < 250) ema += (raw - ema) * 0.06
      evaluateTier(now)
      const pointerBusy = !!down || hovered !== null
      const busy = pointerBusy || cine.phase !== 0 || fxActive() || fx_jobs() || (mode === 'free') || !!selected
      // Giới hạn tốc độ: tối đa ~60 khung/giây; cảnh nghỉ (không quân di chuyển) chỉ ~30.
      let moving = busy
      if (!moving) for (const v of pieces.values()) if (v.start || v.dying) { moving = true; break }
      if (now - lastRender < (moving ? 14.5 : 31)) return
      lastRender = now
      const dtReal = Math.min(0.05, (now - last) / 1000)
      last = now

      // Lịch sự kiện va chạm.
      for (const j of jobs) {
        if (j.kind && now >= j.at) {
          if (j.kind === 1) burst(j.x, j.z, j.color, j.big); else startShock(j.x, j.z, j.color, 1)
          if (j.kind === 1) { clashAt = now; clashPos.set(j.x, 0, j.z) }
          j.kind = 0
        }
      }
      if (cine.phase === 1 && now >= cine.impactAt) startImpact()
      const ts = cine.phase ? stepCine(dtReal) : 1
      const edt = dtReal * (cine.phase ? ts : 1)

      // Quân: nhảy cung khi di chuyển (co giãn khi cất/đáp cánh), phóng to khi rê/chọn, xoay và tan khi bị diệt.
      for (const [id, view] of pieces) {
        if (view.flung) { view.blob.visible = false; continue }
        if (view.dying) {
          const k = Math.min(1, (now - view.dying) / 650)
          view.group.scale.setScalar(Math.max(0.001, 1 - ease(k)))
          view.group.rotation.y += dtReal * 8
          view.group.position.y = 0.05 + k * 0.6
          view.blob.visible = false
          if (k >= 1) { setVisible(view, false); view.dying = 0; view.group.rotation.y = 0 }
          continue
        }
        let sy = 1
        if (view.start) {
          const k = Math.min(1, (now - view.start) / view.dur)
          view.group.position.lerpVectors(view.from, view.to, ease(k))
          view.group.position.y = 0.05 + Math.sin(k * Math.PI) * 0.55
          // Dồn sức (ép xuống) rồi vươn dài khi bật lên, ép nhẹ khi đáp.
          sy = k < 0.12 ? 1 - (k / 0.12) * 0.14 : k > 0.88 ? 1 - Math.sin(((k - 0.88) / 0.12) * Math.PI) * 0.12 : 1 + Math.sin(k * Math.PI) * 0.1
          if (k >= 1) view.start = 0
        }
        if (view.visible) {
          const want = id === hovered || id === selected ? 1.15 : 1
          view.hs += (want - view.hs) * Math.min(1, dtReal * 12)
          view.kick = Math.max(0, view.kick - dtReal * 2.2)
          const s = view.hs * (1 + view.kick * 0.22)
          view.group.scale.set(s / Math.sqrt(sy), s * sy, s / Math.sqrt(sy))
          view.icon.position.y = 0.86 + (id === selected ? Math.sin(now / 260) * 0.06 : 0)
          // Bóng mềm: nhỏ và nhạt dần khi quân nhảy lên cao.
          const h = Math.max(0, view.group.position.y - 0.05)
          view.blob.position.set(view.group.position.x, 0.066, view.group.position.z)
          view.blob.scale.setScalar(Math.max(0.4, 1 - h * 0.6))
        }
      }
      const chosen = selected ? pieces.get(selected) : undefined
      const live = !!chosen && chosen.visible && !chosen.dying && !chosen.flung
      selRing.visible = live
      if (live) {
        selRing.position.set(chosen!.group.position.x, 0.08, chosen!.group.position.z)
        selRing.scale.setScalar(1 + Math.sin(now / 220) * 0.06)
        flat.set(chosen!.group.position.x, 0, chosen!.group.position.z)
      }
      const tracking = live && (following || now < glideUntil)

      updateFx(edt)

      // Cảnh nền chuyển động chậm.
      const tt = now / 1000
      dustPoints.rotation.y += edt * 0.02
      redLight.intensity = 22 + Math.sin(now / 600) * 4
      blueLight.intensity = 22 + Math.cos(now / 650) * 4
      ringUniforms.time.value = tt
      for (const layer of starLayers) { layer.points.rotation.y += edt * layer.speed; layer.mat.opacity = 0.6 + Math.sin(tt * 1.7 + layer.phase) * 0.2 }
      const showDecor = high && tier < 3 && fxMode() === 'full'
      if (decorOn !== showDecor) { decorOn = showDecor; decor.visible = showDecor; emberPoints.visible = showDecor && EMBERS > 0 }
      if (showDecor) {
        if (crystals) {
          for (let i = 0; i < CRYSTALS; i++) {
            const c = crystalSeed[i]
            const a = c.a + tt * 0.025
            dummy.position.set(Math.cos(a) * c.r, c.y + Math.sin(tt * 0.6 + c.ph) * 0.35, Math.sin(a) * c.r)
            dummy.rotation.set(tt * 0.2 + c.ph, tt * 0.3, 0)
            dummy.scale.set(c.s * 0.7, c.s * 1.3, c.s * 0.7)
            dummy.updateMatrix()
            crystals.setMatrixAt(i, dummy.matrix)
          }
          crystals.instanceMatrix.needsUpdate = true
        }
        for (const fl of flags) {
          const arr = fl.geo.getAttribute('position') as THREE.BufferAttribute
          const a = arr.array as Float32Array
          for (let i = 0; i < a.length; i += 3) {
            const bx = fl.base[i]
            a[i + 2] = Math.sin(bx * 3.2 - tt * 4) * 0.09 * (bx + 0.85)
          }
          arr.needsUpdate = true
        }
        beams.forEach((b, i) => {
          const ang = tt * 0.12 * (i ? -1 : 1) + i * Math.PI
          b.position.set(Math.cos(ang) * 12.5, FLOOR_Y, Math.sin(ang) * 12.5)
          b.rotation.set(Math.sin(tt * 0.35 + i) * 0.3, 0, Math.cos(tt * 0.3 + i) * 0.3 - (i ? -0.25 : 0.25))
        })
        if (EMBERS) {
          const ea = emberGeo.getAttribute('position') as THREE.BufferAttribute
          for (let i = 0; i < EMBERS; i++) {
            let y = embers[i * 3 + 1] + emberSpeed[i] * edt
            if (y > 8) y = 0
            embers[i * 3 + 1] = y
            embers[i * 3] += Math.sin(tt + i) * 0.08 * edt
          }
          ea.needsUpdate = true
        }
      }

      const cineFollow = cine.phase === 3 || cine.phase === 4
      if (mode === 'cinematic') {
        const recent = Math.max(0, 1 - (now - clashAt) / 2200)
        const want = cineFollow ? cine.pos : tracking ? flat : recent > 0 ? clashPos : origin
        const w = cineFollow ? 4.5 : 2.4
        spring(fsx, want.x, w, dtReal); spring(fsy, want.y * 0.5, w, dtReal); spring(fsz, want.z, w, dtReal)
        focus.set(fsx.x, fsy.x, fsz.x)
        theta += edt * (0.1 + recent * 0.05)
        const t = (now - t0) / 1000
        const elevation = 0.78 + Math.sin(t * 0.33) * 0.1 - recent * 0.12 - (cineFollow ? 0.12 : 0)
        spring(zoomS, -recent * 5 - (tracking ? 4.5 : 0) - (cineFollow ? 5.5 : 0), 2.6, dtReal)
        const radius = 13.5 + Math.sin(t * 0.21) * 1.4 + zoomS.x
        cam.position.set(focus.x + Math.sin(theta) * Math.cos(elevation) * radius, focus.y + Math.sin(elevation) * radius, focus.z + Math.cos(theta) * Math.cos(elevation) * radius)
        if (shake > 0.01) cam.position.set(cam.position.x + Math.sin(now * 0.13) * shake * 0.14, cam.position.y + Math.cos(now * 0.17) * shake * 0.1, cam.position.z + Math.sin(now * 0.11 + 1) * shake * 0.14)
        cam.lookAt(focus)
        spring(fovS, cineFollow ? 33 : 42, 3.5, dtReal)
        if (Math.abs(cam.fov - fovS.x) > 0.02) { cam.fov = fovS.x; cam.updateProjectionMatrix() }
        if (bloom) bloom.strength = 0.28 + recent * 0.4 + (cineFollow ? 0.15 : 0)
      } else if (mode === 'top') {
        focus.lerp(origin, 1 - Math.exp(-dtReal * 3))
        cam.position.lerp(topPos, 1 - Math.exp(-dtReal * 3))
        cam.lookAt(0, 0, 0)
        fsx.x = focus.x; fsy.x = focus.y; fsz.x = focus.z
      } else {
        if (tracking) controls.target.lerp(flat, 1 - Math.exp(-dtReal * 4))
        controls.update()
        focus.copy(controls.target)
        fsx.x = focus.x; fsy.x = focus.y; fsz.x = focus.z
      }
      if (mode !== 'cinematic' && cam.fov !== 42) { cam.fov = 42; fovS.x = 42; fovS.v = 0; cam.updateProjectionMatrix() }

      render()
      rendered++
      if (!shown && rendered >= 2) { shown = true; renderer.domElement.style.opacity = '1' }
      frames++
      if (fpsEl && now - fpsAt > 500) {
        fpsEl.textContent = `${Math.round((frames * 1000) / (now - fpsAt || 1))} fps · mức ${tier} · ${renderer.info.render.calls} lượt vẽ`
        frames = 0; fpsAt = now
      }
    }
    const fx_jobs = () => jobs.some((j) => j.kind !== 0)
    loop()

    // Cửa kiểm thử/chẩn đoán: số liệu bộ nhớ GPU và mô phỏng nhiều cú đánh liên tiếp không cần chờ thời gian thật.
    const debugApi = {
      info: () => ({ geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, programs: renderer.info.programs?.length ?? 0, calls: renderer.info.render.calls }),
      get tier() { return tier },
      get fps() { return Math.round(1000 / Math.max(1, ema)) },
      setTier: (t: number) => applyTier(Math.max(0, Math.min(3, t))),
      /** Chạy một cú đánh thật (theo thời gian thật) giữa hai quân đầu tiên của hai đội, để xem bằng mắt. */
      demo: (kind: string) => {
        const l = [...pieces.values()].find((v) => v.side === 'blue' && v.visible)
        const w = [...pieces.values()].find((v) => v.side === 'red' && v.visible)
        if (!l || !w || cine.phase) return false
        l.start = 0; l.group.position.set(1, 0.05, 0); w.from.set(0, 0, 0)
        cine.loser = l; cine.winner = w; cine.flavor = FLAVOR[kind] || DEFAULT_FLAVOR; cine.color = theme.red
        cine.impactAt = performance.now() + 200; cine.phase = 1
        return true
      },
      /** Mô phỏng n cú đánh liên tiếp bằng đúng đường chạy của cảnh điện ảnh (bước thời gian cố định 0.05 s). */
      hits: (n: number) => {
        const reds = [...pieces.values()].filter((v) => v.side === 'red')
        const blues = [...pieces.values()].filter((v) => v.side === 'blue')
        if (!reds.length || !blues.length) return -1
        const kinds = ['ROCK', 'PAPER', 'SCISSORS']
        let frames = 0
        for (let i = 0; i < n; i++) {
          const l = blues[i % blues.length]
          const w = reds[i % reds.length]
          setVisible(l, true); l.group.position.set((i % 7) - 3, 0.05, (i % 5) - 2); l.group.scale.setScalar(1); l.dying = 0
          cine.loser = l; cine.winner = w; w.from.set(l.group.position.x - 1, 0, l.group.position.z)
          cine.flavor = FLAVOR[kinds[i % 3]]; cine.color = theme.red; cine.phase = 2; cine.t = 0; cine.rt = 0; cine.fade = 0; timeScale = 1
          startImpact()
          while ((cine.phase as number) !== 0 && frames < 100000) { const ts = stepCine(0.05); updateFx(0.05 * ts); frames++ }
          updateFx(5)
        }
        render()
        return frames
      },
    }
    ;(window as unknown as { __arena3d?: typeof debugApi }).__arena3d = debugApi

    api.current = {
      apply,
      setCamera,
      select,
      toggleFps,
      capture: () => {
        render()
        return renderer.domElement.toDataURL('image/png')
      },
    }
    apply(latest.current.step, latest.current.prev, false)
    select(latest.current.selectedId, latest.current.highlight, latest.current.follow)
    if (fxMode() === 'off') renderer.domElement.style.opacity = '1'

    return () => {
      cancelAnimationFrame(raf)
      renderer.domElement.removeEventListener('pointerdown', onDown)
      renderer.domElement.removeEventListener('pointerup', onUp)
      renderer.domElement.removeEventListener('pointermove', onMove)
      renderer.domElement.removeEventListener('pointerleave', onLeave)
      observer.disconnect()
      io.disconnect()
      controls.dispose()
      fpsEl?.remove()
      pathLine?.dispose()
      debrisMesh.dispose()
      crystals?.dispose()
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh
        if (mesh.geometry) mesh.geometry.dispose()
      })
      disposables.forEach((d) => { try { d.dispose() } catch { /* đã giải phóng */ } })
      composer?.dispose()
      renderer.dispose()
      renderer.forceContextLoss()
      renderer.domElement.remove()
      const w = window as unknown as { __arena3d?: unknown }
      if (w.__arena3d === debugApi) delete w.__arena3d
      api.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme, quality])

  useEffect(() => { api.current?.apply(step, prev, animate) }, [step, prev, animate])
  useEffect(() => { api.current?.setCamera(camera) }, [camera])
  useEffect(() => { api.current?.select(selectedId, highlight, follow) }, [selectedId, highlight, follow])

  return <div ref={host} className="relative aspect-[4/3] min-h-[320px] w-full overflow-hidden rounded-2xl border border-border bg-black/40" aria-label="Sân đấu 3D — bấm vào quân để xem chi tiết" />
}
