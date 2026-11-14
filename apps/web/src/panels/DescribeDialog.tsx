// Describe popup for a variable (plan section 4/6): looping map video, what it is, why its change
// matters, "Understood". Text: science-writer's content (src/content/variables.ts), falling back to
// variables.json `describe`. Video: WebM then MP4 sources from `describe.video`; hidden if missing;
// no autoplay under prefers-reduced-motion (controls instead). Dialog is the only modal we use.
import { useState } from 'react'
import type { Variable } from '@trend/contract'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { VARIABLE_TEXT } from '@/content/variables'
import { useMedia } from '@/lib/useMedia'

export default function DescribeDialog({ variable: v }: { variable: Variable }) {
  const [open, setOpen] = useState(false)
  const [videoOk, setVideoOk] = useState(true)
  const reduced = useMedia('(prefers-reduced-motion: reduce)')
  const text = VARIABLE_TEXT[v.id]
  const what = text?.what ?? v.describe.what
  const why = text?.whyItMatters ?? v.describe.whyItMatters
  const video = v.describe.video
  const mp4 = video.replace(/\.webm$/, '.mp4')

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <button
            type="button"
            aria-label={`Describe ${v.name}`}
            className="shrink-0 rounded-md px-1.5 py-0.5 text-[11px] max-md:min-h-9 max-md:px-2.5 max-md:text-xs text-white/85 underline-offset-2 hover:bg-white/10 hover:underline"
          />
        }
      >
        Describe
      </DialogTrigger>
      <DialogContent className="glass-strong no-scrollbar max-h-[90dvh] overflow-y-auto border-0 text-white sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base text-white">{text?.title ?? v.name}</DialogTitle>
        </DialogHeader>
        {open && videoOk && video && (
          <video
            className="aspect-video w-full rounded-lg bg-black"
            autoPlay={!reduced}
            controls={reduced}
            muted
            loop
            playsInline
            aria-label={`Looping animation of ${v.name.toLowerCase()}`}
            onError={() => setVideoOk(false)}
          >
            <source src={video} type="video/webm" onError={() => {}} />
            <source src={mp4} type="video/mp4" onError={() => setVideoOk(false)} />
          </video>
        )}
        <DialogDescription render={<div />} className="flex flex-col gap-3 text-[14px] leading-relaxed text-white/90">
          <section>
            <h3 className="mb-0.5 text-xs font-semibold tracking-wide text-white uppercase">What it is</h3>
            <p>{what}</p>
          </section>
          <section>
            <h3 className="mb-0.5 text-xs font-semibold tracking-wide text-white uppercase">Why its change matters</h3>
            <p>{why}</p>
          </section>
          {text?.howItRelates && (
            <section>
              <h3 className="mb-0.5 text-xs font-semibold tracking-wide text-white uppercase">How it relates</h3>
              <p>{text.howItRelates}</p>
            </section>
          )}
          {text?.sources?.length ? (
            <p className="text-xs text-white/80">
              Sources:{' '}
              {text.sources.map((s, i) => (
                <span key={s.url}>
                  {i > 0 && '; '}
                  <a href={s.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                    {s.label}
                  </a>
                </span>
              ))}
            </p>
          ) : null}
        </DialogDescription>
        <DialogFooter>
          <Button onClick={() => setOpen(false)} className="bg-sky-300 text-slate-950 hover:bg-sky-200">
            Understood
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
