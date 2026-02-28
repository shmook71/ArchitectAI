import { useEffect, useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

const API = "http://127.0.0.1:8000";
const PROJECT_ID = 2;

export default function App() {
  const [data, setData] = useState(null); // latest run
  const [history, setHistory] = useState([]); // last N runs
  const [theme, setTheme] = useState("dark");
  const [page, setPage] = useState("dashboard"); // dashboard | analytics | history
  const [selectedRun, setSelectedRun] = useState(null);

  const [error, setError] = useState("");
  const [loadingLatest, setLoadingLatest] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [running, setRunning] = useState(false);

  // Analytics
  const [metric, setMetric] = useState("overall_score"); // overall_score | reliability | scalability | observability | cost_optimization

  // Compare Runs (NEW)
  const [compareIds, setCompareIds] = useState([]); // [idA, idB]
  const [compareOpen, setCompareOpen] = useState(false);

  // Apply theme to body
  useEffect(() => {
    document.body.className = theme === "light" ? "light" : "";
  }, [theme]);

  const pill = (value) => {
    const v = Number(value ?? 0);
    if (v >= 80) return "good";
    if (v >= 60) return "warn";
    return "bad";
  };

  const deltaClass = (d) => {
    const n = Number(d ?? 0);
    if (n > 0) return "good";
    if (n < 0) return "bad";
    return "mutedDelta";
  };

  const sign = (n) => {
    const v = Number(n ?? 0);
    if (v > 0) return `+${v}`;
    return `${v}`;
  };

  const downloadJson = (obj, filename = "run.json") => {
    const blob = new Blob([JSON.stringify(obj, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const fetchHistory = async (limit = 20) => {
    setLoadingHistory(true);
    try {
      const res = await fetch(
        `${API}/projects/${PROJECT_ID}/history?limit=${limit}`,
        { headers: { Accept: "application/json" } }
      );
      if (!res.ok) throw new Error(`History API error: ${res.status}`);
      const json = await res.json();
      const arr = Array.isArray(json) ? json : [];
      setHistory(arr);
      return arr;
    } finally {
      setLoadingHistory(false);
    }
  };

  const fetchLatestFromHistory = async () => {
    setLoadingLatest(true);
    try {
      setError("");
      const res = await fetch(`${API}/projects/${PROJECT_ID}/history?limit=1`, {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) throw new Error(`Latest API error: ${res.status}`);
      const json = await res.json();
      const latest = Array.isArray(json) && json.length ? json[0] : null;
      setData(latest);
      return latest;
    } catch (e) {
      setError(e?.message || "Failed to load latest");
      setData(null);
      return null;
    } finally {
      setLoadingLatest(false);
    }
  };

  const runNewAnalysis = async () => {
    setRunning(true);
    try {
      setError("");
      const res = await fetch(`${API}/projects/${PROJECT_ID}/analyze-v2`, {
        method: "POST",
        headers: { Accept: "application/json" },
      });
      if (!res.ok) throw new Error(`Analyze API error: ${res.status}`);
      const json = await res.json();

      setData(json);
      await fetchHistory(20);
      setPage("dashboard");
    } catch (e) {
      setError(e?.message || "Failed to run analysis");
    } finally {
      setRunning(false);
    }
  };

  // Initial load: latest + history
  useEffect(() => {
    (async () => {
      await fetchLatestFromHistory();
      await fetchHistory(20);
    })();
  }, []);

  // Sort history asc for charts
  const sortedHistoryAsc = useMemo(() => {
    const arr = [...history];
    arr.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    return arr;
  }, [history]);

  const timeLabel = (iso) => {
    try {
      return new Date(iso).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "";
    }
  };

  const analyticsChartData = useMemo(() => {
    return sortedHistoryAsc.map((run, idx) => {
      const p = run?.pillars || {};
      const y =
        metric === "overall_score"
          ? run?.overall_score ?? 0
          : metric === "reliability"
          ? p?.reliability ?? 0
          : metric === "scalability"
          ? p?.scalability ?? 0
          : metric === "observability"
          ? p?.observability ?? 0
          : metric === "cost_optimization"
          ? p?.cost_optimization ?? 0
          : 0;

      return {
        name: timeLabel(run?.created_at) || `Run ${idx + 1}`,
        value: Number(y ?? 0),
        created_at: run?.created_at,
      };
    });
  }, [sortedHistoryAsc, metric]);

  const trendOverallVsReliability = useMemo(() => {
    return sortedHistoryAsc.map((run, idx) => ({
      name: timeLabel(run?.created_at) || `Run ${idx + 1}`,
      overall: Number(run?.overall_score ?? 0),
      reliability: Number(run?.pillars?.reliability ?? 0),
    }));
  }, [sortedHistoryAsc]);

  // ===== Compare Runs (NEW) =====
  const byId = useMemo(() => {
    const map = new Map();
    history.forEach((r) => map.set(r.id, r));
    return map;
  }, [history]);

  const runA = compareIds.length > 0 ? byId.get(compareIds[0]) : null;
  const runB = compareIds.length > 1 ? byId.get(compareIds[1]) : null;

  const toggleCompare = (id) => {
    setCompareIds((prev) => {
      const has = prev.includes(id);
      if (has) return prev.filter((x) => x !== id);
      if (prev.length >= 2) return prev; // only 2
      return [...prev, id];
    });
  };

  const clearCompare = () => {
    setCompareIds([]);
    setCompareOpen(false);
  };

  const swapCompare = () => {
    setCompareIds((prev) => (prev.length === 2 ? [prev[1], prev[0]] : prev));
  };

  const comparePillars = useMemo(() => {
    if (!runA || !runB) return [];
    const keys = Array.from(
      new Set([
        ...Object.keys(runA.pillars || {}),
        ...Object.keys(runB.pillars || {}),
      ])
    );

    return keys.map((k) => {
      const a = Number(runA?.pillars?.[k] ?? 0);
      const b = Number(runB?.pillars?.[k] ?? 0);
      return { key: k, a, b, delta: b - a };
    });
  }, [runA, runB]);

  // ---- Render Helpers ----
  const DashboardView = () => {
    if (loadingLatest) return <div style={{ padding: 40 }}>Loading...</div>;
    if (!data) {
      return (
        <div style={{ padding: 40 }}>
          <h3 style={{ marginTop: 0 }}>No runs found</h3>
          <p style={{ opacity: 0.7 }}>
            اضغطي Run New Analysis عشان ينشئ أول تحليل.
          </p>
        </div>
      );
    }

    return (
      <>
        {/* Top Row */}
        <section className="topGrid">
          <div className="heroCard">
            <div className="heroTitle">Overall Score</div>
            <div className="heroValue">{data.overall_score}</div>
            <div className="heroSub">Based on weighted pillars</div>
          </div>

          <div className="statBlock">
            <div className="statTitle">Risk Level</div>
            <div className="statValue">{data.risk_level}</div>
          </div>

          <div className="statBlock">
            <div className="statTitle">Maturity</div>
            <div className="statValue">{data.maturity_level}</div>
          </div>
        </section>

        {/* KPI Cards */}
        <section className="kpiGrid">
          <div className="kpi">
            <div className="kpiTitle">Overall Score</div>
            <div className={`kpiValue ${pill(data.overall_score)}`}>
              {data.overall_score}
            </div>
            <div className="kpiSub">Pillars weighted score</div>
          </div>

          <div className="kpi">
            <div className="kpiTitle">Risk Level</div>
            <div
              className={`kpiValue ${
                data.risk_level === "Low"
                  ? "good"
                  : data.risk_level === "Medium"
                  ? "warn"
                  : "bad"
              }`}
            >
              {data.risk_level}
            </div>
            <div className="kpiSub">Current classification</div>
          </div>

          <div className="kpi">
            <div className="kpiTitle">Maturity</div>
            <div className="kpiValue">{data.maturity_level}</div>
            <div className="kpiSub">Architecture stage</div>
          </div>

          <div className="kpi">
            <div className="kpiTitle">Last Run</div>
            <div className="kpiValue small">
              {new Date(data.created_at).toLocaleString()}
            </div>
            <div className="kpiSub">Timestamp of last analysis</div>
          </div>
        </section>

        {/* Trend */}
        <section className="card">
          <div className="cardHead">
            <h3>Trend</h3>
            <span>Overall vs Reliability</span>
          </div>

          <div className="chartBox">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendOverallVsReliability}>
                <defs>
                  <linearGradient id="gradOverall" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#22c55e" stopOpacity={0.9} />
                    <stop offset="100%" stopColor="#06b6d4" stopOpacity={0.9} />
                  </linearGradient>
                  <linearGradient
                    id="gradReliability"
                    x1="0"
                    y1="0"
                    x2="1"
                    y2="0"
                  >
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.9} />
                    <stop offset="100%" stopColor="#a855f7" stopOpacity={0.9} />
                  </linearGradient>
                </defs>

                <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis
                  dataKey="name"
                  stroke="rgba(255,255,255,0.45)"
                  tick={{ fontSize: 12 }}
                />
                <YAxis
                  stroke="rgba(255,255,255,0.45)"
                  tick={{ fontSize: 12 }}
                  domain={[0, 100]}
                />
                <Tooltip
                  contentStyle={{
                    background: "rgba(10,20,35,0.92)",
                    border: "1px solid rgba(255,255,255,0.10)",
                    borderRadius: 12,
                    boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
                  }}
                  labelStyle={{
                    color: "rgba(255,255,255,0.75)",
                    fontWeight: 700,
                  }}
                  itemStyle={{ color: "#fff" }}
                  cursor={{ stroke: "rgba(255,255,255,0.10)" }}
                />

                <Line
                  type="monotone"
                  dataKey="overall"
                  name="Overall"
                  stroke="url(#gradOverall)"
                  strokeWidth={3}
                  dot={false}
                  activeDot={{ r: 6 }}
                />
                <Line
                  type="monotone"
                  dataKey="reliability"
                  name="Reliability"
                  stroke="url(#gradReliability)"
                  strokeWidth={3}
                  dot={false}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Pillars */}
        <section className="card">
          <div className="cardHead">
            <h3>Pillars</h3>
            <span>Scores by category</span>
          </div>

          <div className="pillars">
            {Object.entries(data.pillars || {}).map(([k, v]) => (
              <div key={k} className="pillarRow">
                <div className="pillarTop">
                  <span className="pillarName">{k}</span>
                  <span className="pillarValue">{v}</span>
                </div>
                <div className="pillarBar">
                  <div
                    className={`pillarFill ${pill(v)}`}
                    style={{ width: `${v}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Risks + Recommendations */}
        <section className="twoCol">
          <div className="card">
            <div className="cardHead">
              <h3>Top Risks</h3>
              <span>Prioritized</span>
            </div>
            <ul className="list">
              {(data.top_risks || []).map((r, i) => (
                <li key={i} className="listItem">
                  <span className={`badge ${String(r.severity).toLowerCase()}`}>
                    {r.severity}
                  </span>
                  <div>
                    <div className="listTitle">{r.category}</div>
                    <div className="listDesc">{r.description}</div>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="card">
            <div className="cardHead">
              <h3>Top Recommendations</h3>
              <span>Actionable</span>
            </div>
            <ul className="list">
              {(data.top_recommendations || []).map((rec, i) => (
                <li key={i} className="listItem">
                  <span className="badge info">
                    {rec.impact}/{rec.effort}
                  </span>
                  <div>
                    <div className="listTitle">Recommendation</div>
                    <div className="listDesc">{rec.action}</div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </>
    );
  };

  const AnalyticsView = () => {
    return (
      <section className="card">
        <div className="cardHead">
          <h3>Analytics</h3>
          <span>Based on last {history.length || 0} runs</span>
        </div>

        <div className="analyticsRow">
          <div className="label">Metric</div>
          <select
            className="select"
            value={metric}
            onChange={(e) => setMetric(e.target.value)}
          >
            <option value="overall_score">Overall</option>
            <option value="reliability">Reliability</option>
            <option value="scalability">Scalability</option>
            <option value="observability">Observability</option>
            <option value="cost_optimization">Cost Optimization</option>
          </select>

          <div className="analyticsHint">
            {loadingHistory ? "Loading runs..." : "Over time"}
          </div>
        </div>

        <div className="chartBox" style={{ height: 360 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={analyticsChartData}>
              <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis
                dataKey="name"
                stroke="rgba(255,255,255,0.45)"
                tick={{ fontSize: 12 }}
                interval="preserveStartEnd"
              />
              <YAxis
                stroke="rgba(255,255,255,0.45)"
                tick={{ fontSize: 12 }}
                domain={[0, 100]}
              />
              <Tooltip
                contentStyle={{
                  background: "rgba(10,20,35,0.92)",
                  border: "1px solid rgba(255,255,255,0.10)",
                  borderRadius: 12,
                  boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
                }}
                labelStyle={{
                  color: "rgba(255,255,255,0.75)",
                  fontWeight: 800,
                }}
                itemStyle={{ color: "#fff" }}
                cursor={{ stroke: "rgba(255,255,255,0.10)" }}
                formatter={(val) => [`${val}`, "value"]}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke="#22c55e"
                strokeWidth={3}
                dot={false}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="miniNote">
          إذا الخط ثابت: هذا لأن كل الـ runs عندك نفس القيم تقريبًا. اضغطي Run New
          Analysis بعد ما تغيّرين مدخلات المشروع/الـ spec (إذا موجود) عشان تتغير
          النتائج.
        </div>
      </section>
    );
  };

  const HistoryView = () => {
    const sortedDesc = [...history].sort(
      (a, b) => new Date(b.created_at) - new Date(a.created_at)
    );

    return (
      <section className="card">
        <div className="cardHead">
          <div>
            <h3 style={{ marginBottom: 2 }}>History</h3>
            <span>Last {history.length} runs</span>
          </div>

          <div className="headActions">
            <button className="smallBtn" onClick={() => setCompareIds([])}>
              Clear
            </button>
            <button
              className="smallBtn"
              disabled={compareIds.length !== 2}
              onClick={() => setCompareOpen(true)}
              title={
                compareIds.length !== 2
                  ? "Select 2 runs to compare"
                  : "Compare selected runs"
              }
            >
              Compare ({compareIds.length}/2)
            </button>
          </div>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 44 }}></th>
                <th>#</th>
                <th>Date</th>
                <th>Overall</th>
                <th>Risk</th>
                <th>Maturity</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sortedDesc.map((run, idx) => (
                <tr key={run.id ?? run.created_at ?? idx}>
                  <td>
                    <input
                      type="checkbox"
                      className="cb"
                      checked={compareIds.includes(run.id)}
                      onChange={() => toggleCompare(run.id)}
                      disabled={
                        !compareIds.includes(run.id) && compareIds.length >= 2
                      }
                      title="Select for compare"
                    />
                  </td>
                  <td>{idx + 1}</td>
                  <td>{new Date(run.created_at).toLocaleString()}</td>
                  <td className={pill(run.overall_score)}>{run.overall_score}</td>
                  <td>{run.risk_level}</td>
                  <td>{run.maturity_level}</td>
                  <td className="tdRight">
                    <button className="smallBtn" onClick={() => setSelectedRun(run)}>
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Run Details Modal */}
        {selectedRun && (
          <div className="modalBackdrop" onClick={() => setSelectedRun(null)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modalHead">
                <div>
                  <div style={{ fontWeight: 900, fontSize: 16 }}>
                    Run Details
                  </div>
                  <div style={{ opacity: 0.7, fontSize: 12 }}>
                    {new Date(selectedRun.created_at).toLocaleString()}
                  </div>
                </div>

                <div className="modalActions">
                  <button
                    className="smallBtn"
                    onClick={() =>
                      downloadJson(
                        selectedRun,
                        `architectai_run_${selectedRun.id ?? "x"}.json`
                      )
                    }
                  >
                    Export JSON
                  </button>
                  <button className="smallBtn" onClick={() => setSelectedRun(null)}>
                    Close
                  </button>
                </div>
              </div>

              <div className="kpiGrid" style={{ marginTop: 12 }}>
                <div className="kpi">
                  <div className="kpiTitle">Overall</div>
                  <div className={`kpiValue ${pill(selectedRun.overall_score)}`}>
                    {selectedRun.overall_score}
                  </div>
                </div>

                <div className="kpi">
                  <div className="kpiTitle">Risk</div>
                  <div className="kpiValue">{selectedRun.risk_level}</div>
                </div>

                <div className="kpi">
                  <div className="kpiTitle">Maturity</div>
                  <div className="kpiValue">{selectedRun.maturity_level}</div>
                </div>

                <div className="kpi">
                  <div className="kpiTitle">Project</div>
                  <div className="kpiValue">{selectedRun.project_id}</div>
                </div>
              </div>

              <div className="twoCol" style={{ marginTop: 12 }}>
                <div className="card" style={{ marginTop: 0 }}>
                  <div className="cardHead">
                    <h3>Pillars</h3>
                    <span>Scores</span>
                  </div>

                  <div className="pillars">
                    {Object.entries(selectedRun.pillars || {}).map(([k, v]) => (
                      <div key={k} className="pillarRow">
                        <div className="pillarTop">
                          <span className="pillarName">{k}</span>
                          <span className="pillarValue">{v}</span>
                        </div>
                        <div className="pillarBar">
                          <div
                            className={`pillarFill ${pill(v)}`}
                            style={{ width: `${v}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="card" style={{ marginTop: 0 }}>
                  <div className="cardHead">
                    <h3>Risks</h3>
                    <span>Top</span>
                  </div>
                  <ul className="list">
                    {(selectedRun.top_risks || []).map((r, i) => (
                      <li key={i} className="listItem">
                        <span className={`badge ${String(r.severity).toLowerCase()}`}>
                          {r.severity}
                        </span>
                        <div>
                          <div className="listTitle">{r.category}</div>
                          <div className="listDesc">{r.description}</div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="card" style={{ marginTop: 12 }}>
                <div className="cardHead">
                  <h3>Recommendations</h3>
                  <span>Top</span>
                </div>
                <ul className="list">
                  {(selectedRun.top_recommendations || []).map((rec, i) => (
                    <li key={i} className="listItem">
                      <span className="badge info">
                        {rec.impact}/{rec.effort}
                      </span>
                      <div>
                        <div className="listTitle">Recommendation</div>
                        <div className="listDesc">{rec.action}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Compare Modal (NEW) */}
        {compareOpen && runA && runB && (
          <div className="modalBackdrop" onClick={clearCompare}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modalHead">
                <div>
                  <div style={{ fontWeight: 900, fontSize: 16 }}>
                    Compare Runs
                  </div>
                  <div style={{ opacity: 0.7, fontSize: 12 }}>
                    A: {new Date(runA.created_at).toLocaleString()} &nbsp;•&nbsp; B:{" "}
                    {new Date(runB.created_at).toLocaleString()}
                  </div>
                </div>

                <div className="modalActions">
                  <button className="smallBtn" onClick={swapCompare}>
                    Swap
                  </button>
                  <button className="smallBtn" onClick={clearCompare}>
                    Close
                  </button>
                </div>
              </div>

              <div className="compareGrid">
                <div className="compareCard">
                  <div className="compareTitle">Overall</div>
                  <div className="compareRow">
                    <span className="muted">A</span>
                    <span className={`big ${pill(runA.overall_score)}`}>
                      {runA.overall_score}
                    </span>
                  </div>
                  <div className="compareRow">
                    <span className="muted">B</span>
                    <span className={`big ${pill(runB.overall_score)}`}>
                      {runB.overall_score}
                    </span>
                  </div>
                  <div className={`delta ${deltaClass(runB.overall_score - runA.overall_score)}`}>
                    Δ {sign(runB.overall_score - runA.overall_score)}
                  </div>
                </div>

                <div className="compareCard">
                  <div className="compareTitle">Risk</div>
                  <div className="compareRow">
                    <span className="muted">A</span>
                    <span className="big">{runA.risk_level}</span>
                  </div>
                  <div className="compareRow">
                    <span className="muted">B</span>
                    <span className="big">{runB.risk_level}</span>
                  </div>
                  <div className="delta mutedDelta">Qualitative</div>
                </div>

                <div className="compareCard">
                  <div className="compareTitle">Maturity</div>
                  <div className="compareRow">
                    <span className="muted">A</span>
                    <span className="big">{runA.maturity_level}</span>
                  </div>
                  <div className="compareRow">
                    <span className="muted">B</span>
                    <span className="big">{runB.maturity_level}</span>
                  </div>
                  <div className="delta mutedDelta">Qualitative</div>
                </div>

                <div className="compareCard">
                  <div className="compareTitle">Counts</div>
                  <div className="compareRow">
                    <span className="muted">Risks</span>
                    <span className="big">
                      {Number(runA.top_risks?.length ?? 0)} →{" "}
                      {Number(runB.top_risks?.length ?? 0)}
                    </span>
                  </div>
                  <div className="compareRow">
                    <span className="muted">Recs</span>
                    <span className="big">
                      {Number(runA.top_recommendations?.length ?? 0)} →{" "}
                      {Number(runB.top_recommendations?.length ?? 0)}
                    </span>
                  </div>
                  <div className="delta mutedDelta">Volume</div>
                </div>
              </div>

              <div className="card" style={{ marginTop: 12 }}>
                <div className="cardHead">
                  <h3>Pillars Delta</h3>
                  <span>B - A</span>
                </div>

                <div style={{ overflowX: "auto" }}>
                  <table className="table" style={{ minWidth: 760 }}>
                    <thead>
                      <tr>
                        <th>Pillar</th>
                        <th>A</th>
                        <th>B</th>
                        <th>Δ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {comparePillars.map((p) => (
                        <tr key={p.key}>
                          <td style={{ textTransform: "capitalize" }}>{p.key}</td>
                          <td className={pill(p.a)}>{p.a}</td>
                          <td className={pill(p.b)}>{p.b}</td>
                          <td className={deltaClass(p.delta)}>
                            {sign(Math.round(p.delta))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="miniNote">
                  الفكرة: A = القديم / B = الجديد. لو Δ موجب فهذا تحسّن ✅ ولو سالب
                  فهذا تراجع ⚠️
                </div>
              </div>

              <div className="twoCol" style={{ marginTop: 12 }}>
                <div className="card" style={{ marginTop: 0 }}>
                  <div className="cardHead">
                    <h3>Run A Top Risks</h3>
                    <span>Snapshot</span>
                  </div>
                  <ul className="list">
                    {(runA.top_risks || []).slice(0, 5).map((r, i) => (
                      <li key={i} className="listItem">
                        <span className={`badge ${String(r.severity).toLowerCase()}`}>
                          {r.severity}
                        </span>
                        <div>
                          <div className="listTitle">{r.category}</div>
                          <div className="listDesc">{r.description}</div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="card" style={{ marginTop: 0 }}>
                  <div className="cardHead">
                    <h3>Run B Top Risks</h3>
                    <span>Snapshot</span>
                  </div>
                  <ul className="list">
                    {(runB.top_risks || []).slice(0, 5).map((r, i) => (
                      <li key={i} className="listItem">
                        <span className={`badge ${String(r.severity).toLowerCase()}`}>
                          {r.severity}
                        </span>
                        <div>
                          <div className="listTitle">{r.category}</div>
                          <div className="listDesc">{r.description}</div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="miniNote" style={{ marginTop: 12 }}>
                Tip: إذا تبين مقارنة أعمق، نقدر نضيف "Changed Risks" (اللي اختفى/ظهر)
                بس هذا يكفي كختم قوي جدًا.
              </div>
            </div>
          </div>
        )}
      </section>
    );
  };

  // ---- Main Render ----
  return (
    <div className="app">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="brand">ArchitectAI</div>

        <nav className="nav">
          <button
            className={`navBtn ${page === "dashboard" ? "active" : ""}`}
            onClick={() => setPage("dashboard")}
          >
            Dashboard
          </button>

          <button
            className={`navBtn ${page === "analytics" ? "active" : ""}`}
            onClick={() => setPage("analytics")}
          >
            Analytics
          </button>

          <button
            className={`navBtn ${page === "history" ? "active" : ""}`}
            onClick={() => setPage("history")}
          >
            History
          </button>
        </nav>

        <button className="runBtn" onClick={runNewAnalysis} disabled={running}>
          {running ? "⏳ Running..." : "▶ Run New Analysis"}
        </button>

        <button
          className="toggle"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        >
          {theme === "dark" ? "☀ Light Mode" : "🌙 Dark Mode"}
        </button>

        <div className="apiHint">API: {API}</div>
      </aside>

      {/* Main */}
      <main className="main">
        <header className="header">
          <h1>AI Architecture Dashboard</h1>
          <div className="headerHint">ArchitectAI v2</div>
        </header>

        {error ? (
          <div className="errorBox">
            <div className="errorTitle">Frontend Error</div>
            <div className="errorText">{error}</div>
            <div className="errorText" style={{ opacity: 0.7, marginTop: 8 }}>
              تأكدي إن backend شغال على 8000
            </div>
          </div>
        ) : null}

        {page === "dashboard" ? (
          <DashboardView />
        ) : page === "analytics" ? (
          <AnalyticsView />
        ) : (
          <HistoryView />
        )}

        {(loadingHistory || loadingLatest) && (
          <div className="loadingBadge">
            {loadingLatest ? "Loading latest..." : "Loading history..."}
          </div>
        )}
      </main>

      {/* Styles */}
      <style>{`
        :root{
          --bg:#071225;
          --panel:rgba(255,255,255,0.04);
          --border:rgba(255,255,255,0.08);
          --text:#e8eefc;
          --muted:rgba(232,238,252,0.65);
          --cyan:#06b6d4;
          --shadow:0 20px 60px rgba(0,0,0,0.35);
        }
        body{
          margin:0;
          background: radial-gradient(1200px 800px at 30% 10%, rgba(14,165,233,0.18), transparent 60%),
                      radial-gradient(1000px 600px at 80% 30%, rgba(6,182,212,0.14), transparent 55%),
                      var(--bg);
          color:var(--text);
          font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial;
        }
        body.light{
          --bg:#f4f7fb;
          --panel:rgba(10,20,35,0.04);
          --border:rgba(10,20,35,0.10);
          --text:#0b1220;
          --muted:rgba(11,18,32,0.65);
          background: radial-gradient(900px 600px at 30% 10%, rgba(14,165,233,0.14), transparent 60%),
                      radial-gradient(900px 600px at 80% 30%, rgba(6,182,212,0.10), transparent 55%),
                      var(--bg);
        }

        .app{ display:grid; grid-template-columns: 280px 1fr; min-height:100vh; }

        .sidebar{
          padding:28px 18px;
          border-right:1px solid var(--border);
          background: rgba(0,0,0,0.10);
          backdrop-filter: blur(10px);
        }
        body.light .sidebar{ background: rgba(255,255,255,0.55); }

        .brand{ font-size:28px; font-weight:900; margin-bottom:22px; letter-spacing:0.2px; }

        .nav{ display:flex; flex-direction:column; gap:10px; }
        .navBtn{
          padding:12px 12px;
          border-radius:14px;
          border:1px solid transparent;
          background: transparent;
          color: var(--muted);
          cursor:pointer;
          text-align:left;
          font-weight:800;
          font-size:15px;
        }
        .navBtn.active{
          color:var(--text);
          border:1px solid var(--border);
          background: var(--panel);
          box-shadow: 0 10px 25px rgba(0,0,0,0.12);
        }

        .runBtn{
          margin-top:16px;
          width:100%;
          padding:12px 12px;
          border-radius:14px;
          border:1px solid rgba(34,197,94,0.35);
          background: rgba(34,197,94,0.10);
          color: var(--text);
          cursor:pointer;
          text-align:left;
          font-weight:900;
        }
        .runBtn:disabled{ opacity:0.6; cursor:not-allowed; }

        .toggle{
          margin-top:12px;
          width:100%;
          padding:12px 12px;
          border-radius:14px;
          border:1px solid var(--border);
          background: var(--panel);
          color:var(--text);
          cursor:pointer;
          text-align:left;
          font-weight:800;
        }

        .apiHint{ margin-top:14px; font-size:12px; color: var(--muted); opacity:0.9; padding-left:4px; }

        .main{ padding:34px 34px 60px; position:relative; }

        .header{ display:flex; align-items:flex-end; justify-content:space-between; gap:16px; }
        .header h1{ margin:0; font-size:44px; letter-spacing:-0.5px; }
        .headerHint{ color:var(--muted); font-weight:800; }

        .errorBox{
          margin-top:18px;
          padding:14px 16px;
          border-radius:16px;
          border:1px solid rgba(239,68,68,0.35);
          background: rgba(239,68,68,0.10);
        }
        .errorTitle{ font-weight:900; }
        .errorText{ margin-top:6px; }

        .topGrid{
          margin-top:22px;
          display:grid;
          grid-template-columns: 420px 1fr 1fr;
          gap:18px;
          align-items:stretch;
        }

        .heroCard{
          border:1px solid var(--border);
          background: linear-gradient(135deg, rgba(14,165,233,0.95), rgba(6,182,212,0.80));
          border-radius:18px;
          padding:22px;
          box-shadow: var(--shadow);
        }
        .heroTitle{ font-weight:900; font-size:18px; opacity:0.95; }
        .heroValue{ font-size:56px; font-weight:900; margin-top:8px; }
        .heroSub{ margin-top:6px; opacity:0.9; }

        .statBlock{
          border:1px solid var(--border);
          background: var(--panel);
          border-radius:18px;
          padding:22px;
          backdrop-filter: blur(10px);
        }
        .statTitle{ color:var(--muted); font-weight:800; }
        .statValue{ font-size:22px; font-weight:900; margin-top:10px; }

        .kpiGrid{
          margin-top:18px;
          display:grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap:18px;
        }
        .kpi{
          border:1px solid var(--border);
          background: var(--panel);
          border-radius:18px;
          padding:18px;
          backdrop-filter: blur(10px);
        }
        .kpiTitle{ color:var(--muted); font-weight:800; }
        .kpiValue{ font-size:40px; font-weight:900; margin-top:10px; }
        .kpiValue.small{ font-size:16px; font-weight:900; }
        .kpiSub{ color:var(--muted); margin-top:6px; font-size:13px; }

        .good{ color:#22c55e; }
        .warn{ color:#eab308; }
        .bad{ color:#ef4444; }
        .muted{ color: var(--muted); }
        .mutedDelta{ color: var(--muted); font-weight:900; }

        .card{
          margin-top:18px;
          border:1px solid var(--border);
          background: var(--panel);
          border-radius:18px;
          padding:18px;
          backdrop-filter: blur(10px);
        }
        .cardHead{
          display:flex;
          justify-content:space-between;
          align-items:center;
          margin-bottom:10px;
          gap:10px;
        }
        .cardHead h3{ margin:0; font-size:18px; font-weight:900; }
        .cardHead span{ color:var(--muted); font-size:12px; font-weight:800; }

        .headActions{ display:flex; gap:10px; }

        .chartBox{ height:280px; }

        .pillars{ margin-top:6px; }
        .pillarRow{ margin-bottom:14px; }
        .pillarTop{ display:flex; justify-content:space-between; align-items:center; }
        .pillarName{ text-transform:capitalize; font-weight:900; }
        .pillarValue{ color:var(--muted); font-weight:900; }
        .pillarBar{
          height:9px;
          background: rgba(255,255,255,0.08);
          border-radius:10px;
          margin-top:6px;
          overflow:hidden;
        }
        body.light .pillarBar{ background: rgba(11,18,32,0.08); }
        .pillarFill{
          height:100%;
          border-radius:10px;
          background: linear-gradient(90deg, #22c55e, var(--cyan));
        }
        .pillarFill.warn{ background: linear-gradient(90deg, #eab308, var(--cyan)); }
        .pillarFill.bad{ background: linear-gradient(90deg, #ef4444, #f97316); }

        .twoCol{
          margin-top:18px;
          display:grid;
          grid-template-columns: 1fr 1fr;
          gap:18px;
        }

        .list{
          list-style:none;
          padding:0;
          margin:0;
          display:flex;
          flex-direction:column;
          gap:12px;
        }
        .listItem{
          display:flex;
          gap:12px;
          align-items:flex-start;
          padding:12px;
          border-radius:16px;
          border:1px solid var(--border);
        }
        .listTitle{ font-weight:900; }
        .listDesc{ color:var(--muted); font-size:13px; margin-top:2px; line-height:1.35; }

        .badge{
          padding:6px 10px;
          border-radius:999px;
          font-size:12px;
          font-weight:900;
          border:1px solid var(--border);
          background: rgba(255,255,255,0.04);
          color: var(--text);
          white-space:nowrap;
        }
        .badge.high{ background: rgba(239,68,68,0.15); border-color: rgba(239,68,68,0.35); }
        .badge.medium{ background: rgba(234,179,8,0.15); border-color: rgba(234,179,8,0.35); }
        .badge.low{ background: rgba(34,197,94,0.15); border-color: rgba(34,197,94,0.35); }
        .badge.info{ background: rgba(14,165,233,0.15); border-color: rgba(14,165,233,0.35); }

        /* Analytics */
        .analyticsRow{ display:flex; align-items:center; gap:12px; margin-bottom:12px; }
        .label{ color: var(--muted); font-weight:900; font-size:13px; }
        .select{
          padding:10px 12px;
          border-radius:14px;
          border:1px solid var(--border);
          background: rgba(255,255,255,0.04);
          color: var(--text);
          font-weight:900;
          outline:none;
          min-width:220px;
        }
        body.light .select{ background: rgba(11,18,32,0.04); }
        .analyticsHint{ margin-left:auto; color: var(--muted); font-weight:900; font-size:12px; }
        .miniNote{ margin-top:12px; color: var(--muted); font-size:12px; font-weight:700; line-height:1.5; }

        /* Table */
        .table{
          width:100%;
          border-collapse:separate;
          border-spacing:0 10px;
          min-width:700px;
        }
        .table thead th{
          text-align:left;
          color: var(--muted);
          font-size:12px;
          font-weight:900;
          padding:0 10px 6px;
        }
        .table tbody tr{
          background: rgba(255,255,255,0.03);
          border:1px solid var(--border);
        }
        body.light .table tbody tr{ background: rgba(11,18,32,0.03); }
        .table tbody td{
          padding:14px 10px;
          border-top:1px solid var(--border);
          border-bottom:1px solid var(--border);
          font-weight:800;
        }
        .table tbody tr td:first-child{
          border-left:1px solid var(--border);
          border-top-left-radius:14px;
          border-bottom-left-radius:14px;
        }
        .table tbody tr td:last-child{
          border-right:1px solid var(--border);
          border-top-right-radius:14px;
          border-bottom-right-radius:14px;
        }
        .tdRight{ text-align:right; }

        .smallBtn{
          padding:10px 12px;
          border-radius:14px;
          border:1px solid var(--border);
          background: rgba(255,255,255,0.04);
          color: var(--text);
          cursor:pointer;
          font-weight:900;
        }
        .smallBtn:disabled{ opacity:0.55; cursor:not-allowed; }
        body.light .smallBtn{ background: rgba(11,18,32,0.04); }

        .cb{
          width:16px;
          height:16px;
          accent-color: #22c55e;
          cursor:pointer;
        }

        /* Compare */
        .compareGrid{
          margin-top:14px;
          display:grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap:12px;
        }
        .compareCard{
          border:1px solid var(--border);
          border-radius:16px;
          background: rgba(255,255,255,0.03);
          padding:12px;
        }
        body.light .compareCard{ background: rgba(11,18,32,0.03); }
        .compareTitle{ font-weight:900; margin-bottom:10px; }
        .compareRow{
          display:flex;
          align-items:center;
          justify-content:space-between;
          margin:6px 0;
          gap:10px;
        }
        .big{ font-size:18px; font-weight:900; }
        .delta{
          margin-top:8px;
          font-weight:900;
          padding-top:8px;
          border-top:1px solid var(--border);
        }

        /* Modal */
        .modalBackdrop{
          position:fixed;
          inset:0;
          background: rgba(0,0,0,0.55);
          display:flex;
          align-items:center;
          justify-content:center;
          padding:18px;
          z-index:50;
        }
        .modal{
          width:min(980px, 100%);
          max-height: 90vh;
          overflow:auto;
          border-radius:18px;
          border:1px solid var(--border);
          background: rgba(7,18,37,0.92);
          backdrop-filter: blur(10px);
          padding:16px;
        }
        body.light .modal{ background: rgba(255,255,255,0.92); }
        .modalHead{
          display:flex;
          align-items:flex-start;
          justify-content:space-between;
          gap:12px;
        }
        .modalActions{ display:flex; gap:10px; align-items:center; }

        /* Loading badge */
        .loadingBadge{
          position:fixed;
          right:18px;
          bottom:18px;
          padding:10px 12px;
          border-radius:999px;
          border:1px solid var(--border);
          background: rgba(255,255,255,0.04);
          font-weight:900;
          color: var(--text);
          z-index:60;
        }

        @media (max-width: 1100px){
          .app{ grid-template-columns: 1fr; }
          .sidebar{ position:sticky; top:0; z-index:5; }
          .topGrid{ grid-template-columns: 1fr; }
          .kpiGrid{ grid-template-columns: 1fr 1fr; }
          .twoCol{ grid-template-columns: 1fr; }
          .compareGrid{ grid-template-columns: 1fr 1fr; }
          .header h1{ font-size:34px; }
        }
      `}</style>
    </div>
  );
}