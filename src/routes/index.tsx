import { createFileRoute } from '@tanstack/react-router'

import { Workbench } from '@/components/sentinel/workbench'

export const Route = createFileRoute('/')({
  component: Workbench,
})
