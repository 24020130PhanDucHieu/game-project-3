import { LivePortal } from '@/components/arena/live-portal'
import portal from '@/generated/portal.json'

export default function Page() {
  return <LivePortal html={portal.html} scripts={portal.scripts} />
}
