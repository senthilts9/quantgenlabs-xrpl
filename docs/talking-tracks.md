# Talking tracks — sounding like experience, not a script

*How to explain your day-to-day as a risk / quant enterprise data developer so it
flows naturally, leaves no vague edges, and pulls the follow-up questions toward
ground you're comfortable on.*

> Only claim what you've actually done. Everything below is a **pattern** to
> pour your real work into — depth you can defend beats breadth you can't.

---

## The five delivery principles

1. **Cause → tool → consequence.** Never name a tool without the problem it
   solved and the outcome. "The EOD run was too slow in Python, so I moved the
   hot path to C++, which cut the batch from hours to minutes." That arc is what
   sounds like memory.
2. **Specificity closes gray areas.** Swap every "various / some / we handle
   that" for a concrete check, number, or failure mode. Vagueness is what an
   interviewer digs into; there's nothing to dig into in a specific.
3. **Rhythm = sentence variety.** Short declarative, then a longer "because…"
   sentence. Don't deliver five clauses at the same length — that's what reads
   as rehearsed.
4. **Signpost the journey.** Data in → validate → research → productionise →
   measure → ship → monitor. A path is easy to follow; a pile isn't.
5. **Invite the probe.** End a sub-topic with a hook — "happy to go deeper on
   the benchmark harness" — so *you* choose where he drills, into your strong
   areas.

---

## The main track (read it aloud until it's yours)

> "A normal day starts with data, not models. Market and reference data lands
> through our **Databricks** pipelines, and the first gate it hits is a **Great
> Expectations** suite — schema, value ranges, staleness, nulls, uniqueness on
> the keys. If an expectation fails, the pipeline stops and pages us rather than
> quietly feeding the desk a bad mark. That discipline matters more than any
> model: a VaR number is only as good as the curve underneath it.
>
> Once the data's trusted, the research happens in **Python** — Jupyter and
> Databricks — where I prototype or recalibrate a model, backtest it, and check
> it against the market. When it's validated it doesn't stay in Python. I
> productionise the hot path in **C++**, because the intraday and end-of-day
> risk runs can't afford the overhead. And so the two never drift apart, the C++
> library is exposed to Python through **pybind11** — research and production
> call the exact same code, not two implementations that slowly diverge.
>
> Before I claim anything's fast, I measure it. I benchmark the C++ kernels with
> **Google Benchmark**, track nanoseconds per operation, and wire a regression
> check into CI, so a change that quietly doubles latency gets caught at the
> pull request, not in production. Correctness is covered too — **GoogleTest**
> on the C++ side, **pytest** on the Python side, both running on every merge.
>
> The scheduled **batch jobs** are the backbone of the day — end-of-day
> revaluation and PnL, overnight VaR and Expected Shortfall, weekend stress
> runs. Results write first to the **local application database** for the app
> and dashboards, and a replicated copy goes to the **central referential
> database**, the firm's golden source, so every desk and report reconciles to
> one set of numbers. On top sit the **credit, operational, and liquidity
> dashboards**, with limit breaches wired to alerts.
>
> And part of the role is the **team** — code review on the C++ side, bringing
> analysts up to speed in Python, and keeping our data contracts and benchmarks
> as shared standards rather than tribal knowledge."

That's roughly 90 seconds and it hits every tool in a causal chain, not a list.

---

## Tool-by-tool: the natural sentence + the follow-up he'll ask

**Great Expectations** — *"Data quality is a gate, not an afterthought: a Great
Expectations suite validates every feed before it reaches the engine."*
- *"What happens on a false positive / too-strict expectation?"* → Expectations
  have severity — some **warn**, some **block**; each suite has an owner, and we
  tune thresholds from real data rather than guessing. It's a living contract.
- *"Where does it run?"* → As a validation step inside the Databricks pipeline,
  with the data-docs published so anyone can see what passed.

**Google Benchmark** — *"I don't claim a kernel is fast until I've measured it in
Google Benchmark — nanoseconds per op, tracked over time."*
- *"How do you get reliable numbers with system noise?"* → pin the process to an
  isolated core, disable turbo/frequency scaling, run repeated iterations, report
  the **median**, not the mean.
- *"Micro-benchmarks miss system latency — how do you catch that?"* → they do; the
  benchmark guards the **kernels**, and I profile the **end-to-end** path
  separately with perf / flamegraphs. Two different tools for two different jobs.

**pybind11** — *"The C++ core is bound into Python with pybind11, so there's one
codebase and no model drift between research and production."*
- *"Doesn't crossing the boundary cost you?"* → you cross it once per call with a
  vectorised payload, not per element, so the C++ still runs on bulk data.

**QuantLib** — *"For standard curves and pricers we lean on QuantLib where it
fits; I build custom C++ only where we need lower latency or a model it doesn't
cover."*
- Signals you don't reinvent wheels *and* know when to.

**CMake / Conan (or vcpkg)** — build and dependency management for the C++ side;
mention only if asked about build/toolchain.

**Databricks / Spark** — *"When the data's too big for one node, the ETL and some
analytics run on Spark in Databricks."*

**CI (GitHub Actions / Jenkins)** — *"Every merge runs the unit tests and the
benchmark regression gate."*

---

## Questions he may have — crisp answers

- *"How do you guarantee the risk numbers are right?"* → two layers: **data**
  validated by Great Expectations before it enters, **models** validated by
  backtests and unit tests before they ship. Bad data fails loud; bad models
  don't merge.
- *"Why both Python and C++?"* → Python for research velocity, C++ for the
  latency-critical kernels; pybind11 keeps them one codebase.
- *"How do you know an optimisation actually helped?"* → Google Benchmark, ns/op,
  before-and-after, with a CI gate so regressions can't sneak back in.
- *"How do you avoid research-vs-production drift?"* → they share the exact C++
  library through the bindings; there's no second implementation to drift.
- *"How do you test numerical code?"* → GoogleTest / pytest against analytical
  cases and reference values, plus property tests on invariants (e.g. put-call
  parity, monotonicity of price in vol).
- *"Two databases — why?"* → local operational store for speed; central
  referential DB as the firm's golden source for consistency and reporting.
- *"Can you compute this without a calculator?"* → yes — I'd do it in Python;
  see the `finmath.py` module (TVM, NPV, IRR, bond price/yield, duration).

---

## If he hands you a number to compute (the BA II moment)

Don't reach for a financial calculator — reach for Python. `finmath.py` covers
what a BA II Plus does: time-value-of-money (solve for N, rate, PV, PMT, or FV),
NPV, IRR, MIRR, nominal↔effective rate conversion, bond price and yield, and
Macaulay / modified duration and convexity. Saying *"I'd just write it in
Python"* and being able to is a stronger answer than any calculator.
