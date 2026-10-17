import { Clock, Hash, ListChecks, Plus, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { TestConfig } from '@/lib/assertions'
import { newId } from '@/lib/request-draft'

export function TestsEditor({ config, onChange }: { config: TestConfig; onChange: (c: TestConfig) => void }) {
  const setField = (id: string, patch: { path?: string; expected?: string }) =>
    onChange({ ...config, fieldChecks: config.fieldChecks.map((f) => (f.id === id ? { ...f, ...patch } : f)) })

  const addField = () =>
    onChange({ ...config, fieldChecks: [...config.fieldChecks, { id: newId('f'), path: '', expected: '' }] })

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="expected-status" className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Hash className="size-3.5" /> Expected status code
          </Label>
          <Input
            id="expected-status"
            inputMode="numeric"
            placeholder="e.g. 200"
            value={config.expectedStatus}
            onChange={(e) => onChange({ ...config, expectedStatus: e.target.value.replace(/[^\d]/g, '').slice(0, 3) })}
            className="font-mono"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="max-time" className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="size-3.5" /> Max response time (ms)
          </Label>
          <Input
            id="max-time"
            inputMode="numeric"
            placeholder="optional, e.g. 1500"
            value={config.maxTimeMs}
            onChange={(e) => onChange({ ...config, maxTimeMs: e.target.value.replace(/[^\d]/g, '').slice(0, 6) })}
            className="font-mono"
          />
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <ListChecks className="size-3.5" /> Required JSON fields
          </h3>
          <Button variant="ghost" size="xs" onClick={addField}>
            <Plus /> Add field
          </Button>
        </div>

        {config.fieldChecks.length === 0 ? (
          <button
            type="button"
            onClick={addField}
            className="w-full rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
          >
            Add a field path like <code className="text-primary">user.id</code> or{' '}
            <code className="text-primary">items[0].name</code> to require it in the response.
          </button>
        ) : (
          <div className="space-y-2">
            {config.fieldChecks.map((f, idx) => (
              <div key={f.id} className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_2.25rem] gap-2">
                <Input
                  value={f.path}
                  onChange={(e) => setField(f.id, { path: e.target.value })}
                  placeholder="user.id"
                  aria-label={`Field check ${idx + 1} path`}
                  spellCheck={false}
                  className="font-mono text-[13px]"
                />
                <Input
                  value={f.expected}
                  onChange={(e) => setField(f.id, { expected: e.target.value })}
                  placeholder="equals… (optional)"
                  aria-label={`Field check ${idx + 1} expected value`}
                  spellCheck={false}
                  className="font-mono text-[13px]"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove field check ${idx + 1}`}
                  onClick={() => onChange({ ...config, fieldChecks: config.fieldChecks.filter((x) => x.id !== f.id) })}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
          </div>
        )}
        <p className="text-xs leading-relaxed text-muted-foreground">
          Leave “equals” empty to only require the field to exist. Values are compared as JSON first (
          <code>1</code>, <code>true</code>, <code>{'{"a":1}'}</code>), then as plain text.
        </p>
      </div>
    </div>
  )
}
