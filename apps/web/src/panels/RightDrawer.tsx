// Right drawer: results, organised to stay compact (boss, 2026-11-13). Plan section 4 order kept:
// 1 parameters (one context line), 2 conclusion card with key numbers (+ compare / other variables),
// then tabs: What it means (verdict detail, interpretation), Statistics (report, uncertainty,
// cross-checks), Notes. The panel can be widened. Text rules: docs/stats/wording.md (lib/verdict.ts).
import { downloadReport } from "@/lib/report";
import {
  formatStep,
  formatUnitsText,
  spanYears,
  useRegionsData,
  useVariablesData,
} from "@/lib/useData";
import {
  compareVerdict,
  correlationText,
  detectText,
  fmt,
  interpretation,
  rateUnits,
  trendVerdict,
  uncertaintyText,
} from "@/lib/verdict";
import { useAppStore, type AnalysisResult } from "@/state/store";
import type { Region, Variable } from "@trend/contract";
import {
  formatP,
  type CompareReport,
  type MannKendallResult,
} from "@trend/stats";
import { cn } from "cn";
import { FileDown } from "lucide-react";
import { useId, useState } from "react";
import DataSourceCard from "./DataSourceCard";

export default function RightDrawer({
  className,
  onCollapse,
  wide,
  onToggleWide,
}: {
  className?: string;
  onCollapse?: () => void;
  wide?: boolean;
  onToggleWide?: () => void;
}) {
  const analysis = useAppStore((s) => s.analysis);
  const status = useAppStore((s) => s.analysisStatus);
  const { data: variables } = useVariablesData();
  const { data: regions } = useRegionsData();

  if (!analysis && status !== "running") return null;
  const v = analysis
    ? variables?.find((x) => x.id === analysis.variable)
    : undefined;
  const r = analysis
    ? regions?.find((x) => x.id === analysis.region)
    : undefined;

  const iconBtn =
    "rounded-md px-2 py-0.5 text-base font-semibold text-white/90 hover:bg-white/10";
  return (
    <section
      aria-label="Results"
      aria-busy={status === "running"}
      className={cn(
        "glass-sidebar flex w-full flex-col overflow-hidden text-white",
        className,
      )}
    >
      <header className="flex items-center justify-between gap-2 px-4 pt-3 pb-2">
        <h2 className="text-sm font-semibold tracking-wide">Results</h2>
        <span className="flex items-center gap-1">
          {analysis && (
            <button
              type="button"
              onClick={() => void downloadReport(analysis)}
              aria-label="Download the report (HTML, prints to PDF)"
              title="Download report"
              className={iconBtn}
            >
              <FileDown className="size-4" aria-hidden />
            </button>
          )}
          {onToggleWide && (
            <button
              type="button"
              onClick={onToggleWide}
              aria-pressed={!!wide}
              aria-label={wide ? "Make results narrower" : "Make results wider"}
              title={wide ? "Narrower" : "Wider"}
              className={iconBtn}
            >
              {wide ? "⇥" : "⇤"}
            </button>
          )}
          {onCollapse && (
            <button
              type="button"
              onClick={onCollapse}
              aria-label="Hide results"
              title="Hide results"
              className={iconBtn}
            >
              »
            </button>
          )}
        </span>
      </header>
      <div className="no-scrollbar flex min-h-0 flex-col gap-3 overflow-y-auto overscroll-contain px-4 pb-4 text-sm">
        {status === "running" && <p role="status">Running the analysis…</p>}
        {analysis && v && r && regions && variables && (
          <Body
            a={analysis}
            v={v}
            r={r}
            regions={regions}
            variables={variables}
            wide={!!wide}
          />
        )}
      </div>
    </section>
  );
}

type Tab = "stats" | "meaning" | "notes";

function Body({
  a,
  v,
  r,
  regions,
  variables,
  wide,
}: {
  a: AnalysisResult;
  v: Variable;
  r: Region;
  regions: Region[];
  variables: Variable[];
  wide: boolean;
}) {
  const rep = a.report;
  const verdict = trendVerdict(v, r, rep);
  const rB = a.compare
    ? regions.find((x) => x.id === a.compare!.region)
    : undefined;
  const cmp =
    a.compare && rB ? compareVerdict(v, r, rB, a.compare.report) : null;
  // Region caveats and this run's notes first; the variable's general notes go in an expandable list.
  const notes = [...new Set([...(r.notes ?? []), ...rep.notes])];
  const general = v.notes.filter((n) => !notes.includes(n));
  const [tab, setTab] = useState<Tab>("stats");
  const tabsId = useId();
  const years = spanYears(a.start, a.end);

  const tabs: { id: Tab; label: string }[] = [
    { id: "stats", label: "Statistics" },
    { id: "meaning", label: "What it means" },
    { id: "notes", label: `Notes (${notes.length + general.length})` },
  ];

  return (
    <>
      {/* 1. Parameters, as one context line */}
      <section aria-label="Selected parameters" className="flex flex-col gap-1">
        <p className="flex flex-wrap items-center gap-1 text-[12px]">
          <Chip>{v.name}</Chip>
          <Chip>{rB ? `${r.name} vs ${rB.name}` : r.name}</Chip>
          <Chip>
            {formatStep(a.start)} – {formatStep(a.end)}
          </Chip>
        </p>
      </section>

      {cmp && rB && (
        <CompareCard
          v={v}
          A={r}
          B={rB}
          rep={a.compare!.report}
          cv={cmp}
          wide={wide}
        />
      )}

      {/* 2. Conclusion card with the key numbers (compare mode: the difference card above is the conclusion) */}
      {!cmp && (
        <section
          aria-labelledby="res-verdict"
          className={cn(
            "rounded-xl border p-3",
            verdict.tone === "significant"
              ? "border-sky-300/50 bg-sky-300/10"
              : "border-amber-300/50 bg-amber-300/10",
          )}
        >
          <h3
            id="res-verdict"
            className="mb-1.5 flex flex-wrap items-center gap-1.5 text-xs font-medium tracking-wide uppercase"
          >
            {a.compare ? `${r.name}, full range` : "Conclusion"}
            <Badge tone={verdict.tone}>
              {verdict.tone === "significant"
                ? "Significant"
                : "Cannot tell yet"}
            </Badge>
            {rep.lowPower && <Badge tone="low">Low power</Badge>}
          </h3>
          <p className="text-[15px] leading-snug font-medium">
            {verdict.headline}
          </p>
          <div
            className={cn(
              "mt-2.5 grid gap-1.5",
              wide ? "grid-cols-4" : "grid-cols-3",
            )}
          >
            <Tile
              label="Trend"
              value={`${fmt(rep.slope.perYear)}`}
              sub={rateUnits(v)}
            />
            <Tile
              label="95% interval"
              value={`${fmt(rep.slope.lower)} to ${fmt(rep.slope.upper)}`}
              sub={rateUnits(v)}
            />
            <Tile
              label="Significance"
              value={formatP(rep.test.p)}
              sub={`${rep.n} points, ${Math.round(years)} yr`}
            />
            {wide && (
              <Tile
                label="Per decade"
                value={fmt(rep.slope.perDecade)}
                sub={formatUnitsText(v.units)}
              />
            )}
          </div>
        </section>
      )}

      {a.extras.length > 0 && <ExtrasBlock a={a} r={r} variables={variables} />}

      {/* 3-5. Details in tabs */}
      <div>
        <div
          role="tablist"
          aria-label="Result details"
          className="grid grid-cols-3 gap-0.5 rounded-lg border border-white/15 p-0.5"
        >
          {tabs.map((t) => (
            <button
              key={t.id}
              id={`${tabsId}-${t.id}`}
              role="tab"
              type="button"
              aria-selected={tab === t.id}
              aria-controls={`${tabsId}-${t.id}-panel`}
              onClick={() => setTab(t.id)}
              className={cn(
                "rounded-md px-1.5 py-1 text-[12px]",
                tab === t.id
                  ? "bg-white/90 font-medium text-slate-950"
                  : "text-white/90 hover:bg-white/10",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div
          id={`${tabsId}-${tab}-panel`}
          role="tabpanel"
          aria-labelledby={`${tabsId}-${tab}`}
          className="pt-2.5"
        >
          {tab === "meaning" && (
            <div className="flex flex-col gap-2 text-[13px] text-white/90">
              {cmp && (
                <>
                  <p className="leading-snug">{cmp.detail}</p>
                  <ul className="flex list-disc flex-col gap-1 pl-4">
                    {[
                      ...new Set([
                        ...cmp.notes,
                        ...a.compare!.report.notes.filter(
                          (n) => !/^Trends are compared, not levels/.test(n),
                        ),
                      ]),
                    ].map((t) => (
                      <li key={t}>{t}</li>
                    ))}
                  </ul>
                  <h4 className="mt-1 text-xs font-medium tracking-wide text-white/85 uppercase">
                    {r.name} on its own, full range
                  </h4>
                  <p className="leading-snug font-medium text-white">
                    {verdict.headline}
                  </p>
                </>
              )}
              <p className="leading-snug">{verdict.detail}</p>
              {a.detect && !rep.test.significant && (
                <p className="leading-snug">{detectText(v, a.detect)}</p>
              )}
              {a.pending?.includes("detect") && (
                <p className="text-white/75 italic">
                  Estimating how many more years of data would be needed…
                </p>
              )}
              <ul className="flex list-disc flex-col gap-1 pl-4">
                {interpretation(v, r, rep, variables).map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
              {a.extras.map((x) => {
                const xv = variables.find((y) => y.id === x.variable);
                return xv && x.correlation ? (
                  <p key={x.variable} className="leading-snug">
                    <span className="font-medium text-white">{xv.name}: </span>
                    {correlationText(v, xv, x.correlation, r)}
                  </p>
                ) : null;
              })}
            </div>
          )}

          {tab === "stats" && (
            <div className="flex flex-col gap-2">
              {cmp && rB && (
                <CompareStats v={v} A={r} B={rB} rep={a.compare!.report} />
              )}
              {cmp && (
                <h4 className="mt-1 text-xs font-medium tracking-wide text-white/85 uppercase">
                  {r.name}, full range
                </h4>
              )}
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[13px] tabular-nums">
                <dt className="text-white/80">Test</dt>
                <dd>{rep.test.method}</dd>
                <dt className="text-white/80">Result</dt>
                <dd>
                  {trendWord(rep.test.trend)}, {formatP(rep.test.p)}
                </dd>
                <dt className="text-white/80">Kendall's tau</dt>
                <dd>{rep.test.tau.toFixed(3)}</dd>
                <dt className="text-white/80">z</dt>
                <dd>{rep.test.z.toFixed(2)}</dd>
                <dt className="text-white/80">Sen's slope</dt>
                <dd>
                  {fmt(rep.slope.perYear)} {rateUnits(v)} (
                  {fmt(rep.slope.perDecade)} {formatUnitsText(v.units)} per
                  decade)
                </dd>
                <dt className="text-white/80">95% interval</dt>
                <dd>
                  {fmt(rep.slope.lower)} to {fmt(rep.slope.upper)}{" "}
                  {rateUnits(v)}
                </dd>
                <dt className="text-white/80">Points (n)</dt>
                <dd>{rep.n}</dd>
                <dt className="text-white/80">Coverage</dt>
                <dd>{Math.round(rep.coverage * 100)}%</dd>
                <dt className="text-white/80">Autocorrelation factor</dt>
                <dd>{rep.test.correction.toFixed(2)}</dd>
              </dl>
              {a.uncertainty && (
                <p className="text-[13px] text-white/90">
                  {uncertaintyText(v, a.uncertainty)}
                </p>
              )}
              {a.pending?.includes("uncertainty") && (
                <p className="text-[13px] text-white/75 italic">
                  Adding the source&apos;s stated uncertainty (a few seconds)…
                </p>
              )}
              <details className="rounded-lg border border-white/10 px-2 py-1">
                <summary className="cursor-pointer text-[13px] text-white/90">
                  Cross-check tests ({rep.crossChecks.length})
                </summary>
                <table className="mt-1 w-full text-[12px] tabular-nums">
                  <thead>
                    <tr className="text-left text-white/80">
                      <th className="font-normal">Method</th>
                      <th className="font-normal">Result</th>
                      <th className="font-normal">p</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rep.crossChecks.map((c: MannKendallResult) => (
                      <tr key={c.method}>
                        <td className="pr-2">{c.method}</td>
                        <td className="pr-2">{trendWord(c.trend)}</td>
                        <td>{formatP(c.p).replace(/^p\s*=?\s*/, "")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            </div>
          )}

          {tab === "notes" && (
            <div className="flex flex-col gap-2">
              <ul className="flex list-disc flex-col gap-1 pl-4 text-[13px] text-white/90">
                {notes.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
              {general.length > 0 && (
                <details
                  className="rounded-lg border border-white/10 px-2 py-1"
                  open={notes.length === 0}
                >
                  <summary className="cursor-pointer text-[13px] text-white/90">
                    About {v.name.toLowerCase()} data ({general.length})
                  </summary>
                  <ul className="mt-1 flex list-disc flex-col gap-1 pl-4 text-[13px] text-white/90">
                    {general.map((t) => (
                      <li key={t}>{t}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Data source and honesty: always visible, highlighted (competition: honest results). */}
      <DataSourceCard a={a} v={v} variables={variables} />
    </>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-white/20 bg-white/5 px-2 py-0.5 tabular-nums">
      {children}
    </span>
  );
}

function Tile({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col rounded-lg bg-black/25 px-2 py-1.5">
      <span
        className="truncate text-[10.5px] tracking-wide text-white/80 uppercase"
        title={label}
      >
        {label}
      </span>
      <span className="text-[14px] leading-tight font-semibold tabular-nums">
        {value}
      </span>
      {sub && <span className="truncate text-[11px] text-white/80">{sub}</span>}
    </div>
  );
}

function Badge({
  tone,
  children,
}: {
  tone: "significant" | "not-significant" | "low";
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-normal normal-case",
        tone === "significant" && "bg-sky-300 text-slate-950",
        tone === "not-significant" && "bg-amber-200 text-slate-950",
        tone === "low" && "bg-white/85 text-slate-950",
      )}
    >
      {children}
    </span>
  );
}

/** The engine's "no trend" is never shown: not significant means "cannot tell yet" (wording.md rule 2). */
function trendWord(t: string): string {
  return t === "no trend" ? "not significant" : t;
}

/** Compare mode "regions": the difference is the Conclusion, with both slopes and the difference as tiles. */
function CompareCard({
  v,
  A,
  B,
  rep,
  cv,
  wide,
}: {
  v: Variable;
  A: Region;
  B: Region;
  rep: CompareReport;
  cv: ReturnType<typeof compareVerdict>;
  wide: boolean;
}) {
  const u = rateUnits(v);
  const d = rep.difference;
  return (
    <section
      aria-labelledby="res-compare"
      className={cn(
        "rounded-xl border p-3",
        cv.tone === "significant"
          ? "border-sky-300/50 bg-sky-300/10"
          : "border-amber-300/50 bg-amber-300/10",
      )}
    >
      <h3
        id="res-compare"
        className="mb-1.5 flex flex-wrap items-center gap-1.5 text-xs font-medium tracking-wide uppercase"
      >
        Conclusion
        <Badge tone={cv.tone}>
          {cv.tone === "significant" ? "Different" : "Cannot tell apart"}
        </Badge>
        {rep.lowPower && <Badge tone="low">Low power</Badge>}
      </h3>
      <p className="text-[15px] leading-snug font-medium">{cv.headline}</p>
      <div
        className={cn(
          "mt-2.5 grid gap-1.5",
          wide ? "grid-cols-4" : "grid-cols-2",
        )}
      >
        <Tile
          label={A.name}
          value={fmt(rep.a.slope.perYear)}
          sub={`${fmt(rep.a.slope.lower)} to ${fmt(rep.a.slope.upper)} ${u}`}
        />
        <Tile
          label={B.name}
          value={fmt(rep.b.slope.perYear)}
          sub={`${fmt(rep.b.slope.lower)} to ${fmt(rep.b.slope.upper)} ${u}`}
        />
        <Tile
          label="Difference"
          value={fmt(d.perYear)}
          sub={`${fmt(d.lower)} to ${fmt(d.upper)} ${u}`}
        />
        <Tile
          label="Significance"
          value={formatP(rep.p)}
          sub={`${formatStep(rep.start)} – ${formatStep(rep.end)}`}
        />
      </div>
      <p className="mt-1.5 text-[11px] text-white/80">
        Ranges are 95% intervals, on the years both records cover.
      </p>
    </section>
  );
}

/** Statistics tab, compare mode: each region on the common period and how the difference was tested. */
function CompareStats({
  v,
  A,
  B,
  rep,
}: {
  v: Variable;
  A: Region;
  B: Region;
  rep: CompareReport;
}) {
  const row = (name: string, t: CompareReport["a"]) => (
    <tr key={name}>
      <td className="pr-2">{name}</td>
      <td className="pr-2">
        {fmt(t.slope.perYear)} ({fmt(t.slope.lower)} to {fmt(t.slope.upper)})
      </td>
      <td>{formatP(t.test.p).replace(/^p\s*=?\s*/, "")}</td>
    </tr>
  );
  return (
    <div className="flex flex-col gap-2">
      <table className="w-full text-[12px] tabular-nums">
        <caption className="sr-only">
          Each region's trend on the common period
        </caption>
        <thead>
          <tr className="text-left text-white/80">
            <th className="font-normal">Region</th>
            <th className="font-normal">Sen's slope, {rateUnits(v)} (95%)</th>
            <th className="font-normal">p</th>
          </tr>
        </thead>
        <tbody>
          {row(A.name, rep.a)}
          {row(B.name, rep.b)}
        </tbody>
      </table>
      <ul className="flex list-disc flex-col gap-1 pl-4 text-[12px] text-white/90">
        <li>
          {rep.bootstrap.method}; {rep.bootstrap.replicates} replicates, block
          length {rep.bootstrap.blockLength} steps ({rep.bootstrap.blockRule}).
        </li>
        <li>
          Common period {formatStep(rep.start)} – {formatStep(rep.end)},{" "}
          {rep.n.common} shared time steps, {rep.frequency}.
        </li>
        <li>
          Cross-check ({rep.crossCheck.method}):{" "}
          {rep.crossCheck.agrees ? "agrees" : "disagrees"} (
          {formatP(rep.crossCheck.test.p)}).
        </li>
      </ul>
    </div>
  );
}

/** Compare mode "variables": each extra variable as a compact card; the correlation text is in "What it means". */
function ExtrasBlock({
  a,
  r,
  variables,
}: {
  a: AnalysisResult;
  r: Region;
  variables: Variable[];
}) {
  return (
    <section aria-labelledby="res-extras" className="flex flex-col gap-2">
      <h3
        id="res-extras"
        className="text-xs font-medium tracking-wide text-white/85 uppercase"
      >
        Other variables in {r.name}
      </h3>
      {a.extras.map((x) => {
        const xv = variables.find((y) => y.id === x.variable);
        if (!xv) return null;
        const t = trendVerdict(xv, r, x.report);
        const s = x.report.slope;
        const corr = x.correlation?.detrended.pearson;
        return (
          <div
            key={x.variable}
            className="rounded-xl border border-white/15 p-3"
          >
            <p className="mb-1 flex flex-wrap items-center gap-1.5 text-xs font-medium">
              {xv.name}
              <Badge tone={t.tone}>
                {t.tone === "significant" ? "Significant" : "Cannot tell yet"}
              </Badge>
              {x.report.lowPower && <Badge tone="low">Low power</Badge>}
            </p>
            <p className="text-[13px] leading-snug">{t.headline}</p>
            <div className="mt-2 grid grid-cols-3 gap-1.5">
              <Tile label="Trend" value={fmt(s.perYear)} sub={rateUnits(xv)} />
              <Tile
                label="95% interval"
                value={`${fmt(s.lower)} to ${fmt(s.upper)}`}
                sub={rateUnits(xv)}
              />
              <Tile
                label="Link (r)"
                value={corr ? corr.r.toFixed(2) : "—"}
                sub={
                  corr
                    ? corr.significant
                      ? "related"
                      : "cannot tell yet"
                    : "not computed"
                }
              />
            </div>
          </div>
        );
      })}
    </section>
  );
}
