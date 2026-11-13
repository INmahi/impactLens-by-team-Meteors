// "Data Source" card (boss, 2026-11-13; competition: honest results). One per analysis,
// always visible under the conclusion: which dataset (version, DOI, licence, download date), real or
// synthetic, the record actually used vs the full record, missing values (never filled), source joins,
// what uncertainty the source gives, and what we did to the values. Everything is read from the data
// files (variables.json `source`, the series' `segments`, `sigma`, nulls); nothing is assumed.
import { formatStep, getSeriesCached, spanYears } from "@/lib/useData";
import type { AnalysisResult } from "@/state/store";
import type { Series, Source, Variable } from "@trend/contract";
import { cn } from "cn";
import { useEffect, useState } from "react";

function inRange(d: string, start: string, end: string): boolean {
  // Dates share the variable's format ("YYYY-MM" or "YYYY"); compare on the common prefix length.
  const n = Math.min(d.length, start.length, end.length);
  return d.slice(0, n) >= start.slice(0, n) && d.slice(0, n) <= end.slice(0, n);
}

function doiUrl(s: Source): string {
  return s.doi ? `https://doi.org/${s.doi}` : s.url;
}

export default function DataSourceCard({
  a,
  v,
  variables,
}: {
  a: AnalysisResult;
  v: Variable;
  variables: Variable[];
}) {
  const [series, setSeries] = useState<Series | null>(null);
  useEffect(() => {
    let alive = true;
    getSeriesCached(a.variable, a.region).then((s) => alive && setSeries(s));
    return () => {
      alive = false;
    };
  }, [a.variable, a.region]);

  const s = v.source;
  const synthetic = v.synthetic || !!series?.synthetic;
  const [recStart, recEnd] = v.periods[a.region] ?? v.period;
  const fullRange = a.start === recStart && a.end === recEnd;

  // Facts about the values actually analysed.
  let used = 0;
  let missing = 0;
  let joins: string[] = [];
  let hasSigma = false;
  if (series) {
    series.dates.forEach((d, i) => {
      if (!inRange(d, a.start, a.end)) return;
      if (series.values[i] == null) missing++;
      else used++;
    });
    joins = series.segments
      .filter((g) => g.start <= a.end && g.end >= a.start)
      .map((g) => g.source);
    hasSigma = !!series.sigma?.some((x) => x != null);
  }
  const others = [
    ...a.extras
      .map((x) => variables.find((y) => y.id === x.variable))
      .filter((x): x is Variable => !!x),
  ].filter((x) => x.source.name !== s.name);

  return (
    <section
      aria-labelledby="res-source"
      className={cn(
        "rounded-xl border-2 p-3",
        synthetic
          ? "border-white/20 bg-white/[0.05]"
          : "border-emerald-300/60 bg-emerald-300/10",
      )}
    >
      <h3
        id="res-source"
        className="mb-1.5 flex flex-wrap items-center gap-1.5 text-xs font-semibold tracking-wide uppercase"
      >
        Data source &amp; honesty
        {!synthetic && (
          <span className="rounded-full bg-emerald-300 px-2 py-0.5 text-[11px] font-semibold tracking-normal text-slate-950 normal-case">
            Real observations
          </span>
        )}
      </h3>

      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12.5px] leading-snug">
        <dt className="text-white/80">Dataset</dt>
        <dd>
          <a
            href={doiUrl(s)}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2"
          >
            {s.name}
          </a>
          {s.version && (
            <span className="text-white/85">, version {s.version}</span>
          )}
          {s.doi && (
            <span className="block text-[11.5px] text-white/80">
              doi:{s.doi}
            </span>
          )}
        </dd>

        {(s.accessed || s.licence) && (
          <>
            <dt className="text-white/80">Access</dt>
            <dd>
              {s.accessed && <>Downloaded {s.accessed}</>}
              {s.accessed && s.licence && "; "}
              {s.licence}
            </dd>
          </>
        )}

        <dt className="text-white/80">Record used</dt>
        <dd className="tabular-nums">
          {formatStep(a.start)} – {formatStep(a.end)} (
          {Math.round(spanYears(a.start, a.end))} yr)
          <span className="block text-[11.5px] text-white/80">
            {fullRange
              ? "The full record for this region."
              : `Part of the full record ${formatStep(recStart)} – ${formatStep(recEnd)}.`}
          </span>
        </dd>

        <dt className="text-white/80">Values</dt>
        <dd className="tabular-nums">
          {series ? (
            <>
              {used} used
              {missing > 0
                ? `, ${missing} missing (left as gaps)`
                : ", none missing"}
              .
              <span className="block text-[11.5px] text-white/80">
                Nothing padded, filled or extrapolated.
              </span>
            </>
          ) : (
            "…"
          )}
        </dd>

        <dt className="text-white/80">Sources joined</dt>
        <dd>
          {series
            ? joins.length > 1
              ? `${joins.length}: ${joins.join("; ")}`
              : "None: one source for the whole range."
            : "…"}
        </dd>

        <dt className="text-white/80">Uncertainty</dt>
        <dd>
          {series
            ? hasSigma
              ? "The source gives a 1-sigma uncertainty per value; it is included in the uncertainty check (Statistics tab)."
              : "The source gives no per-value uncertainty; the 95% interval reflects year-to-year scatter only."
            : "…"}
        </dd>

        {a.compare && (
          <>
            <dt className="text-white/80">Compared</dt>
            <dd>
              Both regions come from this same dataset, on the years both cover.
            </dd>
          </>
        )}
        {others.length > 0 && (
          <>
            <dt className="text-white/80">Also used</dt>
            <dd>
              {others.map((x) => (
                <span key={x.id} className="block">
                  {x.name}:{" "}
                  <a
                    href={doiUrl(x.source)}
                    target="_blank"
                    rel="noreferrer"
                    className="underline underline-offset-2"
                  >
                    {x.source.name}
                  </a>
                  {x.synthetic && (
                    <span className="font-semibold text-amber-200">
                      {" "}
                      (synthetic)
                    </span>
                  )}
                </span>
              ))}
            </dd>
          </>
        )}
      </dl>

      <details className="mt-2 rounded-lg border border-white/15 px-2 py-1">
        <summary className="cursor-pointer text-[12.5px] text-white/90">
          Citation and what we did to the data
        </summary>
        <div className="mt-1 flex flex-col gap-1.5 text-[12px] leading-snug text-white/90">
          <p>
            <span className="text-white/80">Cite: </span>
            {s.citation}
          </p>
          {s.processing?.length ? (
            <ol className="flex list-decimal flex-col gap-0.5 pl-4">
              {s.processing.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ol>
          ) : synthetic ? (
            <p>
              Generated by the ImpactLens synthetic generator
              (pipeline/synthetic), with a known trend built in for testing.
            </p>
          ) : null}
          <p className="text-white/80">
            The trend test and Sen's slope are computed in your browser from
            these values; nothing is sent anywhere.
          </p>
        </div>
      </details>
    </section>
  );
}
