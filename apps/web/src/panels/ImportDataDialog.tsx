// "Import Data" (boss, 2026-11-13): pick one of the app's variables, see the exact file format it needs
// (columns, date format, units, missing values, example rows, template), then select a file. The file is read
// in the browser only and checked against that format; nothing is uploaded.
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  formatUnitsText,
  useRegionsData,
  useSeriesData,
  useVariablesData,
} from "@/lib/useData";
import type { Series, Variable } from "@trend/contract";
import { cn } from "cn";
import { CheckCircle2, Download, FileUp, Upload, XCircle } from "lucide-react";
import { useMemo, useRef, useState } from "react";

interface Column {
  name: string;
  required: boolean;
  type: string;
  description: string;
}

/** Rounds an example value to a readable number of digits. */
function show(x: number): string {
  const a = Math.abs(x);
  return String(
    a >= 1000
      ? Math.round(x)
      : a >= 10
        ? Math.round(x * 10) / 10
        : Math.round(x * 100) / 100,
  );
}

function schemaFor(
  v: Variable,
  series: Series | null,
): { columns: Column[]; dateFormat: string; example: string[][] } {
  const monthly = v.frequency === "monthly";
  const units = formatUnitsText(v.units);
  const columns: Column[] = [
    {
      name: "date",
      required: true,
      type: monthly ? "YYYY-MM" : "YYYY",
      description: monthly
        ? "Year and month, for example 2015-07. One row per month, oldest first."
        : "Year, for example 2015. One row per year, oldest first.",
    },
    {
      name: "value",
      required: true,
      type: `number (${units})`,
      description: `${v.name} in ${units}. Leave empty for a missing ${monthly ? "month" : "year"}; never fill gaps.`,
    },
    {
      name: "uncertainty",
      required: false,
      type: `number (${units})`,
      description:
        "Optional 1-sigma uncertainty of each value, same units. Leave the column out if you do not have it.",
    },
  ];
  const y0 = 2015;
  // Example rows: the first values of the app's own record for this variable, so units and scale are realistic.
  const real = series
    ? series.dates
        .map(
          (d, i) => [d, series.values[i], series.sigma?.[i] ?? null] as const,
        )
        .filter(([, x]) => x !== null)
        .slice(0, 3)
    : [];
  const hasSigma = real.some(([, , s]) => s !== null);
  const example =
    real.length === 3
      ? [
          hasSigma ? ["date", "value", "uncertainty"] : ["date", "value"],
          ...real.map(([d, x, s]) =>
            hasSigma ? [d, show(x!), s === null ? "" : show(s)] : [d, show(x!)],
          ),
        ]
      : monthly
        ? [
            ["date", "value", "uncertainty"],
            [`${y0}-01`, "12.4", "1.5"],
            [`${y0}-02`, "", ""],
            [`${y0}-03`, "13.1", "1.4"],
          ]
        : [
            ["date", "value", "uncertainty"],
            [`${y0}`, "1520", "60"],
            [`${y0 + 1}`, "1688", "55"],
            [`${y0 + 2}`, "", ""],
          ];
  return { columns, dateFormat: monthly ? "YYYY-MM" : "YYYY", example };
}

interface Check {
  ok: boolean;
  text: string;
}
interface Parsed {
  file: string;
  rows: number;
  first?: string;
  last?: string;
  missing: number;
  min?: number;
  max?: number;
  checks: Check[];
  preview: string[][];
}

/** Minimal CSV split (comma or semicolon, optional quotes). */
function splitLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (q && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else q = !q;
    } else if (c === sep && !q) {
      out.push(cur.trim());
      cur = "";
    } else cur += c;
  }
  out.push(cur.trim());
  return out;
}

function checkFile(name: string, text: string, v: Variable): Parsed {
  const monthly = v.frequency === "monthly";
  const dateRe = monthly ? /^\d{4}-(0[1-9]|1[0-2])$/ : /^\d{4}$/;
  const checks: Check[] = [];
  let dates: string[] = [];
  let values: (number | null)[] = [];
  let header: string[] = [];
  let preview: string[][] = [];

  if (/\.json$/i.test(name)) {
    try {
      const j = JSON.parse(text) as { dates?: unknown; values?: unknown };
      if (!Array.isArray(j.dates) || !Array.isArray(j.values))
        throw new Error('needs "dates" and "values" arrays');
      dates = j.dates.map(String);
      values = (j.values as unknown[]).map((x) =>
        x == null || x === "" ? null : Number(x),
      );
      header = ["date", "value"];
      preview = [
        header,
        ...dates
          .slice(0, 5)
          .map((d, i) => [d, values[i] == null ? "" : String(values[i])]),
      ];
      checks.push({
        ok: true,
        text: 'JSON file with "dates" and "values" arrays.',
      });
    } catch (e) {
      return {
        file: name,
        rows: 0,
        missing: 0,
        checks: [
          {
            ok: false,
            text: `Could not read the JSON file: ${e instanceof Error ? e.message : String(e)}.`,
          },
        ],
        preview: [],
      };
    }
  } else {
    const lines = text
      .replace(/^﻿/, "")
      .split(/\r?\n/)
      .filter((l) => l.trim() && !l.trim().startsWith("#"));
    if (!lines.length)
      return {
        file: name,
        rows: 0,
        missing: 0,
        checks: [{ ok: false, text: "The file is empty." }],
        preview: [],
      };
    const sep = lines[0].includes(";") && !lines[0].includes(",") ? ";" : ",";
    header = splitLine(lines[0], sep).map((h) => h.toLowerCase());
    const di = header.indexOf("date");
    const vi = header.indexOf("value");
    const ui = header.indexOf("uncertainty");
    checks.push({
      ok: di >= 0,
      text:
        di >= 0
          ? 'Column "date" found.'
          : `Column "date" is missing (found: ${header.join(", ") || "none"}).`,
    });
    checks.push({
      ok: vi >= 0,
      text: vi >= 0 ? 'Column "value" found.' : 'Column "value" is missing.',
    });
    if (ui >= 0)
      checks.push({ ok: true, text: 'Optional column "uncertainty" found.' });
    const rows = lines.slice(1).map((l) => splitLine(l, sep));
    preview = [header, ...rows.slice(0, 5)];
    if (di < 0 || vi < 0)
      return { file: name, rows: rows.length, missing: 0, checks, preview };
    dates = rows.map((r) => r[di] ?? "");
    values = rows.map((r) => {
      const s = (r[vi] ?? "").trim();
      return s === "" || /^(nan|na|null|-)$/i.test(s) ? null : Number(s);
    });
  }

  const badDates = dates.filter((d) => !dateRe.test(d));
  checks.push({
    ok: badDates.length === 0,
    text:
      badDates.length === 0
        ? `All dates use the ${monthly ? "YYYY-MM" : "YYYY"} format.`
        : `${badDates.length} date(s) not in ${monthly ? "YYYY-MM" : "YYYY"} format, e.g. "${badDates[0]}".`,
  });
  const sorted = dates.every((d, i) => i === 0 || d > dates[i - 1]);
  checks.push({
    ok: sorted,
    text: sorted
      ? "Dates are in order with no repeats."
      : "Dates must be in increasing order with no repeated dates.",
  });
  const bad = values.filter((x) => x !== null && !Number.isFinite(x)).length;
  checks.push({
    ok: bad === 0,
    text:
      bad === 0
        ? "Every value is a number or empty (missing)."
        : `${bad} value(s) are not numbers.`,
  });
  const nums = values.filter(
    (x): x is number => x !== null && Number.isFinite(x),
  );
  const enough = nums.length >= 10;
  checks.push({
    ok: enough,
    text: enough
      ? `${nums.length} values: enough for a trend test.`
      : `Only ${nums.length} values: at least 10 are needed for a trend test.`,
  });
  if (nums.length && nums.length < (monthly ? 360 : 30)) {
    checks.push({
      ok: true,
      text: `Shorter than 30 years: a real trend could be missed ("cannot tell yet" is likely).`,
    });
  }
  return {
    file: name,
    rows: dates.length,
    first: dates[0],
    last: dates[dates.length - 1],
    missing: values.filter((x) => x === null).length,
    min: nums.length ? Math.min(...nums) : undefined,
    max: nums.length ? Math.max(...nums) : undefined,
    checks,
    preview,
  };
}

export default function ImportDataDialog({
  compact = false,
}: {
  compact?: boolean;
}) {
  const { data: variables } = useVariablesData();
  const { data: regions } = useRegionsData();
  const [open, setOpen] = useState(false);
  const [varId, setVarId] = useState<string>("");
  const [regionName, setRegionName] = useState("");
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const v = variables?.find((x) => x.id === varId) ?? null;
  const exampleRegion = v?.regions[0] ?? null;
  const { data: series } = useSeriesData(v?.id ?? null, exampleRegion);
  const schema = useMemo(
    () => (v ? schemaFor(v, series?.variable === v.id ? series : null) : null),
    [v, series],
  );
  const exampleName = regions?.find((r) => r.id === exampleRegion)?.name;
  // What the app's values mean (a total, an average, an anomaly...), from the variable's own notes.
  const definition = v
    ? v.notes
        .filter((n) =>
          /anomaly|total|mean|average|relative|cumulative|sum/i.test(n),
        )
        .slice(0, 2)
    : [];

  function downloadTemplate() {
    if (!v || !schema) return;
    const csv =
      [
        `# ${v.name} (${formatUnitsText(v.units)}), ${v.frequency}; one region per file`,
        ...schema.example.map((r) => r.join(",")),
      ].join("\n") + "\n";
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `trend-detective-template_${v.id}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  async function onFile(f: File | undefined) {
    if (!f || !v) return;
    const text = await f.text();
    setParsed(checkFile(f.name, text, v));
  }

  const allOk = parsed && parsed.checks.every((c) => c.ok);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setParsed(null);
      }}
    >
      <DialogTrigger
        render={
          <button
            type="button"
            className={cn(
              "pointer-events-auto flex items-center gap-1.5 rounded-xl border border-amber-300/60 bg-amber-300/15 font-semibold text-amber-50 shadow-lg backdrop-blur hover:bg-amber-300/25",
              compact ? "px-2.5 py-1.5 text-xs" : "px-3 py-1.5 text-sm",
            )}
          />
        }
      >
        <Upload className="size-4" aria-hidden />
        {compact ? "Import" : "Import Data"}
      </DialogTrigger>
      <DialogContent className="glass-strong no-scrollbar max-h-[90dvh] overflow-y-auto border-0 text-white sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-base text-white">
            Import your own data
          </DialogTitle>
          <DialogDescription className="text-[13px] text-white/85">
            Bring a record for your own region or time frame, for any variable
            in the app. Your file is read in this browser only; nothing is
            uploaded.
          </DialogDescription>
        </DialogHeader>

        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold tracking-wide text-white/90 uppercase">
            1. Choose the variable
          </h3>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-[12.5px] text-white/85">
              Variable
              <select
                value={varId}
                onChange={(e) => {
                  setVarId(e.target.value);
                  setParsed(null);
                }}
                className="h-9 rounded-lg border border-white/20 bg-slate-900 px-2 text-sm text-white"
              >
                <option value="">Select a variable…</option>
                {(variables ?? []).map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name} ({formatUnitsText(x.units)}, {x.frequency})
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[12.5px] text-white/85">
              Your region or site name
              <input
                value={regionName}
                onChange={(e) => setRegionName(e.target.value)}
                placeholder="e.g. Kurigram district, Gangotri glacier"
                className="h-9 rounded-lg border border-white/20 bg-slate-900 px-2 text-sm text-white placeholder:text-white/50"
              />
            </label>
          </div>
        </section>

        {v && schema && (
          <section className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold tracking-wide text-white/90 uppercase">
              2. Match this format
            </h3>
            <p className="text-[12.5px] text-white/85">
              A CSV file (comma separated, first row = column names) with one
              row per {v.frequency === "monthly" ? "month" : "year"} for one
              region. A JSON file with{" "}
              <code className="rounded bg-black/30 px-1">dates</code> and{" "}
              <code className="rounded bg-black/30 px-1">values</code> arrays
              also works.
            </p>
            <div className="overflow-x-auto rounded-xl border border-white/15">
              <table className="w-full text-left text-[12.5px]">
                <thead className="bg-white/[0.06] text-white/80">
                  <tr>
                    <th className="px-3 py-1.5 font-medium">Column</th>
                    <th className="px-3 py-1.5 font-medium">Required</th>
                    <th className="px-3 py-1.5 font-medium">Type</th>
                    <th className="px-3 py-1.5 font-medium">Meaning</th>
                  </tr>
                </thead>
                <tbody>
                  {schema.columns.map((c) => (
                    <tr
                      key={c.name}
                      className="border-t border-white/10 align-top"
                    >
                      <td className="px-3 py-1.5 font-mono text-sky-200">
                        {c.name}
                      </td>
                      <td className="px-3 py-1.5">
                        {c.required ? "Yes" : "Optional"}
                      </td>
                      <td className="px-3 py-1.5 whitespace-nowrap">
                        {c.type}
                      </td>
                      <td className="px-3 py-1.5 text-white/85">
                        {c.description}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-start gap-3">
              <figure className="m-0 min-w-0 flex-1">
                <pre className="rounded-xl border border-white/10 bg-black/40 p-3 text-[12px] leading-relaxed text-white/90">
                  {schema.example.map((r) => r.join(",")).join("\n")}
                </pre>
                {exampleName && series?.variable === v.id && (
                  <figcaption className="mt-1 text-[11.5px] text-white/70">
                    Example: the first rows of the app&apos;s own {exampleName}{" "}
                    record.
                  </figcaption>
                )}
              </figure>
              <button
                type="button"
                onClick={downloadTemplate}
                className="flex items-center gap-1.5 rounded-lg border border-white/20 px-3 py-2 text-[12.5px] text-white hover:bg-white/10"
              >
                <Download className="size-4" aria-hidden /> Download template
              </button>
            </div>
            <p className="text-[12px] text-white/75">
              Units must be {formatUnitsText(v.units)}, defined the same way as
              the app&apos;s {v.name.toLowerCase()} data
              {definition.length ? `: ${definition.join(" ")}` : "."} Leave gaps
              empty: values are never filled in or extended.
            </p>
          </section>
        )}

        {v && (
          <section className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold tracking-wide text-white/90 uppercase">
              3. Select your data file
            </h3>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.txt,.json,text/csv,application/json"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = ""; // so choosing the same (fixed) file again re-checks it
                void onFile(f);
              }}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-sky-300/50 bg-sky-300/[0.06] px-4 py-5 text-sm font-medium text-white hover:bg-sky-300/[0.12]"
            >
              <FileUp className="size-5" aria-hidden /> Select data file (.csv
              or .json)
            </button>

            {parsed && (
              <div
                className={cn(
                  "rounded-xl border p-3",
                  allOk
                    ? "border-emerald-300/50 bg-emerald-300/10"
                    : "border-amber-300/50 bg-amber-300/10",
                )}
              >
                <p className="mb-1.5 text-sm font-semibold">
                  {parsed.file}
                  {regionName ? ` · ${regionName}` : ""}:{" "}
                  {allOk ? "matches the format" : "needs a few fixes"}
                </p>
                {parsed.rows > 0 && (
                  <p className="mb-2 text-[12.5px] text-white/85 tabular-nums">
                    {parsed.rows} rows
                    {parsed.first
                      ? `, ${parsed.first} to ${parsed.last}`
                      : ""}, {parsed.missing} missing
                    {parsed.min !== undefined
                      ? `, values ${parsed.min} to ${parsed.max} ${formatUnitsText(v.units)}`
                      : ""}
                  </p>
                )}
                <ul className="flex flex-col gap-1 text-[12.5px]">
                  {parsed.checks.map((c, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      {c.ok ? (
                        <CheckCircle2
                          className="mt-0.5 size-3.5 shrink-0 text-emerald-300"
                          aria-hidden
                        />
                      ) : (
                        <XCircle
                          className="mt-0.5 size-3.5 shrink-0 text-amber-300"
                          aria-hidden
                        />
                      )}
                      <span>{c.text}</span>
                    </li>
                  ))}
                </ul>
                {parsed.preview.length > 1 && (
                  <div className="mt-2 overflow-x-auto rounded-lg border border-white/10">
                    <table className="w-full text-left text-[12px] tabular-nums">
                      <thead className="bg-white/[0.06] text-white/80">
                        <tr>
                          {parsed.preview[0].map((h, i) => (
                            <th key={i} className="px-2 py-1 font-medium">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {parsed.preview.slice(1).map((r, i) => (
                          <tr key={i} className="border-t border-white/10">
                            {r.map((c, k) => (
                              <td key={k} className="px-2 py-1">
                                {c}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        <DialogFooter>
          <Button
            onClick={() => setOpen(false)}
            className="bg-sky-300 text-slate-950 hover:bg-sky-200"
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
