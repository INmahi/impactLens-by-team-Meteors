// "Data sources" page (boss, 2026-11-13: data honesty must be easy to see). Opened from the header on every
// screen. Lists our honesty promises, then every dataset the app uses: each variable (from variables.json),
// each map layer (from its manifest) and the NASA base map. Real/synthetic status, source, version, DOI,
// licence, download date, years per region, full citation and the processing steps. Nothing is hard-coded
// about a dataset here: it is all read from the data files.
import { useEffect, useState } from 'react'
import type { Manifest, Region, Source, Variable } from '@trend/contract'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { getManifest, GIBS_CREDIT } from '@/globe'
import { loadConfig } from '@/assistant/llm'
import { formatStep, useRegionsData, useVariablesData } from '@/lib/useData'
import { cn } from 'cn'

const PROMISES = [
  'Real data from NASA archives (PO.DAAC, NSIDC, GES DISC) and the NASA- and ESA-supported IMBIE assessment; the version, DOI and download date of every dataset are listed below.',
  'Nothing is padded, gap-filled or extrapolated by us. Missing months stay as gaps and are counted in every result.',
  'Every trend comes with its 95% interval and a p-value. A result that is not significant reads "cannot tell yet", never "no change".',
  'A trend says what changed, not why. Two series moving together are never presented as cause and effect.',
  'Regional sea level is an average over an open-sea area, never the value at a town; land sinking is not included and the app says so.',
  'The statistics run in your browser from the files listed here. You can download every chart.',
]

function link(s: Source): string {
  return s.doi ? `https://doi.org/${s.doi}` : s.url
}

function Status({ synthetic }: { synthetic: boolean }) {
  return (
    <span
      className={cn(
        'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold',
        synthetic ? 'bg-amber-300 text-slate-950' : 'bg-emerald-300 text-slate-950',
      )}
    >
      {synthetic ? 'Synthetic test data' : 'Real observations'}
    </span>
  )
}

function SourceBlock({ title, source, synthetic, extra }: { title: string; source: Source; synthetic: boolean; extra?: React.ReactNode }) {
  return (
    <article className={cn('rounded-xl border p-3', synthetic ? 'border-amber-300/50 bg-amber-300/10' : 'border-emerald-300/40 bg-emerald-300/[0.07]')}>
      <header className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        <Status synthetic={synthetic} />
      </header>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[12.5px] leading-snug text-white/90">
        <dt className="text-white/75">Source</dt>
        <dd>
          <a href={link(source)} target="_blank" rel="noreferrer" className="underline underline-offset-2">
            {source.name}
          </a>
          {source.version && `, version ${source.version}`}
        </dd>
        {source.doi && (
          <>
            <dt className="text-white/75">DOI</dt>
            <dd>{source.doi}</dd>
          </>
        )}
        {(source.licence || source.accessed) && (
          <>
            <dt className="text-white/75">Access</dt>
            <dd>
              {source.accessed && `Downloaded ${source.accessed}`}
              {source.accessed && source.licence && '; '}
              {source.licence}
            </dd>
          </>
        )}
        {extra}
      </dl>
      <details className="mt-1.5">
        <summary className="cursor-pointer text-[12px] text-white/85">Citation and processing</summary>
        <p className="mt-1 text-[12px] text-white/90">{source.citation}</p>
        {source.processing?.length ? (
          <ol className="mt-1 flex list-decimal flex-col gap-0.5 pl-4 text-[12px] text-white/90">
            {source.processing.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ol>
        ) : null}
      </details>
    </article>
  )
}

function Coverage({ v, regions }: { v: Variable; regions: Region[] }) {
  return (
    <>
      <dt className="text-white/75">Records</dt>
      <dd>
        {v.regions.map((id) => {
          const [a, b] = v.periods[id]
          return (
            <span key={id} className="mr-2 inline-block tabular-nums">
              {regions.find((r) => r.id === id)?.name ?? id}: {formatStep(a)} – {formatStep(b)}
            </span>
          )
        })}
      </dd>
    </>
  )
}

export default function DataSourcesDialog({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false)
  const { data: variables } = useVariablesData()
  const { data: regions } = useRegionsData()
  const [layers, setLayers] = useState<Manifest[]>([])

  useEffect(() => {
    if (!open || !variables) return
    const ids = [...new Set(variables.map((v) => v.mapMode).filter((x): x is string => !!x))]
    Promise.all(ids.map((id) => getManifest(id).catch(() => null))).then((ms) => setLayers(ms.filter((m): m is Manifest => !!m)))
  }, [open, variables])

  const anySynthetic = !!variables?.some((v) => v.synthetic) || layers.some((m) => m.synthetic)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <button
            type="button"
            className={cn(
              'glass pointer-events-auto flex items-center gap-1.5 font-medium text-white hover:bg-white/10',
              compact ? 'px-2.5 py-1.5 text-xs' : 'px-3 py-1.5 text-sm',
            )}
          />
        }
      >
        <span aria-hidden className={cn('size-2 rounded-full', anySynthetic ? 'bg-amber-300' : 'bg-emerald-300')} />
        Data sources
      </DialogTrigger>
      <DialogContent className="glass-strong max-h-[90dvh] overflow-y-auto border-0 text-white sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-base text-white">Data sources and honesty</DialogTitle>
          <DialogDescription className="text-[13px] text-white/85">
            {anySynthetic
              ? 'Some data below is synthetic test data (marked in amber). Results from it are not findings.'
              : 'Every dataset below is real data: NASA archives plus the NASA- and ESA-supported IMBIE assessment.'}
          </DialogDescription>
        </DialogHeader>

        <section aria-labelledby="ds-promises" className="rounded-xl border-2 border-emerald-300/60 bg-emerald-300/10 p-3">
          <h3 id="ds-promises" className="mb-1 text-xs font-semibold tracking-wide uppercase">
            Our data honesty promises
          </h3>
          <ul className="flex list-disc flex-col gap-1 pl-4 text-[13px] leading-snug text-white/90">
            {PROMISES.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </section>

        <h3 className="mt-1 text-xs font-semibold tracking-wide text-white/90 uppercase">Variables (what the trend tests use)</h3>
        <div className="flex flex-col gap-2">
          {variables && regions
            ? variables.map((v) => (
                <SourceBlock key={v.id} title={v.name} source={v.source} synthetic={v.synthetic} extra={<Coverage v={v} regions={regions} />} />
              ))
            : 'Loading…'}
        </div>

        {layers.length > 0 && (
          <>
            <h3 className="mt-1 text-xs font-semibold tracking-wide text-white/90 uppercase">Globe map layers</h3>
            <div className="flex flex-col gap-2">
              {layers.map((m) =>
                m.source ? (
                  <SourceBlock
                    key={m.variable}
                    title={m.name ?? m.variable}
                    source={m.source}
                    synthetic={m.synthetic}
                    extra={
                      <>
                        <dt className="text-white/75">Frames</dt>
                        <dd className="tabular-nums">
                          {m.frames.length} months, {formatStep(m.frames[0]?.date ?? '')} – {formatStep(m.frames[m.frames.length - 1]?.date ?? '')}
                          {m.missing.length ? `; ${m.missing.length} months without data shown as gaps` : ''}
                        </dd>
                      </>
                    }
                  />
                ) : null,
              )}
            </div>
          </>
        )}

        <h3 className="mt-1 text-xs font-semibold tracking-wide text-white/90 uppercase">Base map</h3>
        <p className="text-[12.5px] text-white/90">
          {GIBS_CREDIT}. Served by NASA&apos;s Global Imagery Browse Services; a copy of the coarser zoom levels is stored with the app
          so the globe works offline. Background imagery only: no analysis uses it.
        </p>

        <h3 className="mt-1 text-xs font-semibold tracking-wide text-white/90 uppercase">AI assistant (the only online feature)</h3>
        <p className="text-[12.5px] text-white/90">
          The &quot;Ask AI&quot; chat uses a large language model ({loadConfig().model}, by default the open-weights gpt-oss-120b served by
          Groq; OpenRouter or another endpoint can be chosen in its settings). It can only list the app&apos;s variables and regions, set
          the analysis inputs, press Run analysis, and read the result summary the app produced. It never computes statistics: every
          number it quotes comes from the app&apos;s own engine, which runs in your browser. What it sends to the AI service: your chat
          messages, the list of variables and regions, and the result summary. No other data, and no personal data, is sent. AI answers
          can be wrong; the results panel is the reference.
        </p>

        <h3 className="mt-1 text-xs font-semibold tracking-wide text-white/90 uppercase">Region borders</h3>
        <p className="text-[12.5px] text-white/90">
          The Bangladesh border comes from{' '}
          <a href="https://www.naturalearthdata.com/" target="_blank" rel="noreferrer" className="underline underline-offset-2">
            Natural Earth
          </a>{' '}
          (1:50m admin 0 countries, public domain), simplified to about 2 km. Ice-sheet and coastal-sea outlines are drawn by this
          project for averaging; they are shown on the globe and described in each region&apos;s notes.
        </p>

        <DialogFooter>
          <Button onClick={() => setOpen(false)} className="bg-sky-300 text-slate-950 hover:bg-sky-200">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
