// "Data sources" page (boss, 2026-11-13: data honesty must be easy to see). Opened from the header on every
// screen. Layout (boss, 2026-11-14): a stack of collapsible rows like the left panel's steps, all closed at first.
// A closed row shows only where the data is used and which dataset it is; opening it shows the source, version,
// DOI, licence, download date, records per region, citation and processing, with links. Nothing is hard-coded
// about a dataset here: it is all read from the data files (variables.json, map manifests).
import { useEffect, useId, useState } from 'react'
import { ChevronDown, Info } from 'lucide-react'
import type { Manifest, Region, Source, Variable } from '@trend/contract'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { getManifest, GIBS_CREDIT } from '@/globe'
import { loadConfig } from '@/assistant/llm'
import { formatStep, useRegionsData, useVariablesData } from '@/lib/useData'
import { cn } from 'cn'

const PROMISES = [
  'Real data from NASA archives (PO.DAAC, NSIDC, GES DISC), the NASA- and ESA-supported IMBIE assessment and the EC JRC Global Surface Water record (Landsat); the version, DOI and download date of every dataset are listed below.',
  'Nothing is padded, gap-filled or extrapolated by us. Missing months stay as gaps and are counted in every result.',
  'Every trend comes with its 95% interval and a p-value. A result that is not significant reads "cannot tell yet", never "no change".',
  'A trend says what changed, not why. Two series moving together are never presented as cause and effect.',
  'Regional sea level is an average over an open-sea area, never the value at a town; land sinking is not included and the app says so.',
  'The statistics run in your browser from the files listed here. You can download every chart.',
]

function link(s: Source): string {
  return s.doi ? `https://doi.org/${s.doi}` : s.url
}

const A = 'underline underline-offset-2 hover:text-white'

/** One collapsible row: "where used" over "which dataset", details hidden until opened. */
function Row({ where, dataset, real = true, children }: { where: string; dataset: string; real?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const bodyId = useId()
  return (
    <div className={cn('shrink-0 rounded-xl border bg-white/[0.03]', open ? 'border-sky-300/35' : 'border-white/10')}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left hover:bg-white/5"
      >
        {real && <span aria-hidden className="size-2 shrink-0 rounded-full bg-emerald-300" />}
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-[11px] font-medium tracking-wide text-white/70 uppercase">{where}</span>
          <span className="text-[13.5px] leading-snug font-medium text-white">{dataset}</span>
        </span>
        <ChevronDown aria-hidden className={cn('size-4 shrink-0 text-white/70 transition-transform motion-reduce:transition-none', open && 'rotate-180')} />
      </button>
      {open && (
        <div id={bodyId} className="px-3 pt-0.5 pb-3 text-[12.5px] leading-snug text-white/90">
          {children}
        </div>
      )}
    </div>
  )
}

function SourceDetails({ source, extra }: { source: Source; extra?: React.ReactNode }) {
  return (
    <>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt className="text-white/70">Status</dt>
        <dd>
          <span className="rounded-full bg-emerald-300 px-2 py-0.5 text-[11px] font-semibold text-slate-950">Real observations</span>
        </dd>
        <dt className="text-white/70">Source</dt>
        <dd>
          <a href={link(source)} target="_blank" rel="noreferrer" className={A}>
            {source.name}
          </a>
          {source.version && `, version ${source.version}`}
        </dd>
        {source.doi && (
          <>
            <dt className="text-white/70">DOI</dt>
            <dd>
              <a href={`https://doi.org/${source.doi}`} target="_blank" rel="noreferrer" className={A}>
                {source.doi}
              </a>
            </dd>
          </>
        )}
        {source.url && source.doi && !source.url.includes(source.doi) && (
          <>
            <dt className="text-white/70">Website</dt>
            <dd className="break-all">
              <a href={source.url} target="_blank" rel="noreferrer" className={A}>
                {source.url}
              </a>
            </dd>
          </>
        )}
        {(source.licence || source.accessed) && (
          <>
            <dt className="text-white/70">Access</dt>
            <dd>
              {source.accessed && `Downloaded ${source.accessed}`}
              {source.accessed && source.licence && '; '}
              {source.licence}
            </dd>
          </>
        )}
        {extra}
        <dt className="text-white/70">Cite</dt>
        <dd>{source.citation}</dd>
      </dl>
      {source.processing?.length ? (
        <>
          <p className="mt-2 text-[11px] font-medium tracking-wide text-white/70 uppercase">What we did to the data</p>
          <ol className="mt-1 flex list-decimal flex-col gap-0.5 pl-4">
            {source.processing.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ol>
        </>
      ) : null}
    </>
  )
}

function Coverage({ v, regions }: { v: Variable; regions: Region[] }) {
  return (
    <>
      <dt className="text-white/70">Records</dt>
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

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="mt-1 text-xs font-semibold tracking-wide text-white/85 uppercase">{title}</h3>
      {children}
    </section>
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

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {/* Icon button that widens to show its label on hover or focus (teammate PR #1, 2026-11-14). */}
      <DialogTrigger
        type="button"
        className={cn(
          'glass pointer-events-auto group relative flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 text-white transition-[width,background-color] duration-[250ms] ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none hover:bg-white/10 focus-visible:bg-white/10',
          compact ? 'h-8 w-8' : 'h-9 w-9',
          'hover:w-32 focus-visible:w-32',
        )}
        aria-label="Open data sources and honesty"
        title="Data Sources"
      >
        <span className="pointer-events-none absolute left-1/2 flex -translate-x-1/2 items-center justify-center text-white/95 transition-[left,transform] duration-[250ms] ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none group-hover:left-3 group-hover:translate-x-0 group-focus-visible:left-3 group-focus-visible:translate-x-0">
          <Info className={cn('shrink-0', compact ? 'size-3.5' : 'size-4')} aria-hidden />
        </span>
        <span
          className={cn(
            'pointer-events-none absolute left-9 top-1/2 -translate-y-1/2 translate-x-1 whitespace-nowrap text-white opacity-0 transition-[transform,opacity] duration-[250ms] ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100',
            compact ? 'text-[10.5px]' : 'text-xs',
          )}
        >
          Data Sources
        </span>
      </DialogTrigger>
      <DialogContent className="glass-strong no-scrollbar max-h-[90dvh] overflow-y-auto border-0 text-white sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-base text-white">Data sources and honesty</DialogTitle>
          <DialogDescription className="text-[13px] text-white/85">
            Every dataset below is real data. Open a row to see its version, DOI, citation, links and what we did to it.
          </DialogDescription>
        </DialogHeader>

        <Row where="How we handle the data" dataset="Our data honesty promises" real={false}>
          <ul className="flex list-disc flex-col gap-1 pl-4">
            {PROMISES.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </Row>

        <Group title="Analysis variables">
          {variables && regions
            ? variables.map((v) => (
                <Row key={v.id} where={v.name} dataset={v.source.name}>
                  <SourceDetails source={v.source} extra={<Coverage v={v} regions={regions} />} />
                </Row>
              ))
            : 'Loading…'}
        </Group>

        {layers.length > 0 && (
          <Group title="Globe map layers">
            {layers.map((m) =>
              m.source ? (
                <Row key={m.variable} where={`Map: ${m.name ?? m.variable}`} dataset={m.source.name}>
                  <SourceDetails
                    source={m.source}
                    extra={
                      <>
                        <dt className="text-white/70">Frames</dt>
                        <dd className="tabular-nums">
                          {m.frames.length} months, {formatStep(m.frames[0]?.date ?? '')} – {formatStep(m.frames[m.frames.length - 1]?.date ?? '')}
                          {m.missing.length ? `; ${m.missing.length} months without data shown as gaps` : ''}
                        </dd>
                      </>
                    }
                  />
                </Row>
              ) : null,
            )}
          </Group>
        )}

        <Group title="Other">
          <Row where="Globe base map" dataset="NASA GIBS Blue Marble (Shaded Relief and Bathymetry)">
            <p>
              {GIBS_CREDIT}. Served by NASA&apos;s{' '}
              <a href="https://www.earthdata.nasa.gov/engage/open-data-services-software/earthdata-developer-portal/gibs-api" target="_blank" rel="noreferrer" className={A}>
                Global Imagery Browse Services (GIBS)
              </a>
              ; a copy of the coarser zoom levels is stored with the app so the globe works offline. Background imagery only: no analysis
              uses it.
            </p>
          </Row>
          <Row where="Region borders (Bangladesh)" dataset="Bangladesh Bureau of Statistics via OCHA and geoBoundaries (2020)">
            <p>
              Bangladesh, its 8 divisions and 64 districts come from the Bangladesh Bureau of Statistics (via OCHA and{' '}
              <a href="https://www.geoboundaries.org/" target="_blank" rel="noreferrer" className={A}>
                geoBoundaries
              </a>
              , 2020, CC BY 3.0 IGO), simplified to about 1 km with shared borders kept identical; divisions and the country are the union
              of their districts. Ice-sheet and coastal-sea outlines are drawn by this project for averaging.
            </p>
          </Row>
          <Row where="Ask AI (the only online feature)" dataset={`Language model: ${loadConfig().model}`} real={false}>
            <p>
              The &quot;Ask AI&quot; chat uses a large language model (by default the open-weights gpt-oss-120b served by{' '}
              <a href="https://groq.com/" target="_blank" rel="noreferrer" className={A}>
                Groq
              </a>
              ; OpenRouter or another endpoint can be chosen in its settings). It can only list the app&apos;s variables and regions, set
              the analysis inputs, press Run analysis, and read the result summary the app produced. It never computes statistics: every
              number it quotes comes from the app&apos;s own engine, which runs in your browser. What it sends to the AI service: your chat
              messages, the list of variables and regions, and the result summary. No other data, and no personal data, is sent. AI
              answers can be wrong; the results panel is the reference.
            </p>
          </Row>
        </Group>

        <DialogFooter>
          <Button onClick={() => setOpen(false)} className="bg-sky-300 text-slate-950 hover:bg-sky-200">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
